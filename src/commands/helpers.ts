import { api } from "../http.js";

export type Site = {
  id: string;
  name: string;
  domain?: string;
  property?: string;
  cfZoneId?: string;
  gscSiteUrl?: string;
};

let _cache: Site[] | null = null;

export function _resetSiteCache(): void {
  _cache = null;
}

async function getSites(): Promise<Site[]> {
  if (!_cache) _cache = await api<Site[]>("/api/sites");
  return _cache;
}

export async function resolveSite(slug: string): Promise<Site | null> {
  const sites = await getSites();
  return sites.find((s) => s.id === slug) ?? null;
}

export async function resolveSiteProperty(slug: string): Promise<{ site: Site; property: string }> {
  const site = await resolveSite(slug);
  if (!site?.property) {
    process.stderr.write(`no GA property for ${slug}\n`);
    process.exit(1);
  }
  return { site, property: site.property };
}

export async function resolveSiteZone(slug: string): Promise<{ site: Site; cfZoneId: string }> {
  const site = await resolveSite(slug);
  if (!site?.cfZoneId) {
    process.stderr.write(`no Cloudflare zone for ${slug} — connect Cloudflare in app settings\n`);
    process.exit(1);
  }
  return { site, cfZoneId: site.cfZoneId };
}

export async function resolveSiteGscUrl(slug: string): Promise<{ site: Site; gscSiteUrl: string }> {
  const site = await resolveSite(slug);
  if (!site?.gscSiteUrl) {
    process.stderr.write(`no GSC site for ${slug}\n`);
    process.exit(1);
  }
  return { site, gscSiteUrl: site.gscSiteUrl };
}

export async function resolveSiteDomain(slug: string): Promise<{ site: Site; domain: string }> {
  const site = await resolveSite(slug);
  if (!site?.domain) {
    process.stderr.write(`no domain for ${slug}\n`);
    process.exit(1);
  }
  return { site, domain: site.domain };
}

export function getFlag(args: string[], key: string): string | undefined {
  const i = args.indexOf(`--${key}`);
  if (i < 0) return undefined;
  return args[i + 1];
}
