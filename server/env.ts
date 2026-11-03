import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export const env = {
  port: Number(process.env.PORT || 4000),
  neo4jUri: process.env.NEO4J_URI || "",
  neo4jUsername: process.env.NEO4J_USERNAME || "",
  neo4jPassword: process.env.NEO4J_PASSWORD || "",
  githubToken: process.env.GITHUB_TOKEN || "",
  openaiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
};

export function neo4jConfigured() {
  return Boolean(env.neo4jUri && env.neo4jUsername && env.neo4jPassword);
}
