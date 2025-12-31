import { gql } from "graphql-request";
import { GQL_CLIENT } from "../gql";

/**
 * Market information from the GraphQL API
 */
export interface Market {
  market_address: string;
  created_at?: string;
  block_timestamp?: string;
  question_text?: string;
}

/**
 * Query to get all distinct markets, ordered by creation time (newest first)
 * This queries the ledger table to get distinct market addresses
 * Note: distinct_on requires the distinct column to be first in order_by
 */
export const GET_ALL_MARKETS = gql`
  query GetAllMarkets($limit: Int!, $offset: Int!) {
    ledger(
      limit: $limit
      offset: $offset
      order_by: [{ market_address: asc }, { block_timestamp: desc }]
      distinct_on: [market_address]
    ) {
      market_address
      block_timestamp
      question {
        question_text
        created_at
      }
    }
  }
`;

/**
 * Get all markets from the GraphQL API
 * @returns Array of unique market addresses with their metadata
 */
export async function getAllMarkets(): Promise<Market[]> {
  const markets: Market[] = [];
  const seenMarkets = new Set<string>();
  let offset = 0;
  let hasMore = true;
  const pageSize = 1000;

  while (hasMore) {
    try {
      const result = await GQL_CLIENT.request<{
        ledger: Array<{
          market_address: string;
          block_timestamp: string;
          question?: {
            question_text?: string;
            created_at?: string;
          } | null;
        }>;
      }>(GET_ALL_MARKETS, {
        limit: pageSize,
        offset,
      });

      const entries = result.ledger || [];

      if (entries.length === 0) {
        hasMore = false;
        break;
      }

      for (const entry of entries) {
        // Only add markets we haven't seen yet (distinct_on should handle this, but double-check)
        if (!seenMarkets.has(entry.market_address.toLowerCase())) {
          seenMarkets.add(entry.market_address.toLowerCase());
          markets.push({
            market_address: entry.market_address,
            block_timestamp: entry.block_timestamp,
            created_at: entry.question?.created_at,
            question_text: entry.question?.question_text,
          });
        }
      }

      offset += pageSize;

      if (entries.length < pageSize) {
        hasMore = false;
      }
    } catch (error) {
      console.error("Error fetching markets:", error);
      throw error;
    }
  }

  return markets;
}

/**
 * Get markets created after a specific timestamp
 * @param afterTimestamp - Only return markets created after this timestamp
 */
export async function getNewMarkets(
  afterTimestamp: string
): Promise<Market[]> {
  const allMarkets = await getAllMarkets();
  return allMarkets.filter((market) => {
    const marketTime = market.block_timestamp || market.created_at;
    return marketTime && marketTime > afterTimestamp;
  });
}
