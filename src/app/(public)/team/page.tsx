import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { logger } from "@/lib/utils";
import styles from "./Team.module.scss";

interface TeamMember {
  _id?: string;
  name: string;
  role: string;
  module?: string;
  moduleRoles?: { module: string; role: string }[];
  bio?: string;
}

export default async function TeamPage() {
  let teamMembers: TeamMember[] = [];
  let fetchError = false;

  try {
    await dbConnect();
    const users = await User.find({
      role: { $in: ["Secretary", "OC", "Head"] },
      email: { $ne: "codingclub@iitg.ac.in" },
    }).lean();
    teamMembers = users as unknown as TeamMember[];
  } catch (e) {
    logger.error("Failed to fetch team members", e);
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

      <div className={styles.grid}>
        {teamMembers.map((member, index) => (
          <div key={member._id || index} className={styles.card}>
            <div className={styles.avatar}>{member.name.charAt(0)}</div>
            <h2 className={styles.name}>{member.name}</h2>
            <span className={styles.roleBadge}>{member.role}</span>
            <p className={styles.module}>
              {member.module ||
                (member.moduleRoles && member.moduleRoles[0]?.module) ||
                "Coordinator"}
            </p>
            {member.bio && <p className={styles.bio}>{member.bio}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
