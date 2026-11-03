"use client";

import { useEffect, useState } from "react";
import { DataBadge, EmptyState, ErrorBanner, PageHeader } from "@/components/AppShell";
import { api } from "@/lib/api";

export default function AnalyticsPage() {
  const [repoId, setRepoId] = useState("");
  const [repos, setRepos] = useState<{ id: string }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.analytics>> | null>(null);

  useEffect(() => {
    api
      .repos()
      .then((value) => setRepos(value.repositories))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .analytics(repoId || undefined)
      .then((value) => {
        setData(value);
        setError("");
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [repoId]);

  const maxCommits = Math.max(1, ...(data?.activity.map((item) => item.commits) || [1]));
  const maxContrib = Math.max(1, ...(data?.contributors.map((item) => item.commits) || [1]));
  const maxGrowth = Math.max(1, ...(data?.graphGrowth.map((item) => item.total) || [1]));

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="Insights"
          title="Repository and graph analytics"
          description="Contributor volume, commit activity, node-type growth and decision mix — all queried from Neo4j."
        />
        {data ? <DataBadge mode={data.dataMode} /> : null}
      </div>
      <select
        value={repoId}
        onChange={(event) => setRepoId(event.target.value)}
        className="mb-6 rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white"
      >
        <option value="">All repositories</option>
        {repos.map((repo) => (
          <option key={repo.id} value={repo.id}>
            {repo.id}
          </option>
        ))}
      </select>
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <p className="text-slate-400">Loading analytics…</p> : null}
      {!loading && data && !data.contributors.length && !data.activity.length ? (
        <EmptyState title="No analytics yet" body="Import a repository to build these charts from retrieved graph data." />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card rounded-2xl p-5">
          <h2 className="text-lg text-white">Contributor statistics</h2>
          <div className="mt-4 space-y-3">
            {data?.contributors.map((item) => (
              <div key={item.login}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{item.login}</span>
                  <span className="font-mono text-cyan-200">{item.commits}</span>
                </div>
                <div className="h-2 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-cyan-400" style={{ width: `${(item.commits / maxContrib) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="card rounded-2xl p-5">
          <h2 className="text-lg text-white">Decision distribution</h2>
          <div className="mt-4 space-y-3">
            {data?.decisions.map((item, index) => (
              <div key={`${item.origin}-${index}`} className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-sm">
                <span>
                  {item.verified ? "Verified" : "Inferred"} · {item.origin}
                </span>
                <span className="font-mono text-cyan-200">{item.total}</span>
              </div>
            ))}
            {data && !data.decisions.length ? <p className="text-sm text-slate-500">No decision nodes yet.</p> : null}
          </div>
        </section>
        <section className="card rounded-2xl p-5">
          <h2 className="text-lg text-white">Repository activity</h2>
          <div className="mt-4 flex h-48 items-end gap-1">
            {data?.activity.map((item) => (
              <div key={item.day} className="group flex flex-1 flex-col items-center justify-end">
                <div
                  className="w-full rounded-t bg-gradient-to-t from-blue-600 to-cyan-300"
                  style={{ height: `${(item.commits / maxCommits) * 100}%`, minHeight: 4 }}
                  title={`${item.day}: ${item.commits}`}
                />
              </div>
            ))}
          </div>
        </section>
        <section className="card rounded-2xl p-5">
          <h2 className="text-lg text-white">Graph growth by node type</h2>
          <div className="mt-4 space-y-2">
            {data?.graphGrowth.map((item) => (
              <div key={item.label} className="grid grid-cols-[120px_1fr_40px] items-center gap-2 text-sm">
                <span className="text-slate-400">{item.label}</span>
                <div className="h-2 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-blue-400" style={{ width: `${(item.total / maxGrowth) * 100}%` }} />
                </div>
                <span className="font-mono text-cyan-200">{item.total}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
