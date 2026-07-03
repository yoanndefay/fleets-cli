import { api } from "../http.js";
import { _resetSiteCache, resolveSite } from "./helpers.js";
import { printJson } from "../output.js";
import { colorFromFlags } from "../render.js";

type PatchResp = {
  ok: boolean;
  slug: string;
  domain: string;
  gaPropertyId: string | null;
  gscSiteUrl: string | null;
};

type DetectResp = {
  ga?: {
    saved?: { propertyId: string; displayName: string };
    candidates?: Array<{ propertyId: string; displayName: string; accountDisplayName: string }>;
    error?: string;
  };
  gsc?: { saved?: { siteUrl: string }; error?: string };
};

export async function cmdConnect(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const slug = positional[0];
  if (!slug) {
    process.stderr.write(
      "usage:\n" +
        "  fleets connect <slug>                          auto-detect GA4 + GSC for the site's domain\n" +
        "  fleets connect <slug> --property <id>          set GA4 property by id\n" +
        "  fleets connect <slug> --gsc <site-url>         set GSC site (e.g. sc-domain:example.com)\n" +
        "  fleets connect <slug> --clear-ga|--clear-gsc   remove a connection\n",
    );
    process.exit(2);
  }
  // ensure site exists for nicer errors than a bare 404
  const site = await resolveSite(slug);
  if (!site) {
    process.stderr.write(`no site with slug "${slug}" — try \`fleets list\`\n`);
    process.exit(1);
  }
  const c = colorFromFlags(flags);

  // Manual set wins over auto-detect when any --property / --gsc / --clear-* flag is given.
  const manual: { gaPropertyId?: string | null; gscSiteUrl?: string | null } = {};
  if (typeof flags.property === "string") manual.gaPropertyId = flags.property;
  if (flags["clear-ga"] === true) manual.gaPropertyId = null;
  if (typeof flags.gsc === "string") manual.gscSiteUrl = flags.gsc;
  if (flags["clear-gsc"] === true) manual.gscSiteUrl = null;

  if (Object.keys(manual).length > 0) {
    const r = await api<PatchResp>(`/api/sites/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: manual,
    });
    _resetSiteCache();
    if (flags.json) {
      printJson(r);
      return;
    }
    process.stdout.write(`${c.green("✓")} updated ${c.bold(slug)}\n`);
    if (r.gaPropertyId) process.stdout.write(`  ${c.dim("GA4")}  ${r.gaPropertyId}\n`);
    if (r.gscSiteUrl) process.stdout.write(`  ${c.dim("GSC")}  ${r.gscSiteUrl}\n`);
    return;
  }

  // Auto-detect via service account.
  process.stdout.write(`${c.dim("detecting connectors for")} ${c.bold(site.domain ?? slug)}…\n`);
  const detected = await api<DetectResp>(
    `/api/sites/${encodeURIComponent(slug)}/detect`,
    { method: "POST", body: {} },
  );
  _resetSiteCache();

  if (flags.json) {
    printJson(detected);
    return;
  }

  if (detected.ga?.saved) {
    process.stdout.write(
      `${c.green("✓")} GA4   ${detected.ga.saved.propertyId}  ${c.dim(detected.ga.saved.displayName)}\n`,
    );
  } else if (detected.ga?.candidates?.length) {
    process.stdout.write(`${c.yellow("?")} GA4   multiple matches — pick one:\n`);
    for (const cand of detected.ga.candidates) {
      process.stdout.write(
        `       ${cand.propertyId}  ${c.dim(`${cand.accountDisplayName} · ${cand.displayName}`)}\n`,
      );
    }
    process.stdout.write(
      `       ${c.dim(`then: fleets connect ${slug} --property <id>`)}\n`,
    );
  } else if (detected.ga?.error) {
    process.stdout.write(`${c.red("✗")} GA4   ${c.dim(detected.ga.error)}\n`);
  }

  if (detected.gsc?.saved) {
    process.stdout.write(`${c.green("✓")} GSC   ${detected.gsc.saved.siteUrl}\n`);
  } else if (detected.gsc?.error) {
    process.stdout.write(`${c.red("✗")} GSC   ${c.dim(detected.gsc.error)}\n`);
  }
}
