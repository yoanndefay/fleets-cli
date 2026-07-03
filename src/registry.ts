import { cmdLogin } from "./commands/login.js";
import { cmdSites } from "./commands/sites.js";
import { cmdStats } from "./commands/stats.js";
import { cmdSources } from "./commands/sources.js";
import { cmdCampaigns } from "./commands/campaigns.js";
import { cmdReferrals } from "./commands/referrals.js";
import { cmdLanders } from "./commands/landers.js";
import { cmdEvents } from "./commands/events.js";
import { cmdUsers } from "./commands/users.js";
import { cmdDevices } from "./commands/devices.js";
import { cmdDemographics } from "./commands/demographics.js";
import { cmdFunnel } from "./commands/funnel.js";
import { cmdSeo } from "./commands/seo.js";
import { cmdEdge } from "./commands/edge.js";
import { cmdBots } from "./commands/bots.js";
import { cmdSpeed } from "./commands/speed.js";
import { cmdExport } from "./commands/export.js";
import { cmdQuery } from "./commands/query.js";
import { cmdAdd } from "./commands/add.js";
import { cmdConnect } from "./commands/connect.js";
import { cmdUpdate } from "./commands/update.js";
import { cmdInsights } from "./commands/insights.js";
import { cmdAsk } from "./commands/ask.js";
import { cmdLog } from "./commands/log.js";
import { cmdRecall } from "./commands/recall.js";

export type CmdArg = {
  name: string;
  required?: boolean;
  description: string;
};

export type CmdFlag = {
  name: string;
  description: string;
  type: "string" | "boolean";
  default?: string | boolean;
};

export type Command = {
  name: string;
  summary: string;
  args: CmdArg[];
  flags?: CmdFlag[];
  run: (positional: string[], flags: Record<string, string | boolean>) => Promise<void>;
  apiHint?: string;
};

const rangeFlag: CmdFlag = { name: "range", description: "time range e.g. 7d, 30d, 24h", type: "string", default: "7d" };
const jsonFlag: CmdFlag = { name: "json", description: "output raw JSON", type: "boolean", default: false };
const limitFlag: CmdFlag = { name: "limit", description: "max rows", type: "string", default: "20" };

