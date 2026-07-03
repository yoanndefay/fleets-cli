import { api } from "../http.js";
import { resolveSiteDomain } from "./helpers.js";
import { printJson } from "../output.js";
import {
  colorFromFlags,
  fmtNum,
  renderKv,
  renderScore,
  sectionHeader,
  type Colorize,
  type KvRow,
} from "../render.js";

type CwvCategory = "FAST" | "AVERAGE" | "SLOW";
type CwvMetric = {
  id: string;
  label: string;
  displayValue: string;
  numericValue: number;
  category: CwvCategory;
};
type PSIResult = {
  url: string;
  strategy: "mobile" | "desktop";
  fetchTime: string;
  scores: {
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
  };
  cwv: CwvMetric[];
  auditPassed: number;
  auditFailed: number;
};

const SCORE_WIDTH = 24;

export async function cmdSpeed(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const slug = positional[0];
  if (!slug) {
    process.stderr.write(
      "usage: fleets <slug> speed [--strategy mobile|desktop] [--json]\n",
    );
    process.exit(2);
  }
  const { domain } = await resolveSiteDomain(slug);
  const strategy = String(flags.strategy ?? "mobile");
  const data = await api<PSIResult>(
    `/api/psi?url=${encodeURIComponent(`https://${domain}`)}&strategy=${strategy}`,
  );

  if (flags.json) {
    printJson(data);
    return;
  }

  const c = colorFromFlags(flags);
  const sub = `${domain} · ${strategy} · ${new Date(data.fetchTime).toISOString().slice(0, 16).replace("T", " ")}`;
  process.stdout.write(sectionHeader(`speed · ${slug}`, sub, c) + "\n\n");

  // category scores
  process.stdout.write(c.dim("scores") + "\n");
  process.stdout.write(scoreLine("performance", data.scores.performance, c) + "\n");
  process.stdout.write(scoreLine("accessibility", data.scores.accessibility, c) + "\n");
  process.stdout.write(scoreLine("best practices", data.scores.bestPractices, c) + "\n");
  process.stdout.write(scoreLine("seo", data.scores.seo, c) + "\n\n");

  // core web vitals
  process.stdout.write(c.dim("core web vitals") + "\n");
  const cwvRows: KvRow[] = data.cwv.map((m) => {
    const colorFn = m.category === "FAST" ? c.green : m.category === "AVERAGE" ? c.yellow : c.red;
    const dot = colorFn(m.category === "FAST" ? "●" : m.category === "AVERAGE" ? "◐" : "○");
    return { key: `${dot} ${m.label}`, value: m.displayValue };
  });
  process.stdout.write(renderKv(cwvRows, c) + "\n\n");

  const auditRows: KvRow[] = [
    { key: "passed", value: c.green(fmtNum(data.auditPassed)) },
    { key: "failed", value: c.red(fmtNum(data.auditFailed)) },
  ];
  process.stdout.write(c.dim("audits") + "\n");
  process.stdout.write(renderKv(auditRows, c) + "\n");
}

function scoreLine(label: string, value: number | null, c: Colorize): string {
  const v = value ?? 0;
  const colorFn = v >= 90 ? c.green : v >= 50 ? c.yellow : c.red;
  const num = value == null ? "—" : String(value);
  const bar = renderScore(v, SCORE_WIDTH, c);
  return `${c.dim(label.padEnd(14))}  ${colorFn(num.padStart(3))}  ${bar}`;
}
