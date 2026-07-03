import { api } from "../http.js";
import { resolveSiteProperty } from "./helpers.js";
import { parseRange } from "../range.js";
import { printJson } from "../output.js";
import {
  colorFromFlags,
  fmtCompact,
  fmtNum,
  renderTopTable,
  sectionHeader,
} from "../render.js";

type Row = {
  referrer: string;
  sessions: number;
  users: number;
  conversions: number;
};

export async function cmdReferrals(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const slug = positional[0];
  if (!slug) {
    process.stderr.write(
      "usage: fleets <slug> referrals [--range 7d] [--limit 20] [--json]\n",
    );
    process.exit(2);
  }
  const { property } = await resolveSiteProperty(slug);
  const range = parseRange(flags);
  const limit = Number(flags.limit ?? 15);
  const all = await api<Row[]>(
    `/api/ga?view=referrals&days=${range}&property=${property}`,
  );
  const rows = all.slice(0, limit);

  if (flags.json) {
    printJson(rows);
    return;
  }

  const c = colorFromFlags(flags);
  const totalSessions = all.reduce((a, r) => a + r.sessions, 0);
  const sub = `last ${range}d · ${fmtCompact(totalSessions)} referral sessions · top ${rows.length}`;
  process.stdout.write(sectionHeader(`referrals · ${slug}`, sub, c) + "\n\n");

  const table = renderTopTable(
    rows.map((r) => ({
      label: r.referrer,
      values: {
        sessions: r.sessions,
        users: r.users,
        conv: r.conversions,
      },
    })),
    {
      labelHeader: "referrer",
      columns: [
        { key: "sessions", header: "sessions", fmt: fmtNum, bar: true },
        { key: "users", header: "users", fmt: fmtNum },
        { key: "conv", header: "conv", fmt: fmtNum },
      ],
      c,
    },
  );
  process.stdout.write(table + "\n");
}
