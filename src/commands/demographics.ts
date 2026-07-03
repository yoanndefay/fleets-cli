import { api } from "../http.js";
import { resolveSiteProperty } from "./helpers.js";
import { parseRange } from "../range.js";
import { printJson } from "../output.js";
import {
  colorFromFlags,
  fmtCompact,
  fmtNum,
  fmtPct,
  renderBreakdown,
  sectionHeader,
} from "../render.js";

type Row = {
  age: string;
  gender: string;
  sessions: number;
  users: number;
  engagementRate: number;
  bounceRate: number;
};

export async function cmdDemographics(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const slug = positional[0];
  if (!slug) {
    process.stderr.write(
      "usage: fleets <slug> demographics [--range 7d] [--json]\n",
    );
    process.exit(2);
  }
  const { property } = await resolveSiteProperty(slug);
  const range = parseRange(flags);
  const rows = await api<Row[]>(
    `/api/ga?view=demographics&days=${range}&property=${property}`,
  );

  if (flags.json) {
    printJson(rows);
    return;
  }

  const c = colorFromFlags(flags);
  const totalUsers = rows.reduce((a, r) => a + r.users, 0);

  const byAge = new Map<string, number>();
  const byGender = new Map<string, number>();
  for (const r of rows) {
    byAge.set(r.age, (byAge.get(r.age) ?? 0) + r.users);
    byGender.set(r.gender, (byGender.get(r.gender) ?? 0) + r.users);
  }
  const ageRows = [...byAge.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const genderRows = [...byGender.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const allUnknown =
    rows.length === 0 ||
    rows.every((r) => r.age === "unknown" && r.gender === "unknown");

  const sub = `last ${range}d · ${fmtCompact(totalUsers)} users`;
  process.stdout.write(
    sectionHeader(`demographics · ${slug}`, sub, c) + "\n\n",
  );

  if (allUnknown) {
    process.stdout.write(
      c.dim(
        "all values are unknown — enable Google Signals in GA4 admin →\nData collection → Google signals data collection.\n",
      ),
    );
    return;
  }

  process.stdout.write(c.dim("by age") + "\n");
  process.stdout.write(renderBreakdown(ageRows, { c, fmt: fmtNum }) + "\n\n");

  process.stdout.write(c.dim("by gender") + "\n");
  process.stdout.write(
    renderBreakdown(genderRows, { c, fmt: fmtNum, barWidth: 24 }) + "\n",
  );

  // Hint about thresholding behavior
  const knownShare = totalUsers > 0
    ? 1 - ((byAge.get("unknown") ?? 0) / totalUsers)
    : 0;
  if (knownShare < 0.5) {
    process.stdout.write(
      c.dim(
        `\nnote: ${fmtPct(1 - knownShare, 0)} of users fell into "unknown" — GA4 thresholds low-volume cells.\n`,
      ),
    );
  }
}
