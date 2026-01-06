import { gql } from "graphql-request";
import { GQL_CLIENT } from "../gql";

/**
 * @description Get all unresolved markets with metrics including:
 * - Total liquidity per market
 * - Outcome token prices
 * - Total supply per outcome token
 */

// TypeScript Interfaces
export interface OutcomeTokenMetrics {
  token_id: string;
  text?: string;
  price: number;
  total_supply: number;
  payoff: number;
  market_address: string;
}

export interface MarketMetrics {
  market_address: string;
  question_id: string;
  title: string;
  description: string;
  total_liquidity: number;
  outcome_tokens: OutcomeTokenMetrics[];
}

// GraphQL Queries
export const GET_UNRESOLVED_MARKETS = gql`
  query GetUnresolvedMarkets($limit: Int!, $offset: Int!) {
    ledger(
      limit: $limit
      offset: $offset
      order_by: [{ market_address: asc }, { token_id: asc }, { block_timestamp: desc }]
      distinct_on: [market_address, token_id]
    ) {
      market_address
      token_id
      question {
        id
        title
        question_resolves(limit: 1, order_by: { block_timestamp: desc }) {
          answer
        }
      }
      outcome {
        text
        outcome_stats(limit: 1, order_by: { block_timestamp: desc }) {
          marginal_price_hmr
          block_timestamp
        }
      }
    }
  }
`;

export const GET_MARKET_LIQUIDITY = gql`
  query GetMarketLiquidity($marketAddress: String!, $limit: Int!, $offset: Int!) {
    ledger(
      where: {
        market_address: { _eq: $marketAddress }
        event_type: { _neq: "finalise" }
      }
      limit: $limit
      offset: $offset
    ) {
      delta_collateral_hmr
    }
  }
`;

export const GET_MARKET_TOKEN_SUPPLY = gql`
  query GetMarketTokenSupply(
    $marketAddress: String!
    $tokenId: numeric!
    $limit: Int!
    $offset: Int!
  ) {
    ledger(
      where: { market_address: { _eq: $marketAddress }, token_id: { _eq: $tokenId } }
      limit: $limit
      offset: $offset
      order_by: [{ user_address: asc }, { block_timestamp: desc }]
      distinct_on: [user_address]
    ) {
      current_quantity_hmr
      user_address
    }
  }
`;

// Type definitions for GraphQL responses
interface UnresolvedMarketsResponse {
  ledger: Array<{
    market_address: string;
    token_id: string;
    question: {
      id: string;
      title?: string;
      question_resolves: Array<{
        answer: string | null;
      }>;
    };
    outcome: {
      text?: string;
      outcome_stats: Array<{
        marginal_price_hmr: string;
        block_timestamp: string;
      }>;
    };
  }>;
}

interface MarketLiquidityResponse {
  ledger: Array<{
    delta_collateral_hmr: string;
  }>;
}

interface MarketTokenSupplyResponse {
  ledger: Array<{
    current_quantity_hmr: string;
    user_address: string;
  }>;
}

/**
 * Calculate total liquidity for a specific market
 * Net liquidity: buys add to liquidity, sells subtract from liquidity
 */
async function calculateMarketLiquidity(
  marketAddress: string
): Promise<number> {
  let totalLiquidity = 0;
  let offset = 0;
  let hasMore = true;
  const pageSize = 1000;

  while (hasMore) {
    const result = await GQL_CLIENT.request<MarketLiquidityResponse>(
      GET_MARKET_LIQUIDITY,
      {
        marketAddress,
        limit: pageSize,
        offset,
      }
    );

    // Sum all collateral deltas (buys are positive, sells are negative)
    for (const entry of result.ledger) {
      totalLiquidity += parseFloat(entry.delta_collateral_hmr || "0");
    }

    offset += pageSize;

    if (result.ledger.length < pageSize) {
      hasMore = false;
    }
  }

  return totalLiquidity;
}

/**
 * Calculate total supply for a specific outcome token
 * Sums current_quantity_hmr from latest position of each user
 */
async function calculateTokenSupply(
  marketAddress: string,
  tokenId: number
): Promise<number> {
  let totalSupply = 0;
  let offset = 0;
  let hasMore = true;
  const pageSize = 1000;

  while (hasMore) {
    const result = await GQL_CLIENT.request<MarketTokenSupplyResponse>(
      GET_MARKET_TOKEN_SUPPLY,
      {
        marketAddress,
        tokenId,
        limit: pageSize,
        offset,
      }
    );

    // Sum current quantities across all users
    for (const entry of result.ledger) {
      totalSupply += parseFloat(entry.current_quantity_hmr || "0");
    }

    offset += pageSize;

    if (result.ledger.length < pageSize) {
      hasMore = false;
    }
  }

  return totalSupply;
}

/**
 * Main function to get all unresolved markets with their metrics
 * Returns market data with liquidity, outcome token prices, and total supply
 */
export async function getMarketsWithMetrics(): Promise<MarketMetrics[]> {
  const marketMap = new Map<string, MarketMetrics>();
  let offset = 0;
  let hasMore = true;
  const pageSize = 1000;

  while (hasMore) {
    const result = await GQL_CLIENT.request<UnresolvedMarketsResponse>(
      GET_UNRESOLVED_MARKETS,
      {
        limit: pageSize,
        offset,
      }
    );

    // Process each ledger entry (one per market/token combination)
    for (const entry of result.ledger) {
      // Skip if market is resolved (has an answer)
      const isResolved = entry.question?.question_resolves?.[0]?.answer != null;
      if (isResolved) {
        continue;
      }

      const marketAddress = entry.market_address;

      // Get or create market entry
      if (!marketMap.has(marketAddress)) {
        // Calculate liquidity once per market
        const totalLiquidity = await calculateMarketLiquidity(marketAddress);

        marketMap.set(marketAddress, {
          market_address: marketAddress,
          question_id: entry.question.id,
          title: entry.question.title || `${marketAddress.slice(0, 6)}...${marketAddress.slice(-4)}`,
          description: "", // Not available in ledger query
          total_liquidity: totalLiquidity,
          outcome_tokens: [],
        });
      }

      const market = marketMap.get(marketAddress)!;

      // Extract price from outcome_stats
      const price = parseFloat(
        entry.outcome?.outcome_stats[0]?.marginal_price_hmr || "0"
      );

      // Calculate total supply for this token
      const totalSupply = await calculateTokenSupply(
        marketAddress,
        parseInt(entry.token_id)
      );

      // Calculate payoff: (total_liquidity / total_supply) / price
      const payoff = totalSupply > 0 && price > 0
        ? (market.total_liquidity / totalSupply) / price
        : 0;

      market.outcome_tokens.push({
        token_id: entry.token_id,
        text: entry.outcome?.text,
        price,
        total_supply: totalSupply,
        payoff,
        market_address: marketAddress,
      });
    }

    offset += pageSize;

    if (result.ledger.length < pageSize) {
      hasMore = false;
    }
  }

  return Array.from(marketMap.values());
}
