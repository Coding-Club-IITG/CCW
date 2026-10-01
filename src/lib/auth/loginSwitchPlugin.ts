import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  getSessionFromCtx,
  isAPIError,
} from "better-auth/api";
import { generateState, parseState } from "better-auth/oauth2";
import { google, verifyGoogleIdToken } from "better-auth/social-providers";
import { z } from "zod";

import { AppResultError, err, ok } from "@/lib/api/result";
import { isCurrentAuthSession } from "@/lib/auth/security";
import { webEnv } from "@/lib/env/web";
import {
  recentInstituteSession,
  verifySwitchDraft,
} from "@/lib/auth/loginSwitch";
import { consumeUserRateLimit } from "@/lib/users/rateLimit";
import { logger } from "@/lib/telemetry/logger";

const profileURL = "/internal/profile";
const callbackPath = "/login-switch/callback";

function provider() {
  if (!webEnv.GOOGLE_CLIENT_ID || !webEnv.GOOGLE_CLIENT_SECRET)
    throw new APIError("NOT_FOUND", { message: "Google is unavailable." });
  return google({
    clientId: webEnv.GOOGLE_CLIENT_ID,
    clientSecret: webEnv.GOOGLE_CLIENT_SECRET,
    prompt: "select_account",
    accessType: "online",
  });
}

export const loginSwitchPlugin = {
  id: "login-switch",
  endpoints: {
    startLoginSwitch: createAuthEndpoint(
      "/login-switch/start",
      {
        method: "POST",
        body: z.object({}).strict(),
        requireHeaders: true,
      },
      async (ctx) => {
        const session = await getSessionFromCtx(ctx, {
          disableCookieCache: true,
        });
        if (!session || !(await isCurrentAuthSession(session.session)))
          return ctx.json(
            err(
              "UNAUTHENTICATED",
              "Sign in with your institute account again.",
            ),
            { status: 401 },
          );
        if (!recentInstituteSession(session.session))
          return ctx.json(ok({ reauthenticate: true, url: null }));
        const limit = await consumeUserRateLimit(
          "login-switch",
          session.user.id,
          30,
        );
        if (!limit.allowed)
          return ctx.json(
            err("RATE_LIMITED", "Please wait a moment before trying again."),
            { status: 429 },
          );
        const googleProvider = provider();
        const { state, codeVerifier } = await generateState(ctx, undefined, {
          purpose: "login-switch",
          sourceUserId: session.user.id,
          sourceSessionId: session.session.id,
        });
        const url = await googleProvider.createAuthorizationURL({
          state,
          codeVerifier,
          redirectURI: `${ctx.context.baseURL}${callbackPath}`,
        });
        return ctx.json(ok({ reauthenticate: false, url: url.toString() }));
      },
    ),
    verifyLoginSwitch: createAuthEndpoint(
      callbackPath,
      {
        method: "GET",
        query: z.object({
          state: z.string().optional(),
          code: z.string().optional(),
          error: z.string().optional(),
        }),
        requireHeaders: true,
      },
      async (ctx) => {
        let destination = profileURL;
        try {
          const state = await parseState(ctx);
          const session = await getSessionFromCtx(ctx, {
            disableCookieCache: true,
          });
          if (
            !session ||
            !(await isCurrentAuthSession(session.session)) ||
            state.purpose !== "login-switch" ||
            state.sourceUserId !== session.user.id ||
            state.sourceSessionId !== session.session.id ||
            state.expiresAt <= Date.now() ||
            !ctx.query.code ||
            ctx.query.error
          ) {
            destination += "?switchError=verification";
          } else {
            const googleProvider = provider();
            const tokens = await googleProvider.validateAuthorizationCode({
              code: ctx.query.code,
              codeVerifier: state.codeVerifier,
              redirectURI: `${ctx.context.baseURL}${callbackPath}`,
            });
            if (
              !tokens?.idToken ||
              !(await verifyGoogleIdToken({
                token: tokens.idToken,
                audience: webEnv.GOOGLE_CLIENT_ID!,
              }))
            ) {
              destination += "?switchError=verification";
            } else {
              const info = await googleProvider.getUserInfo(tokens);
              if (!info?.user?.email || !info.user.id)
                destination += "?switchError=verification";
              else
                await verifySwitchDraft(session.user, session.session, {
                  email: info.user.email,
                  id: String(info.user.id),
                  emailVerified: info.user.emailVerified === true,
                });
            }
          }
        } catch (error) {
          destination = `${profileURL}?switchError=${error instanceof AppResultError ? "unavailable" : "verification"}`;
          if (!(error instanceof AppResultError) && !isAPIError(error))
            logger.warn("Google verification failed", {
              operation: "login_switch_verify",
              errorName: error instanceof Error ? error.name : "UnknownError",
            });
        }
        throw ctx.redirect(destination);
      },
    ),
  },
} satisfies BetterAuthPlugin;
