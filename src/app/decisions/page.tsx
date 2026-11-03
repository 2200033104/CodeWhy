"use client";

import { useEffect, useState } from "react";
import { DataBadge, EmptyState, ErrorBanner, PageHeader } from "@/components/AppShell";
import { api } from "@/lib/api";

export default function DecisionsPage() {
  const [repoId, setRepoId] = useState("");
  const [repos, setRepos] = useState<{ id: string }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.decisions>>["decisions"]>([]);
  const [mode, setMode] = useState("");

  useEffect(() => {
    api
      .repos()
      .then((value) => setRepos(value.repositories))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .decisions(repoId || undefined)
      .then((value) => {
        setRows(value.decisions);
        setMode(value.dataMode);
        setError("");
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [repoId]);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="Decision history"
          title="Why engineering choices survived"
          description="Verified decisions come from labeled GitHub issues (ADR/RFC/decision). Inferred decisions are extracted from commit, issue and pull-request language and are labeled as such."
        />
        {mode ? <DataBadge mode={mode} /> : null}
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
      {loading ? <p className="text-slate-400">Loading decisions from Neo4j…</p> : null}
      {!loading && !rows.length ? (
        <EmptyState
          title="No decisions retrieved"
          body="Decisions appear after ingestion when commits, issues or PRs discuss a choice. This empty view is not sample data."
        />
      ) : null}
      <div className="space-y-4">
        {rows.map((decision) => (
          <article key={decision.id} className="card rounded-2xl p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg text-white">{decision.title}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  decision.verified ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/15 text-amber-200"
                }`}
              >
                {decision.verified ? "Verified" : "Automated inference"}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-400">{decision.summary}</p>
            <p className="mt-2 text-xs text-slate-500">
              {decision.repoId} · {decision.origin} · {decision.createdAt || "date unknown"} ·{" "}
              {decision.contributors.join(", ") || "no linked contributor"}
            </p>
            {decision.supersededBy.length ? (
              <p className="mt-2 text-sm text-orange-200">Superseded by: {decision.supersededBy.join("; ")}</p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No SUPERSEDED_BY relationship recorded.</p>
            )}
            <div className="mt-3 space-y-1">
              {decision.evidence.map((item, index) =>
                item.url ? (
                  <a key={`${item.url}-${index}`} href={item.url} className="block text-sm text-cyan-200 hover:underline" target="_blank" rel="noreferrer">
                    {item.title}
                  </a>
                ) : (
                  <p key={`${item.title}-${index}`} className="text-sm text-slate-400">
                    {item.title}
                  </p>
                )
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