export const COMMANDS: Command[] = [
  {
    name: "login",
    summary: "authenticate via browser device flow or paste a token",
    args: [{ name: "token", description: "optional: paste a token directly (CI)" }],
    flags: [
      { name: "browser", description: "force browser device flow (skip prompt)", type: "boolean", default: false },
      { name: "paste", description: "force paste-token flow (skip prompt)", type: "boolean", default: false },
      { name: "no-browser", description: "don't auto-open the browser during device flow", type: "boolean", default: false },
      { name: "token", description: "paste a token directly (CI)", type: "string" },
    ],
    run: cmdLogin,
  },
  {
    name: "list",
    summary: "list your sites with totals, Δ7d, and 30-day sparkline",
    args: [],
    flags: [
      { ...rangeFlag, default: "30d" },
      { name: "metric", description: "users | sessions | views | events | revenue", type: "string", default: "users" },
      { name: "no-stats", description: "skip per-site stats fetch (metadata only)", type: "boolean", default: false },
      jsonFlag,
    ],
    run: cmdSites,
    apiHint: "GET /api/sites + per-site GET /api/ga?view=daily&days=N&metric=<metric>&property=<gaPropertyId>",
  },
  {
    name: "sites",
    summary: "list your sites with totals, Δ7d and 30-day sparkline",
    args: [],
    flags: [
      { ...rangeFlag, default: "30d" },
      { name: "metric", description: "users | sessions | views | events | revenue", type: "string", default: "users" },
      { name: "no-stats", description: "skip per-site stats fetch (metadata only)", type: "boolean", default: false },
      jsonFlag,
    ],
    run: cmdSites,
    apiHint: "GET /api/sites + per-site GET /api/ga?view=daily&days=N&metric=<metric>&property=<gaPropertyId>",
  },
  {
    name: "stats",
    summary: "GA4 summary for a site (mirrors 'day' tab)",
    args: [{ name: "slug", required: true, description: "site slug" }],
    flags: [rangeFlag, jsonFlag],
    run: cmdStats,
    apiHint: "GET /api/ga?view=summary&days=N&property=<gaPropertyId>",
  },
  {
    name: "sources",
    summary: "top traffic sources",
    args: [{ name: "slug", required: true, description: "site slug" }],
    flags: [rangeFlag, jsonFlag, limitFlag],
    run: cmdSources,
    apiHint: "GET /api/ga?view=sources&days=N&property=<gaPropertyId>",
  },
  {
    name: "campaigns",
    summary: "UTM campaign breakdown",
    args: [{ name: "slug", required: true, description: "site slug" }],
    flags: [rangeFlag, jsonFlag, limitFlag],
    run: cmdCampaigns,
    apiHint: "GET /api/ga?view=campaigns&days=N&property=<gaPropertyId>",
  },
  {
    name: "referrals",
    summary: "referral traffic breakdown",
    args: [{ name: "slug", required: true, description: "site slug" }],
    flags: [rangeFlag, jsonFlag, limitFlag],
    run: cmdReferrals,
    apiHint: "GET /api/ga?view=referrals&days=N&property=<gaPropertyId>",
  },
  {
    name: "landers",
    summary: "top landing pages",
    args: [{ name: "slug", required: true, description: "site slug" }],
    flags: [rangeFlag, jsonFlag, limitFlag],
    run: cmdLanders,
    apiHint: "GET /api/ga?view=landers&days=N&property=<gaPropertyId>",
  },
  {
    name: "events",
    summary: "GA4 event breakdown",
    args: [{ name: "slug", required: true, description: "site slug" }],
    flags: [rangeFlag, jsonFlag, limitFlag],
    run: cmdEvents,
    apiHint: "GET /api/ga?view=events&days=N&property=<gaPropertyId>",
  },
  {
    name: "users",
    summary: "user and session breakdown",
    args: [{ name: "slug", required: true, description: "site slug" }],
    flags: [rangeFlag, jsonFlag],
    run: cmdUsers,
    apiHint: "GET /api/ga?view=users&days=N&property=<gaPropertyId>",
  },
  {
    name: "devices",
    summary: "device-category breakdown with engagement and bounce rate",
    args: [{ name: "slug", required: true, description: "site slug" }],
    flags: [rangeFlag, jsonFlag],
    run: cmdDevices,
    apiHint: "GET /api/ga?view=devices&days=N&property=<gaPropertyId>",
  },
  {
    name: "demographics",
    summary: "age + gender breakdown (requires Google Signals)",
    args: [{ name: "slug", required: true, description: "site slug" }],
    flags: [rangeFlag, jsonFlag],
    run: cmdDemographics,
    apiHint: "GET /api/ga?view=demographics&days=N&property=<gaPropertyId>",
  },
  {
    name: "funnel",
    summary: "conversion funnel across steps",
    args: [
      { name: "slug", required: true, description: "site slug" },
      { name: "steps…", required: true, description: "two or more funnel step names" },
    ],
    flags: [rangeFlag, jsonFlag],
    run: cmdFunnel,
    apiHint: "GET /api/ga?view=funnel&days=N&property=<gaPropertyId>&steps=a,b,c",
  },
  {
    name: "seo",
    summary: "Google Search Console summary",
    args: [{ name: "slug", required: true, description: "site slug" }],
    flags: [rangeFlag, jsonFlag],
    run: cmdSeo,
    apiHint: "GET /api/gsc?view=summary&days=N&site=<gscSiteUrl>",
  },
  {
    name: "edge",
    summary: "Cloudflare edge analytics (bots, humans, cache)",
    args: [{ name: "slug", required: true, description: "site slug" }],
    flags: [rangeFlag, jsonFlag],
    run: cmdEdge,
    apiHint: "GET /api/cf?view=all&days=N&zone=<cfZoneId>",
  },
  {
    name: "bots",
    summary: "Cloudflare edge analytics — alias for edge",
    args: [{ name: "slug", required: true, description: "site slug" }],
    flags: [rangeFlag, jsonFlag],
    run: cmdBots,
    apiHint: "GET /api/cf?view=all&days=N&zone=<cfZoneId>",
  },
  {
    name: "speed",
    summary: "PageSpeed Insights score",
    args: [{ name: "slug", required: true, description: "site slug" }],
    flags: [
      { name: "strategy", description: "mobile or desktop", type: "string", default: "mobile" },
      jsonFlag,
    ],
    run: cmdSpeed,
    apiHint: "GET /api/psi?url=https://<domain>&strategy=mobile|desktop",
  },
  {
    name: "export",
    summary: "export daily GA4 session data as JSON or CSV",
    args: [{ name: "slug", required: true, description: "site slug" }],
    flags: [
      { ...rangeFlag, default: "30d" },
      { name: "format", description: "json or csv", type: "string", default: "json" },
    ],
    run: cmdExport,
    apiHint: "GET /api/ga?view=daily&days=N&metric=sessions&property=<gaPropertyId>",
  },
  {
    name: "query",
    summary: "natural-language analytics query",
    args: [
      { name: "slug", required: true, description: "site slug" },
      { name: "text", required: true, description: "natural-language query e.g. \"traffic 7d\"" },
    ],
    run: cmdQuery,
    apiHint: "GET /api/ga?view=summary&days=N&property=<gaPropertyId>",
  },
  {
    name: "add",
    summary: "add a site",
    args: [{ name: "domain", required: true, description: "domain to add" }],
    flags: [
      { name: "property", description: "GA4 property id to attach", type: "string" },
      { name: "detect", description: "auto-detect GA4 + GSC after creating", type: "boolean", default: false },
      jsonFlag,
    ],
    run: cmdAdd,
    apiHint: "POST /api/sites",
  },
  {
    name: "connect",
    summary: "auto-detect or set connectors for a site",
    args: [{ name: "slug", required: true, description: "site slug" }],
    flags: [
      { name: "property", description: "set GA4 property id", type: "string" },
      { name: "gsc", description: "set GSC site url (sc-domain:example.com)", type: "string" },
      { name: "clear-ga", description: "remove GA4 connection", type: "boolean", default: false },
      { name: "clear-gsc", description: "remove GSC connection", type: "boolean", default: false },
      jsonFlag,
    ],
    run: cmdConnect,
    apiHint: "PATCH /api/sites/<slug> · POST /api/sites/<slug>/detect",
  },
  {
    name: "ask",
    summary: "ask a natural-language question — agent runs the right tools and answers",
    args: [{ name: "question", required: true, description: "natural-language question in quotes" }],
    flags: [
      { name: "model", description: "haiku (default), sonnet, or opus", type: "string", default: "haiku" },
      jsonFlag,
    ],
    run: cmdAsk,
    apiHint: "POST /api/ask",
  },
  {
    name: "insights",
    summary: "AI-ready signals to investigate — works across all sites or filtered to one",
    args: [{ name: "slug", description: "optional: filter to one site" }],
    flags: [
      { name: "site", description: "filter to one site (alt to positional slug)", type: "string" },
      { name: "prompt", description: "print only the LLM-ready prompt for an insight id (or 'first')", type: "string" },
      { name: "copy", description: "with --prompt: copy the prompt to your clipboard (falls back to stdout)", type: "boolean", default: false },
      jsonFlag,
    ],
    run: cmdInsights,
    apiHint: "GET /api/insights[?site=<slug>]",
  },
  {
    name: "log",
    summary: "record a change you (or your agent) made to a site",
    args: [{ name: "description", required: true, description: "what changed, in quotes" }],
    flags: [
      { name: "site", description: "site slug (else auto-detect from .fleets in cwd)", type: "string" },
      { name: "path", description: "optional page path the change targets (e.g. /pricing)", type: "string" },
      { name: "tag", description: "optional tag (e.g. campaign, content, fix)", type: "string" },
      { name: "actor", description: "override actor (default: $FLEET_AGENT or 'agent')", type: "string" },
      jsonFlag,
    ],
    run: cmdLog,
    apiHint: "POST /api/log",
  },
  {
    name: "recall",
    summary: "show recent logged changes for a site",
    args: [{ name: "slug", description: "site slug (else auto-detect from .fleets in cwd)" }],
    flags: [
      { name: "site", description: "site slug (alt to positional)", type: "string" },
      { name: "since", description: "time range e.g. 7d, 30d, 24h", type: "string", default: "30d" },
      { name: "limit", description: "max entries (default 100)", type: "string" },
      jsonFlag,
    ],
    run: cmdRecall,
    apiHint: "GET /api/log?site=<slug>&days=N",
  },
  {
    name: "update",
    summary: "update the CLI to the latest version",
    args: [],
    flags: [
      { name: "check", description: "only check; don't install", type: "boolean", default: false },
    ],
    run: cmdUpdate,
  },
  {
    name: "open",
    summary: "print the app URL for a site",
    args: [
      { name: "slug", required: true, description: "site slug" },
      { name: "tab", description: "optional tab name" },
    ],
    run: async (positional) => {
      const [slug, tab] = positional;
      const url = tab
        ? `https://fleets.run/app/${slug}/${tab}`
        : `https://fleets.run/app/${slug}`;
      process.stdout.write(url + "\n");
    },
  },
];

export const COMMAND_MAP = new Map<string, Command>(COMMANDS.map((c) => [c.name, c]));
