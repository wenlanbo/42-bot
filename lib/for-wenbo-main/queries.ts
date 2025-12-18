import { gql } from "graphql-request";
import { GQL_CLIENT } from "./gql";

/**
 * Leaderboard GQL Queries
 *
 * Data needed:
 * - Total PNL (realized + unrealized)
 * - Profit (Claim + Realized PnL)
 * - Number of outcomes traded (OT)
 *
 * Available tables from schema:
 * - ledger: has realized_pnl_hmr, user_address, token_id, event_type
 * - active_positions: has current_quantity_hmr, marginal_price_hmr, avg_price_hmr, user_address
 */
