import { env } from "./env";
import { withSession } from "./neo4j";

export type Evidence = {
  kind: string;
  title: string;
  detail: string;
  url?: string;
  date?: string;
  contributor?: string;
  source: "neo4j" | "github";
};

function tokens(question: string) {
  return [...new Set(question.toLowerCase().match(/[a-zA-Z_][a-zA-Z0-9_.-]{2,}/g) || [])].filter(
    (word) =>
      !["why", "was", "this", "that", "the", "how", "what", "which", "does", "did", "set", "code", "function", "commit", "issue", "pull", "request", "configuration", "decision", "implemented", "introduced", "explain", "codewhy"].includes(
        word
      )
  );
}

async function searchGraph(repoId: string | undefined, question: string) {
  const words = tokens(question);
  const like = words.slice(0, 8);
  const params = { repoId: repoId || null, like };

  const result = await withSession((session) =>
    session.run(
      `WITH $like AS terms
       OPTIONAL MATCH (fn:Function)
       WHERE ($repoId IS NULL OR fn.repoId = $repoId)
         AND any(t IN terms WHERE toLower(fn.name) CONTAINS t OR toLower(fn.signature) CONTAINS t)
       OPTIONAL MATCH (cfg:Configuration)
       WHERE ($repoId IS NULL OR cfg.repoId = $repoId)
         AND any(t IN terms WHERE toLower(cfg.key) CONTAINS t OR toLower(cfg.value) CONTAINS t)
       OPTIONAL MATCH (c:Commit)
       WHERE ($repoId IS NULL OR c.repoId = $repoId)
         AND any(t IN terms WHERE toLower(c.message) CONTAINS t)
       OPTIONAL MATCH (i:Issue)
       WHERE ($repoId IS NULL OR i.repoId = $repoId)
         AND any(t IN terms WHERE toLower(i.title) CONTAINS t OR toLower(coalesce(i.body,'')) CONTAINS t)
       OPTIONAL MATCH (p:PullRequest)
       WHERE ($repoId IS NULL OR p.repoId = $repoId)
         AND any(t IN terms WHERE toLower(p.title) CONTAINS t OR toLower(coalesce(p.body,'')) CONTAINS t)
       OPTIONAL MATCH (d:Decision)
       WHERE ($repoId IS NULL OR d.repoId = $repoId)
         AND any(t IN terms WHERE toLower(d.title) CONTAINS t OR toLower(coalesce(d.summary,'')) CONTAINS t)
       OPTIONAL MATCH (f:File)
       WHERE ($repoId IS NULL OR f.repoId = $repoId)
         AND any(t IN terms WHERE toLower(f.path) CONTAINS t)
       RETURN collect(DISTINCT fn)[0..8] AS functions,
              collect(DISTINCT cfg)[0..8] AS configs,
              collect(DISTINCT c)[0..8] AS commits,
              collect(DISTINCT i)[0..8] AS issues,
              collect(DISTINCT p)[0..8] AS pulls,
              collect(DISTINCT d)[0..8] AS decisions,
              collect(DISTINCT f)[0..8] AS files`,
      params
    )
  );

  const record = result.records[0];
  const props = (nodes: unknown[]) =>
    (nodes || [])
      .filter(Boolean)
      .map((node) => (node as { properties: Record<string, unknown> }).properties);

  return {
    functions: props(record?.get("functions") || []),
    configs: props(record?.get("configs") || []),
    commits: props(record?.get("commits") || []),
    issues: props(record?.get("issues") || []),
    pulls: props(record?.get("pulls") || []),
    decisions: props(record?.get("decisions") || []),
    files: props(record?.get("files") || []),
  };
}

