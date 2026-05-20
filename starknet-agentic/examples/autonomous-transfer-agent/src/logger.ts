import fs from "node:fs";
import path from "node:path";

import type { AlertEvent, RunReceipt } from "./types.js";
import { resolveAgentRoot } from "./paths.js";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "ALERT";

export interface LogPayload {
  timestamp: string;
  level: LogLevel;
  component: string;
  event?: string;
  message: string;
  [key: string]: unknown;
}

const COMPONENT = "autonomous-transfer-agent";

export function log(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
): void {
  const payload: LogPayload = {
    timestamp: new Date().toISOString(),
    level,
    component: COMPONENT,
    message,
    ...data,
  };
  const line = JSON.stringify(payload);
  if (level === "ERROR") {
    console.error(line);
  } else if (level === "WARN" || level === "ALERT") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logAlert(alert: AlertEvent): void {
  log("ALERT", "Low balance threshold breached", {
    event: alert.event,
    token: alert.token,
    balance: alert.balance,
    threshold: alert.threshold,
  });
}

export function receiptsDir(): string {
  const dir = path.join(resolveAgentRoot(), "receipts");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeReceipt(receipt: RunReceipt): string {
  const dir = receiptsDir();
  const safeIso = receipt.startedAt.replace(/[:.]/g, "-");
  const filePath = path.join(
    dir,
    `run-${safeIso}-${receipt.runId.slice(0, 8)}.json`,
  );
  fs.writeFileSync(filePath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  const latestPath = path.join(dir, "execution-receipt.json");
  fs.writeFileSync(latestPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  return filePath;
}

export function writeLatestAlert(alert: AlertEvent): string {
  const dir = receiptsDir();
  const filePath = path.join(dir, "latest-alert.json");
  fs.writeFileSync(filePath, `${JSON.stringify(alert, null, 2)}\n`, "utf8");
  return filePath;
}
