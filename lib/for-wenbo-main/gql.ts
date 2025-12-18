import { createClient } from "graphql-ws";
import { GraphQLClient } from "graphql-request";

const GQL_ENDPOINT =
  process.env.NEXT_PUBLIC_HASURA_GQL_ENDPOINT ||
  "http://localhost:8080/v1/graphql";

const GQL_ENDPOINT_WS = (() => {
  const url = new URL(GQL_ENDPOINT);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
})();

export const GQL_CLIENT = new GraphQLClient(GQL_ENDPOINT);
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
