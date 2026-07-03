// Shared visual rendering — Bloomberg-style monospace blocks for the Fleets CLI.
// Each helper is pure: takes data + a colorizer and returns a string (or writes a
// formatted block to stdout). Color is auto-disabled when stdout is not a TTY or
// when NO_COLOR is set. --no-color forces it off.

export type Colorize = ReturnType<typeof colorize>;

export function colorize(on?: boolean): {
  bold: (s: string) => string;
  dim: (s: string) => string;
  cyan: (s: string) => string;
  green: (s: string) => string;
  red: (s: string) => string;
  yellow: (s: string) => string;
  magenta: (s: string) => string;
  blue: (s: string) => string;
  bar: (s: string) => string;
  track: (s: string) => string;
  spark: (s: string) => string;
} {
  const tty = process.stdout.isTTY ?? false;
  const env = !process.env.NO_COLOR;
  const enabled = on ?? (tty && env);
  const w = (code: string) => (s: string) =>
    enabled ? `\x1b[${code}m${s}\x1b[0m` : s;
  return {
    bold: w("1"),
    dim: w("2"),
    cyan: w("36"),
    green: w("32"),
    red: w("31"),
    yellow: w("33"),
    magenta: w("35"),
    blue: w("34"),
    bar: w("38;5;87"),
    track: w("38;5;238"),
    spark: w("38;5;87"),
  };
}

export function colorFromFlags(flags: Record<string, string | boolean>): Colorize {
  const off = flags["no-color"] === true || flags.color === "never";
  if (off) return colorize(false);
  if (flags.color === "always") return colorize(true);
  return colorize();
}

const NUM = new Intl.NumberFormat("en-US");

export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return NUM.format(Math.round(n));
}

export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a < 1000) return String(Math.round(n));
  if (a < 1e6) return `${(n / 1000).toFixed(a < 10_000 ? 1 : 0)}K`;
  if (a < 1e9) return `${(n / 1e6).toFixed(a < 10e6 ? 1 : 0)}M`;
  return `${(n / 1e9).toFixed(1)}B`;
}

export function fmtPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  // Convention: caller passes a number where 1.0 represents 100%.
  // But GA engagementRate / GSC ctr are already in 0..1 — same convention.
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtPctRaw(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a < 1024) return `${n} B`;
  if (a < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (a < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (a < 1024 ** 4) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  return `${(n / 1024 ** 4).toFixed(2)} TB`;
}

export function fmtMs(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n < 1000) return `${Math.round(n)}ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(1)}s`;
  const m = Math.floor(n / 60_000);
  const s = Math.round((n % 60_000) / 1000);
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, Math.max(0, n - 1)) + "…";
}

export function bar(pct: number, width: number, c: Colorize): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  return c.bar("█".repeat(filled)) + c.track("░".repeat(width - filled));
}

// Renders a key/value block — two columns, right-aligned values.
// Optional unit column (e.g., "▲ 12%"). Unit column auto-aligns when present.
export type KvRow =
  | { key: string; value: string; unit?: string }
  | { rule: true };

export function renderKv(rows: KvRow[], c: Colorize): string {
  const data = rows.filter((r): r is { key: string; value: string; unit?: string } => !("rule" in r));
  const keyW = Math.max(0, ...data.map((r) => r.key.length));
  const valW = Math.max(0, ...data.map((r) => stripAnsi(r.value).length));
  const out: string[] = [];
  for (const r of rows) {
    if ("rule" in r) {
      out.push(c.dim("─".repeat(keyW + valW + 6)));
      continue;
    }
    const key = c.dim(r.key.padEnd(keyW));
    const val = c.bold(padStartAnsi(r.value, valW));
    const unit = r.unit ? "  " + r.unit : "";
    out.push(`${key}  ${val}${unit}`);
  }
  return out.join("\n");
}

