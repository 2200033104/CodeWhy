import neo4j from "neo4j-driver";
import { toNumber, withSession } from "./neo4j";

const NODE_COLORS: Record<string, string> = {
  Repository: "#38bdf8",
  File: "#67e8f9",
  Function: "#818cf8",
  Configuration: "#fbbf24",
  Commit: "#34d399",
  PullRequest: "#c084fc",
  Issue: "#fb7185",
  Decision: "#22d3ee",
  Incident: "#f97316",
  Developer: "#94a3b8",
};

function labelOf(labels: string[]) {
  return labels.find((label) => label !== "IngestionState") || labels[0] || "Node";
}

export async function dashboardData() {
  const counts = await withSession((session) =>
    session.run(`
      CALL {
        MATCH (n:Repository) RETURN count(n) AS repositories
      }
      CALL {
        MATCH (n:Commit) RETURN count(n) AS commits
      }
      CALL {
        MATCH (n:PullRequest) RETURN count(n) AS pullRequests
      }
      CALL {
        MATCH (n:Issue) RETURN count(n) AS issues
      }
      CALL {
        MATCH (n:Decision) RETURN count(n) AS decisions
      }
      CALL {
        MATCH (n:File) RETURN count(n) AS files
      }
      CALL {
        MATCH (n:Function) RETURN count(n) AS functions
      }
      CALL {
        MATCH (n:Configuration) RETURN count(n) AS configurations
      }
      CALL {
        MATCH (n:Developer) RETURN count(n) AS developers
      }
      CALL {
        MATCH (n:Incident) RETURN count(n) AS incidents
      }
      CALL {
        MATCH ()-[r]->() RETURN count(r) AS relationships
      }
      RETURN repositories, commits, pullRequests, issues, decisions, files, functions, configurations, developers, incidents, relationships
    `)
  );
  const rec = counts.records[0];
  const stats = {
    repositories: toNumber(rec?.get("repositories")),
    commits: toNumber(rec?.get("commits")),
    pullRequests: toNumber(rec?.get("pullRequests")),
    issues: toNumber(rec?.get("issues")),
    decisions: toNumber(rec?.get("decisions")),
    files: toNumber(rec?.get("files")),
    functions: toNumber(rec?.get("functions")),
    configurations: toNumber(rec?.get("configurations")),
    developers: toNumber(rec?.get("developers")),
    incidents: toNumber(rec?.get("incidents")),
    relationships: toNumber(rec?.get("relationships")),
  };

  const repos = await withSession((session) =>
    session.run(
      `MATCH (r:Repository)
       OPTIONAL MATCH (s:IngestionState {repoId: r.id})
       RETURN r, s
       ORDER BY r.ingestedAt DESC`
    )
  );

  const activity = await withSession((session) =>
    session.run(
      `MATCH (c:Commit)
       OPTIONAL MATCH (c)-[:AUTHORED_BY]->(d:Developer)
       RETURN c.sha AS sha, c.message AS message, c.date AS date, c.url AS url, c.repoId AS repoId, d.login AS author
       ORDER BY c.date DESC
       LIMIT 12`
    )
  );

  return {
    dataMode: "retrieved" as const,
    stats,
    repositories: repos.records.map((record) => {
      const r = record.get("r").properties;
      const s = record.get("s")?.properties;
      return {
        id: r.id,
        name: r.name,
        owner: r.owner,
        url: r.url,
        description: r.description,
        language: r.language,
        stars: toNumber(r.stars),
        ingestionStatus: s?.status || "unknown",
        resumable: s?.status === "paused",
      };
    }),
    recentActivity: activity.records.map((record) => ({
      sha: record.get("sha"),
      message: record.get("message"),
      date: record.get("date"),
      url: record.get("url"),
      repoId: record.get("repoId"),
      author: record.get("author"),
    })),
  };
}

