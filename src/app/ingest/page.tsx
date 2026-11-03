"use client";

import { useEffect, useState } from "react";
import { DataBadge, ErrorBanner, PageHeader } from "@/components/AppShell";
import { api, ingestStream } from "@/lib/api";

type LogItem = { type: string; message: string; percent: number; stage: string };

export default function IngestPage() {
  const [url, setUrl] = useState("https://github.com/octocat/Hello-World");
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [repoId, setRepoId] = useState("");
  const [resumable, setResumable] = useState(false);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [health, setHealth] = useState<string>("");

  useEffect(() => {
    api
      .health()
      .then((value) => {
        setHealth(
          value.neo4j.ok
            ? "Neo4j AuraDB connected"
            : value.neo4j.error || "Neo4j is not connected. Add credentials to .env."
        );
      })
      .catch((err: Error) => setHealth(err.message));
  }, []);

  async function run(resume: boolean) {
    setRunning(true);
    setError("");
    setStats(null);
    setLogs([]);
    try {
      await ingestStream(url, resume, (event) => {
        setLogs((current) => [...current, event]);
        if (event.repoId) setRepoId(event.repoId);
        if (event.stats) setStats(event.stats);
        if (event.resumable) setResumable(true);
        if (event.type === "success" && !event.resumable) setResumable(false);
        if (event.type === "error") setError(event.message);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingestion failed");
    } finally {
      setRunning(false);
    }
  }

  const percent = logs.at(-1)?.percent ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="GitHub → Neo4j"
        title="Repository ingestion"
        description="Fetches public repository details, commits, issues, pull requests and README files, then MERGEs them into AuraDB. Processed identifiers are stored so Resume Analysis skips duplicates."
      />
      {error ? <ErrorBanner message={error} /> : null}

      <div className="card rounded-3xl p-6">
        <label className="text-sm text-slate-300" htmlFor="repo-url">
          Public GitHub repository URL
        </label>
        <div className="mt-2 flex flex-col gap-3 md:flex-row">
          <input
            id="repo-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://github.com/owner/repo"
            className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-cyan-400/40 focus:ring"
          />
          <button
            disabled={running}
            onClick={() => run(false)}
            className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50"
          >
            {running ? "Ingesting…" : "Start analysis"}
          </button>
          <button
            disabled={running || (!resumable && !repoId)}
            onClick={() => run(true)}
            className="rounded-xl border border-amber-300/40 px-5 py-3 font-semibold text-amber-100 disabled:opacity-40"
          >
            Resume analysis
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">{health}</p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card rounded-2xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg text-white">Progress</h2>
            {repoId ? <DataBadge mode="retrieved" /> : null}
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-300 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-400">{percent}% {logs.at(-1)?.message || "Waiting to start"}</p>
          <div className="mt-4 max-h-80 space-y-2 overflow-auto font-mono text-xs">
            {logs.map((log, index) => (
              <p key={`${log.message}-${index}`} className={log.type === "error" ? "text-rose-300" : "text-slate-400"}>
                [{log.stage}] {log.message}
              </p>
            ))}
          </div>
        </section>
        <section className="card rounded-2xl p-5">
          <h2 className="text-lg text-white">Imported this run</h2>
          {stats ? (
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              {Object.entries(stats).map(([key, value]) => (
                <li key={key} className="flex justify-between">
                  <span className="capitalize">{key}</span>
                  <span className="font-mono text-cyan-200">{value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Counts appear after a successful Neo4j write.</p>
          )}
          {resumable ? (
            <p className="mt-4 text-sm text-amber-200">
              Batch paused with checkpoints saved. Resume analysis continues from processed commit, issue, PR and file identifiers.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
