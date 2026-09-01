import type { Metadata } from "next";
import { cachedFetch, CACHE_TTLS } from "@/lib/cache";
import { toBsonSafe } from "@/lib/api/result";
import { CURRENT_TENURE } from "@/lib/constants";
import dbConnect from "@/lib/mongodb";
import { logger } from "@/lib/utils";
import { pageMetadata } from "@/lib/seo";
import User from "@/models/User";
import PageHeader from "@/components/public/PageHeader";
import TeamRosters, { type PublicTeamMember } from "./TeamRosters";
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
    await dbConnect();
    members = await cachedFetch(
      "ccw:team:rosters:v3",
      CACHE_TTLS.TEAM,
      async () => {
        const users = await User.find({
          tenure: { $type: "string" },
          $or: [
            {
              roles: {
                $elemMatch: {
                  position: {
                    $in: ["Secretary", "OC", "Projects Head", "Head"],
                  },
                },
              },
            },
            { access: "Head", "managedModules.0": { $exists: true } },
          ],
          email: { $ne: "codingclub@iitg.ac.in" },
        })
          .select(
            "name image access tenure managedModules roles bio githubId linkedinUrl pizza_count",
          )
          .lean();
        return toBsonSafe(users) as unknown as PublicTeamMember[];
      },
    );
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
        kicker={`${current} ${current === 1 ? "head" : "heads"} · ${CURRENT_TENURE}`}
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
