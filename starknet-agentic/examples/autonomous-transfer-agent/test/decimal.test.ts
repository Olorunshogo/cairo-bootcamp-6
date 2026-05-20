import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareDecimalStrings,
  isZeroAddress,
  subtractDecimalStrings,
} from "../src/decimal.js";

describe("compareDecimalStrings", () => {
  it("compares integers", () => {
    assert.equal(compareDecimalStrings("10", "5"), 1);
    assert.equal(compareDecimalStrings("5", "10"), -1);
    assert.equal(compareDecimalStrings("7", "7"), 0);
  });

  it("compares fractional values", () => {
    assert.equal(compareDecimalStrings("10.5", "10.49"), 1);
    assert.equal(compareDecimalStrings("1.2", "1.20"), 0);
  });
});

describe("subtractDecimalStrings", () => {
  it("subtracts with decimals", () => {
    assert.equal(subtractDecimalStrings("10.5", "2.25"), "8.25");
  });

  it("throws on negative result", () => {
    assert.throws(() => subtractDecimalStrings("1", "5"));
  });
});

describe("isZeroAddress", () => {
  it("detects zero address", () => {
    assert.equal(
      isZeroAddress(
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      ),
      true,
    );
    assert.equal(isZeroAddress("0x1"), false);
  });
});