function evidenceFromSearch(search: Awaited<ReturnType<typeof searchGraph>>): Evidence[] {
  const items: Evidence[] = [];
  for (const commit of search.commits) {
    items.push({
      kind: "Commit",
      title: String(commit.message || "").split("\n")[0],
      detail: String(commit.sha || "").slice(0, 12),
      url: String(commit.url || ""),
      date: String(commit.date || ""),
      source: "github",
    });
  }
  for (const issue of search.issues) {
    items.push({
      kind: "Issue",
      title: String(issue.title || ""),
      detail: String(issue.body || "").slice(0, 240),
      url: String(issue.url || ""),
      date: String(issue.createdAt || ""),
      source: "github",
    });
  }
  for (const pull of search.pulls) {
    items.push({
      kind: "PullRequest",
      title: String(pull.title || ""),
      detail: String(pull.body || "").slice(0, 240),
      url: String(pull.url || ""),
      date: String(pull.createdAt || ""),
      source: "github",
    });
  }
  for (const fn of search.functions) {
    items.push({
      kind: "Function",
      title: String(fn.name || ""),
      detail: `${fn.filePath}:${fn.line} · ${fn.signature}`,
      source: "neo4j",
    });
  }
  for (const cfg of search.configs) {
    items.push({
      kind: "Configuration",
      title: `${cfg.key} = ${cfg.value}`,
      detail: `${cfg.filePath}:${cfg.line}`,
      source: "neo4j",
    });
  }
  for (const decision of search.decisions) {
    items.push({
      kind: "Decision",
      title: String(decision.title || ""),
      detail: `${decision.verified ? "Verified" : "Inferred"} · ${decision.summary || ""}`,
      date: String(decision.createdAt || ""),
      source: decision.source === "github" ? "github" : "neo4j",
    });
  }
  for (const file of search.files) {
    items.push({
      kind: "File",
      title: String(file.path || ""),
      detail: String(file.language || ""),
      source: "neo4j",
    });
  }
  return items.slice(0, 18);
}

async function enrichAuthors(evidence: Evidence[], search: Awaited<ReturnType<typeof searchGraph>>) {
  const shas = search.commits.map((commit) => String(commit.sha || "")).filter(Boolean);
  if (!shas.length) return evidence;
  const result = await withSession((session) =>
    session.run(
      `UNWIND $shas AS sha
       MATCH (c:Commit {sha: sha})-[:AUTHORED_BY]->(d:Developer)
       RETURN c.sha AS sha, d.login AS login, c.url AS url, c.date AS date`,
      { shas }
    )
  );
  const bySha = new Map<string, string>();
  for (const record of result.records) {
    bySha.set(String(record.get("sha")), String(record.get("login")));
  }
  return evidence.map((item) => {
    if (item.kind !== "Commit") return item;
    const sha = item.detail;
    const full = [...bySha.keys()].find((value) => value.startsWith(sha) || sha.startsWith(value.slice(0, 7)));
    return { ...item, contributor: full ? bySha.get(full) : item.contributor };
  });
}

function composeAnswer(question: string, evidence: Evidence[]) {
  if (!evidence.length) {
    return {
      answer:
        "I could not find enough graph or GitHub evidence to answer this. Ingest a public repository first, or ask about a function, configuration key, commit, issue, or decision that exists in the imported graph. CodeWhy will not invent citations.",
      confidence: "none" as const,
    };
  }

  const q = question.toLowerCase();
  const commits = evidence.filter((item) => item.kind === "Commit" && item.url);
  const issues = evidence.filter((item) => item.kind === "Issue" && item.url);
  const pulls = evidence.filter((item) => item.kind === "PullRequest" && item.url);
  const configs = evidence.filter((item) => item.kind === "Configuration");
  const functions = evidence.filter((item) => item.kind === "Function");
  const decisions = evidence.filter((item) => item.kind === "Decision");

  const lines: string[] = [];
  if (functions.length && /why|implemented|function/.test(q)) {
    lines.push(
      `${functions[0].title} appears in ${functions[0].detail}. Related repository history is listed in the evidence below.`
    );
  }
  if (configs.length && /retry|limit|config|set to|timeout/.test(q)) {
    lines.push(`Configuration evidence: ${configs.map((item) => item.title).join("; ")} (${configs[0].detail}).`);
  }
  if (commits.length && /commit|introduced|change/.test(q)) {
    const commit = commits[0];
    lines.push(
      `A matching commit is ${commit.detail}${commit.contributor ? ` by ${commit.contributor}` : ""}${commit.date ? ` on ${commit.date}` : ""}.`
    );
  }
  if (issues.length && /issue|why|explain/.test(q)) {
    lines.push(`Related issue: ${issues[0].title}.`);
  }
  if (pulls.length) {
    lines.push(`Related pull request: ${pulls[0].title}.`);
  }
  if (decisions.length) {
    const superseded = /supersede/.test(q);
    lines.push(
      superseded
        ? `Decision records were found. Check evidence for any SUPERSEDED_BY relationship notes. ${decisions[0].detail}`
        : `Engineering decision: ${decisions[0].title}. ${decisions[0].detail}`
    );
  }
  if (!lines.length) {
    lines.push(
      "Matching records were retrieved from Neo4j. The explanation below is limited to those records; items without URLs are graph nodes, not guessed GitHub pages."
    );
  }
  lines.push("Only the linked GitHub URLs and graph properties below were used. Nothing else was assumed.");
  return { answer: lines.join(" "), confidence: evidence.length > 2 ? ("medium" as const) : ("low" as const) };
}

