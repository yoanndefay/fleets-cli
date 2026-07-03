// Reads `.fleets` repo config so commands like `fleets log` can default the
// site from the current working directory. Walks up from `cwd` until it finds
// `.fleets` (JSON) or hits the filesystem root. Returns null if not found or
// unreadable — callers should fall back to `--site` or error.

import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export type RepoConfig = {
  site?: string;
};

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

export async function readRepoConfig(
  startDir = process.cwd(),
): Promise<RepoConfig | null> {
  let dir = resolve(startDir);
  // Cap depth so we don't traverse forever on weird filesystems.
  for (let i = 0; i < 30; i++) {
    const candidate = join(dir, ".fleets");
    if (await fileExists(candidate)) {
      try {
        const raw = await readFile(candidate, "utf8");
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as RepoConfig;
        }
        return null;
      } catch {
        return null;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
