import { GraphQLClient, gql } from "graphql-request";
import * as fs from "fs";

const endpoint = "https://dev-api.42.space/v1/graphql";
const client = new GraphQLClient(endpoint);

const introspectionQuery = gql`
  query IntrospectionQuery {
    __schema {
      types {
        name
        kind
        fields {
          name
          type {
            name
            kind
            ofType {
              name
              kind
            }
          }
        }
      }
    }
  }
`;

async function introspect() {
  try {
    const result: any = await client.request(introspectionQuery);

    // Find the 'outcome' type
    const outcomeType = result.__schema.types.find((t: any) => t.name === "outcome");
    console.log("\n=== OUTCOME TYPE FIELDS ===");
    if (outcomeType && outcomeType.fields) {
      outcomeType.fields.forEach((field: any) => {
        console.log(`- ${field.name}: ${field.type.name || field.type.ofType?.name}`);
      });
    } else {
      console.log("Outcome type not found or has no fields");
    }

    // Find the 'question' type
    const questionType = result.__schema.types.find((t: any) => t.name === "question");
    console.log("\n=== QUESTION TYPE FIELDS ===");
    if (questionType && questionType.fields) {
      questionType.fields.forEach((field: any) => {
        console.log(`- ${field.name}: ${field.type.name || field.type.ofType?.name}`);
      });
    } else {
      console.log("Question type not found or has no fields");
    }

    // Save full schema to file
    fs.writeFileSync("schema-introspection.json", JSON.stringify(result, null, 2));
    console.log("\n✅ Full schema saved to schema-introspection.json");

  } catch (error) {
    console.error("Error introspecting schema:", error);
  }
}

introspect();
