import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { getWalletPortfolio, getWalletPositions } from "../lib/for-wenbo-main/queries/wallet";

const app = express();
const PORT = process.env.PORT || 3001;
const TRACKED_WALLETS_FILE = path.join(__dirname, "tracked-wallets.json");

app.use(cors());
app.use(express.json());

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
    
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: "Invalid wallet address format" });
    }

    const portfolio = await getWalletPortfolio(walletAddress);
    res.json({ walletAddress, portfolio });
  } catch (error) {
    console.error("Error fetching portfolio:", error);
    res.status(500).json({ error: "Failed to fetch portfolio" });
  }
});

// Get positions for a specific wallet
app.get("/api/wallet/:walletAddress/positions", async (req, res) => {
  try {
    const { walletAddress } = req.params;
    
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: "Invalid wallet address format" });
    }

    const positions = await getWalletPositions(walletAddress);
    res.json({ walletAddress, positions });
  } catch (error) {
    console.error("Error fetching positions:", error);
    res.status(500).json({ error: "Failed to fetch positions" });
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

