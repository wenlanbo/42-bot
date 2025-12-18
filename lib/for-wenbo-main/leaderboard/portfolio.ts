import "dotenv/config";
import { buildPortfolioLeaderboard } from "../queries/portfolio";

/**
 * Main function to fetch and process Portfolio leaderboard data
 */
async function getLeaderboard() {
  try {
    console.log("Building Portfolio leaderboard...\n");

    const leaderboard = await buildPortfolioLeaderboard(1000);

    console.log("\n=== Portfolio Leaderboard Stats ===");
    console.log(`Total unique users: ${leaderboard.userToStats.size}`);

    let totalPortfolioValue = 0;
    let usersWithPositions = 0;
    for (const portfolioValue of leaderboard.userToStats.values()) {
      totalPortfolioValue += portfolioValue;
      if (portfolioValue > 0) usersWithPositions++;
    }

    console.log(
      `Total portfolio value across all users: ${totalPortfolioValue.toFixed(
        2
      )}`
    );
    console.log(`Users with active positions: ${usersWithPositions}`);

    const traders = Array.from(leaderboard.userToStats.entries())
      .map(([user, portfolioValue]) => ({ user, portfolioValue }))
      .sort((a, b) => b.portfolioValue - a.portfolioValue);

    traders.forEach((user, index) => {
      console.log(
        `${index + 1}. ${user.user}: ${user.portfolioValue.toFixed(2)}`
      );
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
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed:", error);
    process.exit(1);
  });