export async function graphData(opts: {
  repoId?: string;
  search?: string;
  types?: string[];
  limit?: number;
}) {
  const limit = Math.min(opts.limit || 180, 250);
  const types = opts.types?.length
    ? opts.types
    : [
        "Repository",
        "File",
        "Function",
        "Configuration",
        "Commit",
        "PullRequest",
        "Issue",
        "Decision",
        "Incident",
        "Developer",
      ];
  const search = (opts.search || "").toLowerCase();

  const nodeResult = await withSession((session) =>
    session.run(
      `MATCH (n)
       WHERE NOT n:IngestionState
         AND ($repoId IS NULL OR n.repoId = $repoId OR n.id = $repoId OR (n:Developer AND exists { MATCH (x)-[:AUTHORED_BY]->(n) WHERE x.repoId = $repoId }))
         AND any(label IN labels(n) WHERE label IN $types)
         AND (
           $search = '' OR
           toLower(coalesce(n.name, '')) CONTAINS $search OR
           toLower(coalesce(n.path, '')) CONTAINS $search OR
           toLower(coalesce(n.title, '')) CONTAINS $search OR
           toLower(coalesce(n.message, '')) CONTAINS $search OR
           toLower(coalesce(n.key, '')) CONTAINS $search OR
           toLower(coalesce(n.login, '')) CONTAINS $search OR
           toLower(coalesce(n.sha, '')) CONTAINS $search
         )
       RETURN n, labels(n) AS labels, id(n) AS neoId
       LIMIT $limit`,
      {
        repoId: opts.repoId || null,
        types,
        search,
        limit: neo4j.int(limit),
      }
    )
  );

  const nodes = nodeResult.records.map((record) => {
    const n = record.get("n").properties;
    const labels = record.get("labels") as string[];
    const kind = labelOf(labels);
    const neoId = String(toNumber(record.get("neoId")));
    const title =
      n.name || n.path || n.title || n.login || n.key || (n.sha ? String(n.sha).slice(0, 7) : "") || kind;
    return {
      id: neoId,
      neoId,
      elementId: record.get("n").elementId || neoId,
      type: kind,
      label: String(title).slice(0, 48),
      color: NODE_COLORS[kind] || "#64748b",
      properties: serialize(n),
    };
  });

  const ids = nodes.map((node) => Number(node.neoId));
  const edgeResult = await withSession((session) =>
    session.run(
      `MATCH (a)-[r]->(b)
       WHERE id(a) IN $ids AND id(b) IN $ids
       RETURN id(a) AS source, id(b) AS target, type(r) AS type, id(r) AS rid
       LIMIT 400`,
      { ids }
    )
  );

  const columns = types;
  const nodesByType: Record<string, typeof nodes> = {};
  for (const node of nodes) {
    nodesByType[node.type] ||= [];
    nodesByType[node.type].push(node);
  }

  const positioned = nodes.map((node) => {
    const col = Math.max(columns.indexOf(node.type), 0);
    const index = nodesByType[node.type].findIndex((item) => item.id === node.id);
    return {
      ...node,
      position: { x: col * 280, y: index * 86 },
    };
  });

  return {
    dataMode: "retrieved" as const,
    nodes: positioned,
    edges: edgeResult.records.map((record) => ({
      id: `e${toNumber(record.get("rid"))}`,
      source: String(toNumber(record.get("source"))),
      target: String(toNumber(record.get("target"))),
      label: record.get("type"),
    })),
  };
}

function serialize(value: Record<string, unknown>) {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") out[key] = raw;
    else if (typeof raw === "object" && raw && "toNumber" in raw) out[key] = toNumber(raw);
    else out[key] = String(raw);
  }
  return out;
}

