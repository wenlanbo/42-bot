import { gql } from "graphql-request";
import {
  GetLastPositionQuery,
  GetLastPositionQueryVariables,
  GetMarketClaimsQuery,
  GetMarketClaimsQueryVariables,
} from "../generated/types";
import { formatUnits } from "viem";
import { GQL_CLIENT } from "../gql";
import { COLLATERAL_ADDRESS, ERC20_ABI, PUBLIC_CLIENT } from "../evm";

/**
 * @description Get portfolio value for a specific wallet address
 * @dev to calculate portfolio:
 *      1. Position Value (Resolved but unclaimed, active face value)
 *      2. Cash Holdings (from BSC chain)
 */
export async function getWalletPortfolio(
  walletAddress: string
): Promise<number> {
  const claims: MarketClaims = {};
  let portfolio = 0;

  // Fetch all market claims for this wallet (filtered at database level)
  let offset = 0;
  let hasMore = true;
  const pageSize = 1000;
  const normalizedWalletAddress = walletAddress.toLowerCase();

  while (hasMore) {
    try {
      const result = await GQL_CLIENT.request<{
        market_claim: ClaimEntry[];
      }>(GET_MARKET_CLAIMS_BY_WALLET, {
        limit: pageSize,
        offset,
        userAddress: normalizedWalletAddress,
      });

      const entries = result.market_claim || [];

      if (entries.length === 0) {
        hasMore = false;
        break;
      }

      processClaims(claims, entries);

      offset += pageSize;

      if (entries.length < pageSize) {
        hasMore = false;
      }
    } catch (error) {
      console.error(`[WALLET PORTFOLIO] Error fetching market claims at offset ${offset}:`, error);
      // If we get an error, break to avoid infinite loop
      hasMore = false;
      throw error;
    }
  }

  // Fetch last positions for this wallet (filtered at database level)
  offset = 0;
  hasMore = true;

  while (hasMore) {
    try {
      const result = await GQL_CLIENT.request<{
        ledger: LastPositionEntry[];
      }>(GET_LAST_POSITION_BY_WALLET, {
        limit: pageSize,
        offset,
        userAddress: normalizedWalletAddress,
      });

      const entries = result.ledger || [];

      if (entries.length === 0) {
        hasMore = false;
        break;
      }

    for (const entry of entries) {
      const { market_address, token_id, question } = entry;

      if (question.question_resolves?.[0]?.answer != null) {
        if (
          (Number(token_id) &
            Number(entry.question.question_resolves[0].answer)) !==
          0
        ) {
          const key = buildClaimKey(walletAddress, market_address, token_id);
          const fullClaimWei = -BigInt(entry.delta_quantity);
          const claimedWei = claims?.[key] || BigInt(0);
          const remainingWei = fullClaimWei - claimedWei;
          if (remainingWei > BigInt(0)) {
            const payoutPerOt = parseFloat(
              entry.outcome?.outcome_stats[0].payout_hmr || "0"
            );
            const remaining = Number(formatUnits(remainingWei, 18));
            const value = payoutPerOt * remaining;
            portfolio += value;
          }
        }
      } else {
        const price = parseFloat(
          entry.outcome?.outcome_stats[0].marginal_price_hmr || "0"
        );
        const quantity = parseFloat(entry?.current_quantity_hmr || "0");
        const value = price * quantity;
        portfolio += value;
      }
    }

      offset += pageSize;

      if (entries.length < pageSize) {
        hasMore = false;
      }
    } catch (error) {
      console.error(`[WALLET PORTFOLIO] Error fetching positions at offset ${offset}:`, error);
      // If we get an error, break to avoid infinite loop
      hasMore = false;
      throw error;
    }
  }

  // Fetch cash balance from BSC chain
  try {
    const result = await PUBLIC_CLIENT.readContract({
      address: COLLATERAL_ADDRESS as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [walletAddress as `0x${string}`],
    });

    const usdcBalance = Number(formatUnits(result, 6));
    portfolio += usdcBalance;
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.warn(
      `Failed to fetch USDC balance for ${walletAddress}:`,
      error
    );
  }

  return portfolio;
}

/**
 * @description Get all positions for a specific wallet address
 */
