import Link from "next/link";

const features = [
  {
    title: "GitHub ingestion",
    body: "Import a public repository’s commits, files, issues, pull requests and README into a living knowledge graph.",
  },
  {
    title: "Neo4j knowledge graph",
    body: "Repository, File, Function, Configuration, Commit, PullRequest, Issue, Decision, Incident and Developer nodes with Cypher relationships.",
  },
  {
    title: "Ask CodeWhy",
    body: "Question answering grounded in retrieved evidence. Missing proof is stated clearly — citations are never invented.",
  },
  {
    title: "Graph explorer",
    body: "Zoom, filter and inspect how code, people and decisions connect, using the actual AuraDB graph.",
  },
  {
    title: "Decision history",
    body: "Verified ADRs and inferred decisions stay distinct, with superseding changes when the graph records them.",
  },
  {
    title: "Resume analysis",
    body: "Checkpoints store processed record identifiers so interrupted imports continue without duplicate MERGE writes.",
  },
];

const stack = ["React", "TypeScript", "Tailwind CSS", "Node.js", "Express", "Neo4j AuraDB", "Cypher", "GitHub REST API", "React Flow"];

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
            HackFront India 2026 · AI & Developer Tools · Neo4j
          </p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight text-white md:text-6xl">
            Why the code is like this.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
            CodeWhy is a GraphRAG engineering intelligence assistant. It explains current
            implementations by connecting source files, Git history, pull requests, issues,
            technical decisions and the developers who made them.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/ingest"
              className="rounded-full bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.35)]"
            >
              Ingest a public repository
            </Link>
            <Link
              href="/ask"
              className="rounded-full border border-cyan-400/30 px-6 py-3 text-sm font-medium text-cyan-100 hover:bg-white/5"
            >
              Ask CodeWhy
            </Link>
          </div>
        </div>
        <div className="card relative overflow-hidden rounded-3xl p-6">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />
          <p className="font-mono text-xs text-cyan-300">
  {"MATCH (decision)-[:IMPLEMENTED_BY]->(commit)"}
</p>
          <div className="mt-6 space-y-3">
            {[
              ["Repository", "public GitHub project"],
              ["Commit", "who changed what, and when"],
              ["Issue / PR", "the discussion behind the diff"],
              ["Decision", "why the implementation stayed"],
            ].map(([label, detail]) => (
              <div key={label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <span className="text-sm font-medium text-white">{label}</span>
                <span className="text-xs text-slate-400">{detail}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-white">How CodeWhy answers</h2>
        <p className="mt-2 max-w-3xl text-slate-400">
          Retrieval comes first. Cypher queries collect commits, configurations, issues and
          decisions. Answers cite those records. If the graph does not contain enough evidence,
          CodeWhy says so.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="card rounded-2xl p-5">
              <h3 className="text-lg font-medium text-cyan-200">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card rounded-3xl p-8">
        <h2 className="text-2xl font-semibold text-white">Technology</h2>
        <div className="mt-5 flex flex-wrap gap-2">
          {stack.map((item) => (
            <span key={item} className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-100">
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="card rounded-3xl p-8">
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Team HACKYI6D</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Builders</h2>
          <ul className="mt-5 space-y-3 text-slate-300">
            <li>Jahnavi Reddy</li>
            <li>Pavan Sai Reddy</li>
          </ul>
        </article>
        <article className="card rounded-3xl p-8">
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Demo path</p>
          <ol className="mt-5 space-y-2 text-sm text-slate-300">
            <li>1. Paste a public GitHub URL</li>
            <li>2. Watch Neo4j ingest progress</li>
            <li>3. Explore the graph</li>
            <li>4. Ask why a decision exists</li>
            <li>5. Resume if the batch pauses</li>
          </ol>
        </article>
      </section>
    </div>
  );
}
