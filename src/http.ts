import { apiUrl, readConfig, token } from "./config.js";

export type ApiInit = Omit<RequestInit, "body"> & {
  // Replaces RequestInit.body with a JSON-friendly object that we
  // serialize for the caller. Pass `null` / `undefined` for no body.
  body?: unknown;
};

export async function api<T = unknown>(
  path: string,
  init?: ApiInit,
): Promise<T> {
  const cfg = await readConfig();
  const tok = token(cfg);
  if (!tok) throw new Error("not logged in — run `fleets login`");
  const { body, headers, ...rest } = init ?? {};
  const r = await fetch(`${apiUrl(cfg)}${path}`, {
    ...rest,
    headers: {
      ...(headers ?? {}),
      Authorization: `Bearer ${tok}`,
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    let msg: string | null = null;
    try {
      const j = JSON.parse(text);
      if (j && typeof j.error === "string") msg = j.error;
    } catch {
      // not JSON
    }
    if (!msg) {
      // HTML error pages or huge bodies are not useful in a terminal —
      // collapse to a one-liner the user can act on.
      msg = text.trim().startsWith("<")
        ? r.status === 404
          ? "endpoint not found (server may be running an older build)"
          : "non-JSON response from server"
        : text.slice(0, 200);
    }
    throw new Error(`${r.status} ${msg}`);
  }
  return r.json() as Promise<T>;
}
