/** Compare non-negative decimal strings. Returns -1 | 0 | 1 */
export function compareDecimalStrings(a: string, b: string): number {
  const [aInt, aFrac = ""] = a.split(".");
  const [bInt, bFrac = ""] = b.split(".");

  const intCmp = compareIntegerStrings(aInt, bInt);
  if (intCmp !== 0) return intCmp;

  const maxFrac = Math.max(aFrac.length, bFrac.length);
  const aPadded = aFrac.padEnd(maxFrac, "0");
  const bPadded = bFrac.padEnd(maxFrac, "0");
  return aPadded.localeCompare(bPadded);
}

function compareIntegerStrings(a: string, b: string): number {
  const aNorm = a.replace(/^0+/, "") || "0";
  const bNorm = b.replace(/^0+/, "") || "0";
  if (aNorm.length !== bNorm.length) {
    return aNorm.length > bNorm.length ? 1 : -1;
  }
  return aNorm.localeCompare(bNorm);
}

export function subtractDecimalStrings(a: string, b: string): string {
  if (compareDecimalStrings(a, b) < 0) {
    throw new Error(`Cannot subtract ${b} from ${a}: negative result`);
  }

  const [aInt, aFrac = ""] = a.split(".");
  const [bInt, bFrac = ""] = b.split(".");
  const scale = Math.max(aFrac.length, bFrac.length);
  const aScaled = BigInt(aInt + aFrac.padEnd(scale, "0"));
  const bScaled = BigInt(bInt + bFrac.padEnd(scale, "0"));
  const diff = aScaled - bScaled;

  if (scale === 0) return diff.toString();

  const raw = diff.toString().padStart(scale + 1, "0");
  const splitAt = raw.length - scale;
  const intPart = raw.slice(0, splitAt).replace(/^0+/, "") || "0";
  const fracPart = raw.slice(splitAt).replace(/0+$/, "") || "0";
  if (fracPart === "0") return intPart;
  return `${intPart}.${fracPart}`;
}

export function isZeroAddress(address: string): boolean {
  try {
    return BigInt(address) === BigInt(0);
  } catch {
    return false;
  }
}
