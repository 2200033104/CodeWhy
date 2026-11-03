"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { DataBadge, EmptyState, ErrorBanner, PageHeader } from "@/components/AppShell";
import { api, type GraphPayload } from "@/lib/api";

const TYPES = [
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

export default function GraphPage() {
  const [search, setSearch] = useState("");
  const [repoId, setRepoId] = useState("");
  const [repos, setRepos] = useState<{ id: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [payload, setPayload] = useState<GraphPayload | null>(null);
  const [active, setActive] = useState<GraphPayload["nodes"][number] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .repos()
      .then((value) => setRepos(value.repositories))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (repoId) params.set("repoId", repoId);
      if (search) params.set("search", search);
      if (selected.length) params.set("types", selected.join(","));
      setPayload(await api.graph(params));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Graph query failed");
    } finally {
      setLoading(false);
    }
  }, [repoId, search, selected]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 200);
    return () => clearTimeout(timer);
  }, [load]);

  const nodes: Node[] = useMemo(
    () =>
      (payload?.nodes || []).map((node) => ({
        id: node.id,
        position: node.position,
        data: { label: `${node.type}: ${node.label}` },
        style: {
          background: "#0b1728",
          color: node.color,
          border: `1px solid ${node.color}`,
          borderRadius: 12,
          padding: 8,
          fontSize: 12,
          width: 210,
        },
      })),
    [payload]
  );

  const edges: Edge[] = useMemo(
    () =>
      (payload?.edges || []).map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        animated: edge.label === "INTRODUCED" || edge.label === "SUPERSEDED_BY",
        style: { stroke: "#67e8f9" },
        labelStyle: { fill: "#94a3b8", fontSize: 10 },
      })),
    [payload]
  );

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="Interactive explorer"
          title="Knowledge graph"
          description="Nodes and relationships are queried live from Neo4j. Use search, type filters and node selection to inspect evidence."
        />
        {payload ? <DataBadge mode={payload.dataMode} /> : null}
      </div>
      {error ? <ErrorBanner message={error} /> : null}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search files, functions, commits, issues…"
          className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
        />
        <select
          value={repoId}
          onChange={(event) => setRepoId(event.target.value)}
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white"
        >
          <option value="">All repositories</option>
          {repos.map((repo) => (
            <option key={repo.id} value={repo.id}>
              {repo.id}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {TYPES.map((type) => {
          const on = !selected.length || selected.includes(type);
          return (
            <button
              key={type}
              onClick={() =>
                setSelected((current) =>
                  current.includes(type) ? current.filter((item) => item !== type) : [...current, type]
                )
              }
              className={`rounded-full px-3 py-1 text-xs ${on ? "bg-cyan-400/15 text-cyan-200" : "bg-white/5 text-slate-500"}`}
            >
              {type}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="card h-[640px] overflow-hidden rounded-3xl">
          {loading ? <p className="p-6 text-slate-400">Querying Neo4j…</p> : null}
          {!loading && payload && !payload.nodes.length ? (
            <div className="p-6">
              <EmptyState title="No graph nodes match these filters" body="Ingest a repository or clear search/filters." />
            </div>
          ) : null}
          {!loading && payload?.nodes.length ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              fitView
              onNodeClick={(_, node) => {
                const match = payload.nodes.find((item) => item.id === node.id) || null;
                setActive(match);
              }}
            >
              <MiniMap pannable zoomable />
              <Controls />
              <Background color="#164e63" gap={18} />
            </ReactFlow>
          ) : null}
        </div>
        <aside className="card rounded-3xl p-5">
          <h2 className="text-lg text-white">Selected node</h2>
          {active ? (
            <div className="mt-4 space-y-2 text-sm">
              <p className="text-cyan-200">{active.type}</p>
              <p className="font-medium text-white">{active.label}</p>
              {Object.entries(active.properties).map(([key, value]) => (
                <p key={key} className="break-all text-slate-400">
                  <span className="text-slate-500">{key}:</span> {String(value).slice(0, 180)}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Click a node to inspect its Neo4j properties and GitHub links.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
