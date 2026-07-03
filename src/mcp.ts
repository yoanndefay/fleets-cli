#!/usr/bin/env node
/**
 * Fleets MCP server (stdio).
 *
 * Exposes the read-only Fleets analytics surface — GA4, Search Console,
 * Cloudflare edge, PageSpeed, insights, ask, and the change log — as MCP
 * tools, so an agent (Claude, Cursor, …) can pull live multi-site analytics.
 *
 * Auth reuses the CLI's credential store: it reads the token from
 * ~/.fleets/config.json (written by `fleets login`) or the FLEETS_TOKEN env
 * var. Every tool hits the same public API the CLI uses.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z, type ZodRawShape } from "zod";
import { api } from "./http.js";
import { resolveSite, type Site } from "./commands/helpers.js";
import { parseRange } from "./range.js";

// ── shared helpers ──────────────────────────────────────────────────────────

const days = (range?: string): number => parseRange({ range: range ?? "7d" }, 7);

function need<T>(v: T | null | undefined, message: string): NonNullable<T> {
  if (v == null || v === "") throw new Error(message);
  return v as NonNullable<T>;
}

async function siteOrThrow(slug: string): Promise<Site> {
  const site = await resolveSite(slug);
  if (!site) {
    throw new Error(`unknown site "${slug}". Call list_sites to see available slugs.`);
  }
  return site;
}

/** GET /api/ga for a view that resolves the site's GA4 property. */
async function gaView(
  view: string,
  slug: string,
  range: string | undefined,
  extra = "",
): Promise<unknown> {
  const site = await siteOrThrow(slug);
  const property = need(site.property, `site "${slug}" has no GA4 property connected`);
  return api(`/api/ga?view=${view}&days=${days(range)}&property=${property}${extra}`);
}

/** Slice a top-level array response to `limit` rows; pass through otherwise. */
function applyLimit(data: unknown, limit?: string): unknown {
  if (!limit || !Array.isArray(data)) return data;
  const n = Number(limit);
  return Number.isFinite(n) && n > 0 ? data.slice(0, n) : data;
}

const jsonResult = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

// ── reusable zod fragments ──────────────────────────────────────────────────

const slug = z.string().describe("site slug (from list_sites)");
const range = z.string().optional().describe("time range e.g. 7d, 30d, 24h (default 7d)");
const limit = z.string().optional().describe("max rows to return (default: all)");

const siteRange = { slug, range };
const siteRangeLimit = { slug, range, limit };

// ── tool table: schema + handler in one place ───────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  shape: ZodRawShape;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

const opt = (a: Record<string, unknown>, k: string): string | undefined =>
  a[k] == null ? undefined : String(a[k]);
const str = (a: Record<string, unknown>, k: string): string => String(a[k] ?? "");

