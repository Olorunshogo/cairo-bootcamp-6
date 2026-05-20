import type { AgentContext, McpClient } from "../types.js";
import { fetchBalance, resolveTokenProfile } from "../tokens.js";

export async function runFetchBalance(
  mcp: McpClient,
  ctx: AgentContext,
): Promise<AgentContext> {
  const profile = resolveTokenProfile(ctx.config);
  const balance = await fetchBalance(
    mcp,
    ctx.accountAddress,
    profile,
    ctx.config,
  );
  return { ...ctx, balance };
}
