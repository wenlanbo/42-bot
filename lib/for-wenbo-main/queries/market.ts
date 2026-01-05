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
    question(
      limit: $limit
      offset: $offset
      where: { question_resolves: { answer: { _is_null: true } } }
      order_by: { id: asc }
    ) {
      id
      market_address
      title
      description
      outcomes {
        token_id
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
  question: Array<{
    id: string;
    market_address: string;
    title: string;
    description: string;
    outcomes: Array<{
      token_id: string;
      outcome_stats: Array<{
        marginal_price_hmr: string;
        block_timestamp: string;
      }>;
    }>;
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
  const markets: MarketMetrics[] = [];
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

    // Process each market
    for (const question of result.question) {
      // Calculate liquidity once per market
      const totalLiquidity = await calculateMarketLiquidity(
        question.market_address
      );

      // Process each outcome token
      const outcomeTokens: OutcomeTokenMetrics[] = [];
      for (const outcome of question.outcomes) {
        // Extract price from outcome_stats
        const price = parseFloat(
          outcome.outcome_stats[0]?.marginal_price_hmr || "0"
        );

        // Calculate total supply for this token
        const totalSupply = await calculateTokenSupply(
          question.market_address,
          outcome.token_id
        );

        outcomeTokens.push({
          token_id: outcome.token_id,
          price,
          total_supply: totalSupply,
          market_address: question.market_address,
        });
      }

      markets.push({
        market_address: question.market_address,
        question_id: question.id,
        title: question.title || "Untitled Market",
        description: question.description || "",
        total_liquidity: totalLiquidity,
        outcome_tokens: outcomeTokens,
      });
    }

    offset += pageSize;

    if (result.question.length < pageSize) {
      hasMore = false;
    }
  }

  return markets;
}
