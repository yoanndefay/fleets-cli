import { api } from "../http.js";
import { resolveSiteProperty } from "./helpers.js";

export async function cmdQuery(
  positional: string[],
  _flags: Record<string, string | boolean>,
): Promise<void> {
  const [slug, query] = positional;
  if (!slug || !query) {
    process.stderr.write('usage: fleets <slug> query "<question>"\n');
    process.exit(2);
  }
  const { property } = await resolveSiteProperty(slug);
  const m = query.match(/(\d+)\s*(d|h)/i);
  const days = m
    ? m[2].toLowerCase() === "d"
      ? Number(m[1])
      : Math.max(1, Math.round(Number(m[1]) / 24))
    : 7;
  const data = await api<unknown>(`/api/ga?view=summary&days=${days}&property=${property}`);
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}
