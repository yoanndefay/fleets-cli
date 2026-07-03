import { api } from "../http.js";
import { resolveSiteProperty } from "./helpers.js";
import { parseRange } from "../range.js";

export async function cmdExport(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const slug = positional[0];
  if (!slug) {
    process.stderr.write("usage: fleets <slug> export [--range 30d] [--format json|csv]\n");
    process.exit(2);
  }
  const { property } = await resolveSiteProperty(slug);
  const range = parseRange(flags, 30);
  const fmt = String(flags.format ?? "json").toLowerCase();
  const rows = await api<{ date: string; value: number }[]>(
    `/api/ga?view=daily&days=${range}&metric=sessions&property=${property}`,
  );
  if (fmt === "csv") {
    process.stdout.write("date,sessions\n");
    for (const r of rows) {
      process.stdout.write(`${r.date},${r.value}\n`);
    }
  } else {
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
  }
}
