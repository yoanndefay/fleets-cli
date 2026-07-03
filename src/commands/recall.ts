import { api } from "../http.js";
import { printJson } from "../output.js";
import { parseRange } from "../range.js";
import { readRepoConfig } from "../repo-config.js";
import { colorFromFlags, sectionHeader, truncate } from "../render.js";

type ChangeLogEntry = {
  id: string;
  description: string;
  path: string | null;
  actor: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type RecallResponse = {
  site: string;
  count: number;
  entries: ChangeLogEntry[];
};

function relativeAge(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffMs = Math.max(0, now - t);
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export async function cmdRecall(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  // Slug: positional wins; --site flag next; else .fleets repo config.
  let slug = positional[0]?.trim() ?? "";
  if (!slug && typeof flags.site === "string") slug = flags.site.trim();
  if (!slug) {
    const cfg = await readRepoConfig();
    if (cfg?.site) slug = cfg.site;
  }
  if (!slug) {
    process.stderr.write(
      "usage: fleets recall <slug> [--since 30d] [--limit 100] [--json]\n",
    );
    process.exit(2);
  }

  // --since accepts 7d / 30d / 24h via the shared range parser; default 30d.
  const days = parseRange({ ...flags, range: String(flags.since ?? flags.range ?? "30d") }, 30);
  const limit = typeof flags.limit === "string" ? Math.max(1, Number(flags.limit) || 100) : 100;

  const params = new URLSearchParams({ site: slug, days: String(days), limit: String(limit) });
  const data = await api<RecallResponse>(`/api/log?${params.toString()}`);

  if (flags.json) {
    printJson(data);
    return;
  }

  const c = colorFromFlags(flags);
  const sub = `${data.count} entr${data.count === 1 ? "y" : "ies"} · last ${days}d`;
  process.stdout.write(sectionHeader(`recall · ${slug}`, sub, c) + "\n\n");

  if (data.entries.length === 0) {
    process.stdout.write(
      c.dim(`(no entries — log one with 'fleets log "..." --site ${slug}')\n`),
    );
    return;
  }

  // Column-aligned timeline. Width tuned for typical terminals.
  const ageW = Math.max(...data.entries.map((e) => relativeAge(e.createdAt).length));
  const pathW = Math.min(
    24,
    Math.max(0, ...data.entries.map((e) => (e.path ? e.path.length : 0))),
  );
  for (const e of data.entries) {
    const age = c.dim(`[${relativeAge(e.createdAt).padStart(ageW)}]`);
    const path = pathW > 0
      ? c.cyan(truncate(e.path ?? "", pathW).padEnd(pathW))
      : "";
    const desc = c.bold(truncate(e.description, 60));
    const actor = c.dim(e.actor);
    const sep = pathW > 0 ? "  " : "";
    process.stdout.write(`${age}  ${path}${sep}${desc}  ${actor}\n`);
  }
}
