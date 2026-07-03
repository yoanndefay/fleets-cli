import { api } from "../http.js";
import { printJson } from "../output.js";
import { readRepoConfig } from "../repo-config.js";
import { colorFromFlags } from "../render.js";

type ChangeLogEntry = {
  id: string;
  site: string;
  description: string;
  path: string | null;
  actor: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

function detectActor(flagActor?: string): string {
  if (flagActor && flagActor.trim()) return flagActor.trim();
  const env = process.env.FLEET_AGENT?.trim();
  if (env) return env;
  return "agent";
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

export async function cmdLog(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const description = positional.join(" ").trim();
  if (!description) {
    process.stderr.write(
      'usage: fleets log "<description>" [--site <slug>] [--path <path>] [--tag <name>] [--actor <name>] [--json]\n',
    );
    process.exit(2);
  }

  // Site: --site flag wins; else read .fleets in cwd.
  let site = typeof flags.site === "string" ? flags.site.trim() : "";
  if (!site) {
    const cfg = await readRepoConfig();
    if (cfg?.site) site = cfg.site;
  }
  if (!site) {
    process.stderr.write(
      "no site — pass --site <slug> or add a .fleets file ({\"site\":\"<slug>\"}) in your repo\n",
    );
    process.exit(2);
  }

  const path = typeof flags.path === "string" ? flags.path.trim() : null;
  const actor = detectActor(typeof flags.actor === "string" ? flags.actor : undefined);

  const tags: string[] = [];
  if (typeof flags.tag === "string" && flags.tag.trim()) tags.push(flags.tag.trim());
  const metadata: Record<string, unknown> = {};
  if (tags.length > 0) metadata.tags = tags;

  const body: Record<string, unknown> = { site, description, actor };
  if (path) body.path = path;
  if (Object.keys(metadata).length > 0) body.metadata = metadata;

  const entry = await api<ChangeLogEntry>("/api/log", {
    method: "POST",
    body,
  });

  if (flags.json) {
    printJson(entry);
    return;
  }

  const c = colorFromFlags(flags);
  const sitePath = entry.path ? `${entry.site}${entry.path}` : entry.site;
  process.stdout.write(
    `${c.green("✓ logged")} · ${c.bold(sitePath)} · ${c.dim(shortTime(entry.createdAt))} · ${c.cyan(entry.actor)}\n`,
  );
}
