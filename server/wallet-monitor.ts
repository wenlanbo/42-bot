import {
  getWalletPortfolio,
  getWalletPositions,
  WalletPosition,
} from "../lib/for-wenbo-main/queries/wallet";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const TRACKED_WALLET = "0x303E912232a80607D08705cc679F7DbfBb9FC6b2";

/**
 * Format portfolio value for display
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format positions for Slack message
 */
function formatPositions(positions: WalletPosition[]): string {
  if (positions.length === 0) {
    return "_No active positions_";
  }

  // Limit to top 10 positions by value to avoid message being too long
  const topPositions = positions
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const positionTexts = topPositions.map((pos, index) => {
    const marketShort = `${pos.market_address.slice(0, 6)}...${pos.market_address.slice(-4)}`;
    const statusBadge = pos.is_resolved
      ? pos.is_winning
        ? "✅ Winning"
        : "❌ Losing"
      : "🔄 Active";
    const pnlSign = pos.realized_pnl >= 0 ? "+" : "";
    
    return `${index + 1}. *${marketShort}* (Token: ${pos.token_id})
   Value: ${formatCurrency(pos.value)} | Qty: ${pos.quantity.toFixed(4)} | Price: $${pos.current_price.toFixed(4)}
   PnL: ${pnlSign}${formatCurrency(pos.realized_pnl)} | Status: ${statusBadge}`;
  });

  const remainingCount = positions.length - topPositions.length;
  const remainingText =
    remainingCount > 0
      ? `\n_...and ${remainingCount} more position${remainingCount > 1 ? "s" : ""}_`
      : "";

  return positionTexts.join("\n\n") + remainingText;
}

/**
 * Send wallet portfolio and positions to Slack
 */
async function sendWalletReportToSlack(
  slackWebhookUrl: string,
  walletAddress: string,
  portfolio: number,
  positions: WalletPosition[]
): Promise<void> {
  console.log(`[SLACK REPORT] Preparing wallet report for ${walletAddress}...`);
  
  if (!slackWebhookUrl) {
    console.warn("[SLACK REPORT] ⚠️ SLACK_WEBHOOK_URL not configured, skipping notification");
    throw new Error("SLACK_WEBHOOK_URL is not provided");
  }

  const totalPositionsValue = positions.reduce((sum, pos) => sum + pos.value, 0);
  const activePositionsCount = positions.filter((p) => !p.is_resolved).length;
  const resolvedPositionsCount = positions.filter((p) => p.is_resolved).length;
  const totalPnL = positions.reduce((sum, pos) => sum + pos.realized_pnl, 0);

  const timestamp = new Date().toISOString();
  const dateTime = new Date().toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const payload = {
    text: `💰 Wallet Portfolio Report - ${walletAddress.slice(0, 10)}...`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "💰 Wallet Portfolio Report",
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Wallet Address:*\n\`${walletAddress}\``,
          },
          {
            type: "mrkdwn",
            text: `*Last Updated:*\n${dateTime} UTC`,
          },
        ],
      },
      {
        type: "divider",
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Total Portfolio Value:*\n*${formatCurrency(portfolio)}*`,
          },
          {
            type: "mrkdwn",
            text: `*Positions Value:*\n${formatCurrency(totalPositionsValue)}`,
          },
        ],
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Active Positions:*\n${activePositionsCount}`,
          },
          {
            type: "mrkdwn",
            text: `*Resolved Positions:*\n${resolvedPositionsCount}`,
          },
          {
            type: "mrkdwn",
            text: `*Total Realized PnL:*\n${formatCurrency(totalPnL)}`,
          },
        ],
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Top Positions (${positions.length} total):*\n\n${formatPositions(positions)}`,
        },
      },
    ],
  };

  try {
    console.log(`[SLACK REPORT] Sending request to Slack webhook...`);
    console.log(`[SLACK REPORT] Webhook URL: ${slackWebhookUrl.substring(0, 30)}...`);
    
    const response = await fetch(slackWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log(`[SLACK REPORT] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SLACK REPORT] ❌ Slack API error response: ${errorText}`);
      throw new Error(
        `Slack API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const responseText = await response.text();
    console.log(`[SLACK REPORT] ✅ Successfully sent wallet report to Slack for ${walletAddress}`);
    console.log(`[SLACK REPORT] Response: ${responseText}`);
  } catch (error) {
    console.error("[SLACK REPORT] ❌ Failed to send wallet report to Slack:", error);
    if (error instanceof Error) {
      console.error("[SLACK REPORT] Error message:", error.message);
      console.error("[SLACK REPORT] Error stack:", error.stack);
    }
    throw error;
  }
}

/**
 * Check wallet portfolio and positions and send to Slack
 */
