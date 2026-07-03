import { api } from "../http.js";
import { resolveSiteProperty } from "./helpers.js";
import { parseRange } from "../range.js";
import { printJson } from "../output.js";
import {
  colorFromFlags,
  fmtCompact,
  fmtMs,
  fmtNum,
  fmtPct,
  renderTopTable,
  sectionHeader,
} from "../render.js";

type Row = {
  page: string;
  views: number;
  sessions: number;
  users: number;
  avgEngagement: number; // seconds
  bounceRate: number;
};

export async function cmdLanders(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const slug = positional[0];
  if (!slug) {
    process.stderr.write(
      "usage: fleets <slug> landers [--range 7d] [--limit 20] [--json]\n",
    );
    process.exit(2);
  }
  const { property } = await resolveSiteProperty(slug);
  const range = parseRange(flags);
  const limit = Number(flags.limit ?? 15);
  const all = await api<Row[]>(
    `/api/ga?view=landers&days=${range}&property=${property}`,
  );
  const rows = all.slice(0, limit);

  if (flags.json) {
    printJson(rows);
    return;
  }

  const c = colorFromFlags(flags);
  const totalViews = all.reduce((a, r) => a + r.views, 0);
  const sub = `last ${range}d · ${fmtCompact(totalViews)} pageviews · top ${rows.length}`;
  process.stdout.write(sectionHeader(`landers · ${slug}`, sub, c) + "\n\n");

  const table = renderTopTable(
    rows.map((r) => ({
      label: r.page,
      values: {
        sessions: r.sessions,
        views: r.views,
        users: r.users,
        engage: r.avgEngagement * 1000, // ms
        bounce: r.bounceRate,
      },
    })),
    {
      labelHeader: "page",
      labelWidth: 40,
      columns: [
        { key: "sessions", header: "sessions", fmt: fmtNum, bar: true },
        { key: "views", header: "views", fmt: fmtNum },
        { key: "users", header: "users", fmt: fmtNum },
        { key: "engage", header: "avg eng", fmt: fmtMs },
        { key: "bounce", header: "bounce", fmt: (n: number) => fmtPct(n, 0) },
      ],
      c,
    },
  );
  process.stdout.write(table + "\n");
}
