# CodeWhy

GraphRAG engineering intelligence for **HackFront India 2026**.

CodeWhy explains *why the code is like this* by connecting source files, Git commits, pull requests, issues, technical decisions and developers in **Neo4j AuraDB**.

| | |
| --- | --- |
| Team | **HACKYI6D** |
| Members | Jahnavi Reddy, Pavan Sai Reddy |
| Theme | AI & Developer Tools |
| Track | Neo4j |

## Architecture

- Frontend: React, TypeScript, Tailwind CSS, Next.js App Router, React Flow
- Backend: Node.js + Express (`server/`)
- Graph: Neo4j AuraDB + Cypher (`neo4j-driver`)
- Repository data: GitHub REST API

Neo4j credentials stay on the server in `.env`. They are never sent to the browser.

## Run locally

1. Create an [AuraDB](https://neo4j.com/cloud/aura/) free instance.
2. Copy environment variables:

```
copy .env.example .env
```

3. Fill in:

```
NEO4J_URI=neo4j+s://xxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=...
```

`GITHUB_TOKEN` is optional but strongly recommended (higher rate limits).  
`OPENAI_API_KEY` is optional. Without it, Ask CodeWhy still answers from retrieved graph evidence.

4. Install and start both servers:

```
npm install
npm run dev
```

- Web: http://localhost:3000
- API: http://localhost:4000/api/health

## Demo workflow

1. Open **Ingest** and paste a **public** GitHub URL (for example `https://github.com/octocat/Hello-World`).
2. Watch live progress while commits, issues, pull requests, files, functions and configuration nodes are MERGEd into Neo4j.
3. Open **Graph** to zoom, search, filter and inspect relationships.
4. Open **Ask CodeWhy** and ask questions such as:
   - Why was this function implemented this way?
   - Which commit introduced this configuration?
   - Which issue explains this code change?
   - Was this engineering decision superseded?
5. If a batch pauses, click **Resume analysis**. Processed SHAs, issue numbers, PR numbers and file paths are stored on an `IngestionState` node so duplicates are not imported again.

## Graph model

**Nodes:** Repository, File, Function, Configuration, Commit, PullRequest, Issue, Decision, Incident, Developer

**Relationships:** CONTAINS, MODIFIED, INTRODUCED, DISCUSSED_IN, AUTHORED_BY, RELATED_TO, CAUSED_BY, IMPLEMENTED_BY, SUPERSEDED_BY, DEPENDS_ON

Unique constraints prevent duplicate records. Decision cards distinguish **verified** GitHub-labeled ADRs from **automated inferences**.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Express API + Next.js together |
| `npm run dev:api` | API only |
| `npm run dev:web` | Frontend only |

## Notes

- Private repositories are not ingested.
- Empty dashboards mean Neo4j has no data yet — they are not filled with sample repositories.
- Ask CodeWhy will refuse to invent commit URLs, dates or contributors when evidence is missing.
