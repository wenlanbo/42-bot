// graphql.config.ts
import type { IGraphQLConfig } from "graphql-config";
import dotenv from "dotenv";

dotenv.config();

const endpoint =
  process.env.NEXT_PUBLIC_HASURA_GQL_ENDPOINT ||
  "http://localhost:8080/v1/graphql";

const headers: Record<string, string> = {};
if (process.env.HASURA_ADMIN_SECRET) {
  headers["x-hasura-admin-secret"] = process.env.HASURA_ADMIN_SECRET;
}

const config: IGraphQLConfig = {
  schema: [
    {
      [endpoint]: {
        headers,
      },
    },
  ],

  extensions: {
    codegen: {
      generates: {
        // Generate introspection schema as JSON
        "./schema.json": {
          plugins: ["introspection"],
          config: {
            minify: true,
          },
        },

        // Generate schema as SDL (human-readable .graphql file)
        "./schema.graphql": {
          plugins: ["schema-ast"],
          config: {
            includeDirectives: true,
          },
        },

        // Generate TypeScript types from GraphQL schema
        "./generated/schema.types.ts": {
          plugins: ["typescript"],
          config: {
            maybeValue: "T | null | undefined",
            inputMaybeValue: "T | null | undefined",
            enumsAsTypes: true,
            scalars: {
              bigint: "string",
              numeric: "string",
              timestamptz: "string",
            },
          },
        },

        // Generate TypeScript types from operations in queries.ts
        "./generated/types.ts": {
          preset: "import-types",
          documents: ["./**/*.ts"],
          plugins: ["typescript-operations"],
          ignoreNoDocuments: true,
          config: {
            skipTypename: true,
            enumsAsTypes: true,
            preResolveTypes: false,
            useTypeImports: true,
          },
          presetConfig: {
            typesPath: "./schema.types",
          },
        },
      },
    },
  },
};

export default config;
