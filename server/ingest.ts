import { createHash } from "crypto";
import { toNumber, withSession } from "./neo4j";
import {
  fetchCommit,
  fetchCommits,
  fetchFileContent,
  fetchIssues,
  fetchPulls,
  fetchReadme,
  fetchRepo,
  fetchTree,
  parseGithubRepoUrl,
} from "./github";
import {
  extractConfigurations,
  extractDependencies,
  extractFunctions,
  extractShas,
  isConfigFile,
  isSourceFile,
  looksLikeDecision,
  looksLikeIncident,
} from "./parseCode";

export type ProgressEvent = {
  type: "progress" | "success" | "error";
  stage: string;
  message: string;
  percent: number;
  repoId?: string;
  stats?: Record<string, number>;
  resumable?: boolean;
};

type Checkpoint = {
  repoId: string;
  processedCommits: string[];
  processedIssues: number[];
  processedPrs: number[];
  processedFiles: string[];
  commitPage: number;
  issuePage: number;
  prPage: number;
  status: string;
};

const BATCH = {
  commits: 25,
  issues: 20,
  pulls: 15,
  files: 12,
};

const CODE_EXTS = /\.(ts|tsx|js|jsx|py|go|java|json|yml|yaml|env|toml|rb)$/i;

function decisionId(repoId: string, title: string) {
  return createHash("sha1").update(`${repoId}:${title.toLowerCase()}`).digest("hex").slice(0, 20);
}

async function loadCheckpoint(repoId: string): Promise<Checkpoint> {
  const result = await withSession((session) =>
    session.run(`MATCH (s:IngestionState {repoId: $repoId}) RETURN s`, { repoId })
  );
  const node = result.records[0]?.get("s")?.properties;
  if (!node) {
    return {
      repoId,
      processedCommits: [],
      processedIssues: [],
      processedPrs: [],
      processedFiles: [],
      commitPage: 1,
      issuePage: 1,
      prPage: 1,
      status: "idle",
    };
  }
  return {
    repoId,
    processedCommits: node.processedCommits || [],
    processedIssues: (node.processedIssues || []).map((value: unknown) => toNumber(value)),
    processedPrs: (node.processedPrs || []).map((value: unknown) => toNumber(value)),
    processedFiles: node.processedFiles || [],
    commitPage: toNumber(node.commitPage) || 1,
    issuePage: toNumber(node.issuePage) || 1,
    prPage: toNumber(node.prPage) || 1,
    status: node.status || "idle",
  };
}

async function saveCheckpoint(checkpoint: Checkpoint, extra: Record<string, unknown> = {}) {
  await withSession((session) =>
    session.run(
      `MERGE (s:IngestionState {repoId: $repoId})
       SET s.processedCommits = $processedCommits,
           s.processedIssues = $processedIssues,
           s.processedPrs = $processedPrs,
           s.processedFiles = $processedFiles,
           s.commitPage = $commitPage,
           s.issuePage = $issuePage,
           s.prPage = $prPage,
           s.status = $status,
           s.updatedAt = datetime(),
           s += $extra`,
      { ...checkpoint, extra }
    )
  );
}

