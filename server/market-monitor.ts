import fs from "fs/promises";
import path from "path";
import { getAllMarkets, Market } from "../lib/for-wenbo-main/queries/markets";

const KNOWN_MARKETS_FILE = process.env.VERCEL
  ? "/tmp/known-markets.json"
  : path.join(__dirname, "known-markets.json");

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

interface KnownMarkets {
  markets: string[]; // Array of market addresses
  lastCheck: string; // ISO timestamp of last check
}

/**
 * Load known markets from file
 */
async function loadKnownMarkets(): Promise<KnownMarkets> {
  try {
    await fs.access(KNOWN_MARKETS_FILE);
    const data = await fs.readFile(KNOWN_MARKETS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    // File doesn't exist, return empty state
    return {
      markets: [],
      lastCheck: new Date().toISOString(),
    };
  }
}

/**
 * Save known markets to file
 */
async function saveKnownMarkets(knownMarkets: KnownMarkets): Promise<void> {
  await fs.writeFile(
    KNOWN_MARKETS_FILE,
    JSON.stringify(knownMarkets, null, 2),
    "utf-8"
  );
}

/**
 * Send notification to Slack
 */
async function sendSlackNotification(
  slackWebhookUrl: string,
  markets: Market[]
): Promise<void> {
  if (!slackWebhookUrl) {
    console.warn("[SLACK MARKET] ⚠️ SLACK_WEBHOOK_URL not configured, skipping notification");
    return;
  }
  
  // Validate webhook URL format
  if (!slackWebhookUrl.startsWith("https://hooks.slack.com/services/")) {
    console.warn(`[SLACK MARKET] ⚠️ Invalid webhook URL format. Expected to start with 'https://hooks.slack.com/services/'`);
    console.warn(`[SLACK MARKET] Current URL: ${slackWebhookUrl.substring(0, 50)}...`);
    throw new Error("Invalid Slack webhook URL format. Must start with 'https://hooks.slack.com/services/'");
  }
  
  console.log(`[SLACK MARKET] Preparing market notification for ${markets.length} market(s)...`);

  const blocks = markets.map((market) => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*New Market Detected!*\n*Address:* \`${market.market_address}\`\n*Question:* ${market.question_text || "N/A"}\n*Created:* ${market.block_timestamp || market.created_at || "Unknown"}`,
    },
  }));

  const payload = {
    text: `🎉 ${markets.length} new market${markets.length > 1 ? "s" : ""} ${markets.length > 1 ? "have" : "has"} gone live!`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🎉 ${markets.length} New Market${markets.length > 1 ? "s" : ""} Detected`,
        },
      },
      ...blocks,
    ],
  };

  try {
    console.log(`[SLACK MARKET] Sending request to Slack webhook...`);
    
    const response = await fetch(slackWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log(`[SLACK MARKET] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SLACK MARKET] ❌ Slack API error response: ${errorText}`);
      throw new Error(
        `Slack API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const responseText = await response.text();
    
    // Slack webhooks return "ok" on success
    if (responseText.trim() === "ok") {
      console.log(`[SLACK MARKET] ✅ Successfully sent Slack notification for ${markets.length} new market(s)`);
    } else {
      console.warn(`[SLACK MARKET] ⚠️ Unexpected response from Slack: ${responseText}`);
      console.log(`[SLACK MARKET] ✅ Message sent (response: ${responseText})`);
    }
  } catch (error) {
    console.error("[SLACK MARKET] ❌ Failed to send Slack notification:", error);
    if (error instanceof Error) {
      console.error("[SLACK MARKET] Error message:", error.message);
      console.error("[SLACK MARKET] Error stack:", error.stack);
    }
    throw error;
  }
}

/**
 * Check for new markets and send notifications
 */
export async function checkForNewMarkets(): Promise<void> {
  try {
    console.log("Checking for new markets...");
    const knownMarkets = await loadKnownMarkets();
    const allMarkets = await getAllMarkets();

    // Normalize market addresses to lowercase for comparison
    const knownMarketSet = new Set(
      knownMarkets.markets.map((addr) => addr.toLowerCase())
    );

    // Find new markets
    const newMarkets = allMarkets.filter(
      (market) => !knownMarketSet.has(market.market_address.toLowerCase())
    );

    if (newMarkets.length > 0) {
      console.log(`Found ${newMarkets.length} new market(s)`);

      // Send Slack notification
      const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
      if (slackWebhookUrl) {
        await sendSlackNotification(slackWebhookUrl, newMarkets);
      } else {
        console.warn(
          "SLACK_WEBHOOK_URL not set - skipping notification (markets still tracked)"
        );
      }

      // Update known markets
      const updatedKnownMarkets: KnownMarkets = {
        markets: allMarkets.map((m) => m.market_address),
        lastCheck: new Date().toISOString(),
      };
      await saveKnownMarkets(updatedKnownMarkets);

      console.log(`Updated known markets list (${allMarkets.length} total)`);
    } else {
      console.log("No new markets found");
      // Update last check time even if no new markets
      const updatedKnownMarkets: KnownMarkets = {
        ...knownMarkets,
        lastCheck: new Date().toISOString(),
      };
      await saveKnownMarkets(updatedKnownMarkets);
    }
  } catch (error) {
    console.error("Error checking for new markets:", error);
    // Don't throw - we want the interval to continue running
  }
}

let intervalId: NodeJS.Timeout | null = null;

/**
 * Start the market monitoring service
 * Checks for new markets every 30 minutes
 */
export function startMarketMonitoring(): void {
  if (intervalId) {
    console.log("Market monitoring is already running");
    return;
  }

  console.log("Starting market monitoring service (checking every 30 minutes)");

  // Run immediately on start
  checkForNewMarkets().catch((error) => {
    console.error("Initial market check failed:", error);
  });

  // Then run every 30 minutes
  intervalId = setInterval(() => {
    checkForNewMarkets();
  }, CHECK_INTERVAL_MS);

  console.log("Market monitoring service started");
}

/**
 * Stop the market monitoring service
 */
export function stopMarketMonitoring(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("Market monitoring service stopped");
  }
}
