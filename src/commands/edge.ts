import { api } from "../http.js";
import { resolveSiteZone } from "./helpers.js";
import { parseRange } from "../range.js";
import { printJson } from "../output.js";
import {
  colorFromFlags,
  fmtBytes,
  fmtCompact,
  fmtNum,
  fmtPctRaw,
  renderBreakdown,
  renderKv,
  sectionHeader,
  type KvRow,
} from "../render.js";

type Summary = {
  requests: number;
  pageViews: number;
  uniques: number;
  bytes: number;
  cachedRequests: number;
  cachedBytes: number;
  threats: number;
};
type Breakdown = {
  status: Array<{ code: number; requests: number }>;
  contentType: Array<{ name: string; requests: number; bytes: number }>;
  browser: Array<{ name: string; pageViews: number }>;
  httpVersion: Array<{ name: string; requests: number }>;
  tls: Array<{ name: string; requests: number }>;
};
type EdgeAll = {
  summary: Summary;
  breakdown: Breakdown;
};

export async function cmdEdge(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const slug = positional[0];
  if (!slug) {
    process.stderr.write("usage: fleets <slug> edge [--range 7d] [--json]\n");
    process.exit(2);
  }
  const { site, cfZoneId } = await resolveSiteZone(slug);
  const range = parseRange(flags);
  const data = await api<EdgeAll>(
    `/api/cf?view=all&days=${range}&zone=${encodeURIComponent(cfZoneId)}`,
  );

  if (flags.json) {
    printJson(data);
    return;
  }

  const c = colorFromFlags(flags);
  const s = data.summary;
  const cacheHitPct = s.requests > 0 ? (s.cachedRequests / s.requests) * 100 : 0;
  const cacheByteHitPct = s.bytes > 0 ? (s.cachedBytes / s.bytes) * 100 : 0;

  const sub = `${site.domain ?? slug} · last ${range}d · zone ${cfZoneId.slice(0, 8)}…`;
  process.stdout.write(sectionHeader(`edge · ${slug}`, sub, c) + "\n\n");

  const kv: KvRow[] = [
    { key: "requests", value: fmtNum(s.requests) },
    { key: "pageviews", value: fmtNum(s.pageViews) },
    { key: "uniques", value: fmtNum(s.uniques) },
    { key: "bandwidth", value: fmtBytes(s.bytes) },
    { rule: true },
    { key: "cache hit (req)", value: fmtPctRaw(cacheHitPct, 1) },
    { key: "cache hit (bytes)", value: fmtPctRaw(cacheByteHitPct, 1) },
    { key: "threats", value: fmtNum(s.threats) },
  ];
  process.stdout.write(renderKv(kv, c) + "\n\n");

  const b = data.breakdown;
  if (b?.status?.length) {
    process.stdout.write(c.dim("status codes") + "\n");
    const rows = b.status
      .map((r) => ({ label: String(r.code), value: r.requests }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    process.stdout.write(renderBreakdown(rows, { c, fmt: fmtCompact, labelWidth: 6 }) + "\n\n");
  }
  if (b?.browser?.length) {
    process.stdout.write(c.dim("browsers") + "\n");
    const rows = b.browser
      .map((r) => ({ label: r.name || "—", value: r.pageViews }))
      .slice(0, 8);
    process.stdout.write(renderBreakdown(rows, { c, fmt: fmtCompact }) + "\n\n");
  }
  if (b?.contentType?.length) {
    process.stdout.write(c.dim("content types (by bytes)") + "\n");
    const rows = b.contentType
      .map((r) => ({ label: r.name || "—", value: r.bytes }))
      .slice(0, 6);
    process.stdout.write(renderBreakdown(rows, { c, fmt: fmtBytes, labelWidth: 22 }) + "\n");
  }
}