export async function ingestRepository(
  url: string,
  resume: boolean,
  onProgress: (event: ProgressEvent) => void
) {
  const { owner, repo } = parseGithubRepoUrl(url);
  const repoId = `${owner}/${repo}`;

  onProgress({ type: "progress", stage: "connect", message: "Connecting to Neo4j AuraDB...", percent: 4, repoId });

  const githubRepo = await fetchRepo(owner, repo);
  onProgress({
    type: "progress",
    stage: "repo",
    message: `Fetched ${githubRepo.full_name}`,
    percent: 10,
    repoId,
  });

  await withSession((session) =>
    session.run(
      `MERGE (r:Repository {id: $id})
       SET r.name = $name,
           r.owner = $owner,
           r.url = $url,
           r.description = $description,
           r.defaultBranch = $defaultBranch,
           r.language = $language,
           r.stars = $stars,
           r.source = 'github',
           r.ingestedAt = datetime()`,
      {
        id: repoId,
        name: githubRepo.name,
        owner: githubRepo.owner.login,
        url: githubRepo.html_url,
        description: githubRepo.description || "",
        defaultBranch: githubRepo.default_branch,
        language: githubRepo.language || "",
        stars: githubRepo.stargazers_count,
      }
    )
  );

  let checkpoint = await loadCheckpoint(repoId);
  if (!resume) {
    checkpoint = {
      repoId,
      processedCommits: [],
      processedIssues: [],
      processedPrs: [],
      processedFiles: [],
      commitPage: 1,
      issuePage: 1,
      prPage: 1,
      status: "running",
    };
  } else {
    checkpoint.status = "running";
  }
  await saveCheckpoint(checkpoint);

  const readme = await fetchReadme(owner, repo);
  if (readme) {
    await withSession((session) =>
      session.run(
        `MATCH (r:Repository {id: $repoId})
         MERGE (f:File {id: $id})
         SET f.path = 'README.md', f.language = 'markdown', f.repoId = $repoId, f.source = 'github'
         MERGE (r)-[:CONTAINS]->(f)`,
        { repoId, id: `${repoId}:README.md` }
      )
    );
  }

  onProgress({ type: "progress", stage: "commits", message: "Importing commits...", percent: 22, repoId });
  const commits = await fetchCommits(owner, repo, checkpoint.commitPage, BATCH.commits);
  const newCommits = commits.filter((commit) => !checkpoint.processedCommits.includes(commit.sha));
  const chronological = [...newCommits].reverse();

  for (const [index, summary] of chronological.entries()) {
    const detail = await fetchCommit(owner, repo, summary.sha);
    const login = detail.author?.login || detail.commit.author?.name || "unknown";
    await withSession(async (session) => {
      await session.run(
        `MATCH (r:Repository {id: $repoId})
         MERGE (c:Commit {sha: $sha})
         SET c.message = $message,
             c.date = $date,
             c.url = $url,
             c.repoId = $repoId,
             c.source = 'github'
         MERGE (d:Developer {login: $login})
         SET d.url = $devUrl, d.avatar = $avatar, d.source = 'github'
         MERGE (c)-[:AUTHORED_BY]->(d)
         MERGE (r)-[:CONTAINS]->(c)`,
        {
          repoId,
          sha: detail.sha,
          message: detail.commit.message.slice(0, 500),
          date: detail.commit.author?.date || detail.commit.committer?.date || "",
          url: detail.html_url,
          login,
          devUrl: detail.author?.html_url || `https://github.com/${login}`,
          avatar: detail.author?.avatar_url || "",
        }
      );

      for (const file of detail.files || []) {
        const fileId = `${repoId}:${file.filename}`;
        await session.run(
          `MATCH (r:Repository {id: $repoId})
           MATCH (c:Commit {sha: $sha})
           MERGE (f:File {id: $fileId})
           SET f.path = $path, f.repoId = $repoId, f.source = 'github'
           MERGE (r)-[:CONTAINS]->(f)
           MERGE (c)-[:MODIFIED]->(f)`,
          { repoId, sha: detail.sha, fileId, path: file.filename }
        );
        if (file.status === "added") {
          await session.run(
            `MATCH (c:Commit {sha: $sha}) MATCH (f:File {id: $fileId})
             MERGE (c)-[:INTRODUCED]->(f)`,
            { sha: detail.sha, fileId }
          );
        }
      }
    });

    if (looksLikeDecision(detail.commit.message)) {
      const title = detail.commit.message.split("\n")[0].slice(0, 140);
      const id = decisionId(repoId, title);
      await withSession((session) =>
        session.run(
          `MATCH (c:Commit {sha: $sha})
           MERGE (d:Decision {id: $id})
           SET d.title = $title,
               d.summary = $summary,
               d.repoId = $repoId,
               d.verified = false,
               d.origin = 'commit-inference',
               d.source = 'inferred',
               d.createdAt = $date
           MERGE (d)-[:IMPLEMENTED_BY]->(c)
           WITH d, c
           OPTIONAL MATCH (c)-[:AUTHORED_BY]->(dev:Developer)
           FOREACH (_ IN CASE WHEN dev IS NULL THEN [] ELSE [1] END |
             MERGE (d)-[:RELATED_TO]->(dev)
           )`,
          {
            sha: detail.sha,
            id,
            title,
            summary: detail.commit.message.slice(0, 400),
            repoId,
            date: detail.commit.author?.date || "",
          }
        )
      );
    }

    checkpoint.processedCommits.push(detail.sha);
    if (index % 5 === 0) await saveCheckpoint(checkpoint);
    onProgress({
      type: "progress",
      stage: "commits",
      message: `Commit ${detail.sha.slice(0, 7)} · ${detail.commit.message.split("\n")[0].slice(0, 80)}`,
      percent: 22 + Math.round(((index + 1) / Math.max(chronological.length, 1)) * 18),
      repoId,
    });
  }
  if (commits.length === BATCH.commits) checkpoint.commitPage += 1;

  onProgress({ type: "progress", stage: "issues", message: "Importing issues...", percent: 42, repoId });
  const issues = await fetchIssues(owner, repo, checkpoint.issuePage, BATCH.issues);
  for (const issue of issues) {
    if (checkpoint.processedIssues.includes(issue.number)) continue;
    const issueId = `${repoId}:issue:${issue.number}`;
    await withSession(async (session) => {
      await session.run(
        `MATCH (r:Repository {id: $repoId})
         MERGE (i:Issue {id: $id})
         SET i.number = $number,
             i.title = $title,
             i.body = $body,
             i.state = $state,
             i.url = $url,
             i.createdAt = $createdAt,
             i.repoId = $repoId,
             i.source = 'github'
         MERGE (r)-[:CONTAINS]->(i)`,
        {
          repoId,
          id: issueId,
          number: issue.number,
          title: issue.title,
          body: (issue.body || "").slice(0, 1500),
          state: issue.state,
          url: issue.html_url,
          createdAt: issue.created_at,
        }
      );
      if (issue.user?.login) {
        await session.run(
          `MATCH (i:Issue {id: $id})
           MERGE (d:Developer {login: $login})
           SET d.url = $url, d.avatar = $avatar, d.source = 'github'
           MERGE (i)-[:AUTHORED_BY]->(d)`,
          {
            id: issueId,
            login: issue.user.login,
            url: issue.user.html_url,
            avatar: issue.user.avatar_url,
          }
        );
      }
    });

    if (looksLikeIncident(issue.title, issue.labels.map((label) => label.name))) {
      const incidentId = `${repoId}:incident:${issue.number}`;
      await withSession(async (session) => {
        await session.run(
          `MATCH (i:Issue {id: $issueId})
           MERGE (n:Incident {id: $id})
           SET n.title = $title, n.description = $body, n.repoId = $repoId, n.source = 'github'
           MERGE (n)-[:DISCUSSED_IN]->(i)`,
          {
            issueId,
            id: incidentId,
            title: issue.title,
            body: (issue.body || "").slice(0, 800),
            repoId,
          }
        );
        for (const sha of extractShas(issue.body || "")) {
          await session.run(
            `MATCH (n:Incident {id: $id})
             OPTIONAL MATCH (c:Commit)
             WHERE c.repoId = $repoId AND (c.sha = $sha OR c.sha STARTS WITH $sha)
             WITH n, c
             WHERE c IS NOT NULL
             MERGE (n)-[:CAUSED_BY]->(c)`,
            { id: incidentId, repoId, sha }
          );
        }
      });
    }

    if (looksLikeDecision(`${issue.title}\n${issue.body || ""}`)) {
      const title = issue.title.slice(0, 140);
      const id = decisionId(repoId, title);
      const verified = issue.labels.some((label) => /decision|adr|rfc/i.test(label.name));
      await withSession((session) =>
        session.run(
          `MATCH (i:Issue {id: $issueId})
           MERGE (d:Decision {id: $id})
           SET d.title = $title,
               d.summary = $summary,
               d.repoId = $repoId,
               d.verified = $verified,
               d.origin = $origin,
               d.source = $source,
               d.createdAt = $createdAt
           MERGE (d)-[:DISCUSSED_IN]->(i)`,
          {
            issueId,
            id,
            title,
            summary: (issue.body || issue.title).slice(0, 400),
            repoId,
            verified,
            origin: verified ? "labeled-issue" : "issue-inference",
            source: verified ? "github" : "inferred",
            createdAt: issue.created_at,
          }
        )
      );
    }
    checkpoint.processedIssues.push(issue.number);
  }
  if (issues.length === BATCH.issues) checkpoint.issuePage += 1;

  onProgress({ type: "progress", stage: "pulls", message: "Importing pull requests...", percent: 58, repoId });
  const pulls = await fetchPulls(owner, repo, checkpoint.prPage, BATCH.pulls);
  for (const pull of pulls) {
    if (checkpoint.processedPrs.includes(pull.number)) continue;
    const prId = `${repoId}:pr:${pull.number}`;
    await withSession(async (session) => {
      await session.run(
        `MATCH (r:Repository {id: $repoId})
         MERGE (p:PullRequest {id: $id})
         SET p.number = $number,
             p.title = $title,
             p.body = $body,
             p.state = $state,
             p.url = $url,
             p.createdAt = $createdAt,
             p.mergedAt = $mergedAt,
             p.repoId = $repoId,
             p.source = 'github'
         MERGE (r)-[:CONTAINS]->(p)`,
        {
          repoId,
          id: prId,
          number: pull.number,
          title: pull.title,
          body: (pull.body || "").slice(0, 1500),
          state: pull.state,
          url: pull.html_url,
          createdAt: pull.created_at,
          mergedAt: pull.merged_at || "",
        }
      );
      if (pull.user?.login) {
        await session.run(
          `MATCH (p:PullRequest {id: $id})
           MERGE (d:Developer {login: $login})
           SET d.url = $url, d.avatar = $avatar, d.source = 'github'
           MERGE (p)-[:AUTHORED_BY]->(d)`,
          {
            id: prId,
            login: pull.user.login,
            url: pull.user.html_url,
            avatar: pull.user.avatar_url,
          }
        );
      }
    });

    if (looksLikeDecision(`${pull.title}\n${pull.body || ""}`)) {
      const title = pull.title.slice(0, 140);
      const id = decisionId(repoId, title);
      await withSession((session) =>
        session.run(
          `MATCH (p:PullRequest {id: $prId})
           MERGE (d:Decision {id: $id})
           SET d.title = $title,
               d.summary = $summary,
               d.repoId = $repoId,
               d.verified = false,
               d.origin = 'pull-inference',
               d.source = 'inferred',
               d.createdAt = $createdAt
           MERGE (d)-[:IMPLEMENTED_BY]->(p)
           MERGE (d)-[:DISCUSSED_IN]->(p)`,
          {
            prId,
            id,
            title,
            summary: (pull.body || pull.title).slice(0, 400),
            repoId,
            createdAt: pull.created_at,
          }
        )
      );
    }
    checkpoint.processedPrs.push(pull.number);
  }
  if (pulls.length === BATCH.pulls) checkpoint.prPage += 1;

  await linkSupersededDecisions(repoId);

  onProgress({ type: "progress", stage: "files", message: "Parsing source files and configuration...", percent: 72, repoId });
  let tree: Awaited<ReturnType<typeof fetchTree>> = [];
  for (const ref of [githubRepo.default_branch, "main", "master"]) {
    try {
      tree = await fetchTree(owner, repo, ref);
      break;
    } catch {
      tree = [];
    }
  }
  const candidates = tree
    .filter((item) => CODE_EXTS.test(item.path) && (isSourceFile(item.path) || isConfigFile(item.path)))
    .filter((item) => !checkpoint.processedFiles.includes(item.path))
    .slice(0, BATCH.files);

  for (const item of candidates) {
    const content = await fetchFileContent(owner, repo, item.path);
    const fileId = `${repoId}:${item.path}`;
    const language = item.path.split(".").pop() || "";
    await withSession((session) =>
      session.run(
        `MATCH (r:Repository {id: $repoId})
         MERGE (f:File {id: $fileId})
         SET f.path = $path, f.language = $language, f.repoId = $repoId, f.source = 'github'
         MERGE (r)-[:CONTAINS]->(f)`,
        { repoId, fileId, path: item.path, language }
      )
    );

    const functions = extractFunctions(item.path, content);
    for (const fn of functions) {
      const id = `${repoId}:${item.path}:${fn.name}:${fn.line}`;
      await withSession((session) =>
        session.run(
          `MATCH (f:File {id: $fileId})
           MERGE (fn:Function {id: $id})
           SET fn.name = $name, fn.signature = $signature, fn.line = $line, fn.filePath = $path, fn.repoId = $repoId, fn.source = 'github'
           MERGE (f)-[:CONTAINS]->(fn)`,
          {
            fileId,
            id,
            name: fn.name,
            signature: fn.signature,
            line: fn.line,
            path: item.path,
            repoId,
          }
        )
      );
      await withSession((session) =>
        session.run(
          `MATCH (fn:Function {id: $id})
           MATCH (c:Commit)-[:MODIFIED]->(:File {id: $fileId})
           WITH fn, c ORDER BY c.date ASC LIMIT 1
           MERGE (c)-[:INTRODUCED]->(fn)`,
          { id, fileId }
        )
      );
    }

    const configs = extractConfigurations(item.path, content);
    for (const config of configs) {
      const id = `${repoId}:${item.path}:${config.key}`;
      await withSession((session) =>
        session.run(
          `MATCH (f:File {id: $fileId})
           MERGE (cfg:Configuration {id: $id})
           SET cfg.key = $key, cfg.value = $value, cfg.line = $line, cfg.filePath = $path, cfg.repoId = $repoId, cfg.source = 'github'
           MERGE (f)-[:CONTAINS]->(cfg)`,
          {
            fileId,
            id,
            key: config.key,
            value: config.value,
            line: config.line,
            path: item.path,
            repoId,
          }
        )
      );
      await withSession((session) =>
        session.run(
          `MATCH (cfg:Configuration {id: $id})
           MATCH (c:Commit)-[:MODIFIED]->(:File {id: $fileId})
           WITH cfg, c ORDER BY c.date ASC LIMIT 1
           MERGE (c)-[:INTRODUCED]->(cfg)`,
          { id, fileId }
        )
      );
    }

    for (const dep of extractDependencies(content)) {
      const resolved = resolveRelative(item.path, dep.specifier);
      if (!resolved) continue;
      await withSession((session) =>
        session.run(
          `MATCH (a:File {id: $fromId})
           OPTIONAL MATCH (b:File)
           WHERE b.repoId = $repoId AND (b.path = $resolved OR b.path STARTS WITH $resolved)
           WITH a, b
           WHERE b IS NOT NULL
           MERGE (a)-[:DEPENDS_ON]->(b)`,
          { fromId: fileId, repoId, resolved }
        )
      );
    }

    checkpoint.processedFiles.push(item.path);
  }

  await relateIssuesToCode(repoId);

  const moreWork =
    commits.length === BATCH.commits ||
    issues.length === BATCH.issues ||
    pulls.length === BATCH.pulls ||
    candidates.length === BATCH.files;

  checkpoint.status = moreWork ? "paused" : "complete";
  await saveCheckpoint(checkpoint, {
    lastMessage: moreWork ? "Batch complete. Resume analysis to continue." : "Ingestion complete.",
  });

  const stats = await repoStats(repoId);
  onProgress({
    type: "success",
    stage: moreWork ? "paused" : "complete",
    message: moreWork
      ? "Batch imported. Use Resume Analysis to continue without duplicate imports."
      : "Repository imported into Neo4j.",
    percent: moreWork ? 92 : 100,
    repoId,
    stats,
    resumable: moreWork,
  });
}

