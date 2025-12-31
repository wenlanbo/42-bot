# 42 Bot - Wallet Tracker

A full-stack application for tracking wallet addresses, viewing their portfolios, and monitoring their positions.

## Features

- ✅ Add/remove wallet addresses to track
- ✅ View portfolio values for tracked wallets (including BSC chain cash positions)
- ✅ View all positions for tracked wallets with detailed information
- ✅ Real-time data from GraphQL API and BSC blockchain

## Project Structure

```
.
├── lib/for-wenbo-main/     # GraphQL query library
│   ├── queries/
│   │   └── wallet.ts       # Wallet-specific queries (portfolio & positions)
│   ├── gql.ts              # GraphQL client setup
│   └── evm.ts              # EVM/BSC chain client setup
├── server/                 # Backend Express server
│   ├── index.ts            # API endpoints
│   ├── package.json        # Server dependencies
│   └── tracked-wallets.json # Stored tracked wallets (auto-created)
└── frontend/               # Frontend web interface
    └── index.html          # Single-page application
```

## Setup

### Prerequisites

- Node.js 18+ and npm/pnpm
- Access to Hasura GraphQL endpoint
- BSC RPC endpoint (optional, defaults to public RPC)

### 1. Install Dependencies

#### Backend Server
```bash
cd server
npm install
# or
pnpm install
```

#### Library (if needed)
```bash
cd lib/for-wenbo-main
pnpm install
```

### 2. Environment Variables

Create a `.env` file in the `server` directory (or root):

```env
# GraphQL/Hasura Configuration
NEXT_PUBLIC_HASURA_GQL_ENDPOINT=http://localhost:8080/v1/graphql
HASURA_ADMIN_SECRET=your-secret-here

# BSC RPC (optional)
NEXT_PUBLIC_RPC_URL=https://bsc-dataseed.binance.org/

# Server Port (optional, defaults to 3001)
PORT=3001

# Slack Webhook URL for market notifications (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### 3. Generate GraphQL Types (if needed)

If you need to regenerate TypeScript types from the GraphQL schema:

```bash
cd lib/for-wenbo-main
pnpm codegen
```

### 4. Start the Server

```bash
cd server
npm run dev    # Development mode with hot reload
# or
npm start      # Production mode
```

The server will start on `http://localhost:3001`

### 5. Open the Frontend

Simply open `frontend/index.html` in your browser, or serve it with a simple HTTP server:

```bash
# Using Python
cd frontend
python -m http.server 8000

# Using Node.js http-server
npx http-server frontend -p 8000
```

Then open `http://localhost:8000` in your browser.

## API Endpoints

### Tracked Wallets

- `GET /api/tracked-wallets` - Get all tracked wallet addresses
- `POST /api/tracked-wallets` - Add a wallet to track
  ```json
  { "walletAddress": "0x..." }
  ```
- `DELETE /api/tracked-wallets/:walletAddress` - Remove a tracked wallet

### Wallet Data

- `GET /api/wallet/:walletAddress/portfolio` - Get portfolio value for a wallet
- `GET /api/wallet/:walletAddress/positions` - Get all positions for a wallet

### Batch Operations

- `GET /api/tracked-wallets/portfolio` - Get portfolios for all tracked wallets
- `GET /api/tracked-wallets/positions` - Get positions for all tracked wallets

## Usage

1. **Add a Wallet**: Enter a wallet address (0x format) in the input field and click "Add Wallet"

2. **View Portfolios**: Click "Refresh Portfolios" to see the total portfolio value for all tracked wallets (includes positions + cash on BSC)

3. **View Positions**: Click "Refresh Positions" to see all active positions for tracked wallets, including:
   - Market address
   - Token ID
   - Quantity
   - Current price
   - Position value
   - Realized PnL
   - Status (Active/Resolved, Winning/Losing)

## Data Storage

Tracked wallets are stored in `server/tracked-wallets.json` as a simple JSON array. This file is automatically created on first use.

## Market Monitoring

The server includes a market monitoring service that:

- **Checks for new markets every 30 minutes** (automatic in local development)
- **Sends Slack notifications** when new markets are detected
- **Tracks known markets** to avoid duplicate notifications

### Setup for Market Monitoring

1. **Slack Webhook Setup:**
   - Go to your Slack workspace
   - Create a new Slack App or use an existing one
   - Enable "Incoming Webhooks"
   - Create a webhook for the channel where you want notifications
   - Add the webhook URL to your `.env` file as `SLACK_WEBHOOK_URL`

2. **Local Development:**
   - The monitoring service starts automatically when you run the server
   - It runs every 30 minutes and sends notifications to Slack

3. **Vercel Deployment:**
   - The `vercel.json` includes a cron job configuration
   - Vercel will automatically call `/api/cron/check-markets` every 30 minutes
   - Make sure to set `SLACK_WEBHOOK_URL` in your Vercel environment variables

### Manual Market Check

You can manually trigger a market check by calling:
```bash
curl -X POST http://localhost:3001/api/markets/check
```

## Notes

- Wallet addresses are normalized to lowercase for consistency
- Portfolio calculation includes:
  - Active position values (unresolved markets)
  - Resolved but unclaimed position values
  - Cash holdings from BSC chain (USDC balance)
- Positions only show non-zero quantities
- The system queries the GraphQL API with pagination to handle large datasets
- Market monitoring stores known markets in `server/known-markets.json` (local) or `/tmp/known-markets.json` (serverless)