export async function decisionHistory(repoId?: string) {
  const result = await withSession((session) =>
    session.run(
      `MATCH (d:Decision)
       WHERE $repoId IS NULL OR d.repoId = $repoId
       OPTIONAL MATCH (d)-[:IMPLEMENTED_BY]->(impl)
       OPTIONAL MATCH (d)-[:DISCUSSED_IN]->(disc)
       OPTIONAL MATCH (d)-[:SUPERSEDED_BY]->(later:Decision)
       OPTIONAL MATCH (d)-[:RELATED_TO]->(dev:Developer)
       RETURN d,
              collect(DISTINCT impl) AS impls,
              collect(DISTINCT disc) AS discs,
              collect(DISTINCT later) AS later,
              collect(DISTINCT dev.login) AS contributors
       ORDER BY d.createdAt DESC`,
      { repoId: repoId || null }
    )
  );

  return {
    dataMode: "retrieved" as const,
    decisions: result.records.map((record) => {
      const d = record.get("d").properties;
      const impls = (record.get("impls") as { properties: Record<string, unknown>; labels?: string[] }[])
        .filter(Boolean)
        .map((node) => ({
          title: String(node.properties.title || node.properties.message || node.properties.sha || ""),
          url: String(node.properties.url || ""),
        }));
      const discs = (record.get("discs") as { properties: Record<string, unknown> }[])
        .filter(Boolean)
        .map((node) => ({
          title: String(node.properties.title || ""),
          url: String(node.properties.url || ""),
        }));
      const later = (record.get("later") as { properties: Record<string, unknown> }[])
        .filter(Boolean)
        .map((node) => String(node.properties.title || ""));
      return {
        id: d.id,
        title: d.title,
        summary: d.summary,
        repoId: d.repoId,
        verified: Boolean(d.verified),
        origin: d.origin,
        source: d.source,
        createdAt: d.createdAt,
        contributors: (record.get("contributors") as string[]).filter(Boolean),
        evidence: [...impls, ...discs].filter((item) => item.title),
        supersededBy: later,
      };
    }),
  };
}

export async function analyticsData(repoId?: string) {
  const contributors = await withSession((session) =>
    session.run(
      `MATCH (c:Commit)-[:AUTHORED_BY]->(d:Developer)
       WHERE $repoId IS NULL OR c.repoId = $repoId
       RETURN d.login AS login, count(c) AS commits
       ORDER BY commits DESC
       LIMIT 12`,
      { repoId: repoId || null }
    )
  );

  const activity = await withSession((session) =>
    session.run(
      `MATCH (c:Commit)
       WHERE $repoId IS NULL OR c.repoId = $repoId
       WITH substring(c.date, 0, 10) AS day, count(*) AS commits
       WHERE day IS NOT NULL AND day <> ''
       RETURN day, commits
       ORDER BY day ASC
       LIMIT 60`,
      { repoId: repoId || null }
    )
  );

  const labels = await withSession((session) =>
    session.run(
      `UNWIND [
        'Repository','File','Function','Configuration','Commit',
        'PullRequest','Issue','Decision','Incident','Developer'
      ] AS label
      CALL {
        WITH label
        MATCH (n)
        WHERE label IN labels(n) AND ($repoId IS NULL OR n.repoId = $repoId OR n.id = $repoId OR n:Developer)
        RETURN count(n) AS total
      }
      RETURN label, total`,
      { repoId: repoId || null }
    )
  );

  const decisionSplit = await withSession((session) =>
    session.run(
      `MATCH (d:Decision)
       WHERE $repoId IS NULL OR d.repoId = $repoId
       RETURN d.verified AS verified, d.origin AS origin, count(*) AS total`,
      { repoId: repoId || null }
    )
  );

  return {
    dataMode: "retrieved" as const,
    contributors: contributors.records.map((record) => ({
      login: record.get("login"),
      commits: toNumber(record.get("commits")),
    })),
    activity: activity.records.map((record) => ({
      day: record.get("day"),
      commits: toNumber(record.get("commits")),
    })),
    graphGrowth: labels.records.map((record) => ({
      label: record.get("label"),
      total: toNumber(record.get("total")),
    })),
    decisions: decisionSplit.records.map((record) => ({
      verified: Boolean(record.get("verified")),
      origin: record.get("origin") || "unknown",
      total: toNumber(record.get("total")),
    })),
  };
}

export async function listRepos() {
  const result = await withSession((session) =>
    session.run(`MATCH (r:Repository) RETURN r.id AS id, r.name AS name ORDER BY r.name`)
  );
  return result.records.map((record) => ({ id: record.get("id") as string, name: record.get("name") as string }));
}
