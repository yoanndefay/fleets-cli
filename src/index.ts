import { COMMAND_MAP } from "./registry.js";
import { parseFlags } from "./flags.js";
import { _resetSiteCache, resolveSite } from "./commands/helpers.js";
import { api } from "./http.js";
import { autocorrect, closeMatches } from "./fuzzy.js";
import { colorize } from "./render.js";

const HIDDEN = new Set(["bots", "sites"]);

// Commands that take a slug as their first positional argument. When the user
// types `fleets <slug> <tab>`, we rewrite to `fleets <tab> <slug>`.
const PER_SITE_TABS = new Set([
  "stats",
  "sources",
  "campaigns",
  "referrals",
  "landers",
  "events",
  "users",
  "devices",
  "demographics",
  "funnel",
  "seo",
  "edge",
  "bots",
  "speed",
  "export",
  "query",
  "connect",
  "open",
  "insights",
  "ask",
]);

// Per-site tabs grouped for help. These are NEVER shown as `fleets <tab>` in
// help text — only as `fleets <slug> <tab>` — because slug-first is the
// intuitive grammar ("inside a site, run a tab"). The legacy `fleets <tab> <slug>`
// form still dispatches under the hood, but we don't teach it.
const SITE_TABS_HELP: Array<{ name: string; summary: string }> = [
  { name: "stats", summary: "GA4 summary (the day view)" },
  { name: "sources", summary: "top traffic sources" },
  { name: "campaigns", summary: "UTM campaign breakdown" },
  { name: "referrals", summary: "referral traffic breakdown" },
  { name: "landers", summary: "top landing pages" },
  { name: "events", summary: "GA4 event breakdown" },
  { name: "users", summary: "user / country / device breakdown" },
  { name: "devices", summary: "device-category breakdown (mobile / desktop / tablet)" },
  { name: "demographics", summary: "age + gender breakdown (needs Google Signals)" },
  { name: "funnel", summary: "conversion funnel across steps" },
  { name: "seo", summary: "Google Search Console summary" },
  { name: "edge", summary: "Cloudflare edge analytics" },
  { name: "speed", summary: "PageSpeed Insights score" },
  { name: "export", summary: "daily session data as JSON / CSV" },
  { name: "query", summary: "natural-language query" },
  { name: "open", summary: "print app URL for a tab" },
  { name: "insights", summary: "AI-ready signals to investigate (also top-level: `fleets insights`)" },
  { name: "ask", summary: "ask any natural-language question (also top-level: `fleets ask`)" },
];

function buildHelp(): string {
  const lines: string[] = ["fleets — analytics terminal CLI", ""];

  // Widths computed across all visible command/tab names so columns align
  // identically in every section.
  const overviewCmds = ["list", "ask", "insights"];
  const setupCmds = ["login", "add", "connect", "update"];
  const allNames = [
    ...overviewCmds,
    ...setupCmds,
    ...SITE_TABS_HELP.map((t) => t.name),
  ];
  const w = Math.max(...allNames.map((n) => n.length));

  // 1. overview — top-level multi-site commands
  lines.push("overview:");
  for (const name of overviewCmds) {
    const cmd = COMMAND_MAP.get(name);
    if (!cmd || HIDDEN.has(name)) continue;
    lines.push(`  fleets ${cmd.name.padEnd(w)}  ${cmd.summary}`);
  }
  lines.push("");

  // memory — agent action log
  const logCmd = COMMAND_MAP.get("log");
  const recallCmd = COMMAND_MAP.get("recall");
  if (logCmd && recallCmd) {
    lines.push("memory:");
    lines.push(`  fleets ${logCmd.name.padEnd(w)}  ${logCmd.summary}`);
    lines.push(`  fleets ${recallCmd.name.padEnd(w)}  ${recallCmd.summary}`);
    lines.push("");
  }

  // 2. websites — per-site tabs, only ever shown as `fleets <slug> <tab>`
  lines.push("websites:   fleets <slug> <tab>  (e.g. fleets fightbets sources)");
  for (const tab of SITE_TABS_HELP) {
    lines.push(`  fleets <slug> ${tab.name.padEnd(w)}  ${tab.summary}`);
  }
  lines.push(`  fleets <slug>${" ".repeat(w + 1)}  bare slug → GA4 summary (alias for stats)`);
  lines.push(`  fleets <slug> funnel s1 s2…    funnel takes step names after the tab`);
  lines.push("");

  // 3. setup — auth, sites, updates, env
  lines.push("setup:");
  for (const name of setupCmds) {
    const cmd = COMMAND_MAP.get(name);
    if (!cmd || HIDDEN.has(name)) continue;
    lines.push(`  fleets ${cmd.name.padEnd(w)}  ${cmd.summary}`);
  }
  lines.push(
    `  ${"FLEETS_TOKEN".padEnd(w + 7)}  env var to skip \`fleets login\` (useful for CI)`,
  );
  return lines.join("\n") + "\n";
}

