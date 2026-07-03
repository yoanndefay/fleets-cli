import { api } from "../http.js";
import { resolveSiteProperty } from "./helpers.js";
import { parseRange } from "../range.js";
import { printJson } from "../output.js";
import {
  colorFromFlags,
  fmtCompact,
  fmtNum,
  renderBreakdown,
  sectionHeader,
} from "../render.js";

type Row = {
  country: string;
  device: string;
  users: number;
  sessions: number;
  engagementRate: number;
};

export async function cmdUsers(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const slug = positional[0];
  if (!slug) {
    process.stderr.write("usage: fleets <slug> users [--range 7d] [--json]\n");
    process.exit(2);
  }
  const { property } = await resolveSiteProperty(slug);
  const range = parseRange(flags);
  const all = await api<Row[]>(
    `/api/ga?view=users&days=${range}&property=${property}`,
  );

  if (flags.json) {
    printJson(all);
    return;
  }

  const c = colorFromFlags(flags);
  const totalUsers = all.reduce((a, r) => a + r.users, 0);

  const byCountry = new Map<string, number>();
  const byDevice = new Map<string, number>();
  for (const r of all) {
    byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + r.users);
    byDevice.set(r.device, (byDevice.get(r.device) ?? 0) + r.users);
  }
  const countryRows = [...byCountry.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
  const deviceRows = [...byDevice.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const sub = `last ${range}d · ${fmtCompact(totalUsers)} users · ${byCountry.size} countries`;
  process.stdout.write(sectionHeader(`users · ${slug}`, sub, c) + "\n\n");

  process.stdout.write(c.dim("by country") + "\n");
  process.stdout.write(renderBreakdown(countryRows, { c, fmt: fmtNum }) + "\n\n");

  process.stdout.write(c.dim("by device") + "\n");
  process.stdout.write(renderBreakdown(deviceRows, { c, fmt: fmtNum, barWidth: 24 }) + "\n");
}
