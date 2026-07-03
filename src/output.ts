export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

export function printTable(
  rows: Array<Record<string, string | number>>,
  columns?: string[],
): void {
  if (rows.length === 0) {
    process.stdout.write("(no data)\n");
    return;
  }
  const cols = columns ?? Object.keys(rows[0]);
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)),
  );
  const header = cols.map((c, i) => c.padEnd(widths[i])).join("  ");
  process.stdout.write(header + "\n");
  process.stdout.write(widths.map((w) => "-".repeat(w)).join("  ") + "\n");
  for (const row of rows) {
    const line = cols.map((c, i) => String(row[c] ?? "").padEnd(widths[i])).join("  ");
    process.stdout.write(line + "\n");
  }
}

export function out(
  data: unknown,
  flags: Record<string, string | boolean>,
): void {
  if (flags.json) {
    printJson(data);
    return;
  }
  if (Array.isArray(data)) {
    printTable(data as Array<Record<string, string | number>>);
  } else {
    printJson(data);
  }
}
