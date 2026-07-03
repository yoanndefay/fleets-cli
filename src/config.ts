import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".fleets");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export type Config = {
  token?: string;
  apiUrl?: string;
};

export async function readConfig(): Promise<Config> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    return JSON.parse(raw) as Config;
  } catch {
    return {};
  }
}

export async function writeConfig(patch: Config): Promise<void> {
  const current = await readConfig();
  const next = { ...current, ...patch };
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
}

export function apiUrl(cfg?: Config): string {
  return (
    cfg?.apiUrl ?? process.env.FLEETS_API_URL ?? "https://fleets.run"
  ).replace(/\/$/, "");
}

export function token(cfg?: Config): string {
  return cfg?.token ?? process.env.FLEETS_TOKEN ?? "";
}
