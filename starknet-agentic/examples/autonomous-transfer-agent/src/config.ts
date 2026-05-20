import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import { resolveAgentRoot } from "./paths.js";
import { AgentConfigSchema, type AgentConfig } from "./types.js";

const AGENT_ROOT = resolveAgentRoot();

const ProfilesEnvelopeSchema = z.object({
  profiles: z.record(z.string(), z.unknown()),
  activeProfile: z.string().min(1),
});

export interface RuntimeEnv {
  rpcUrl: string;
  accountAddress: string;
  privateKey?: string;
  signerMode: "direct" | "proxy";
  mcpEntry: string;
  mcpPolicy?: string;
  mcpPolicyPath?: string;
  paymasterApiKey?: string;
  paymasterFeeMode?: string;
  spendingTokenAddress?: string;
}

export function resolveConfigPath(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  const fromEnv = process.env.AGENT_CONFIG_PATH;
  if (fromEnv) return path.resolve(fromEnv);
  const local = path.join(AGENT_ROOT, "agent.config.json");
  if (fs.existsSync(local)) return local;
  return path.join(AGENT_ROOT, "agent.config.example.json");
}

export function loadAgentConfig(
  configPath?: string,
  profileName?: string,
): AgentConfig {
  const resolved = resolveConfigPath(configPath);
  const raw = JSON.parse(fs.readFileSync(resolved, "utf8")) as unknown;

  const direct = AgentConfigSchema.safeParse(raw);
  if (direct.success) {
    return direct.data;
  }

  const envelope = ProfilesEnvelopeSchema.parse(raw);
  const name = profileName ?? envelope.activeProfile;
  const profileRaw = envelope.profiles[name];
  if (!profileRaw) {
    throw new Error(`Profile not found: ${name}`);
  }

  const parsed = AgentConfigSchema.safeParse(profileRaw);
  if (!parsed.success) {
    throw new Error(`Invalid profile "${name}": ${parsed.error.message}`);
  }
  return parsed.data;
}

export function resolveMcpEntry(): string {
  const fromEnv = process.env.MCP_ENTRY_PATH;
  if (fromEnv) return path.resolve(fromEnv);

  const defaultPath = path.resolve(
    AGENT_ROOT,
    "../../packages/starknet-mcp-server/dist/index.js",
  );
  if (fs.existsSync(defaultPath)) return defaultPath;

  throw new Error(
    "MCP server entry not found. Build starknet-mcp-server or set MCP_ENTRY_PATH.",
  );
}

export function loadRuntimeEnv(): RuntimeEnv {
  const rpcUrl =
    process.env.STARKNET_RPC_URL ||
    "https://starknet-sepolia.public.blastapi.io/rpc/v0_9";
  const accountAddress = process.env.STARKNET_ACCOUNT_ADDRESS;
  if (!accountAddress) {
    throw new Error("STARKNET_ACCOUNT_ADDRESS is required");
  }

  const signerMode =
    process.env.STARKNET_SIGNER_MODE === "proxy" ? "proxy" : "direct";

  return {
    rpcUrl,
    accountAddress,
    privateKey: process.env.STARKNET_PRIVATE_KEY,
    signerMode,
    mcpEntry: resolveMcpEntry(),
    mcpPolicy: process.env.STARKNET_MCP_POLICY,
    mcpPolicyPath: process.env.STARKNET_MCP_POLICY_PATH,
    paymasterApiKey: process.env.AVNU_PAYMASTER_API_KEY,
    paymasterFeeMode: process.env.AVNU_PAYMASTER_FEE_MODE,
    spendingTokenAddress: process.env.SPENDING_TOKEN_ADDRESS || undefined,
  };
}

export function buildMcpSidecarEnv(
  runtime: RuntimeEnv,
): Record<string, string> {
  const keys = [
    "STARKNET_RPC_URL",
    "STARKNET_ACCOUNT_ADDRESS",
    "STARKNET_PRIVATE_KEY",
    "STARKNET_SIGNER_MODE",
    "KEYRING_PROXY_URL",
    "KEYRING_HMAC_SECRET",
    "KEYRING_CLIENT_ID",
    "KEYRING_SIGNING_KEY_ID",
    "AVNU_PAYMASTER_API_KEY",
    "AVNU_PAYMASTER_FEE_MODE",
    "STARKNET_MCP_POLICY",
    "STARKNET_MCP_POLICY_PATH",
  ];

  const env: Record<string, string> = {
    STARKNET_RPC_URL: runtime.rpcUrl,
    STARKNET_ACCOUNT_ADDRESS: runtime.accountAddress,
    STARKNET_SIGNER_MODE: runtime.signerMode,
  };

  if (runtime.privateKey) {
    env.STARKNET_PRIVATE_KEY = runtime.privateKey;
  }
  if (runtime.mcpPolicy) env.STARKNET_MCP_POLICY = runtime.mcpPolicy;
  if (runtime.mcpPolicyPath)
    env.STARKNET_MCP_POLICY_PATH = runtime.mcpPolicyPath;
  if (runtime.paymasterApiKey)
    env.AVNU_PAYMASTER_API_KEY = runtime.paymasterApiKey;
  if (runtime.paymasterFeeMode)
    env.AVNU_PAYMASTER_FEE_MODE = runtime.paymasterFeeMode;

  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0 && !(key in env)) {
      env[key] = value;
    }
  }

  return env;
}

export function mergeSpendingTokenAddress(
  config: AgentConfig,
  runtime: RuntimeEnv,
): AgentConfig {
  const envAddress = runtime.spendingTokenAddress;
  if (!envAddress || config.token !== "MTK") {
    return config;
  }

  return {
    ...config,
    spendingToken: {
      ...config.spendingToken,
      address: envAddress,
    },
  };
}
