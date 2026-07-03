import { api } from "../http.js";
import { copyToClipboard } from "../clipboard.js";
import { printJson } from "../output.js";
import {
  colorFromFlags,
  deltaStr,
  sectionHeader,
  type Colorize,
} from "../render.js";

type Severity = "high" | "medium" | "low";

type Insight = {
  id: string;
  severity: Severity;
  title: string;
  body: string;
  metric?: { label: string; value: string; delta?: number };
  site?: { slug: string; name: string };
  prompt: string;
  cli?: string;
};

type Resp = {
  generatedAt: string;
  count: number;
  insights: Insight[];
};

export async function cmdInsights(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  // Top-level: `fleets insights [--site slug] [--prompt <id|first>]`
  // Slug-first: `fleets <slug> insights …`  →  positional[0] = slug.
  const slugArg = positional[0];
  const site =
    typeof flags.site === "string"
      ? flags.site
      : slugArg && !slugArg.startsWith("-")
        ? slugArg
        : null;
  const promptOnly =
    flags.prompt === true || typeof flags.prompt === "string"
      ? typeof flags.prompt === "string" ? flags.prompt : "first"
      : null;

  const qs = site ? `?site=${encodeURIComponent(site)}` : "";
  const data = await api<Resp>(`/api/insights${qs}`);

  if (flags.json) {
    printJson(data);
    return;
  }

  const c = colorFromFlags(flags);
  const insights = data.insights;

  if (promptOnly) {
    const target =
      promptOnly === "first" || promptOnly === "1"
        ? insights[0]
        : insights.find((i) => i.id === promptOnly);
    if (!target) {
      process.stderr.write(
        `no insight matching "${promptOnly}". Available ids: ${insights.map((i) => i.id).join(", ")}\n`,
      );
      process.exit(1);
    }
    // --copy: put the prompt on the clipboard (human convenience). Confirmation
    // goes to stderr so stdout stays clean if piped. Falls back to printing when
    // no clipboard tool is available (headless / CI / SSH).
    if (flags.copy) {
      const res = await copyToClipboard(target.prompt);
      if (res.ok) {
        process.stderr.write(`✓ copied prompt for "${target.id}" to clipboard\n`);
        return;
      }
      process.stderr.write(`could not copy to clipboard (${res.reason}); printing instead:\n`);
    }
    // Plain stdout, pipable into clipboard / agents / files.
    process.stdout.write(target.prompt + "\n");
    return;
  }

  const sub = `${insights.length} insight${insights.length === 1 ? "" : "s"} · ${site ? `site=${site}` : "all sites"} · ${data.generatedAt.slice(0, 16).replace("T", " ")}`;
  process.stdout.write(sectionHeader("insights", sub, c) + "\n\n");

  if (insights.length === 0) {
    process.stdout.write(c.dim("nothing to act on right now.\n"));
    return;
  }

  for (let i = 0; i < insights.length; i++) {
    process.stdout.write(renderOne(insights[i]!, c) + "\n");
    if (i < insights.length - 1) process.stdout.write("\n");
  }

  process.stdout.write(
    "\n" +
      c.dim(
        `paste an insight prompt into your agent:  fleets insights --prompt <id>\n` +
          `(e.g. \`fleets insights --prompt ${insights[0]!.id}\`)\n`,
      ),
  );
}

function renderOne(i: Insight, c: Colorize): string {
  const tagFn = i.severity === "high" ? c.red : i.severity === "medium" ? c.yellow : c.dim;
  const tag = tagFn(`[${i.severity.toUpperCase().padEnd(6)}]`);
  const head = `${tag} ${c.bold(i.title)}`;
  const metaParts: string[] = [];
  if (i.site) metaParts.push(i.site.slug);
  metaParts.push(c.dim(`id ${i.id}`));
  const lines = [head, `  ${metaParts.join("  ")}`];
  if (i.metric) {
    const d = i.metric.delta != null ? `  ${deltaStr(i.metric.delta, c)}` : "";
    lines.push(`  ${c.dim(i.metric.label)}: ${c.bold(i.metric.value)}${d}`);
  }
  lines.push(`  ${c.dim(wrap(i.body, 76).join("\n  "))}`);
  if (i.cli) lines.push(`  ${c.dim("→")} ${c.bold(i.cli)}`);
  return lines.join("\n");
}

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (!line) {
        line = word;
        continue;
      }
      if ((line + " " + word).length > width) {
        out.push(line);
        line = word;
      } else {
        line = line + " " + word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}
