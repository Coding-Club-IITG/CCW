import { cachedFetch, CACHE_TTLS } from "@/lib/cache";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import {
  LEADERSHIP_ROLES,
  LeadershipRole,
  MODULES,
  TEAM_ROLES,
} from "@/lib/constants";
import { getDisplayName, logger } from "@/lib/utils";
import styles from "./Team.module.scss";

interface TeamMember {
  _id?: string;
  name: string;
  image?: string;
  role: string;
  moduleRoles?: { module: string; role: string }[];
  bio?: string;
  pizza_count?: number;
}

function MemberCard({
  member,
  showRole,
}: {
  member: TeamMember;
  showRole?: boolean;
}) {
  const displayName = getDisplayName(member.name, member.pizza_count);
  return (
    <div className={styles.card}>
      {member.image ? (
        <img
          src={member.image}
          alt={member.name}
          className={styles.avatarImg}
        />
      ) : (
        <div className={styles.avatar}>{member.name.charAt(0)}</div>
      )}
      {showRole && <span className={styles.role}>{member.role}</span>}
      <h2 className={styles.name}>{displayName}</h2>
      {member.bio && <p className={styles.bio}>{member.bio}</p>}
    </div>
  );
}

export default async function TeamPage() {
  let teamMembers: TeamMember[] = [];
  let fetchError = false;

  try {
    await dbConnect();
    teamMembers = await cachedFetch<TeamMember[]>(
      "ccw:team:roster",
      CACHE_TTLS.TEAM,
      async () => {
        const users = await User.find({
          role: { $in: TEAM_ROLES },
          email: { $ne: "codingclub@iitg.ac.in" },
        })
          .select("name image role moduleRoles bio pizza_count")
          .lean();
        return users as unknown as TeamMember[];
      },
    );
  } catch (e) {
    logger.error("Failed to fetch team members", e);
    fetchError = true;
  }

  const leadership = teamMembers
    .filter((m) => m.role !== "Head")
    .sort(
      (a, b) =>
        LEADERSHIP_ROLES.indexOf(a.role as LeadershipRole) -
        LEADERSHIP_ROLES.indexOf(b.role as LeadershipRole),
    );
  const heads = teamMembers.filter((m) => m.role === "Head");
  const moduleGroups = MODULES.map((moduleName) => ({
    module: moduleName,
    members: heads.filter((h) =>
      h.moduleRoles?.some((mr) => mr.module === moduleName),
    ),
  })).filter((g) => g.members.length > 0);

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

      {leadership.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Leadership</h2>
          <div className={styles.grid}>
            {leadership.map((member, index) => (
              <MemberCard key={member._id || index} member={member} showRole />
            ))}
          </div>
        </section>
      )}

      {moduleGroups.map((group) => (
        <section key={group.module} className={styles.section}>
          <h2 className={styles.sectionTitle}>{group.module} Heads</h2>
          <div className={styles.grid}>
            {group.members.map((member, index) => (
              <MemberCard key={member._id || index} member={member} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
