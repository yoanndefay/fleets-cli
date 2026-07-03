import { api } from "../http.js";
import { resolveSiteProperty } from "./helpers.js";
import { parseRange } from "../range.js";
import { printJson } from "../output.js";

type Step = { event: string; users: number; count: number };
type FunnelData = { steps: Step[] };

const BAR_WIDTH = 50;

export async function cmdFunnel(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const [slug, ...steps] = positional;
  if (!slug || steps.length < 2) {
    process.stderr.write("usage: fleets <slug> funnel <step1> <step2> [step3…] [--range 7d] [--json]\n");
    process.exit(2);
  }
  const { property } = await resolveSiteProperty(slug);
  const range = parseRange(flags);
  const data = await api<FunnelData>(
    `/api/ga?view=funnel&days=${range}&property=${property}&steps=${encodeURIComponent(steps.join(","))}`,
  );

  if (flags.json) {
    printJson(data);
    return;
  }
  renderFunnel(slug, range, data.steps ?? []);
}

export function renderFunnel(slug: string, range: number, steps: Step[]): void {
  if (!steps.length) {
    process.stdout.write("no data\n");
    return;
  }
  const isTty = Boolean(process.stdout.isTTY);
  const c = colorize(isTty);
  const fmt = new Intl.NumberFormat("en-US");
  const top = steps[0]?.users ?? 0;
  const bottom = steps[steps.length - 1]?.users ?? 0;
  const overall = top > 0 ? (bottom / top) * 100 : 0;

  const header = `${c.bold("funnel")} · ${slug} · last ${range}d`;
  const summary = c.dim(
    `${fmt.format(top)} users · ${fmt.format(bottom)} completions · ${overall.toFixed(2)}% overall conversion`,
  );
  process.stdout.write(`${header}\n${summary}\n\n`);

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    const pct = top > 0 ? (s.users / top) * 100 : 0;
    const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round((pct / 100) * BAR_WIDTH)));
    const bar = c.bar("█".repeat(filled)) + c.track("░".repeat(BAR_WIDTH - filled));
    const idx = String(i + 1).padStart(2, " ");
    const name = s.event.padEnd(BAR_WIDTH - 8, " ");
    const pctStr = `${pct.toFixed(2)}%`.padStart(7, " ");

    process.stdout.write(`${c.bold(idx)}  ${c.bold(name)} ${c.pct(pctStr)}\n`);
    process.stdout.write(`    ${bar}\n`);

    let line = `    ${c.dim("→")} ${fmt.format(s.users)} users`;
    if (i > 0) {
      const prev = steps[i - 1]!.users;
      const drop = prev - s.users;
      const dropPct = prev > 0 ? (drop / prev) * 100 : 0;
      line += `  ${c.drop(`↘ ${fmt.format(drop)} (${dropPct.toFixed(0)}%)`)}`;
    }
    process.stdout.write(`${line}\n\n`);
  }
}

function colorize(on: boolean) {
  const w = (code: string) => (s: string) => (on ? `\x1b[${code}m${s}\x1b[0m` : s);
  return {
    bold: w("1"),
    dim: w("2"),
    pct: w("36"),
    bar: w("38;5;87"),
    track: w("38;5;238"),
    drop: w("31"),
  };
}
