import "dotenv/config";
import { buildOTLeaderboard } from "../queries/ot";

/**
 * Main function to fetch and process OT leaderboard data
 */
async function getLeaderboard() {
  try {
    console.log("Building OT leaderboard...");

    const leaderboard = await buildOTLeaderboard(1000);

    console.log("\nLeaderboard Stats:");
    console.log(`Total unique users: ${leaderboard.userToStats.size}`);

    const traders = Array.from(leaderboard.userToStats.entries())
      .map(([user_address, [cumVol, cumQty]]) => ({
        user: user_address,
        cumQty,
      }))
      .sort((a, b) => b.cumQty - a.cumQty);

    traders.forEach((trader, index) => {
      console.log(`${index + 1}. ${trader.user}: ${trader.cumQty}`);
    });

    return leaderboard;
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    throw error;
  }
}

// Run the function
getLeaderboard()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed:", error);
    process.exit(1);
  });
