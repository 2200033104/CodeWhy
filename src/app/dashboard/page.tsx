"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataBadge, EmptyState, ErrorBanner, PageHeader } from "@/components/AppShell";
import { api, type Dashboard } from "@/lib/api";

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .dashboard()
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    ["Repositories", data?.stats.repositories],
    ["Commits analysed", data?.stats.commits],
    ["Pull requests", data?.stats.pullRequests],
    ["Issues", data?.stats.issues],
    ["Decisions", data?.stats.decisions],
    ["Relationships", data?.stats.relationships],
  ];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="Operations"
          title="Engineering intelligence dashboard"
          description="Live counts from Neo4j AuraDB after GitHub ingestion. Empty until a repository is imported."
        />
        {data ? <DataBadge mode={data.dataMode} /> : null}
      </div>
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <p className="text-slate-400">Loading graph statistics…</p> : null}
      {!loading && !error && !data?.repositories.length ? (
        <EmptyState
          title="No repositories in Neo4j yet"
          body="This is an empty retrieved state, not sample data. Ingest a public GitHub repository to populate the dashboard."
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map(([label, value]) => (
          <article key={String(label)} className="card rounded-2xl p-5">
            <p className="text-sm text-slate-400">{label}</p>
            <p className="mt-2 font-mono text-3xl text-cyan-200">{value ?? "—"}</p>
          </article>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="card rounded-2xl p-5">
          <h2 className="text-lg font-medium text-white">Connected repositories</h2>
          <div className="mt-4 space-y-3">
            {data?.repositories.map((repo) => (
              <div key={repo.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <a href={repo.url} className="font-medium text-cyan-200 hover:underline" target="_blank" rel="noreferrer">
                    {repo.id}
                  </a>
                  <span className="text-xs capitalize text-slate-400">{repo.ingestionStatus}</span>
                </div>
                <p className="mt-1 text-sm text-slate-400">{repo.description || "No description on GitHub."}</p>
                {repo.resumable ? (
                  <Link href="/ingest" className="mt-2 inline-block text-sm text-amber-200">
                    Resume analysis →
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </section>
        <section className="card rounded-2xl p-5">
          <h2 className="text-lg font-medium text-white">Recent activity</h2>
          <div className="mt-4 space-y-3">
            {data?.recentActivity.map((item) => (
              <a key={item.sha} href={item.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/10 bg-black/20 p-4 hover:border-cyan-400/30">
                <p className="text-sm text-white">{item.message?.split("\n")[0]}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {item.sha?.slice(0, 7)} · {item.author || "unknown"} · {item.date} · {item.repoId}
                </p>
              </a>
            ))}
            {data && !data.recentActivity.length ? <p className="text-sm text-slate-500">No commits retrieved yet.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