export async function checkWalletAndSendReport(): Promise<void> {
  console.log(`[WALLET MONITOR] Starting check for wallet ${TRACKED_WALLET}`);
  console.log(`[WALLET MONITOR] SLACK_WEBHOOK_URL configured: ${!!process.env.SLACK_WEBHOOK_URL}`);
  
  try {
    // Send test message on first run (for deployment notification)
    if (isFirstRun) {
      console.log(`[WALLET MONITOR] First run detected, sending test message...`);
      isFirstRun = false;
      try {
        const { sendSlackTestMessage } = await import("./slack-test");
        await sendSlackTestMessage();
        console.log("[WALLET MONITOR] ✅ Successfully sent deployment test message to Slack");
      } catch (error) {
        console.error("[WALLET MONITOR] ❌ Failed to send deployment test message:", error);
        if (error instanceof Error) {
          console.error("[WALLET MONITOR] Error details:", error.message);
          console.error("[WALLET MONITOR] Error stack:", error.stack);
        }
        // Continue with wallet check even if test message fails
      }
    }
    
    console.log(`[WALLET MONITOR] Fetching portfolio and positions...`);
    console.log(`[WALLET MONITOR] GraphQL endpoint: ${process.env.NEXT_PUBLIC_HASURA_GQL_ENDPOINT || process.env.HASURA_GQL_ENDPOINT || "Not set (will use localhost:8080)"}`);
    
    // Fetch portfolio and positions
    let portfolio: number;
    let positions: WalletPosition[];
    
    try {
      [portfolio, positions] = await Promise.all([
        getWalletPortfolio(TRACKED_WALLET),
        getWalletPositions(TRACKED_WALLET),
      ]);
    } catch (error) {
      console.error("[WALLET MONITOR] ❌ Error fetching wallet data:", error);
      if (error instanceof Error) {
        console.error("[WALLET MONITOR] Error message:", error.message);
        if (error.message.includes("ECONNREFUSED") || error.message.includes("localhost")) {
          console.error("[WALLET MONITOR] ⚠️ CRITICAL: GraphQL endpoint not configured!");
          console.error("[WALLET MONITOR] Please set NEXT_PUBLIC_HASURA_GQL_ENDPOINT environment variable in Vercel");
        }
      }
      throw error; // Re-throw to be handled by outer catch
    }

    console.log(
      `[WALLET MONITOR] ✅ Fetched data - Portfolio: $${portfolio.toFixed(2)}, Positions: ${positions.length}`
    );

    // Send Slack notification
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (slackWebhookUrl) {
      console.log(`[WALLET MONITOR] Sending wallet report to Slack...`);
      try {
        await sendWalletReportToSlack(
          slackWebhookUrl,
          TRACKED_WALLET,
          portfolio,
          positions
        );
        console.log(`[WALLET MONITOR] ✅ Successfully sent wallet report to Slack`);
      } catch (error) {
        console.error("[WALLET MONITOR] ❌ Failed to send wallet report to Slack:", error);
        if (error instanceof Error) {
          console.error("[WALLET MONITOR] Error details:", error.message);
          console.error("[WALLET MONITOR] Error stack:", error.stack);
        }
        // Re-throw to be caught by outer catch
        throw error;
      }
    } else {
      console.warn(
        "[WALLET MONITOR] ⚠️ SLACK_WEBHOOK_URL not set - skipping notification"
      );
    }
  } catch (error) {
    console.error("[WALLET MONITOR] ❌ Error checking wallet:", error);
    if (error instanceof Error) {
      console.error("[WALLET MONITOR] Error message:", error.message);
      console.error("[WALLET MONITOR] Error stack:", error.stack);
    }
    // Re-throw so it can be caught by the calling function (cron endpoint)
    throw error;
  }
}

let intervalId: NodeJS.Timeout | null = null;
let isFirstRun = true;

/**
 * Start the wallet monitoring service
 * Checks wallet every 5 minutes and sends report to Slack
 */
export function startWalletMonitoring(): void {
  if (intervalId) {
    console.log("Wallet monitoring is already running");
    return;
  }

  console.log(
    `Starting wallet monitoring service for ${TRACKED_WALLET} (checking every 5 minutes)`
  );

  // Run immediately on start
  checkWalletAndSendReport().catch((error) => {
    console.error("Initial wallet check failed:", error);
  });

  // Then run every 5 minutes
  intervalId = setInterval(() => {
    checkWalletAndSendReport();
  }, CHECK_INTERVAL_MS);

  console.log("Wallet monitoring service started");
}

/**
 * Reset first run flag (useful for testing)
 */
export function resetFirstRun(): void {
  isFirstRun = true;
}

/**
 * Stop the wallet monitoring service
 */
export function stopWalletMonitoring(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("Wallet monitoring service stopped");
  }
}
