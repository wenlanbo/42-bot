import { gql } from "graphql-request";
import { GQL_CLIENT } from "../gql";
import type {
  GetLastPositionPnlQuery,
  GetLastPositionPnlQueryVariables,
} from "../generated/types";
import { getOrCreate } from "./utils";

/**
 * @description builds leaderboard data for total pnl
 * @description leaderboard has 3 degrees of granularity:
 *              1. Leaderboard for pnl per user
 *              2. Leaderboard for pnl per user & per market
 *              3. Leaderboard for pnl per user & per market + OT
 * @dev to calculate pnl:
 *      1. Claim PnL
 *      2. Realized Trade Pnl
 */
export async function buildProfitLeaderboard(pageSize: number = 1000) {
  const leaderboard: PnlLeaderboard = {
    userToStats: new Map(),
    userToMarketToStats: new Map(),
    userToMarketToTokenToStats: new Map(),
  };

  let offset = 0;
  let totalProcessed = 0;
  let hasMore = true;

  while (true) {
    const result = await GQL_CLIENT.request<
      GetLastPositionPnlQuery,
      GetLastPositionPnlQueryVariables
    >(GET_LAST_POSITION_PNL, { limit: pageSize, offset });

    const entries = result.ledger;

    if (entries.length === 0) {
      hasMore = false;
      break;
    }

    processBatch(leaderboard, entries);

    totalProcessed += entries.length;
    offset += pageSize;

    console.log(`Processed ${totalProcessed} position...`);

    if (entries.length < pageSize) {
      hasMore = false;
    }
  }

  console.log(`Finished processing ${totalProcessed} total ledger entries`);
  return leaderboard;
}

export const GET_LAST_POSITION_PNL = gql`
  query GetLastPositionPnl($limit: Int!, $offset: Int!) {
    ledger(
      limit: $limit
      offset: $offset
      order_by: [
        { user_address: asc }
        { market_address: asc }
        { token_id: asc }
        { block_timestamp: desc }
      ]
      distinct_on: [user_address, market_address, token_id]
    ) {
      user_address
      market_address
      token_id
      current_quantity_hmr
      realized_pnl_hmr
      block_timestamp
      event_type
    }
  }
`;

type PnlLedgerEntry = GetLastPositionPnlQuery["ledger"][number];
export type Pnl = number;
const ZERO_PNL = 0;

export interface PnlLeaderboard {
  // pnl per user
  userToStats: Map<string, Pnl>;

  // pnl per user per market
  userToMarketToStats: Map<string, Map<string, Pnl>>;

  // pnl per user per market per token
  userToMarketToTokenToStats: Map<string, Map<string, Map<string, Pnl>>>;
}

function processBatch(leaderboard: PnlLeaderboard, entries: PnlLedgerEntry[]) {
  for (const entry of entries) {
    const { user_address, market_address, token_id, realized_pnl_hmr } = entry;
    const pnl = parseFloat(realized_pnl_hmr);

    // pnl per user
    const currentUserPnl =
      leaderboard.userToStats.get(user_address) || ZERO_PNL;
    leaderboard.userToStats.set(user_address, currentUserPnl + pnl);

    // pnl per user per market
    const marketToStats = getOrCreate(
      leaderboard.userToMarketToStats,
      user_address,
      () => new Map()
    );
    const currentMarketPnl = marketToStats.get(market_address) || ZERO_PNL;
    marketToStats.set(market_address, currentMarketPnl + pnl);

    // pnl per user per market per token
    const marketToToken = getOrCreate(
      leaderboard.userToMarketToTokenToStats,
      user_address,
      () => new Map()
    );
    const tokenToStats = getOrCreate(
      marketToToken,
      market_address,
      () => new Map()
    );
    tokenToStats.set(token_id, pnl);
  }
}
