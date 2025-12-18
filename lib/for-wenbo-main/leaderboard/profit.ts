import "dotenv/config";
import { buildProfitLeaderboard } from "../queries/profit";

/**
 * Main function to fetch and process PnL leaderboard data
 */
async function getLeaderboard() {
  try {
    console.log("Building PnL leaderboard...\n");

    const leaderboard = await buildProfitLeaderboard(1000);

    console.log("\n=== PnL Leaderboard Stats ===");
    console.log(`Total unique users: ${leaderboard.userToStats.size}`);

    let totalPnl = 0;
    let positiveCount = 0;
    let negativeCount = 0;

    for (const pnl of leaderboard.userToStats.values()) {
      totalPnl += pnl;
      if (pnl > 0) positiveCount++;
      else if (pnl < 0) negativeCount++;
    }

    console.log(`Total PnL across all users: ${totalPnl.toFixed(2)}`);
    console.log(`Users with positive PnL: ${positiveCount}`);
    console.log(`Users with negative PnL: ${negativeCount}`);

    const traders = Array.from(leaderboard.userToStats.entries())
      .map(([user, pnl]) => ({ user, pnl }))
      .sort((a, b) => b.pnl - a.pnl);

    traders.forEach((trader, index) => {
      const sign = trader.pnl >= 0 ? "+" : "";
      console.log(
        `${index + 1}. ${trader.user}: ${sign}${trader.pnl.toFixed(2)}`
      );
    });

    if (traders.length > 0) {
      const topTrader = traders[0];
      const marketBreakdown = leaderboard.userToMarketToStats.get(
        topTrader.user
      );

      if (marketBreakdown) {
        console.log(`\n=== Market Breakdown for Top Trader ===`);
        console.log(`User: ${topTrader.user}`);
        console.log(`Total PnL: ${topTrader.pnl.toFixed(2)}\n`);

        const markets = Array.from(marketBreakdown.entries())
          .map(([market, pnl]) => ({ market, pnl }))
          .sort((a, b) => b.pnl - a.pnl);

        markets.forEach((m, index) => {
          const sign = m.pnl >= 0 ? "+" : "";
          console.log(
            `${index + 1}. Market ${m.market.slice(
              0,
              10
            )}...: ${sign}${m.pnl.toFixed(2)}`
          );
        });
      }
    }

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
