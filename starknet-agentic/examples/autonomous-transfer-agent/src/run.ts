#!/usr/bin/env -S npx tsx
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildMcpSidecarEnv,
  loadAgentConfig,
  loadRuntimeEnv,
  mergeSpendingTokenAddress,
} from "./config.js";
import { log } from "./logger.js";
import { McpSidecar } from "./mcp.js";
import { runPipeline } from "./steps/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

function parseArgs(argv: string[]): {
  configPath?: string;
  dryRunOnly: boolean;
  profile?: string;
} {
  let configPath: string | undefined;
  let dryRunOnly = false;
  let profile: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run" || arg === "--dry-run-only") {
      dryRunOnly = true;
    } else if (arg === "--config" && argv[i + 1]) {
      configPath = argv[++i];
    } else if (arg === "--profile" && argv[i + 1]) {
      profile = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: npx tsx src/run.ts [options]

Options:
  --config <path>     Agent config JSON (default: agent.config.json)
  --profile <name>    Profile from profiles file (e.g. strk-sepolia)
  --dry-run           Simulate transfer only (no live tx)
  --help              Show this help
`);
      process.exit(0);
    }
  }

  return { configPath, dryRunOnly, profile };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runtime = loadRuntimeEnv();

  if (!runtime.privateKey && runtime.signerMode === "direct") {
    throw new Error("STARKNET_PRIVATE_KEY is required for direct signer mode");
  }

  let config = loadAgentConfig(args.configPath, args.profile);
  config = mergeSpendingTokenAddress(config, runtime);

  const mcpEnv = buildMcpSidecarEnv(runtime);
  const sidecar = new McpSidecar(runtime.mcpEntry, mcpEnv);

  log("INFO", "Connecting MCP sidecar", {
    mcpEntry: runtime.mcpEntry,
    account: runtime.accountAddress,
    token: config.token,
    profile: args.profile,
    dryRunOnly: args.dryRunOnly,
  });

  await sidecar.connect("main");
  const tools = await sidecar.listTools();
  log("INFO", "MCP tools available", { count: tools.length });

  const required = [
    "starknet_get_balance",
    "starknet_transfer",
    "starknet_call_contract",
  ];
  const missing = required.filter((t) => !tools.includes(t));
  if (missing.length > 0) {
    throw new Error(`Missing required MCP tools: ${missing.join(", ")}`);
  }

  try {
    const receipt = await runPipeline(sidecar, config, runtime.accountAddress, {
      dryRunOnly: args.dryRunOnly,
    });

    const failed = receipt.steps.some((s) => s.status === "failed");
    if (failed || receipt.transfer?.status === "failed") {
      process.exitCode = 1;
    }
  } finally {
    await sidecar.close();
  }
}

main().catch((error) => {
  log("ERROR", "Agent run failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
