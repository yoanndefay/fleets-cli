import { api } from "../http.js";
import { parseRange } from "../range.js";
import { printJson } from "../output.js";
import type { Site } from "./helpers.js";

type DailyPoint = { date: string; value: number };
type SiteRow = { site: Site; points: DailyPoint[]; total: number; delta7: number | null };

const METRIC_MAP: Record<string, { gaMetric: string; label: string }> = {
  users: { gaMetric: "totalUsers", label: "users" },
  sessions: { gaMetric: "sessions", label: "sessions" },
  views: { gaMetric: "screenPageViews", label: "views" },
  events: { gaMetric: "eventCount", label: "events" },
  revenue: { gaMetric: "totalRevenue", label: "revenue" },
};

const SPARK_CHARS = " ▁▂▃▄▅▆▇█";
const SPARK_WIDTH = 30;
const NAME_WIDTH = 22;

export async function cmdSites(
  _positional: string[] = [],
  flags: Record<string, string | boolean> = {},
): Promise<void> {
  const sites = await api<Site[]>("/api/sites");
  if (flags.json) {
    printJson(sites);
    return;
  }
  if (sites.length === 0) {
    process.stdout.write("no sites yet — add one at https://fleets.run/app\n");
    return;
  }
  if (flags["no-stats"]) {
    renderBare(sites);
    return;
  }
  const metricKey = String(flags.metric ?? "users").toLowerCase();
  const metric = METRIC_MAP[metricKey] ?? METRIC_MAP.users;
  const days = parseRange(flags, 30);
  const rows = await fetchRows(sites, metric.gaMetric, days);
  renderTable(rows, metric.label, days);
}

async function fetchRows(sites: Site[], gaMetric: string, days: number): Promise<SiteRow[]> {
  return Promise.all(
    sites.map(async (site) => {
      if (!site.property) return { site, points: [], total: 0, delta7: null };
      try {
        const points = await api<DailyPoint[]>(
          `/api/ga?view=daily&days=${days}&metric=${gaMetric}&property=${site.property}`,
        );
        const total = points.reduce((a, p) => a + p.value, 0);
        return { site, points, total, delta7: delta7(points) };
      } catch {
        return { site, points: [], total: 0, delta7: null };
      }
    }),
  );
}

function delta7(points: DailyPoint[]): number | null {
  if (points.length < 14) return null;
  const last7 = points.slice(-7).reduce((s, p) => s + p.value, 0);
  const prior7 = points.slice(-14, -7).reduce((s, p) => s + p.value, 0);
  if (prior7 === 0) return null;
  return ((last7 - prior7) / prior7) * 100;
}

function renderBare(sites: Site[]): void {
  for (const s of sites) {
    process.stdout.write(`${s.id.padEnd(20)} ${s.name.padEnd(30)} ${s.property ?? ""}\n`);
  }
}

function renderTable(rows: SiteRow[], metricLabel: string, days: number): void {
  const isTty = Boolean(process.stdout.isTTY);
  const c = colorize(isTty);
  const fmt = new Intl.NumberFormat("en-US");
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const grandTotal = sorted.reduce((s, r) => s + r.total, 0);

  const header = `${c.bold("app")} · ${rows.length} sites · ${fmt.format(grandTotal)} ${metricLabel} in last ${days}d`;
  process.stdout.write(`${header}\n\n`);

  for (let i = 0; i < sorted.length; i++) {
    const { site, points, total, delta7: d } = sorted[i]!;
    const isLive = Boolean(site.property);
    const rank = c.dim(String(i + 1).padStart(2, "0"));
    const status = isLive
      ? c.live("●") + " " + c.live("LIVE ")
      : c.dim("◐") + " " + c.dim("SETUP");
    const name = c.bold(truncate(site.id, NAME_WIDTH).padEnd(NAME_WIDTH));
    const totalCell = isLive ? compact(total).padStart(8) : c.dim("       —");
    const deltaCell = renderDelta(d, c);
    const spark = isLive ? renderSpark(points, c) : c.dim("—".padEnd(SPARK_WIDTH));

    process.stdout.write(`${rank}  ${status}  ${name}  ${totalCell}  ${deltaCell}  ${spark}\n`);
  }
}

function renderDelta(d: number | null, c: ReturnType<typeof colorize>): string {
  if (d === null) return c.dim("    —   ");
  const sign = d >= 0 ? "▲" : "▼";
  const txt = `${sign} ${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
  const padded = txt.padStart(8);
  return d >= 0 ? c.up(padded) : c.down(padded);
}

function renderSpark(points: DailyPoint[], c: ReturnType<typeof colorize>): string {
  if (points.length === 0) return c.dim("—".padEnd(SPARK_WIDTH));
  const tail = points.slice(-SPARK_WIDTH);
  const max = Math.max(...tail.map((p) => p.value), 1);
  let s = "";
  for (let i = 0; i < SPARK_WIDTH; i++) {
    const offset = SPARK_WIDTH - tail.length;
    const v = i >= offset ? tail[i - offset]!.value : 0;
    const idx = v === 0 ? 0 : Math.min(8, Math.max(1, Math.round((v / max) * 8)));
    s += SPARK_CHARS[idx];
  }
  return c.spark(s);
}

function compact(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  if (n < 1e9) return `${(n / 1e6).toFixed(n < 10e6 ? 1 : 0)}M`;
  return `${(n / 1e9).toFixed(1)}B`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function colorize(on: boolean) {
  const w = (code: string) => (s: string) => (on ? `\x1b[${code}m${s}\x1b[0m` : s);
  return {
    bold: w("1"),
    dim: w("2"),
    live: w("32"),
    up: w("32"),
    down: w("31"),
    spark: w("38;5;87"),
  };
}
