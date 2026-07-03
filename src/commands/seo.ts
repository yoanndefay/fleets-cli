import { api } from "../http.js";
import { resolveSiteGscUrl } from "./helpers.js";
import { parseRange } from "../range.js";
import { printJson } from "../output.js";
import {
  colorFromFlags,
  fmtNum,
  fmtPct,
  renderKv,
  sectionHeader,
  type KvRow,
} from "../render.js";

type Summary = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function cmdSeo(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const slug = positional[0];
  if (!slug) {
    process.stderr.write("usage: fleets <slug> seo [--range 7d] [--json]\n");
    process.exit(2);
  }
  const { site, gscSiteUrl } = await resolveSiteGscUrl(slug);
  const range = parseRange(flags);
  const data = await api<Summary>(
    `/api/gsc?view=summary&days=${range}&site=${encodeURIComponent(gscSiteUrl)}`,
  );

  if (flags.json) {
    printJson(data);
    return;
  }

  const c = colorFromFlags(flags);
  const rows: KvRow[] = [
    { key: "clicks", value: fmtNum(data.clicks) },
    { key: "impressions", value: fmtNum(data.impressions) },
    { key: "ctr", value: fmtPct(data.ctr, 2) },
    { key: "avg position", value: data.position > 0 ? data.position.toFixed(1) : "—" },
  ];
  const sub = `${site.domain ?? slug} · last ${range}d · GSC ${gscSiteUrl}`;
  process.stdout.write(sectionHeader(`seo · ${slug}`, sub, c) + "\n\n");
  process.stdout.write(renderKv(rows, c) + "\n");
}
