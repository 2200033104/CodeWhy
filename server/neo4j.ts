import neo4j, { Driver, Session } from "neo4j-driver";
import { env, neo4jConfigured } from "./env";

let driver: Driver | null = null;
let lastError: string | null = null;

export function getNeo4jError() {
  return lastError;
}

export function getDriver(): Driver {
  if (!neo4jConfigured()) {
    lastError = "Neo4j environment variables are missing.";
    throw new Error(lastError);
  }
  if (!driver) {
    driver = neo4j.driver(
      env.neo4jUri,
      neo4j.auth.basic(env.neo4jUsername, env.neo4jPassword),
      { maxConnectionLifetime: 3 * 60 * 60 * 1000, connectionAcquisitionTimeout: 15000 }
    );
  }
  return driver;
}

export async function withSession<T>(work: (session: Session) => Promise<T>): Promise<T> {
  const session = getDriver().session();
  try {
    return await work(session);
  } finally {
    await session.close();
  }
}

export async function initGraph(): Promise<{ ok: boolean; error?: string }> {
  if (!neo4jConfigured()) {
    lastError = "Set NEO4J_URI, NEO4J_USERNAME and NEO4J_PASSWORD in .env";
    return { ok: false, error: lastError };
  }
  try {
    await getDriver().verifyConnectivity();
    await withSession(async (session) => {
      const constraints = [
        "CREATE CONSTRAINT repository_id IF NOT EXISTS FOR (n:Repository) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT file_id IF NOT EXISTS FOR (n:File) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT function_id IF NOT EXISTS FOR (n:Function) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT configuration_id IF NOT EXISTS FOR (n:Configuration) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT commit_sha IF NOT EXISTS FOR (n:Commit) REQUIRE n.sha IS UNIQUE",
        "CREATE CONSTRAINT pr_id IF NOT EXISTS FOR (n:PullRequest) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT issue_id IF NOT EXISTS FOR (n:Issue) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT decision_id IF NOT EXISTS FOR (n:Decision) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT incident_id IF NOT EXISTS FOR (n:Incident) REQUIRE n.id IS UNIQUE",
        "CREATE CONSTRAINT developer_login IF NOT EXISTS FOR (n:Developer) REQUIRE n.login IS UNIQUE",
        "CREATE CONSTRAINT ingest_id IF NOT EXISTS FOR (n:IngestionState) REQUIRE n.repoId IS UNIQUE",
      ];
      for (const cypher of constraints) {
        await session.run(cypher);
      }
    });
    lastError = null;
    return { ok: true };
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Neo4j connection failed";
    return { ok: false, error: lastError };
  }
}

export async function closeDriver() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

export function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value || 0);
}