async function phraseWithLlm(question: string, evidence: Evidence[], draft: string) {
  if (!env.openaiKey) return draft;
  const payload = {
    model: env.openaiModel,
    messages: [
      {
        role: "system",
        content:
          "You are CodeWhy. Answer only from the provided evidence JSON. If evidence is missing, say so. Never invent commits, issues, dates, URLs, or contributors. Quote only URLs present in evidence.",
      },
      {
        role: "user",
        content: `Question: ${question}\nDraft: ${draft}\nEvidence: ${JSON.stringify(evidence).slice(0, 12000)}`,
      },
    ],
    temperature: 0.1,
  };
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return draft;
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() || draft;
  } catch {
    return draft;
  }
}

export async function askCodeWhy(question: string, repoId?: string) {
  const trimmed = question.trim();
  if (trimmed.length < 5) {
    throw new Error("Ask a specific question about a function, configuration, commit, issue, or decision.");
  }

  const search = await searchGraph(repoId, trimmed);
  let evidence = evidenceFromSearch(search);
  evidence = await enrichAuthors(evidence, search);

  if (/supersede/.test(trimmed.toLowerCase())) {
    const supersede = await withSession((session) =>
      session.run(
        `MATCH (a:Decision)-[rel:SUPERSEDED_BY]->(b:Decision)
         WHERE $repoId IS NULL OR a.repoId = $repoId
         RETURN a.title AS fromTitle, b.title AS toTitle, b.createdAt AS date
         LIMIT 8`,
        { repoId: repoId || null }
      )
    );
    for (const record of supersede.records) {
      evidence.unshift({
        kind: "Decision",
        title: `${record.get("fromTitle")} → ${record.get("toTitle")}`,
        detail: "SUPERSEDED_BY relationship in Neo4j",
        date: String(record.get("date") || ""),
        source: "neo4j",
      });
    }
  }

  const intro = await withSession((session) =>
    session.run(
      `MATCH (c:Commit)-[:INTRODUCED]->(n)
       WHERE (n:Function OR n:Configuration)
         AND ($repoId IS NULL OR n.repoId = $repoId)
         AND (
           any(t IN $like WHERE toLower(coalesce(n.name,'')) CONTAINS t OR toLower(coalesce(n.key,'')) CONTAINS t)
         )
       OPTIONAL MATCH (c)-[:AUTHORED_BY]->(d:Developer)
       RETURN n, c, d
       LIMIT 8`,
      { repoId: repoId || null, like: tokens(trimmed) }
    )
  );
  for (const record of intro.records) {
    const node = record.get("n")?.properties || {};
    const commit = record.get("c")?.properties || {};
    const dev = record.get("d")?.properties || {};
    evidence.push({
      kind: "Commit",
      title: `Introduced ${node.name || node.key || "symbol"}`,
      detail: String(commit.sha || "").slice(0, 12),
      url: String(commit.url || ""),
      date: String(commit.date || ""),
      contributor: String(dev.login || ""),
      source: "github",
    });
  }

  const unique: Evidence[] = [];
  const seen = new Set<string>();
  for (const item of evidence) {
    const key = `${item.kind}:${item.url || item.title}:${item.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  const composed = composeAnswer(trimmed, unique);
  const answer = await phraseWithLlm(trimmed, unique, composed.answer);

  return {
    answer,
    confidence: unique.length ? composed.confidence : "none",
    evidence: unique,
    usedLlm: Boolean(env.openaiKey),
    dataMode: unique.length ? "retrieved" : "insufficient",
  };
}