function resolveRelative(fromPath: string, specifier: string) {
  if (!specifier.startsWith(".")) return "";
  const parts = fromPath.split("/").slice(0, -1);
  for (const segment of specifier.split("/")) {
    if (segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/").replace(/\.(ts|tsx|js|jsx)$/, "");
}

async function linkSupersededDecisions(repoId: string) {
  await withSession((session) =>
    session.run(
      `MATCH (a:Decision {repoId: $repoId})
       MATCH (b:Decision {repoId: $repoId})
       WHERE a.id <> b.id
         AND b.createdAt > a.createdAt
         AND (
           toLower(b.title) CONTAINS 'revert'
           OR toLower(b.title) CONTAINS 'supersede'
           OR toLower(b.summary) CONTAINS toLower(substring(a.title, 0, 24))
         )
       MERGE (a)-[:SUPERSEDED_BY]->(b)`,
      { repoId }
    )
  );
}

async function relateIssuesToCode(repoId: string) {
  await withSession((session) =>
    session.run(
      `MATCH (i:Issue {repoId: $repoId})
       MATCH (fn:Function {repoId: $repoId})
       WHERE toLower(i.title + ' ' + coalesce(i.body, '')) CONTAINS toLower(fn.name)
       MERGE (i)-[:RELATED_TO]->(fn)
       WITH i, fn
       MATCH (f:File {repoId: $repoId, path: fn.filePath})
       MERGE (i)-[:RELATED_TO]->(f)`,
      { repoId }
    )
  );
  await withSession((session) =>
    session.run(
      `MATCH (i:Issue {repoId: $repoId})
       MATCH (cfg:Configuration {repoId: $repoId})
       WHERE toLower(i.title + ' ' + coalesce(i.body, '')) CONTAINS toLower(cfg.key)
       MERGE (i)-[:RELATED_TO]->(cfg)`,
      { repoId }
    )
  );
  await withSession((session) =>
    session.run(
      `MATCH (p:PullRequest {repoId: $repoId})
       MATCH (c:Commit {repoId: $repoId})
       WHERE toLower(p.title) CONTAINS toLower(substring(c.message, 0, 40))
          OR toLower(c.message) CONTAINS toLower(substring(p.title, 0, 40))
       MERGE (p)-[:RELATED_TO]->(c)`,
      { repoId }
    )
  );
}

export async function repoStats(repoId: string) {
  const result = await withSession((session) =>
    session.run(
      `MATCH (n)
       WHERE n.repoId = $repoId OR n.id = $repoId
       RETURN labels(n)[0] AS label, count(*) AS total`,
      { repoId }
    )
  );
  const developers = await withSession((session) =>
    session.run(
      `MATCH (x)-[:AUTHORED_BY]->(d:Developer)
       WHERE x.repoId = $repoId
       RETURN count(DISTINCT d) AS developers`,
      { repoId }
    )
  );
  const counts: Record<string, number> = {};
  for (const record of result.records) {
    counts[String(record.get("label"))] = toNumber(record.get("total"));
  }
  return {
    commits: counts.Commit || 0,
    pullRequests: counts.PullRequest || 0,
    issues: counts.Issue || 0,
    files: counts.File || 0,
    decisions: counts.Decision || 0,
    functions: counts.Function || 0,
    configurations: counts.Configuration || 0,
    developers: toNumber(developers.records[0]?.get("developers")),
    incidents: counts.Incident || 0,
  };
}

export async function getIngestionState(repoId: string) {
  return loadCheckpoint(repoId);
}
