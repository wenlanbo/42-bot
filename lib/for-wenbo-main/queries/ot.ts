import { gql } from "graphql-request";
import { GQL_CLIENT } from "../gql";
import type {
  GetTradesQuery,
  GetTradesQueryVariables,
} from "../generated/types";
import { getOrCreate } from "./utils";

/**
 * @description builds leaderboard data for amount of OT traded in terms of cumulative volume & cumulative quantity
 * @description leaderboard has 3 degrees of granularity:
 *              1. Leaderboard for OT traded per user
 *              2. Leaderboard for OT traded per user & per market
 *              3. Leaderboard for OT traded per user & per market + OT
 * @dev to calculate OT traded in cumulative quantity, simply add the quantity of OT per trade per user. For cumulative volume, add the value of OT per trade per user.
 */
export async function buildOTLeaderboard(
  pageSize: number = 1000
): Promise<OTLeaderboard> {
  const leaderboard: OTLeaderboard = {
    userToStats: new Map(),
    userToMarketToStats: new Map(),
    userToMarketToTokenToStats: new Map(),
  };

  let offset = 0;
  let totalProcessed = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await GQL_CLIENT.request<
      GetTradesQuery,
      GetTradesQueryVariables
    >(GET_TRADES, { limit: pageSize, offset });

    const entries = result.ledger;

    if (entries.length === 0) {
      hasMore = false;
      break;
    }

    processBatch(leaderboard, entries);

    totalProcessed += entries.length;
    offset += pageSize;

    console.log(`Processed ${totalProcessed} ledger entries...`);

    // If we got fewer entries than pageSize, we're done
    if (entries.length < pageSize) {
      hasMore = false;
    }
  }

  console.log(`Finished processing ${totalProcessed} total ledger entries`);
  return leaderboard;
}

export const GET_TRADES = gql`
  query GetTrades($limit: Int!, $offset: Int!) {
    ledger(
      limit: $limit
      offset: $offset
      order_by: { id: asc }
      where: { event_type: { _neq: "finalise" } }
    ) {
      user_address
      market_address
      token_id
      delta_quantity_hmr
      delta_collateral_hmr
    }
  }
`;

type LedgerEntry = GetTradesQuery["ledger"][number];
export type CumVolQty = [cumVol: number, cumQty: number];
const ZERO_CUM_VOL_QTY = [0, 0];

export interface OTLeaderboard {
  // OT traded per user
  userToStats: Map<string, CumVolQty>;

  // OT traded per user per market
  userToMarketToStats: Map<string, Map<string, CumVolQty>>;

  // OT traded per user per market per token
  userToMarketToTokenToStats: Map<string, Map<string, Map<string, CumVolQty>>>;
}

function processBatch(
  leaderboard: OTLeaderboard,
  entries: LedgerEntry[]
): void {
  for (const entry of entries) {
    const {
      user_address,
      market_address,
      token_id,
      delta_quantity_hmr,
      delta_collateral_hmr,
    } = entry;
    const quantity = Math.abs(parseFloat(delta_quantity_hmr));
    const volume = Math.abs(parseFloat(delta_collateral_hmr));

    // OT traded per user
    const [v1, q1] =
      leaderboard.userToStats.get(user_address) || ZERO_CUM_VOL_QTY;
    leaderboard.userToStats.set(user_address, [v1 + volume, q1 + quantity]);

    // OT traded per user per market
    const marketToStats = getOrCreate(
      leaderboard.userToMarketToStats,
      user_address,
      () => new Map()
    );
    const [v2, q2] = marketToStats.get(market_address) || ZERO_CUM_VOL_QTY;
    marketToStats.set(market_address, [v2 + volume, q2 + quantity]);

    // OT traded per user per market per token
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
    const [v3, q3] = tokenToStats.get(token_id) || ZERO_CUM_VOL_QTY;
    tokenToStats.set(token_id, [v3 + volume, q3 + quantity]);
  }
}
