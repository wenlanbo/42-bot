import { createClient } from "graphql-ws";
import { GraphQLClient } from "graphql-request";
import dotenv from "dotenv";

dotenv.config();

const GQL_ENDPOINT =
  process.env.NEXT_PUBLIC_HASURA_GQL_ENDPOINT ||
  process.env.HASURA_GQL_ENDPOINT ||
  "http://localhost:8080/v1/graphql";

// Validate that we have a GraphQL endpoint configured
if (!process.env.NEXT_PUBLIC_HASURA_GQL_ENDPOINT && !process.env.HASURA_GQL_ENDPOINT) {
  console.warn(
    "[GQL CLIENT] ⚠️ WARNING: No GraphQL endpoint configured. Using default localhost:8080"
  );
  console.warn(
    "[GQL CLIENT] Please set NEXT_PUBLIC_HASURA_GQL_ENDPOINT or HASURA_GQL_ENDPOINT environment variable"
  );
}

const GQL_ENDPOINT_WS = (() => {
  const url = new URL(GQL_ENDPOINT);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
})();

const headers: Record<string, string> = {};
if (process.env.HASURA_ADMIN_SECRET) {
  headers["x-hasura-admin-secret"] = process.env.HASURA_ADMIN_SECRET;
}

console.log(`[GQL CLIENT] Initializing GraphQL client`);
console.log(`[GQL CLIENT] Endpoint: ${GQL_ENDPOINT}`);
console.log(`[GQL CLIENT] Has admin secret: ${!!headers["x-hasura-admin-secret"]}`);

export const GQL_CLIENT = new GraphQLClient(GQL_ENDPOINT, {
  headers,
});
export const GQL_CLIENT_WS = createGqlWSClient();

function createGqlWSClient(): ReturnType<typeof createClient> {
  const client = createClient({
    url: GQL_ENDPOINT_WS,
    lazy: true,
    shouldRetry: () => true,
    retryAttempts: Infinity,
    retryWait: async (retries: number) => {
      const delay = Math.min(1_000 * 2 ** retries, 30_000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    },
    keepAlive: 30_000,
    on: {
      opened: () => {
        console.log("WebSocket connection opened");
      },
      closed: () => {
        console.log("WebSocket connection closed");
      },
      error: (error) => {
        console.error("WebSocket connection error:", error);
      },
    },
  });

  return client;
}
