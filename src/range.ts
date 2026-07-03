export function parseRange(
  flags: Record<string, string | boolean>,
  def = 7,
): number {
  const v = String(flags.range ?? `${def}d`);
  const m = v.match(/^(\d+)([dh])$/i);
  if (!m) return def;
  return m[2].toLowerCase() === "d"
    ? Number(m[1])
    : Math.max(1, Math.round(Number(m[1]) / 24));
}
