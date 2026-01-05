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
  price: number;
  total_supply: number;
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
      where: {
        question: {
          question_resolves: { answer: { _is_null: true } }
        }
      }
    ) {
      market_address
      token_id
      question {
        id
        question_text
        created_at
        question_resolves(limit: 1, order_by: { block_timestamp: desc }) {
          answer
        }
      }
      outcome {
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
    $tokenId: String!
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
      question_text: string;
      created_at: string;
      question_resolves: Array<{
        answer: string | null;
      }>;
    };
    outcome: {
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
 * Sums absolute value of all delta_collateral_hmr to represent trading volume
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

    // Sum absolute value of all collateral deltas
    for (const entry of result.ledger) {
      totalLiquidity += Math.abs(parseFloat(entry.delta_collateral_hmr || "0"));
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
  tokenId: string
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
      const marketAddress = entry.market_address;

      // Get or create market entry
      if (!marketMap.has(marketAddress)) {
        // Calculate liquidity once per market
        const totalLiquidity = await calculateMarketLiquidity(marketAddress);

        marketMap.set(marketAddress, {
          market_address: marketAddress,
          question_id: entry.question.id,
          title: entry.question.question_text || "Untitled Market",
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
        entry.token_id
      );

      market.outcome_tokens.push({
        token_id: entry.token_id,
        price,
        total_supply: totalSupply,
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
