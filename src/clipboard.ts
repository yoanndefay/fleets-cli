import { spawn } from "node:child_process";

export type CopyResult = { ok: true } | { ok: false; reason: string };

// Copy text to the OS clipboard by shelling out to the native tool. Never
// throws — returns { ok: false, reason } so callers can fall back to stdout
// (headless boxes, CI, and SSH sessions have no clipboard). Linux tries
// Wayland then X11 tools in turn.
export async function copyToClipboard(text: string): Promise<CopyResult> {
  const candidates: Array<{ cmd: string; args: string[] }> =
    process.platform === "darwin"
      ? [{ cmd: "pbcopy", args: [] }]
      : process.platform === "win32"
        ? [{ cmd: "clip", args: [] }]
        : [
            { cmd: "wl-copy", args: [] },
            { cmd: "xclip", args: ["-selection", "clipboard"] },
            { cmd: "xsel", args: ["--clipboard", "--input"] },
          ];

  let lastReason = "no clipboard tool found";
  for (const { cmd, args } of candidates) {
    const res = await tryCopy(cmd, args, text);
    if (res.ok) return res;
    lastReason = res.reason;
    // Tool missing → try the next candidate; any other failure is terminal.
    if (res.reason !== NOT_FOUND) return res;
  }
  const hint =
    process.platform === "linux"
      ? "no clipboard tool found (install wl-clipboard, xclip, or xsel)"
      : lastReason;
  return { ok: false, reason: hint };
}

const NOT_FOUND = "not-found";

function tryCopy(cmd: string, args: string[], text: string): Promise<CopyResult> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args);
    } catch {
      resolve({ ok: false, reason: NOT_FOUND });
      return;
    }
    child.on("error", (err: NodeJS.ErrnoException) => {
      resolve({ ok: false, reason: err.code === "ENOENT" ? NOT_FOUND : String(err.message) });
    });
    child.on("close", (code) => {
      resolve(code === 0 ? { ok: true } : { ok: false, reason: `${cmd} exited with code ${code}` });
    });
    // Swallow EPIPE if the tool dies early; the close/error handler reports.
    child.stdin.on("error", () => {});
    child.stdin.end(text);
  });
}
