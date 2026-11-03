"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/ingest", label: "Ingest" },
  { href: "/graph", label: "Graph" },
  { href: "/ask", label: "Ask CodeWhy" },
  { href: "/decisions", label: "Decisions" },
  { href: "/analytics", label: "Analytics" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,_#163a6b_0%,_#07111f_42%,_#050b14_100%)] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-cyan-400/15 bg-[#07111f]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 font-mono text-sm font-bold text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.45)]">
              CW
            </span>
            <span>
              <span className="block font-semibold tracking-[0.22em] text-cyan-300">CODEWHY</span>
              <span className="block text-[11px] text-slate-400">GraphRAG engineering intelligence</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    active
                      ? "bg-cyan-400/15 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35)]"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <Link
            href="/ingest"
            className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.35)] transition hover:bg-cyan-300"
          >
            Analyse repo
          </Link>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-slate-500">
        HACKYI6D · Jahnavi Reddy & Pavan Sai Reddy · HackFront India 2026 · Neo4j track
      </footer>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-8 max-w-3xl">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">{eyebrow}</p>
      <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">{title}</h1>
      <p className="mt-3 text-slate-400">{description}</p>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-cyan-400/25 bg-white/5 px-6 py-12 text-center">
      <p className="text-lg font-medium text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{body}</p>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-6 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
      {message}
    </div>
  );
}

export function DataBadge({ mode }: { mode?: string }) {
  const retrieved = mode === "retrieved";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
        retrieved ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/15 text-amber-200"
      }`}
    >
      {retrieved ? "Live Neo4j data" : mode || "No retrieved data"}
    </span>
  );
}
