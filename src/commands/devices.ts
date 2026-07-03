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
  device: string;
  sessions: number;
  users: number;
  engagementRate: number;
  bounceRate: number;
  avgSessionDuration: number;
};

export async function cmdDevices(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const slug = positional[0];
  if (!slug) {
    process.stderr.write("usage: fleets <slug> devices [--range 7d] [--json]\n");
    process.exit(2);
  }
  const { property } = await resolveSiteProperty(slug);
  const range = parseRange(flags);
  const rows = await api<Row[]>(
    `/api/ga?view=devices&days=${range}&property=${property}`,
  );

  if (flags.json) {
    printJson(rows);
    return;
  }

  const c = colorFromFlags(flags);
  const totalSessions = rows.reduce((a, r) => a + r.sessions, 0);
  const sub = `last ${range}d · ${fmtCompact(totalSessions)} sessions · ${rows.length} devices`;
  process.stdout.write(sectionHeader(`devices · ${slug}`, sub, c) + "\n\n");

  const table = renderTopTable(
    rows.map((r) => ({
      label: r.device,
      values: {
        sessions: r.sessions,
        users: r.users,
        engage: r.engagementRate,
        bounce: r.bounceRate,
        avg: r.avgSessionDuration * 1000, // ms
      },
    })),
    {
      labelHeader: "device",
      labelWidth: 12,
      columns: [
        { key: "sessions", header: "sessions", fmt: fmtNum, bar: true },
        { key: "users", header: "users", fmt: fmtNum },
        { key: "engage", header: "engage", fmt: (n: number) => fmtPct(n, 0) },
        { key: "bounce", header: "bounce", fmt: (n: number) => fmtPct(n, 0) },
        { key: "avg", header: "avg sess", fmt: fmtMs },
      ],
      c,
    },
  );
  process.stdout.write(table + "\n");
  process.stdout.write(
    c.dim("\ntip: filter other tabs with --filter device=mobile (or desktop, tablet)\n"),
  );
}
