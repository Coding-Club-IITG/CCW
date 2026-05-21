import CFUser from "@/models/CFUser";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

export default async function LeaderboardPage() {
  await dbConnect();

  // Fetch only verified CF users with an actual rating
  // Sort by rating descending
  const leaderboardData = await CFUser.find({
    cfVerified: true,
    rating: { $gt: 0 },
  })
    .sort({ rating: -1 })
    .populate({
      path: "userId",
      model: User,
      select: "name",
    })
    .lean();

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Codeforces Leaderboard</h1>
      <p>Current standings of coding club members.</p>

      <div style={{ marginTop: "2rem", overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: "600px",
          }}
        >
          <thead>
            <tr
              style={{ textAlign: "left", borderBottom: "2px solid #eaeaea" }}
            >
              <th style={{ padding: "1rem" }}>Rank</th>
              <th style={{ padding: "1rem" }}>Member</th>
              <th style={{ padding: "1rem" }}>Handle</th>
              <th style={{ padding: "1rem" }}>Rating</th>
              <th style={{ padding: "1rem" }}>CF Rank</th>
            </tr>
          </thead>
          <tbody>
            {leaderboardData.map((entry: any, index: number) => (
              <tr
                key={entry._id.toString()}
                style={{ borderBottom: "1px solid #f9f9f9" }}
              >
                <td style={{ padding: "1rem" }}>{index + 1}</td>
                <td style={{ padding: "1rem" }}>
                  {entry.userId?.name || "Unknown"}
                </td>
                <td style={{ padding: "1rem" }}>
                  <a
                    href={`https://codeforces.com/profile/${entry.handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#0070f3", textDecoration: "none" }}
                  >
                    {entry.handle}
                  </a>
                </td>
                <td style={{ padding: "1rem", fontWeight: "bold" }}>
                  {entry.rating}
                </td>
                <td style={{ padding: "1rem" }}>
                  <span
                    style={{
                      padding: "0.25rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.85rem",
                      backgroundColor: "#f0f0f0",
                    }}
                  >
                    {entry.rank}
                  </span>
                </td>
              </tr>
            ))}
            {leaderboardData.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "#666",
                  }}
                >
                  No data available yet. Ratings sync every 6 hours.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