export async function getWalletPositions(walletAddress: string) {
  const positions: WalletPosition[] = [];
  let offset = 0;
  let hasMore = true;
  const pageSize = 1000;
  const normalizedWalletAddress = walletAddress.toLowerCase();

  while (hasMore) {
    try {
      const result = await GQL_CLIENT.request<{
        ledger: LastPositionEntry[];
      }>(GET_LAST_POSITION_BY_WALLET, {
        limit: pageSize,
        offset,
        userAddress: normalizedWalletAddress,
      });

      const entries = result.ledger || [];

      if (entries.length === 0) {
        hasMore = false;
        break;
      }

    for (const entry of entries) {
      const quantity = parseFloat(entry.current_quantity_hmr || "0");
      
      // Only include positions with non-zero quantity
      if (quantity !== 0) {
        const price = parseFloat(
          entry.outcome?.outcome_stats[0]?.marginal_price_hmr || "0"
        );
        const value = price * quantity;
        const isResolved =
          entry.question.question_resolves?.[0]?.answer != null;
        const isWinning =
          isResolved &&
          (Number(entry.token_id) &
            Number(entry.question.question_resolves[0].answer)) !==
            0;

        positions.push({
          market_address: entry.market_address,
          token_id: entry.token_id,
          quantity: quantity,
          current_price: price,
          value: value,
          realized_pnl: parseFloat(entry.realized_pnl_hmr || "0"),
          block_timestamp: entry.block_timestamp,
          event_type: entry.event_type,
          is_resolved: isResolved,
          is_winning: isWinning,
          payout_hmr: entry.outcome?.outcome_stats[0]?.payout_hmr || null,
        });
      }
    }

      offset += pageSize;

      if (entries.length < pageSize) {
        hasMore = false;
      }
    } catch (error) {
      console.error(`[WALLET POSITIONS] Error fetching positions at offset ${offset}:`, error);
      // If we get an error, break to avoid infinite loop
      hasMore = false;
      throw error;
    }
  }

  return positions;
}

export const GET_LAST_POSITION = gql`
  query GetLastPosition($limit: Int!, $offset: Int!) {
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
      delta_quantity
      realized_pnl_hmr
      block_timestamp
      event_type
      outcome {
        outcome_stats(limit: 1, order_by: [{ block_timestamp: desc }]) {
          marginal_price_hmr
          payout_hmr
        }
      }
      question {
        question_resolves(limit: 1, order_by: { block_timestamp: desc }) {
          answer
          block_timestamp
        }
      }
    }
  }
`;

// Query filtered by wallet address for efficiency
export const GET_LAST_POSITION_BY_WALLET = gql`
  query GetLastPositionByWallet($limit: Int!, $offset: Int!, $userAddress: String!) {
    ledger(
      limit: $limit
      offset: $offset
      where: { user_address: { _eq: $userAddress } }
      order_by: [
        { market_address: asc }
        { token_id: asc }
        { block_timestamp: desc }
      ]
      distinct_on: [market_address, token_id]
    ) {
      user_address
      market_address
      token_id
      current_quantity_hmr
      delta_quantity
      realized_pnl_hmr
      block_timestamp
      event_type
      outcome {
        outcome_stats(limit: 1, order_by: [{ block_timestamp: desc }]) {
          marginal_price_hmr
          payout_hmr
        }
      }
      question {
        question_resolves(limit: 1, order_by: { block_timestamp: desc }) {
          answer
          block_timestamp
        }
      }
    }
  }
`;

export const GET_MARKET_CLAIMS = gql`
  query GetMarketClaims($limit: Int!, $offset: Int!) {
    market_claim(
      limit: $limit
      offset: $offset
      where: { quantity: { _gt: "0" } }
    ) {
      id
      user_address
      market_address
      quantity
      token_id
      block_timestamp
      collateral
    }
  }
`;

// Query filtered by wallet address for efficiency
export const GET_MARKET_CLAIMS_BY_WALLET = gql`
  query GetMarketClaimsByWallet($limit: Int!, $offset: Int!, $userAddress: String!) {
    market_claim(
      limit: $limit
      offset: $offset
      where: { 
        quantity: { _gt: "0" }
        user_address: { _eq: $userAddress }
      }
    ) {
      id
      user_address
      market_address
      quantity
      token_id
      block_timestamp
      collateral
    }
  }
`;

type LastPositionEntry = GetLastPositionQuery["ledger"][number];
type ClaimEntry = GetMarketClaimsQuery["market_claim"][number];
export type MarketClaims = Record<string, bigint>;

export interface WalletPosition {
  market_address: string;
  token_id: string;
  quantity: number;
  current_price: number;
  value: number;
  realized_pnl: number;
  block_timestamp: string;
  event_type: string;
  is_resolved: boolean;
  is_winning: boolean | null;
  payout_hmr: string | null;
}

function buildClaimKey(user: string, market: string, tokenId: string) {
  return `${user}-${market}-${tokenId}`;
}

function processClaims(claims: MarketClaims, entries: ClaimEntry[]) {
  for (const entry of entries) {
    const { user_address, market_address, token_id, quantity } = entry;
    const key = buildClaimKey(user_address, market_address, token_id);
    const claimWei = claims?.[key] || BigInt(0);
    claims[key] = claimWei + BigInt(quantity);
  }
}

