import { describe, expect, it } from "vitest";
import { MongoServerError, ObjectId } from "mongodb";
import { z } from "zod";
import {
  HTTP_STATUS_BY_ERROR_CODE,
  parseFormData,
  parseJson,
  requestIdFrom,
  toBsonSafe,
  zodIssuesToFields,
} from "@/lib/api/result";
import {
  jsonError,
  mongoErrorResult,
  parseObjectId,
} from "@/lib/api/result.server";

describe("boundary result helpers", () => {
  it("maps stable error codes to HTTP statuses", () => {
    expect(HTTP_STATUS_BY_ERROR_CODE).toMatchObject({
      VALIDATION_ERROR: 400,
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      RATE_LIMITED: 429,
      INTERNAL_ERROR: 500,
    });
  });

  it("parses JSON and returns safe field errors", async () => {
    const schema = z.object({
      name: z.string().min(2),
      count: z.number().int(),
    });
    const valid = await parseJson(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({ name: "ok", count: 2 }),
      }),
      schema,
    );
    expect(valid).toEqual({ ok: true, data: { name: "ok", count: 2 } });
    const invalid = await parseJson(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({ name: "", count: 2 }),
      }),
      schema,
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.fields).toHaveProperty("name");
  });

  it("parses repeated FormData values", () => {
    const form = new FormData();
    form.append("tag", "one");
    form.append("tag", "two");
    expect(parseFormData(form, z.object({ tag: z.array(z.string()) }))).toEqual(
      {
        ok: true,
        data: { tag: ["one", "two"] },
      },
    );
  });

  it("groups Zod issues without exposing input values", () => {
    const parsed = z
      .object({ email: z.string().email() })
      .safeParse({ email: "secret" });
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(zodIssuesToFields(parsed.error.issues)).toEqual({
        email: [expect.any(String)],
      });
  });

  it("validates ObjectIds", () => {
    expect(parseObjectId(new ObjectId().toHexString()).ok).toBe(true);
    expect(parseObjectId("bad")).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("translates duplicate key errors without database messages", () => {
    const duplicate = new MongoServerError({
      message: "private duplicate details",
      code: 11000,
      keyPattern: { email: 1 },
    });
    expect(mongoErrorResult(duplicate)).toEqual({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "A record with these values already exists.",
        fields: { email: ["Must be unique."] },
      },
    });
  });

  it("serializes BSON values explicitly", () => {
    const id = new ObjectId();
    expect(
      toBsonSafe({
        id,
        at: new Date("2025-01-01T00:00:00Z"),
        missing: undefined,
      }),
    ).toEqual({
      id: id.toHexString(),
      at: "2025-01-01T00:00:00.000Z",
    });
  });

  it("propagates safe request IDs and replaces unsafe ones", () => {
    expect(
      requestIdFrom(
        new Request("http://test", {
          headers: { "x-request-id": "request-123" },
        }),
      ),
    ).toBe("request-123");
    expect(
      requestIdFrom(
        new Request("http://test", {
          headers: { "x-request-id": "not safe!" },
        }),
      ),
    ).not.toBe("not safe!");
  });

  it("sanitizes internal HTTP failures and correlates them with a request ID", async () => {
    const response = jsonError("INTERNAL_ERROR", "private database failure");
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("x-request-id")).toBe(body.error.requestId);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("private database failure");
  });
});
