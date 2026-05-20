import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function resolveAgentRoot(): string {
  return path.resolve(__dirname, "..");
}