const ALL_TOP_LEVEL = [
  "list",
  "login",
  "add",
  "connect",
  "update",
  "help",
  "open",
  "log",
  "recall",
];

async function listSlugs(): Promise<string[]> {
  try {
    const sites = await api<Array<{ id: string }>>("/api/sites");
    return sites.map((s) => s.id);
  } catch {
    return [];
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const { positional, flags } = parseFlags(rawArgs);
  let [cmd, ...rest] = positional;
  const c = colorize();

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(buildHelp());
    return;
  }

  let command = COMMAND_MAP.get(cmd);

  // Tabs that work both standalone (all sites) AND per-site. Don't gate them.
  const DUAL_SCOPE = new Set(["insights", "ask"]);

  // If the user typed a per-site tab WITHOUT a slug, point them at the
  // slug-first form instead of dumping a usage line nobody asked for.
  if (
    command &&
    PER_SITE_TABS.has(cmd) &&
    !DUAL_SCOPE.has(cmd) &&
    (rest.length === 0 || rest[0]?.startsWith("-"))
  ) {
    process.stderr.write(
      `usage: fleets <slug> ${cmd}${cmd === "funnel" ? " <step1> <step2>…" : ""}\n` +
        `       e.g. fleets fightbets ${cmd}${cmd === "funnel" ? " session_start view" : ""}\n` +
        `       (run \`fleets list\` to see your slugs)\n`,
    );
    process.exit(2);
  }

  if (command) {
    return command.run(rest, flags);
  }

  // Not a known command — try slug-first dispatch with fuzzy fallback.
  if (!cmd.startsWith("-")) {
    let site = await resolveSite(cmd).catch(() => null);

    // Slug typo? Try to autocorrect.
    if (!site) {
      const slugs = await listSlugs();
      const fixed = autocorrect(cmd, slugs);
      if (fixed) {
        process.stderr.write(c.dim(`(did you mean "${fixed}"?)\n`));
        cmd = fixed;
        _resetSiteCache();
        site = await resolveSite(cmd).catch(() => null);
      } else {
        const suggestions = closeMatches(cmd, slugs).slice(0, 3);
        if (suggestions.length > 0) {
          process.stderr.write(
            `no site "${cmd}" — did you mean: ${suggestions.map((s) => `"${s.value}"`).join(", ")}?\n`,
          );
          process.exit(2);
        }
      }
    }

    if (site) {
      const next = rest[0];
      if (!next) {
        const statsCmd = COMMAND_MAP.get("stats")!;
        return statsCmd.run([cmd], flags);
      }
      const tabList = [...PER_SITE_TABS];
      let tab = next;
      if (!PER_SITE_TABS.has(tab)) {
        const fixedTab = autocorrect(tab, tabList);
        if (fixedTab) {
          process.stderr.write(c.dim(`(did you mean "${fixedTab}"?)\n`));
          tab = fixedTab;
        } else {
          const suggestions = closeMatches(next, tabList).slice(0, 3);
          if (suggestions.length > 0) {
            process.stderr.write(
              `unknown tab "${next}" for site "${cmd}" — did you mean: ${suggestions.map((s) => `"${s.value}"`).join(", ")}?\n`,
            );
            process.exit(2);
          }
          const tabs = SITE_TABS_HELP.map((t) => t.name).sort();
          process.stderr.write(
            `unknown tab "${next}" for site "${cmd}"\n` +
              `available tabs: ${tabs.join(", ")}\n`,
          );
          process.exit(2);
        }
      }
      const tabCmd = COMMAND_MAP.get(tab)!;
      return tabCmd.run([cmd, ...rest.slice(1)], flags);
    }
  }

  // Last-ditch: maybe they typo'd a top-level command (e.g. "fleest").
  const topFix = autocorrect(cmd, ALL_TOP_LEVEL);
  if (topFix) {
    process.stderr.write(c.dim(`(did you mean "${topFix}"?)\n`));
    const fixedCmd = COMMAND_MAP.get(topFix);
    if (fixedCmd) return fixedCmd.run(rest, flags);
  }

  process.stderr.write(`unknown command or site: ${cmd}\n`);
  process.stdout.write(buildHelp());
  process.exit(1);
}

main().catch((e) => {
  process.stderr.write(`error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
