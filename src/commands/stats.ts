import { api } from "../http.js";
import { resolveSiteProperty } from "./helpers.js";
import { parseRange } from "../range.js";
import { printJson } from "../output.js";
import {
  colorFromFlags,
  fmtMs,
  fmtNum,
  fmtPct,
  fmtPctRaw,
  renderKv,
  sectionHeader,
  type KvRow,
} from "../render.js";

type Summary = {
  sessions: number;
  users: number;
  newUsers: number;
  pageviews: number;
  events: number;
  engagementRate: number;
  bounceRate: number;
  avgSessionDuration: number;
};

export async function cmdStats(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const slug = positional[0];
  if (!slug) {
    process.stderr.write("usage: fleets <slug> stats [--range 7d] [--json]\n");
    process.exit(2);
  }
  const { site, property } = await resolveSiteProperty(slug);
  const range = parseRange(flags);
  const data = await api<Summary>(
    `/api/ga?view=summary&days=${range}&property=${property}`,
  );

  if (flags.json) {
    printJson(data);
    return;
  }

  const c = colorFromFlags(flags);
  const perSession = data.sessions > 0 ? data.pageviews / data.sessions : 0;
  const evPerSession = data.sessions > 0 ? data.events / data.sessions : 0;
  const returningPct =
    data.users > 0 ? ((data.users - data.newUsers) / data.users) * 100 : 0;

  const rows: KvRow[] = [
    { key: "sessions", value: fmtNum(data.sessions) },
    { key: "users", value: fmtNum(data.users) },
    { key: "new users", value: fmtNum(data.newUsers) },
    { key: "pageviews", value: fmtNum(data.pageviews) },
    { key: "events", value: fmtNum(data.events) },
    { key: "engagement", value: fmtPct(data.engagementRate, 2) },
    { key: "bounce rate", value: fmtPct(data.bounceRate, 2) },
    { key: "avg session", value: fmtMs(data.avgSessionDuration * 1000) },
    { rule: true },
    { key: "pages/sess", value: perSession.toFixed(2) },
    { key: "events/sess", value: evPerSession.toFixed(1) },
    { key: "returning", value: fmtPctRaw(returningPct, 1) },
  ];

  const sub = `${site.domain ?? slug} · last ${range}d · GA4 ${property}`;
  process.stdout.write(sectionHeader(`stats · ${slug}`, sub, c) + "\n\n");
  process.stdout.write(renderKv(rows, c) + "\n");
}
