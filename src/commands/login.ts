import { hostname } from "node:os";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { apiUrl, readConfig, writeConfig } from "../config.js";
import { colorFromFlags, type Colorize } from "../render.js";

type DeviceStart = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
};

type PollResp =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "denied" }
  | { status: "consumed" }
  | {
      status: "approved";
      token: string;
      tokenId: string;
      name: string;
      userId: string;
    };

export async function cmdLogin(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const c = colorFromFlags(flags);

  // Direct token via flag or positional — bypass everything, write & exit.
  const directToken =
    typeof flags.token === "string" ? flags.token : positional[0];
  if (directToken && directToken.startsWith("fl_")) {
    await writeConfig({ token: directToken });
    process.stdout.write(`${c.green("✓")} saved to ~/.fleets/config.json\n`);
    return;
  }

  // Pick a method. Explicit flag wins; otherwise ask if interactive,
  // default to browser when stdin isn't a TTY.
  let method: "browser" | "paste";
  if (flags.browser === true) method = "browser";
  else if (flags.paste === true) method = "paste";
  else if (!process.stdin.isTTY) method = "browser";
  else method = await chooseMethod(c);

  if (method === "browser") {
    return browserLogin(c, flags);
  }
  return pasteLogin(c);
}

async function chooseMethod(c: Colorize): Promise<"browser" | "paste"> {
  process.stdout.write(
    `${c.bold("sign in with:")}\n` +
      `  ${c.bold("1")}) browser   ${c.dim("— recommended, one-tap auth")}\n` +
      `  ${c.bold("2")}) paste token ${c.dim("— from app → account → cli")}\n\n`,
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`choose [${c.bold("1")}]: `)).trim();
    return answer === "2" || answer.toLowerCase().startsWith("p")
      ? "paste"
      : "browser";
  } finally {
    rl.close();
  }
}

async function pasteLogin(c: Colorize): Promise<void> {
  const cfg = await readConfig();
  const base = apiUrl(cfg);
  process.stdout.write(
    `\nopen ${c.bold(`${base}/app/account?tab=cli`)} to mint a token,\nthen paste it below.\n\n`,
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let token: string;
  try {
    token = (await rl.question("token: ")).trim();
  } finally {
    rl.close();
  }
  if (!token) {
    process.stderr.write(`${c.red("✗")} no token entered\n`);
    process.exit(1);
  }
  if (!token.startsWith("fl_")) {
    process.stderr.write(`${c.red("✗")} token should start with "fl_"\n`);
    process.exit(1);
  }
  await writeConfig({ token });
  process.stdout.write(`${c.green("✓")} saved to ~/.fleets/config.json\n`);
}

async function browserLogin(
  c: Colorize,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const cfg = await readConfig();
  const base = apiUrl(cfg);

  const startRes = await fetch(`${base}/api/auth/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostname: hostname() }),
  });
  if (!startRes.ok) {
    const text = await startRes.text();
    throw new Error(
      text.trim().startsWith("<")
        ? `${startRes.status}: ${base} did not return JSON — wrong FLEETS_API_URL or server too old (try \`fleets login --paste\`)`
        : `${startRes.status}: ${text.slice(0, 200)}`,
    );
  }
  const start = (await startRes.json()) as DeviceStart;

  process.stdout.write(
    `\nopen this URL and enter the code:\n\n` +
      `  ${c.bold(start.verificationUri)}\n` +
      `  code: ${c.bold(start.userCode)}\n\n`,
  );
  if (!flags["no-browser"]) {
    openBrowser(start.verificationUriComplete);
  }
  process.stdout.write(c.dim("waiting for browser approval…\n"));

  const intervalMs = Math.max(1000, start.interval * 1000);
  const deadline = Date.now() + start.expiresIn * 1000;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    const result = await poll(base, start.deviceCode);
    if (result.status === "pending") continue;
    if (result.status === "denied") {
      process.stderr.write(`${c.red("✗")} denied in browser\n`);
      process.exit(1);
    }
    if (result.status === "expired") {
      process.stderr.write(
        `${c.red("✗")} code expired — re-run \`fleets login\`\n`,
      );
      process.exit(1);
    }
    if (result.status === "consumed") {
      process.stderr.write(
        `${c.red("✗")} token already claimed — re-run \`fleets login\`\n`,
      );
      process.exit(1);
    }
    if (result.status === "approved") {
      await writeConfig({ token: result.token });
      process.stdout.write(
        `${c.green("✓")} authorized as ${c.bold(result.name)}  ` +
          c.dim("(saved to ~/.fleets/config.json)\n"),
      );
      return;
    }
  }
  process.stderr.write(`${c.red("✗")} timed out waiting for approval\n`);
  process.exit(1);
}

async function poll(base: string, deviceCode: string): Promise<PollResp> {
  const r = await fetch(`${base}/api/auth/device/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceCode }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`poll ${r.status}: ${text.slice(0, 200)}`);
  }
  return (await r.json()) as PollResp;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.unref();
  } catch {
    // ignored — the URL is printed; user can click it.
  }
}
