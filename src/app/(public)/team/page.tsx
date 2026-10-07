import type { Metadata } from "next";

import { cachedFetch, CACHE_TTLS } from "@/lib/cache/redis";
import { toBsonSafe } from "@/lib/api/result";
import { CURRENT_TENURE } from "@/lib/constants";
import { connectMongoDB } from "@/lib/db/mongodb";
import { logger } from "@/lib/telemetry/logger";
import { pageMetadata } from "@/lib/seo/metadata";
import {
  publicTeamFilter,
  visibleTeamMembers,
  type PublicTeamMember,
} from "@/lib/users/team";

import User from "@/models/User";

import PageHeader from "@/components/public/PageHeader";

import TeamRosters from "./TeamRosters";
import styles from "./Team.module.scss";

export const metadata: Metadata = pageMetadata({
  title: "Team",
  description: "Meet the students leading Coding Club IITG and its modules.",
  path: "/team",
});

export default async function TeamPage() {
  let members: PublicTeamMember[] = [];
  let fetchError = false;
  try {
    await connectMongoDB();
    members = await cachedFetch(
      "ccw:team:rosters:v4",
      CACHE_TTLS.TEAM,
      async () => {
        const users = await User.find(publicTeamFilter())
          .select(
            "name image access tenure managedModules roles bio githubId linkedinUrl pizza_count",
          )
          .lean();
        return toBsonSafe(users) as unknown as PublicTeamMember[];
      },
    );

    // Profile picture is mandatory
    members = visibleTeamMembers(members);
  } catch (error) {
    logger.error("Failed to fetch team members", error);
    fetchError = true;
  }
  const current = members.filter(
    (member) => member.tenure === CURRENT_TENURE,
  ).length;

  return (
    <div className={styles.page}>
      <PageHeader
        kicker={`${current} ${current === 1 ? "member" : "members"} · ${CURRENT_TENURE}`}
        title="Team"
        glow="ember"
        lead="Meet the students running this club."
      />

      {fetchError && (
        <p className={styles.error}>
          Unable to load team data. Please try again later.
        </p>
      )}

      {!fetchError && (
        <TeamRosters members={members} currentTenure={CURRENT_TENURE} />
      )}
    </div>
  );
}
