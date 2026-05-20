import { z } from "zod";

export const StepStatusSchema = z.enum(["ok", "failed", "skipped"]);

export const StepResultSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: StepStatusSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  details: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
});

export type StepResult = z.infer<typeof StepResultSchema>;
export type StepStatus = z.infer<typeof StepStatusSchema>;

const DecimalAmountSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d+)?$/, "Must be a non-negative decimal amount");

const StarknetAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{1,64}$/, "Must be a valid Starknet hex address");

export const PostTransferHookSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("mcp_invoke"),
    contractAddress: StarknetAddressSchema.optional(),
    entrypoint: z.string().min(1),
    calldata: z.array(z.string()).default([]),
    gasfree: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("mcp_call"),
    contractAddress: StarknetAddressSchema.optional(),
    entrypoint: z.string().min(1),
    calldata: z.array(z.string()).default([]),
  }),
  z.object({
    type: z.literal("subagent"),
    prompt: z.string().min(1),
    description: z.string().optional(),
  }),
]);

export const AgentConfigSchema = z.object({
  network: z.enum(["sepolia", "mainnet"]),
  token: z.enum(["STRK", "MTK"]),
  minBalanceForTransfer: DecimalAmountSchema,
  lowBalanceAlertThreshold: DecimalAmountSchema,
  reserveBalance: DecimalAmountSchema,
  transfer: z.object({
    enabled: z.boolean(),
    recipient: StarknetAddressSchema,
    amount: DecimalAmountSchema,
    gasfree: z.boolean().default(false),
  }),
  spendingToken: z.object({
    address: z.string(),
    symbol: z.string().default("MTK"),
  }),
  postTransferHook: PostTransferHookSchema,
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type PostTransferHook = z.infer<typeof PostTransferHookSchema>;

export interface BalanceSnapshot {
  address: string;
  token: string;
  tokenAddress?: string;
  balance: string;
  raw?: string;
  decimals?: number;
}

export interface TransferValidation {
  shouldTransfer: boolean;
  reason: string;
  onChainTransferLimit?: string;
}

export interface TransferResult {
  status: "completed" | "simulated" | "skipped" | "failed";
  transactionHash?: string | null;
  dryRun?: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

export interface AlertEvent {
  level: "ALERT";
  event: "low_balance";
  token: string;
  balance: string;
  threshold: string;
  timestamp: string;
}

export interface AgentContext {
  runId: string;
  startedAt: string;
  config: AgentConfig;
  accountAddress: string;
  balance?: BalanceSnapshot;
  validation?: TransferValidation;
  transfer?: TransferResult;
  postHook?: StepResult;
  alerts: AlertEvent[];
  steps: StepResult[];
}

export interface RunReceipt {
  runId: string;
  startedAt: string;
  endedAt: string;
  config: AgentConfig;
  accountAddress: string;
  balance?: BalanceSnapshot;
  validation?: TransferValidation;
  transfer?: TransferResult;
  postHook?: StepResult;
  alerts: AlertEvent[];
  steps: StepResult[];
}

export interface McpClient {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  listTools(): Promise<string[]>;
  close(): Promise<void>;
}
