import { cmdEdge } from "./edge.js";

export async function cmdBots(
  positional: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  return cmdEdge(positional, flags);
}