const DEFS: ToolDef[] = [
  {
    name: "list_sites",
    description:
      "List all sites on your Fleets account with their connected sources " +
      "(GA4 property, Cloudflare zone, GSC site). Start here to get slugs.",
    shape: {},
    run: () => api("/api/sites"),
  },
  {
    name: "stats",
    description: "GA4 summary for a site: sessions, users, pageviews, events, engagement, bounce.",
    shape: siteRange,
    run: (a) => gaView("summary", str(a, "slug"), opt(a, "range")),
  },
  {
    name: "sources",
    description: "GA4 top traffic sources / channels for a site.",
    shape: siteRangeLimit,
    run: async (a) => applyLimit(await gaView("sources", str(a, "slug"), opt(a, "range")), opt(a, "limit")),
  },
  {
    name: "campaigns",
    description: "GA4 UTM campaign breakdown for a site.",
    shape: siteRangeLimit,
    run: async (a) => applyLimit(await gaView("campaigns", str(a, "slug"), opt(a, "range")), opt(a, "limit")),
  },
  {
    name: "referrals",
    description: "GA4 referral traffic breakdown for a site.",
    shape: siteRangeLimit,
    run: async (a) => applyLimit(await gaView("referrals", str(a, "slug"), opt(a, "range")), opt(a, "limit")),
  },
  {
    name: "landers",
    description: "GA4 top landing pages for a site.",
    shape: siteRangeLimit,
    run: async (a) => applyLimit(await gaView("landers", str(a, "slug"), opt(a, "range")), opt(a, "limit")),
  },
  {
    name: "events",
    description: "GA4 event breakdown (event name, count, users) for a site.",
    shape: siteRangeLimit,
    run: async (a) => applyLimit(await gaView("events", str(a, "slug"), opt(a, "range")), opt(a, "limit")),
  },
  {
    name: "users",
    description: "GA4 user + session breakdown (country + device) for a site.",
    shape: siteRange,
    run: (a) => gaView("users", str(a, "slug"), opt(a, "range")),
  },
  {
    name: "devices",
    description: "GA4 device-category breakdown with engagement and bounce rate.",
    shape: siteRange,
    run: (a) => gaView("devices", str(a, "slug"), opt(a, "range")),
  },
  {
    name: "demographics",
    description: "GA4 age + gender breakdown (requires Google Signals).",
    shape: siteRange,
    run: (a) => gaView("demographics", str(a, "slug"), opt(a, "range")),
  },
  {
    name: "funnel",
    description: "GA4 conversion funnel across two or more event/step names.",
    shape: {
      slug,
      steps: z.array(z.string()).min(2).describe("two or more funnel step names, in order"),
      range,
    },
    run: (a) => {
      const steps = Array.isArray(a.steps) ? (a.steps as unknown[]).map(String) : [];
      if (steps.length < 2) throw new Error("funnel needs at least two steps");
      return gaView(
        "funnel",
        str(a, "slug"),
        opt(a, "range"),
        `&steps=${steps.map(encodeURIComponent).join(",")}`,
      );
    },
  },
  {
    name: "seo",
    description: "Google Search Console summary (clicks, impressions, CTR, position) for a site.",
    shape: siteRange,
    run: async (a) => {
      const site = await siteOrThrow(str(a, "slug"));
      const gsc = need(site.gscSiteUrl, `site "${site.id}" has no Search Console site connected`);
      return api(`/api/gsc?view=summary&days=${days(opt(a, "range"))}&site=${encodeURIComponent(gsc)}`);
    },
  },
  {
    name: "edge",
    description: "Cloudflare edge analytics for a site: bots vs humans, cache hit rate, requests.",
    shape: siteRange,
    run: async (a) => {
      const site = await siteOrThrow(str(a, "slug"));
      const zone = need(site.cfZoneId, `site "${site.id}" has no Cloudflare zone connected`);
      return api(`/api/cf?view=all&days=${days(opt(a, "range"))}&zone=${zone}`);
    },
  },
  {
    name: "speed",
    description: "PageSpeed Insights score + Core Web Vitals for a site's homepage.",
    shape: {
      slug,
      strategy: z.enum(["mobile", "desktop"]).optional().describe("mobile (default) or desktop"),
    },
    run: async (a) => {
      const site = await siteOrThrow(str(a, "slug"));
      const domain = need(site.domain, `site "${site.id}" has no domain`);
      const strategy = opt(a, "strategy") === "desktop" ? "desktop" : "mobile";
      return api(`/api/psi?url=${encodeURIComponent(`https://${domain}`)}&strategy=${strategy}`);
    },
  },
  {
    name: "insights",
    description:
      "AI-ready signals worth investigating across all sites, or filtered to one. " +
      "Each insight includes a ready-to-run prompt.",
    shape: {
      site: z.string().optional().describe("optional: filter to one site slug"),
    },
    run: (a) => {
      const site = opt(a, "site");
      return api(`/api/insights${site ? `?site=${encodeURIComponent(site)}` : ""}`);
    },
  },
  {
    name: "ask",
    description:
      "Ask a natural-language analytics question; the Fleets agent runs the right " +
      "tools server-side and returns an answer with citations.",
    shape: {
      question: z.string().describe("the question, plain English"),
      model: z.enum(["haiku", "sonnet", "opus"]).optional().describe("model (default haiku)"),
    },
    run: (a) => {
      const question = need(opt(a, "question"), "missing required argument: question");
      const model = ["haiku", "sonnet", "opus"].includes(str(a, "model")) ? str(a, "model") : "haiku";
      return api("/api/ask", { method: "POST", body: { question, model } });
    },
  },
  {
    name: "log_change",
    description:
      "Record a change you or your agent made to a site (deploy, copy edit, campaign) " +
      "so it can be correlated with analytics later.",
    shape: {
      description: z.string().describe("what changed, plain English"),
      site: z.string().describe("site slug the change targets"),
      path: z.string().optional().describe("optional page path e.g. /pricing"),
      tag: z.string().optional().describe("optional tag e.g. campaign, content, fix"),
      actor: z.string().optional().describe("optional actor label (default: agent)"),
    },
    run: (a) => {
      const body: Record<string, unknown> = {
        site: need(opt(a, "site"), "missing required argument: site"),
        description: need(opt(a, "description"), "missing required argument: description"),
        actor: opt(a, "actor")?.trim() || "agent",
      };
      const path = opt(a, "path");
      if (path) body.path = path;
      const tag = opt(a, "tag");
      if (tag) body.metadata = { tags: [tag] };
      return api("/api/log", { method: "POST", body });
    },
  },
  {
    name: "recall",
    description: "Show recent logged changes for a site (from log_change / `fleets log`).",
    shape: {
      slug,
      since: z.string().optional().describe("time range e.g. 7d, 30d (default 30d)"),
    },
    run: (a) => {
      const s = need(opt(a, "slug"), "missing required argument: slug");
      return api(`/api/log?site=${encodeURIComponent(s)}&days=${days(opt(a, "since") ?? "30d")}`);
    },
  },
];

// ── server wiring ───────────────────────────────────────────────────────────

const server = new McpServer({ name: "fleets", version: "0.2.0" });

// Concrete, non-generic view of registerTool. Iterating over tools with a
// dynamic ZodRawShape makes the SDK's generic inference recurse (TS2589), so we
// pin the signature we actually use and register through it.
type ToolResult = { content: { type: "text"; text: string }[] };
const register = server.registerTool.bind(server) as unknown as (
  name: string,
  config: { description: string; inputSchema: ZodRawShape },
  cb: (args: Record<string, unknown>) => Promise<ToolResult>,
) => void;

for (const def of DEFS) {
  register(
    def.name,
    { description: def.description, inputSchema: def.shape },
    async (args) => jsonResult(await def.run(args ?? {})),
  );
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logs — stdout is the JSON-RPC channel.
  process.stderr.write("fleets-mcp: ready (stdio)\n");
}

main().catch((err) => {
  process.stderr.write(`fleets-mcp: fatal ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
