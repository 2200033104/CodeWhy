import express from "express";
import cors from "cors";
import { env, neo4jConfigured } from "./env";
import { closeDriver, getNeo4jError, initGraph } from "./neo4j";
import { ingestRepository, getIngestionState } from "./ingest";
import { askCodeWhy } from "./ask";
import { analyticsData, dashboardData, decisionHistory, graphData, listRepos } from "./queries";
import { parseGithubRepoUrl } from "./github";

const app = express();
app.use(cors({ origin: ["http://localhost:3000", "http://127.0.0.1:3000"] }));
app.use(express.json({ limit: "1mb" }));

const running = new Set<string>();

app.get("/api/health", async (_req, res) => {
  const neo4j = await initGraph();
  res.json({
    ok: neo4j.ok,
    service: "CodeWhy API",
    team: "HACKYI6D",
    neo4jConfigured: neo4jConfigured(),
    neo4j,
    githubToken: Boolean(process.env.GITHUB_TOKEN),
    llm: Boolean(process.env.OPENAI_API_KEY),
  });
});

app.get("/api/dashboard", async (_req, res) => {
  try {
    const neo4j = await initGraph();
    if (!neo4j.ok) return res.status(503).json({ error: neo4j.error, dataMode: "unavailable" });
    res.json(await dashboardData());
  } catch (error) {
    res.status(500).json({ error: messageOf(error) });
  }
});

app.get("/api/repos", async (_req, res) => {
  try {
    const neo4j = await initGraph();
    if (!neo4j.ok) return res.status(503).json({ error: neo4j.error });
    res.json({ repositories: await listRepos(), dataMode: "retrieved" });
  } catch (error) {
    res.status(500).json({ error: messageOf(error) });
  }
});

app.post("/api/ingest", async (req, res) => {
  const url = String(req.body?.url || "");
  const resume = Boolean(req.body?.resume);
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const write = (payload: unknown) => res.write(`${JSON.stringify(payload)}\n`);

  try {
    if (!neo4jConfigured()) {
      write({ type: "error", stage: "connect", message: getNeo4jError() || "Neo4j is not configured.", percent: 0 });
      return res.end();
    }
    const neo4j = await initGraph();
    if (!neo4j.ok) {
      write({ type: "error", stage: "connect", message: neo4j.error, percent: 0 });
      return res.end();
    }
    const { owner, repo } = parseGithubRepoUrl(url);
    const repoId = `${owner}/${repo}`;
    if (running.has(repoId)) {
      write({ type: "error", stage: "lock", message: "This repository is already being ingested.", percent: 0, repoId });
      return res.end();
    }
    running.add(repoId);
    try {
      await ingestRepository(url, resume, (event) => write(event));
    } finally {
      running.delete(repoId);
    }
  } catch (error) {
    write({ type: "error", stage: "failed", message: messageOf(error), percent: 0 });
  }
  res.end();
});

app.get("/api/ingest/status", async (req, res) => {
  try {
    const repoId = String(req.query.repoId || "");
    if (!repoId) return res.status(400).json({ error: "repoId is required" });
    const neo4j = await initGraph();
    if (!neo4j.ok) return res.status(503).json({ error: neo4j.error });
    res.json({ state: await getIngestionState(repoId), dataMode: "retrieved" });
  } catch (error) {
    res.status(500).json({ error: messageOf(error) });
  }
});

app.get("/api/graph", async (req, res) => {
  try {
    const neo4j = await initGraph();
    if (!neo4j.ok) return res.status(503).json({ error: neo4j.error, dataMode: "unavailable" });
    const types = String(req.query.types || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    res.json(
      await graphData({
        repoId: req.query.repoId ? String(req.query.repoId) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
        types,
      })
    );
  } catch (error) {
    res.status(500).json({ error: messageOf(error) });
  }
});

app.post("/api/ask", async (req, res) => {
  try {
    const neo4j = await initGraph();
    if (!neo4j.ok) return res.status(503).json({ error: neo4j.error, dataMode: "unavailable" });
    const question = String(req.body?.question || "");
    const repoId = req.body?.repoId ? String(req.body.repoId) : undefined;
    res.json(await askCodeWhy(question, repoId));
  } catch (error) {
    res.status(400).json({ error: messageOf(error) });
  }
});

app.get("/api/decisions", async (req, res) => {
  try {
    const neo4j = await initGraph();
    if (!neo4j.ok) return res.status(503).json({ error: neo4j.error, dataMode: "unavailable" });
    res.json(await decisionHistory(req.query.repoId ? String(req.query.repoId) : undefined));
  } catch (error) {
    res.status(500).json({ error: messageOf(error) });
  }
});

app.get("/api/analytics", async (req, res) => {
  try {
    const neo4j = await initGraph();
    if (!neo4j.ok) return res.status(503).json({ error: neo4j.error, dataMode: "unavailable" });
    res.json(await analyticsData(req.query.repoId ? String(req.query.repoId) : undefined));
  } catch (error) {
    res.status(500).json({ error: messageOf(error) });
  }
});

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

const server = app.listen(env.port, () => {
  console.log(`CodeWhy API listening on http://localhost:${env.port}`);
});

process.on("SIGINT", async () => {
  server.close();
  await closeDriver();
  process.exit(0);
});
