# Leaderboard Queries

This directory contains GraphQL queries for fetching leaderboard data.

## Setup

1. Install dependencies:
```bash
pnpm i
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Update `.env` with your GraphQL endpoint and credentials

## Data to Query

- Use the `./queries` table for info on how to query the data
- Use the `./leaderboard` for example of the leaderboard

## Generate codegen
```bash
pnpm codegen
```

## Usage

```bash
# generate OT
pnpm leaderboard:ot

# generate Profit
pnpm leaderboard:profit

# generate Portfolio
pnpm leaderboard:portfolio
```

## Files & Folders

- `queries`: Folder for query on how to fetch OT, Portfolio and Profit
- `gql.ts`: Required params for GQL related interactions
- `evm.ts`: Required params for EVM related interactions
