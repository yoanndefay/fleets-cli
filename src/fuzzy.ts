// Tiny fuzzy matcher used to repair typos at the dispatcher.
// Two heuristics:
//   1. Prefix/contains  → very high confidence (e.g. "source" → "sources")
//   2. Edit distance ≤ N → autocorrect when N=1, suggest when N=2
//
// Tabs and slugs are short tokens — Levenshtein on lowercase strings is fast
// enough and predictable. We don't need to ship a fuse.js for this.

export type Match = { value: string; distance: number; reason: "prefix" | "contains" | "edit" };

export function closeMatches(input: string, candidates: string[]): Match[] {
  const lower = input.toLowerCase();
  const matches: Match[] = [];
  for (const c of candidates) {
    const cl = c.toLowerCase();
    if (cl === lower) continue; // exact match handled by caller
    if (cl.startsWith(lower) || lower.startsWith(cl)) {
      matches.push({ value: c, distance: Math.abs(cl.length - lower.length), reason: "prefix" });
      continue;
    }
    if (cl.includes(lower) || lower.includes(cl)) {
      matches.push({ value: c, distance: Math.abs(cl.length - lower.length), reason: "contains" });
      continue;
    }
    const d = levenshtein(cl, lower);
    // Only keep if reasonably close — distance > 3 is not a typo, it's a different word.
    if (d <= 2 || (d === 3 && cl.length >= 6)) {
      matches.push({ value: c, distance: d, reason: "edit" });
    }
  }
  matches.sort((a, b) => a.distance - b.distance || a.value.localeCompare(b.value));
  return matches;
}

// Returns the single best autocorrect, or null when ambiguous / no good guess.
// "Autocorrect" = silently run the match. Caller may print a hint.
export function autocorrect(input: string, candidates: string[]): string | null {
  const matches = closeMatches(input, candidates);
  if (matches.length === 0) return null;
  const best = matches[0]!;
  // Strong signals — confidently rewrite:
  //   1. Prefix or contains match (e.g. "source" → "sources").
  //   2. Single edit-distance, and no second match is close enough to be ambiguous.
  if (best.reason === "prefix" || best.reason === "contains") {
    // If two prefixes match (e.g. "s" prefix of both "sources" and "speed"),
    // bail out so the user disambiguates.
    const otherClose = matches[1];
    if (otherClose && otherClose.reason !== "edit" && otherClose.distance <= best.distance + 1) {
      return null;
    }
    return best.value;
  }
  if (best.reason === "edit" && best.distance <= 2) {
    // Distance 1 always wins unless there's a tie. Distance 2 only wins when
    // no other candidate is within 2 — protects against ambiguous corrections.
    const otherClose = matches[1];
    if (best.distance === 1) {
      if (otherClose && otherClose.distance === 1) return null;
      return best.value;
    }
    if (otherClose && otherClose.distance <= 2) return null;
    return best.value;
  }
  return null;
}

// Damerau-Levenshtein — same as Levenshtein but adjacent transposition counts
// as a single edit. That's important: human typos like "camapigns" vs
// "campaigns" are one transposition, and plain Levenshtein would charge 2.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  // Two prior rows for transposition lookup.
  let prevPrev: number[] = new Array(n + 1).fill(0);
  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr: number[] = new Array(n + 1).fill(0);
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1]! + 1, // insertion
        prev[j]! + 1, // deletion
        prev[j - 1]! + cost, // substitution
      );
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        curr[j] = Math.min(curr[j]!, prevPrev[j - 2]! + 1); // transposition
      }
    }
    prevPrev = prev;
    prev = curr;
  }
  return prev[n]!;
}