export function deltaStr(d: number | null | undefined, c: Colorize): string {
  if (d == null || !Number.isFinite(d)) return c.dim("    —");
  const sign = d >= 0 ? "▲" : "▼";
  const txt = `${sign} ${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
  return d >= 0 ? c.green(txt) : c.red(txt);
}

export function sectionHeader(title: string, sub: string, c: Colorize): string {
  return `${c.bold(title)}  ${c.dim(sub)}`;
}

// Top-N table with a horizontal bar showing share of the leading value.
// columns: label first, then numeric columns (formatted by caller).
// barOn: name of the numeric column used to scale the bar.
export type TopRow = { label: string; values: Record<string, number>; raw?: string };

export function renderTopTable(
  rows: TopRow[],
  opts: {
    labelHeader: string;
    columns: Array<{
      key: string;
      header: string;
      fmt: (n: number) => string;
      bar?: boolean; // draw bar against this column
    }>;
    labelWidth?: number;
    barWidth?: number;
    c: Colorize;
  },
): string {
  const { c, columns } = opts;
  if (rows.length === 0) return c.dim("(no data)");
  const labelW = opts.labelWidth ?? Math.min(48, Math.max(opts.labelHeader.length, ...rows.map((r) => r.label.length)));
  const barWidth = opts.barWidth ?? 20;
  const barCol = columns.find((c) => c.bar);
  const max = barCol ? Math.max(1, ...rows.map((r) => r.values[barCol.key] ?? 0)) : 0;

  // Compute column widths from formatted values
  const colWidths = columns.map((col) =>
    Math.max(col.header.length, ...rows.map((r) => col.fmt(r.values[col.key] ?? 0).length)),
  );

  const headerCells = [
    c.dim(opts.labelHeader.padEnd(labelW)),
    ...columns.map((col, i) => c.dim(col.header.padStart(colWidths[i]!))),
  ];
  if (barCol) headerCells.push(c.dim("share".padStart(barWidth)));

  const lines: string[] = [headerCells.join("  ")];
  for (const r of rows) {
    const cells: string[] = [
      c.bold(truncate(r.label, labelW).padEnd(labelW)),
      ...columns.map((col, i) => col.fmt(r.values[col.key] ?? 0).padStart(colWidths[i]!)),
    ];
    if (barCol) {
      const v = r.values[barCol.key] ?? 0;
      const pct = (v / max) * 100;
      cells.push(bar(pct, barWidth, c));
    }
    lines.push(cells.join("  "));
  }
  return lines.join("\n");
}

// Simple breakdown: name + count + bar (no headers). Used for small inline blocks.
export function renderBreakdown(
  rows: Array<{ label: string; value: number; pct?: number }>,
  opts: { labelWidth?: number; barWidth?: number; fmt?: (n: number) => string; c: Colorize },
): string {
  const c = opts.c;
  if (rows.length === 0) return c.dim("(no data)");
  const f = opts.fmt ?? fmtCompact;
  const labelW = opts.labelWidth ?? Math.min(28, Math.max(...rows.map((r) => r.label.length)));
  const barW = opts.barWidth ?? 18;
  const total = rows.reduce((a, r) => a + r.value, 0);
  const valW = Math.max(...rows.map((r) => f(r.value).length));
  return rows
    .map((r) => {
      const pct = r.pct ?? (total > 0 ? (r.value / total) * 100 : 0);
      const label = truncate(r.label, labelW).padEnd(labelW);
      const val = f(r.value).padStart(valW);
      const pctStr = `${pct.toFixed(1)}%`.padStart(6);
      return `${c.bold(label)}  ${val}  ${c.dim(pctStr)}  ${bar(pct, barW, c)}`;
    })
    .join("\n");
}

// Score gauge: 0–100 with red/yellow/green color band.
export function renderScore(value: number, width: number, c: Colorize): string {
  const v = Math.max(0, Math.min(100, value));
  const filled = Math.round((v / 100) * width);
  const colorFn = v >= 90 ? c.green : v >= 50 ? c.yellow : c.red;
  return colorFn("█".repeat(filled)) + c.track("░".repeat(width - filled));
}

// ---- ANSI-aware helpers (so padding doesn't break escape sequences) ----

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

export function padStartAnsi(s: string, n: number): string {
  const visible = stripAnsi(s).length;
  if (visible >= n) return s;
  return " ".repeat(n - visible) + s;
}

export function padEndAnsi(s: string, n: number): string {
  const visible = stripAnsi(s).length;
  if (visible >= n) return s;
  return s + " ".repeat(n - visible);
}
