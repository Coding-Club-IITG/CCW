import { cachedFetch, CACHE_TTLS } from "@/lib/cache";
import { CURRENT_TENURE } from "@/lib/constants";
import dbConnect from "@/lib/mongodb";
import { logger } from "@/lib/utils";
import User from "@/models/User";
import TeamRosters, { type PublicTeamMember } from "./TeamRosters";
import styles from "./Team.module.scss";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Team",
  description:
    "Meet the students leading Coding Club IITG and its technical communities.",
  path: "/team",
});

export default async function TeamPage() {
  let members: PublicTeamMember[] = [];
  let fetchError = false;
  try {
    await dbConnect();
    members = await cachedFetch(
      "ccw:team:rosters:v2",
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
            "name image access tenure managedModules roles bio pizza_count",
          )
          .lean();
        return JSON.parse(JSON.stringify(users));
      },
    );
  } catch (error) {
    logger.error("Failed to fetch team members", error);
    fetchError = true;
  }
  return (
    <div className={styles.container}>
      <h1>Meet the Team</h1>
      <p className={styles.subtitle}>
        The passionate individuals driving innovation at Coding Club IITG.
      </p>
      {fetchError && (
        <p className={styles.errorText}>
          Unable to load team data. Please try again later.
        </p>
      )}
      {!fetchError && (
        <TeamRosters members={members} currentTenure={CURRENT_TENURE} />
      )}
    </div>
  );
}
