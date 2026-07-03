import { api } from "../http.js";
import { _resetSiteCache } from "./helpers.js";
import { printJson } from "../output.js";
import { colorFromFlags } from "../render.js";

type CreateResp = {
  id: string;
  slug: string;
  name: string;
  domain: string;
  property: string | null;
};

export async function cmdAdd(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const domain = positional[0];
  if (!domain) {
    process.stderr.write(
      "usage: fleets add <domain> [--property <id>] [--detect] [--json]\n",
    );
    process.exit(2);
  }
  const c = colorFromFlags(flags);
  const body: { domain: string; gaPropertyId?: string } = { domain };
  if (typeof flags.property === "string") body.gaPropertyId = flags.property;

  const created = await api<CreateResp>("/api/sites", {
    method: "POST",
    body,
  });
  _resetSiteCache();

  if (flags.detect) {
    await runDetect(created.slug, c, flags);
  }

  if (flags.json) {
    printJson(created);
    return;
  }
  process.stdout.write(
    `${c.green("✓")} added ${c.bold(created.slug)}  ${c.dim(created.domain)}\n`,
  );
  if (created.property) {
    process.stdout.write(`  ${c.dim("GA4 property")}  ${created.property}\n`);
  } else if (!flags.detect) {
    process.stdout.write(
      `  ${c.dim("connect data with")}  ${c.bold(`fleets connect ${created.slug}`)}\n`,
    );
  }
}

type DetectResp = {
  ga?: {
    saved?: { propertyId: string; displayName: string };
    candidates?: Array<{ propertyId: string; displayName: string; accountDisplayName: string }>;
    error?: string;
  };
  gsc?: { saved?: { siteUrl: string }; error?: string };
};

async function runDetect(
  slug: string,
  c: ReturnType<typeof colorFromFlags>,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const r = await api<DetectResp>(`/api/sites/${encodeURIComponent(slug)}/detect`, {
    method: "POST",
    body: {},
  });
  if (flags.json) return;
  if (r.ga?.saved) {
    process.stdout.write(
      `  ${c.green("✓")} GA4   ${r.ga.saved.propertyId}  ${c.dim(r.ga.saved.displayName)}\n`,
    );
  } else if (r.ga?.candidates?.length) {
    process.stdout.write(
      `  ${c.yellow("?")} GA4   multiple matches — pick one:\n`,
    );
    for (const cand of r.ga.candidates) {
      process.stdout.write(
        `        ${cand.propertyId}  ${c.dim(`${cand.accountDisplayName} · ${cand.displayName}`)}\n`,
      );
    }
    process.stdout.write(
      `        ${c.dim(`then: fleets connect ${slug} --property <id>`)}\n`,
    );
  } else if (r.ga?.error) {
    process.stdout.write(`  ${c.red("✗")} GA4   ${c.dim(r.ga.error)}\n`);
  }
  if (r.gsc?.saved) {
    process.stdout.write(
      `  ${c.green("✓")} GSC   ${r.gsc.saved.siteUrl}\n`,
    );
  } else if (r.gsc?.error) {
    process.stdout.write(`  ${c.red("✗")} GSC   ${c.dim(r.gsc.error)}\n`);
  }
}
