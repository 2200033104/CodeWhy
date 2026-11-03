import { env } from "./env";

const API = "https://api.github.com";

export type GithubRepo = {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string; html_url: string };
  description: string | null;
  html_url: string;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string;
};

export type GithubCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string } | null;
    committer: { name: string; date: string } | null;
  };
  author: { login: string; html_url: string; avatar_url: string } | null;
  files?: { filename: string; status: string; patch?: string }[];
};

export type GithubIssue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  pull_request?: { url: string };
  user: { login: string; html_url: string; avatar_url: string } | null;
  labels: { name: string }[];
};

export type GithubPull = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  created_at: string;
  merged_at: string | null;
  user: { login: string; html_url: string; avatar_url: string } | null;
};

export type GithubTreeItem = { path: string; type: string; sha: string };

export function parseGithubRepoUrl(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/)?(?:#.*)?$/i
  );
  if (!match) {
    throw new Error("Enter a public GitHub repository URL such as https://github.com/owner/repo");
  }
  return { owner: match[1], repo: match[2].replace(/\.git$/i, "") };
}

async function githubFetch<T>(path: string): Promise<{ data: T; status: number; remaining: number }> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CodeWhy-HACKYI6D-HackFront-India-2026",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (env.githubToken) headers.Authorization = `Bearer ${env.githubToken}`;

  const response = await fetch(`${API}${path}`, { headers });
  const remaining = Number(response.headers.get("x-ratelimit-remaining") || 0);
  const text = await response.text();
  if (!response.ok) {
    let message = `GitHub API ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      if (text) message = text.slice(0, 240);
    }
    if (response.status === 403 || response.status === 429) {
      message += " Rate limit reached. Set GITHUB_TOKEN in .env to continue.";
    }
    if (response.status === 404) {
      message = "Repository not found or it is private. CodeWhy ingests public repositories.";
    }
    throw new Error(message);
  }
  return { data: JSON.parse(text) as T, status: response.status, remaining };
}

export async function fetchRepo(owner: string, repo: string) {
  const { data } = await githubFetch<GithubRepo>(`/repos/${owner}/${repo}`);
  return data;
}

export async function fetchCommits(owner: string, repo: string, page: number, perPage = 30) {
  const { data } = await githubFetch<GithubCommit[]>(
    `/repos/${owner}/${repo}/commits?per_page=${perPage}&page=${page}`
  );
  return data;
}

export async function fetchCommit(owner: string, repo: string, sha: string) {
  const { data } = await githubFetch<GithubCommit>(`/repos/${owner}/${repo}/commits/${sha}`);
  return data;
}

export async function fetchIssues(owner: string, repo: string, page: number, perPage = 30) {
  const { data } = await githubFetch<GithubIssue[]>(
    `/repos/${owner}/${repo}/issues?state=all&per_page=${perPage}&page=${page}`
  );
  return data.filter((issue) => !issue.pull_request);
}

export async function fetchPulls(owner: string, repo: string, page: number, perPage = 20) {
  const { data } = await githubFetch<GithubPull[]>(
    `/repos/${owner}/${repo}/pulls?state=all&per_page=${perPage}&page=${page}`
  );
  return data;
}

export async function fetchReadme(owner: string, repo: string) {
  try {
    const { data } = await githubFetch<{ content?: string; encoding?: string; download_url?: string }>(
      `/repos/${owner}/${repo}/readme`
    );
    if (data.content && data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf8");
    }
    return "";
  } catch {
    return "";
  }
}

export async function fetchTree(owner: string, repo: string, branch: string) {
  const { data } = await githubFetch<{ tree: GithubTreeItem[]; truncated: boolean }>(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  );
  return data.tree.filter((item) => item.type === "blob");
}

export async function fetchFileContent(owner: string, repo: string, path: string) {
  const { data } = await githubFetch<{ content?: string; encoding?: string; size?: number }>(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replaceAll("%2F", "/")}`
  );
  if (!data.content || data.encoding !== "base64") return "";
  if ((data.size || 0) > 200_000) return "";
  return Buffer.from(data.content, "base64").toString("utf8");
}
