export type Health = {
  ok: boolean;
  neo4jConfigured: boolean;
  neo4j: { ok: boolean; error?: string };
  githubToken: boolean;
  llm: boolean;
};

export type Dashboard = {
  dataMode: string;
  stats: Record<string, number>;
  repositories: {
    id: string;
    name: string;
    owner: string;
    url: string;
    description: string;
    language: string;
    stars: number;
    ingestionStatus: string;
    resumable: boolean;
  }[];
  recentActivity: {
    sha: string;
    message: string;
    date: string;
    url: string;
    repoId: string;
    author: string | null;
  }[];
};

export type GraphPayload = {
  dataMode: string;
  nodes: {
    id: string;
    type: string;
    label: string;
    color: string;
    position: { x: number; y: number };
    properties: Record<string, string | number | boolean>;
  }[];
  edges: { id: string; source: string; target: string; label: string }[];
};

export type Evidence = {
  kind: string;
  title: string;
  detail: string;
  url?: string;
  date?: string;
  contributor?: string;
  source: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export const api = {
  health: () => request<Health>("/api/health"),
  dashboard: () => request<Dashboard>("/api/dashboard"),
  repos: () => request<{ repositories: { id: string; name: string }[] }>("/api/repos"),
  graph: (params: URLSearchParams) => request<GraphPayload>(`/api/graph?${params}`),
  decisions: (repoId?: string) =>
    request<{
      dataMode: string;
      decisions: {
        id: string;
        title: string;
        summary: string;
        repoId: string;
        verified: boolean;
        origin: string;
        source: string;
        createdAt: string;
        contributors: string[];
        evidence: { title: string; url: string }[];
        supersededBy: string[];
      }[];
    }>(`/api/decisions${repoId ? `?repoId=${encodeURIComponent(repoId)}` : ""}`),
  analytics: (repoId?: string) =>
    request<{
      dataMode: string;
      contributors: { login: string; commits: number }[];
      activity: { day: string; commits: number }[];
      graphGrowth: { label: string; total: number }[];
      decisions: { verified: boolean; origin: string; total: number }[];
    }>(`/api/analytics${repoId ? `?repoId=${encodeURIComponent(repoId)}` : ""}`),
  ask: (question: string, repoId?: string) =>
    request<{
      answer: string;
      confidence: string;
      evidence: Evidence[];
      usedLlm: boolean;
      dataMode: string;
    }>("/api/ask", { method: "POST", body: JSON.stringify({ question, repoId }) }),
};

export async function ingestStream(
  url: string,
  resume: boolean,
  onEvent: (event: {
    type: string;
    stage: string;
    message: string;
    percent: number;
    repoId?: string;
    stats?: Record<string, number>;
    resumable?: boolean;
  }) => void
) {
  const response = await fetch("/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, resume }),
  });
  if (!response.body) throw new Error("No ingestion stream received from the API.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      onEvent(JSON.parse(line));
    }
    if (done) break;
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer));
}
