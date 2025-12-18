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
 * @description builds leaderboard data for portfolio
 * @description leaderboard only has 1 granularity: per user level - anything else is NOT a              portfolio value
 * @dev to calculate portfolio:
 *      1. Position Value (Resolved but unclaimed, active face value)
 *      2. Cash Holdings
 */
export async function buildPortfolioLeaderboard(
  pageSize: number = 1000
): Promise<PortfolioLeaderboard> {
  const leaderboard: PortfolioLeaderboard = {
    userToStats: new Map(),
  };
  const claims: MarketClaims = {};

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await GQL_CLIENT.request<
      GetMarketClaimsQuery,
      GetMarketClaimsQueryVariables
    >(GET_MARKET_CLAIMS, { limit: pageSize, offset });

    const entries = result.market_claim;

    if (entries.length === 0) {
      hasMore = false;
      break;
    }

    processClaims(claims, entries);

    offset += pageSize;

    if (entries.length < pageSize) {
      hasMore = false;
    }
  }

  console.log(`${Object.keys(claims).length} keys in claims`);

  offset = 0;
  hasMore = true;

  while (hasMore) {
    const result = await GQL_CLIENT.request<
      GetLastPositionQuery,
      GetLastPositionQueryVariables
    >(GET_LAST_POSITION, { limit: pageSize, offset });

    const entries = result.ledger;

    if (entries.length === 0) {
      hasMore = false;
      break;
    }

    for (const entry of entries) {
      if (!leaderboard.userToStats.has(entry.user_address)) {
        leaderboard.userToStats.set(entry.user_address, ZERO_PORTFOLIO);
      }
    }

    processBatch(leaderboard, entries, claims);

    offset += pageSize;

    if (entries.length < pageSize) {
      hasMore = false;
    }
  }

  console.log(`${leaderboard.userToStats.size} portfolio entries`);

  const userAddresses = Array.from(leaderboard.userToStats.keys());
  const BATCH_SIZE = 500;

  for (let i = 0; i < userAddresses.length; i += BATCH_SIZE) {
    const batch = userAddresses.slice(i, i + BATCH_SIZE);

    const contracts = batch.map((address) => ({
      address: COLLATERAL_ADDRESS as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    }));

    const results = await PUBLIC_CLIENT.multicall({ contracts });

    results.forEach((result, index) => {
      const userAddress = batch[index];
      const currentPortfolio = leaderboard.userToStats.get(userAddress) || 0;

      if (result.status === "success") {
        const usdcBalance = Number(formatUnits(result.result as bigint, 6));
        leaderboard.userToStats.set(
          userAddress,
          currentPortfolio + usdcBalance
        );
      } else {
        console.warn(
          `Failed to fetch USDC balance for ${userAddress}:`,
          result.error
        );
      }
    });
  }
  console.log(`${userAddresses.length} cash balances`);

  return leaderboard;
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

type LastPositionEntry = GetLastPositionQuery["ledger"][number];
type ClaimEntry = GetMarketClaimsQuery["market_claim"][number];
export type Portfolio = number;
const ZERO_PORTFOLIO = 0;

export interface PortfolioLeaderboard {
  // portfolio per user
  userToStats: Map<string, Portfolio>;
}

export type MarketClaims = Record<string, bigint>;

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

function processBatch(
  leaderboard: PortfolioLeaderboard,
  entries: LastPositionEntry[],
  claims: MarketClaims
) {
  for (const entry of entries) {
    const { user_address, market_address, token_id, question } = entry;
    const portfolio =
      leaderboard.userToStats.get(user_address) || ZERO_PORTFOLIO;

    if (question.question_resolves?.[0]?.answer != null) {
      if (
        (Number(token_id) &
          Number(entry.question.question_resolves[0].answer)) !==
        0
      ) {
        const key = buildClaimKey(user_address, market_address, token_id);
        const fullClaimWei = -BigInt(entry.delta_quantity); // note: delta is negative (user gives up quantity)
        const claimedWei = claims?.[key] || BigInt(0);
        const remainingWei = fullClaimWei - claimedWei;
        if (remainingWei > BigInt(0)) {
          const payoutPerOt = parseFloat(
            entry.outcome?.outcome_stats[0].payout_hmr || "0"
          );
          const remaining = Number(formatUnits(remainingWei, 18));
          const value = payoutPerOt * remaining;
          leaderboard.userToStats.set(user_address, portfolio + value);
        }
      }
    } else {
      const price = parseFloat(
        entry.outcome?.outcome_stats[0].marginal_price_hmr || "0"
      );
      const quantity = parseFloat(entry?.current_quantity_hmr || "0");
      const value = price * quantity;
      leaderboard.userToStats.set(user_address, portfolio + value);
    }
  }
}
