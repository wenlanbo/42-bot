import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { getWalletPortfolio, getWalletPositions } from "../lib/for-wenbo-main/queries/wallet";
import { getMarketsWithMetrics } from "../lib/for-wenbo-main/queries/market";
import { startMarketMonitoring } from "./market-monitor";
import { startWalletMonitoring } from "./wallet-monitor";
import { sendSlackTestMessage } from "./slack-test";

const app = express();
const PORT = process.env.PORT || 3001;
// Use /tmp for serverless environments (Vercel), fallback to __dirname for local
const TRACKED_WALLETS_FILE = process.env.VERCEL 
  ? "/tmp/tracked-wallets.json"
  : path.join(__dirname, "tracked-wallets.json");

app.use(cors());
app.use(express.json());

// Serve static files from frontend directory
// In Vercel, use process.cwd() as the base path
const frontendPath = process.env.VERCEL 
  ? path.join(process.cwd(), "frontend")
  : path.join(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

// Serve frontend HTML for root route
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Ensure tracked wallets file exists
async function ensureTrackedWalletsFile() {
  try {
    await fs.access(TRACKED_WALLETS_FILE);
  } catch {
    await fs.writeFile(TRACKED_WALLETS_FILE, JSON.stringify([]), "utf-8");
  }
}

// Read tracked wallets
async function getTrackedWallets(): Promise<string[]> {
  await ensureTrackedWalletsFile();
  const data = await fs.readFile(TRACKED_WALLETS_FILE, "utf-8");
  return JSON.parse(data);
}

// Write tracked wallets
async function saveTrackedWallets(wallets: string[]): Promise<void> {
  await ensureTrackedWalletsFile();
  await fs.writeFile(TRACKED_WALLETS_FILE, JSON.stringify(wallets, null, 2), "utf-8");
}

// Get all tracked wallets
app.get("/api/tracked-wallets", async (req, res) => {
  try {
    const wallets = await getTrackedWallets();
    res.json({ wallets });
  } catch (error) {
    console.error("Error fetching tracked wallets:", error);
    res.status(500).json({ error: "Failed to fetch tracked wallets" });
  }
});

// Add a tracked wallet
app.post("/api/tracked-wallets", async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress || typeof walletAddress !== "string") {
      return res.status(400).json({ error: "walletAddress is required" });
    }

    // Basic validation for Ethereum address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: "Invalid wallet address format" });
    }

    const wallets = await getTrackedWallets();
    const normalizedAddress = walletAddress.toLowerCase();

    if (wallets.includes(normalizedAddress)) {
      return res.status(400).json({ error: "Wallet already tracked" });
    }

    wallets.push(normalizedAddress);
    await saveTrackedWallets(wallets);

    res.json({ success: true, wallet: normalizedAddress });
  } catch (error) {
    console.error("Error adding tracked wallet:", error);
    res.status(500).json({ error: "Failed to add tracked wallet" });
  }
});

// Remove a tracked wallet
app.delete("/api/tracked-wallets/:walletAddress", async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const wallets = await getTrackedWallets();
    const normalizedAddress = walletAddress.toLowerCase();

    const index = wallets.indexOf(normalizedAddress);
    if (index === -1) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    wallets.splice(index, 1);
    await saveTrackedWallets(wallets);

    res.json({ success: true });
  } catch (error) {
    console.error("Error removing tracked wallet:", error);
    res.status(500).json({ error: "Failed to remove tracked wallet" });
  }
});

