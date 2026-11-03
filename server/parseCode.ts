const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|rb|cs|php|kt|rs)$/i;
const CONFIG_EXT = /\.(json|ya?ml|toml|ini|env|config\.[^.]+)$/i;

export function isSourceFile(path: string) {
  return SOURCE_EXT.test(path) && !path.includes("node_modules/") && !path.includes("dist/");
}

export function isConfigFile(path: string) {
  const name = path.toLowerCase();
  return (
    CONFIG_EXT.test(name) ||
    name.endsWith(".env.example") ||
    name.includes("config") ||
    name.endsWith("dockerfile")
  );
}

export type ExtractedFunction = { name: string; signature: string; line: number };
export type ExtractedConfig = { key: string; value: string; line: number };
export type ExtractedDep = { specifier: string };

export function extractFunctions(path: string, content: string): ExtractedFunction[] {
  const lines = content.split(/\r?\n/);
  const found: ExtractedFunction[] = [];
  const seen = new Set<string>();
  const patterns: RegExp[] = [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/,
    /def\s+(\w+)\s*\(([^)]*)\)/,
    /func\s+(\w+)\s*\(([^)]*)\)/,
    /(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?[\w<>[\]]+\s+(\w+)\s*\(([^)]*)\)/,
  ];

  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.[1] && !["if", "for", "while", "switch"].includes(match[1])) {
        const key = `${match[1]}:${index + 1}`;
        if (!seen.has(key)) {
          seen.add(key);
          found.push({
            name: match[1],
            signature: line.trim().slice(0, 180),
            line: index + 1,
          });
        }
        break;
      }
    }
  });
  return found.slice(0, 40);
}

export function extractConfigurations(path: string, content: string): ExtractedConfig[] {
  const lines = content.split(/\r?\n/);
  const found: ExtractedConfig[] = [];
  const pattern =
    /\b([A-Za-z_][A-Za-z0-9_]*(?:retry|retries|timeout|limit|max|ttl|delay|attempts)[A-Za-z0-9_]*)\b(?:\s*[:=]\s*|\s+)['"]?([0-9A-Za-z._-]+)['"]?/i;
  const assignment =
    /(?:const|let|var|export\s+const)\s+([A-Z][A-Z0-9_]+)\s*=\s*['"]?([^'";\s]+)['"]?/;
  const envLine = /^([A-Z][A-Z0-9_]+)=([^\s#]+)/;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) return;
    const match = trimmed.match(pattern) || trimmed.match(assignment) || trimmed.match(envLine);
    if (match) {
      found.push({ key: match[1], value: String(match[2]).slice(0, 80), line: index + 1 });
    }
  });

  if (path.toLowerCase().endsWith(".json")) {
    try {
      const json = JSON.parse(content) as Record<string, unknown>;
      flattenConfig(json).forEach((item) => found.push({ ...item, line: 1 }));
    } catch {
      /* ignore invalid json */
    }
  }
  return found.slice(0, 30);
}

function flattenConfig(value: unknown, prefix = ""): ExtractedConfig[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object") {
    return prefix ? [{ key: prefix, value: String(value).slice(0, 80), line: 1 }] : [];
  }
  const out: ExtractedConfig[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (typeof nested === "object" && nested && !Array.isArray(nested)) {
      out.push(...flattenConfig(nested, next));
    } else if (typeof nested === "number" || typeof nested === "string" || typeof nested === "boolean") {
      out.push({ key: next, value: String(nested).slice(0, 80), line: 1 });
    }
  }
  return out.slice(0, 40);
}

export function extractDependencies(content: string): ExtractedDep[] {
  const specs = new Set<string>();
  const patterns = [
    /from\s+['"](\.[^'"]+)['"]/g,
    /import\s+['"](\.[^'"]+)['"]/g,
    /require\(['"](\.[^'"]+)['"]\)/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content))) {
      specs.add(match[1]);
    }
  }
  return [...specs].slice(0, 20).map((specifier) => ({ specifier }));
}

export function looksLikeDecision(text: string) {
  return /\b(decided|decision|adr|rfc|because|we (?:should|chose|picked)|supersede|replace(?:d|s)? the previous)\b/i.test(
    text
  );
}

export function looksLikeIncident(title: string, labels: string[]) {
  const hay = `${title} ${labels.join(" ")}`.toLowerCase();
  return /\b(bug|incident|outage|crash|sev[0-9]|hotfix|regression)\b/.test(hay);
}

export function extractShas(text: string) {
  return [...text.matchAll(/\b([a-f0-9]{7,40})\b/gi)].map((match) => match[1]);
}
