"use client";

import { useEffect, useState } from "react";
import { DataBadge, ErrorBanner, PageHeader } from "@/components/AppShell";
import { api, type Evidence } from "@/lib/api";

const SUGGESTIONS = [
  "Why was this function implemented this way?",
  "Why is the retry limit set to three?",
  "Which commit introduced this configuration?",
  "Which issue explains this code change?",
  "Was this engineering decision superseded?",
];

export default function AskPage() {
  const [question, setQuestion] = useState(SUGGESTIONS[0]);
  const [repoId, setRepoId] = useState("");
  const [repos, setRepos] = useState<{ id: string; name: string }[]>([]);
  const [answer, setAnswer] = useState("");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [meta, setMeta] = useState({ confidence: "", usedLlm: false, dataMode: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .repos()
      .then((value) => setRepos(value.repositories))
      .catch(() => setRepos([]));
  }, []);

  async function onAsk(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await api.ask(question, repoId || undefined);
      setAnswer(result.answer);
      setEvidence(result.evidence);
      setMeta({ confidence: result.confidence, usedLlm: result.usedLlm, dataMode: result.dataMode });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ask failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Evidence-first Q&A"
        title="Ask CodeWhy"
        description="Questions are answered from Neo4j retrieval and GitHub-backed node properties. If the graph does not contain the fact, CodeWhy will say the evidence is insufficient."
      />
      {error ? <ErrorBanner message={error} /> : null}

      <form onSubmit={onAsk} className="card rounded-3xl p-6">
        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={4}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-cyan-400/40 focus:ring"
          />
          <div className="space-y-3">
            <select
              value={repoId}
              onChange={(event) => setRepoId(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white"
            >
              <option value="">All ingested repositories</option>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.id}
                </option>
              ))}
            </select>
            <button disabled={loading} className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">
              {loading ? "Retrieving evidence…" : "Ask"}
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setQuestion(item)}
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:border-cyan-400/40"
            >
              {item}
            </button>
          ))}
        </div>
      </form>

      {answer ? (
        <section className="mt-6 card rounded-3xl p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg text-white">Explanation</h2>
            <DataBadge mode={meta.dataMode} />
            <span className="text-xs text-slate-500">confidence {meta.confidence}</span>
            <span className="text-xs text-slate-500">{meta.usedLlm ? "LLM phrasing over retrieved evidence" : "Structured retrieval answer (no LLM)"}</span>
          </div>
          <p className="mt-4 leading-7 text-slate-200">{answer}</p>
          <h3 className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Evidence</h3>
          <div className="mt-3 space-y-3">
            {evidence.map((item, index) => (
              <article key={`${item.kind}-${index}`} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {item.kind} · {item.source}
                </p>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 block font-medium text-cyan-200 hover:underline">
                    {item.title}
                  </a>
                ) : (
                  <p className="mt-1 font-medium text-white">{item.title}</p>
                )}
                <p className="mt-1 text-sm text-slate-400">{item.detail}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {[item.contributor, item.date].filter(Boolean).join(" · ")}
                  {!item.url && item.kind !== "Function" && item.kind !== "Configuration" && item.kind !== "File" && item.kind !== "Decision"
                    ? " · no GitHub URL retrieved"
                    : ""}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
