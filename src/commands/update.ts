// `fleets update` — keep the CLI current.
//
// Detects how the user installed:
//   1. Global npm install   → `npm i -g fleets@latest`
//   2. npm link (dev build) → tell the user where the source is + suggest `git pull && npm run build`
//   3. Other (npx / one-off bundle) → print the install command
//
// Prints the version before/after and skips the install when already up to date.

import { spawn } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { colorFromFlags } from "../render.js";

type Pkg = { name: string; version: string };

export async function cmdUpdate(
  _positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const c = colorFromFlags(flags);

  const pkgPath = await findPackageJson();
  const pkg = await readPkg(pkgPath);
  const installRoot = dirname(pkgPath);
  const isLinked = await isDevLink(installRoot);

  process.stdout.write(
    `${c.dim("current")}  ${c.bold(`${pkg.name}@${pkg.version}`)}\n`,
  );

  // Dev link → upgrading via npm would clobber the symlink. Surface the
  // real source path so the user can pull there.
  if (isLinked) {
    const realRoot = await realpath(installRoot);
    process.stdout.write(
      `${c.dim("install ")}  dev build (npm link) at ${c.bold(realRoot)}\n\n`,
    );
    if (flags.check) return;
    process.stdout.write(
      `${c.dim("this is a dev build — to update, pull and rebuild:")}\n\n` +
        `  cd ${realRoot}\n  git pull\n  npm run build\n`,
    );
    return;
  }

  // Global / one-off install. Compare against npm registry.
  const latest = await fetchLatestVersion(pkg.name);
  if (!latest) {
    process.stdout.write(
      `${c.yellow("?")} couldn't reach the npm registry — try again later\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`${c.dim("latest ")}  ${c.bold(`${pkg.name}@${latest}`)}\n\n`);

  if (latest === pkg.version) {
    process.stdout.write(`${c.green("✓")} already up to date\n`);
    return;
  }

  if (flags.check) {
    process.stdout.write(
      `${c.yellow("↑")} update available — run \`fleets update\` to install\n`,
    );
    return;
  }

  process.stdout.write(`${c.dim("running")}  npm i -g ${pkg.name}@latest\n\n`);
  const code = await run("npm", ["i", "-g", `${pkg.name}@latest`]);
  if (code !== 0) {
    process.stderr.write(
      `${c.red("✗")} npm exited ${code} — try \`sudo npm i -g ${pkg.name}@latest\` or fix your npm prefix\n`,
    );
    process.exit(code);
  }
  process.stdout.write(`\n${c.green("✓")} ${pkg.name} upgraded to ${latest}\n`);
}

async function findPackageJson(): Promise<string> {
  // Walk up from the running script until we find a package.json with our name.
  // For `npm link` installs this resolves to the source repo; for `npm i -g`
  // it resolves to ~/.npm-global/lib/node_modules/fleets/package.json.
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "package.json");
    try {
      const raw = await readFile(candidate, "utf8");
      const pkg = JSON.parse(raw) as Pkg;
      if (pkg.name === "fleets" || pkg.name === "@fleets/cli") return candidate;
    } catch {
      // keep walking
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("could not locate the fleets package.json");
}

async function readPkg(path: string): Promise<Pkg> {
  return JSON.parse(await readFile(path, "utf8")) as Pkg;
}

async function isDevLink(installRoot: string): Promise<boolean> {
  // Two signals, either of which means "this is a checkout, not an install":
  // 1. The install path is a symlink (classic `npm link` setup).
  // 2. The package directory contains a src/ folder. Published builds only
  //    ship the files listed in package.json#files (bin, dist) — never src.
  try {
    const real = await realpath(installRoot);
    if (real !== installRoot) return true;
  } catch {
    // ignored
  }
  try {
    const s = await stat(join(installRoot, "src"));
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function fetchLatestVersion(name: string): Promise<string | null> {
  try {
    const r = await fetch(`https://registry.npmjs.org/${name}/latest`, {
      headers: { accept: "application/json" },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { version?: string };
    return j.version ?? null;
  } catch {
    return null;
  }
}

function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((res) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("close", (code) => res(code ?? 0));
    child.on("error", () => res(1));
  });
}