// Get portfolio for a specific wallet
app.get("/api/wallet/:walletAddress/portfolio", async (req, res) => {
  try {
    const { walletAddress } = req.params;
    
    console.log(`[API] GET /api/wallet/${walletAddress}/portfolio`);
    
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: "Invalid wallet address format" });
    }

    // Check if GraphQL endpoint is configured
    const gqlEndpoint = process.env.NEXT_PUBLIC_HASURA_GQL_ENDPOINT || process.env.HASURA_GQL_ENDPOINT;
    if (!gqlEndpoint) {
      console.error("[API] ❌ GraphQL endpoint not configured");
      return res.status(500).json({ 
        error: "GraphQL endpoint not configured",
        message: "Please set NEXT_PUBLIC_HASURA_GQL_ENDPOINT environment variable",
        details: "The server is trying to connect to localhost:8080 which doesn't work on Vercel"
      });
    }

    console.log(`[API] Fetching portfolio for ${walletAddress}...`);
    const portfolio = await getWalletPortfolio(walletAddress);
    console.log(`[API] ✅ Portfolio fetched: $${portfolio.toFixed(2)}`);
    res.json({ walletAddress, portfolio });
  } catch (error) {
    console.error("[API] ❌ Error fetching portfolio:", error);
    if (error instanceof Error) {
      console.error("[API] Error message:", error.message);
      console.error("[API] Error stack:", error.stack);
      
      // Check if it's a connection error
      if (error.message.includes("ECONNREFUSED") || error.message.includes("localhost")) {
        return res.status(500).json({ 
          error: "Failed to connect to GraphQL endpoint",
          message: "GraphQL endpoint is not accessible. Please check NEXT_PUBLIC_HASURA_GQL_ENDPOINT environment variable.",
          details: error.message
        });
      }
      
      return res.status(500).json({ 
        error: "Failed to fetch portfolio",
        message: error.message,
        details: error.stack
      });
    }
    res.status(500).json({ error: "Failed to fetch portfolio", message: "Unknown error" });
  }
});

// Get positions for a specific wallet
app.get("/api/wallet/:walletAddress/positions", async (req, res) => {
  try {
    const { walletAddress } = req.params;
    
    console.log(`[API] GET /api/wallet/${walletAddress}/positions`);
    
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: "Invalid wallet address format" });
    }

    // Check if GraphQL endpoint is configured
    const gqlEndpoint = process.env.NEXT_PUBLIC_HASURA_GQL_ENDPOINT || process.env.HASURA_GQL_ENDPOINT;
    if (!gqlEndpoint) {
      console.error("[API] ❌ GraphQL endpoint not configured");
      return res.status(500).json({ 
        error: "GraphQL endpoint not configured",
        message: "Please set NEXT_PUBLIC_HASURA_GQL_ENDPOINT environment variable",
        details: "The server is trying to connect to localhost:8080 which doesn't work on Vercel"
      });
    }

    console.log(`[API] Fetching positions for ${walletAddress}...`);
    const positions = await getWalletPositions(walletAddress);
    console.log(`[API] ✅ Positions fetched: ${positions.length} positions`);
    res.json({ walletAddress, positions });
  } catch (error) {
    console.error("[API] ❌ Error fetching positions:", error);
    if (error instanceof Error) {
      console.error("[API] Error message:", error.message);
      console.error("[API] Error stack:", error.stack);
      
      // Check if it's a connection error
      if (error.message.includes("ECONNREFUSED") || error.message.includes("localhost")) {
        return res.status(500).json({ 
          error: "Failed to connect to GraphQL endpoint",
          message: "GraphQL endpoint is not accessible. Please check NEXT_PUBLIC_HASURA_GQL_ENDPOINT environment variable.",
          details: error.message
        });
      }
      
      return res.status(500).json({ 
        error: "Failed to fetch positions",
        message: error.message,
        details: error.stack
      });
    }
    res.status(500).json({ error: "Failed to fetch positions", message: "Unknown error" });
  }
});

// Get portfolio and positions for all tracked wallets
app.get("/api/tracked-wallets/portfolio", async (req, res) => {
  try {
    const wallets = await getTrackedWallets();
    const results = await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const portfolio = await getWalletPortfolio(wallet);
          return { wallet, portfolio };
        } catch (error) {
          console.error(`Error fetching portfolio for ${wallet}:`, error);
          return { wallet, portfolio: 0, error: "Failed to fetch" };
        }
      })
    );

    res.json({ results });
  } catch (error) {
    console.error("Error fetching tracked wallets portfolio:", error);
    res.status(500).json({ error: "Failed to fetch tracked wallets portfolio" });
  }
});

// Get positions for all tracked wallets
app.get("/api/tracked-wallets/positions", async (req, res) => {
  try {
    const wallets = await getTrackedWallets();
    const results = await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const positions = await getWalletPositions(wallet);
          return { wallet, positions };
        } catch (error) {
          console.error(`Error fetching positions for ${wallet}:`, error);
          return { wallet, positions: [], error: "Failed to fetch" };
        }
      })
    );

    res.json({ results });
  } catch (error) {
    console.error("Error fetching tracked wallets positions:", error);
    res.status(500).json({ error: "Failed to fetch tracked wallets positions" });
  }
});

