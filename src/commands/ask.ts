import { api } from "../http.js";
import { printJson } from "../output.js";
import { colorFromFlags, type Colorize } from "../render.js";

type Citation = {
  tool: string;
  args: Record<string, unknown>;
  cli: string;
};

type AskResponse = {
  answer: string;
  citations: Citation[];
  model: string;
};

export async function cmdAsk(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  // Two shapes:
  //   fleets ask "question"
  //   fleets <slug> ask "question"  →  slug-first dispatcher rewrites to: ask <slug> "question"
  //
  // We don't actually need the slug separately — the agent will resolve it.
  // But if a slug was passed (slug-first form), prepend "for site <slug>:" so
  // the model has the hint without us routing manually.
  const args = positional.slice();
  let prefix = "";
  // Heuristic: first positional that isn't quoted looks like a slug (no spaces).
  // If we got more than one positional and the first looks like a slug, treat it as one.
  if (args.length > 1 && /^[a-z0-9-]+$/.test(args[0]!)) {
    const slug = args.shift()!;
    prefix = `For site "${slug}": `;
  }
  const question = args.join(" ").trim();
  if (!question) {
    process.stderr.write(
      'usage: fleets ask "<question>"\n' +
        '       fleets <slug> ask "<question>"\n' +
        '       e.g. fleets ask "what\'s the traffic of fightbets today?"\n',
    );
    process.exit(2);
  }

  const model =
    typeof flags.model === "string" && ["haiku", "sonnet", "opus"].includes(flags.model)
      ? flags.model
      : "haiku";

  const c = colorFromFlags(flags);
  if (!flags.json) process.stdout.write(c.dim("thinking…\n"));

  const r = await api<AskResponse>("/api/ask", {
    method: "POST",
    body: { question: prefix + question, model },
  });

  if (flags.json) {
    printJson(r);
    return;
  }

  // Clear the "thinking…" line.
  process.stdout.write("\x1b[1A\x1b[2K");
  process.stdout.write(r.answer.trimEnd() + "\n");
  if (r.citations.length > 0) {
    process.stdout.write("\n" + c.dim("── ran ──") + "\n");
    for (const c2 of r.citations) {
      process.stdout.write(`  ${c.dim("$")} ${c.bold(c2.cli)}\n`);
    }
  }
  process.stdout.write(c.dim(`\n  ${r.model} · ${r.citations.length} tool call${r.citations.length === 1 ? "" : "s"}\n`));
  // pulled in to avoid unused-warning if we ever drop the model line
  void (null as unknown as Colorize);
}
