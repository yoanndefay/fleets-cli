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

type Row = { event: string; count: number; users: number };

export async function cmdEvents(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const slug = positional[0];
  if (!slug) {
    process.stderr.write(
      "usage: fleets <slug> events [--range 7d] [--limit 20] [--json]\n",
    );
    process.exit(2);
  }
  const { property } = await resolveSiteProperty(slug);
  const range = parseRange(flags);
  const limit = Number(flags.limit ?? 15);
  const all = await api<Row[]>(
    `/api/ga?view=events&days=${range}&property=${property}`,
  );
  const rows = all.slice(0, limit);

  if (flags.json) {
    printJson(rows);
    return;
  }

  const c = colorFromFlags(flags);
  const total = all.reduce((a, r) => a + r.count, 0);
  const sub = `last ${range}d · ${fmtCompact(total)} events · top ${rows.length}`;
  process.stdout.write(sectionHeader(`events · ${slug}`, sub, c) + "\n\n");

  const table = renderTopTable(
    rows.map((r) => ({
      label: r.event,
      values: { count: r.count, users: r.users },
    })),
    {
      labelHeader: "event",
      columns: [
        { key: "count", header: "count", fmt: fmtNum, bar: true },
        { key: "users", header: "users", fmt: fmtNum },
      ],
      c,
    },
  );
  process.stdout.write(table + "\n");
}