// Get all unresolved markets with metrics
app.get("/api/markets/unresolved", async (req, res) => {
  try {
    console.log("[API] Fetching unresolved markets...");
    const markets = await getMarketsWithMetrics();
    console.log(`[API] ✅ Found ${markets.length} unresolved markets`);
    res.json({ markets });
  } catch (error) {
    console.error("[API] ❌ Error fetching unresolved markets:", error);
    if (error instanceof Error) {
      console.error("[API] Error message:", error.message);
      console.error("[API] Error stack:", error.stack);
      return res.status(500).json({
        error: "Failed to fetch unresolved markets",
        message: error.message,
        details: error.stack
      });
    }
    res.status(500).json({ error: "Failed to fetch unresolved markets", message: "Unknown error" });
  }
});

// Market monitoring endpoint (can be called manually or by cron)
app.post("/api/markets/check", async (req, res) => {
  try {
    const { checkForNewMarkets } = await import("./market-monitor");
    await checkForNewMarkets();
    res.json({ success: true, message: "Market check completed" });
  } catch (error) {
    console.error("Error checking markets:", error);
    res.status(500).json({
      error: "Failed to check markets",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Wallet monitoring endpoint (can be called manually or by cron)
app.post("/api/wallet/check", async (req, res) => {
  try {
    const { checkWalletAndSendReport } = await import("./wallet-monitor");
    await checkWalletAndSendReport();
    res.json({ success: true, message: "Wallet check completed" });
  } catch (error) {
    console.error("Error checking wallet:", error);
    res.status(500).json({ 
      error: "Failed to check wallet",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Test Slack notification endpoint
app.post("/api/slack/test", async (req, res) => {
  console.log("[API] /api/slack/test endpoint called");
  console.log(`[API] SLACK_WEBHOOK_URL configured: ${!!process.env.SLACK_WEBHOOK_URL}`);
  
  try {
    const { sendSlackTestMessage } = await import("./slack-test");
    await sendSlackTestMessage();
    console.log("[API] ✅ Test message sent successfully");
    res.json({ success: true, message: "Test message sent to Slack" });
  } catch (error) {
    console.error("[API] ❌ Error sending test message:", error);
    if (error instanceof Error) {
      console.error("[API] Error details:", error.message);
      console.error("[API] Error stack:", error.stack);
    }
    res.status(500).json({ 
      error: "Failed to send test message",
      message: error instanceof Error ? error.message : "Unknown error",
      details: error instanceof Error ? error.stack : undefined
    });
  }
});

// Debug endpoint to check environment
app.get("/api/debug/env", (req, res) => {
  res.json({
    hasSlackWebhook: !!process.env.SLACK_WEBHOOK_URL,
    slackWebhookPrefix: process.env.SLACK_WEBHOOK_URL ? process.env.SLACK_WEBHOOK_URL.substring(0, 30) + "..." : "Not set",
    hasGraphQLEndpoint: !!(process.env.NEXT_PUBLIC_HASURA_GQL_ENDPOINT || process.env.HASURA_GQL_ENDPOINT),
    graphQLEndpoint: process.env.NEXT_PUBLIC_HASURA_GQL_ENDPOINT || process.env.HASURA_GQL_ENDPOINT || "Not set (using default localhost:8080)",
    hasHasuraSecret: !!process.env.HASURA_ADMIN_SECRET,
    isVercel: !!process.env.VERCEL,
    nodeEnv: process.env.NODE_ENV,
  });
});

// Only start the server if this file is run directly (not imported as a module)
// In Vercel/serverless environments, the app will be exported and handled by the platform
// Check if we're running in a serverless environment
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

if (!isServerless && typeof require !== 'undefined' && require.main === module) {
  app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Start market monitoring when server starts (only in non-serverless environments)
    // Note: In serverless environments (Vercel), use the /api/markets/check endpoint
    // with Vercel Cron Jobs instead (see vercel.json for cron configuration)
    startMarketMonitoring();
    // Start wallet monitoring (checks every 5 minutes)
    startWalletMonitoring();
    
    // Send test message to Slack on deployment (only in production/Vercel)
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      setTimeout(async () => {
        try {
          await sendSlackTestMessage();
        } catch (error) {
          console.error("Failed to send deployment test message:", error);
        }
      }, 2000); // Wait 2 seconds for server to fully start
    }
  });
}

// Export the app for serverless environments (Vercel, etc.)
export default app;

