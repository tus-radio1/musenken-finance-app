import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SUBSIDY_STATUS_DISPLAY,
  TRANSACTION_STATUS_DISPLAY,
  getStatusDisplay,
} from "@/lib/status-display";

const EXPECTED_TRANSACTION_STATUSES = [
  "pending",
  "accepted",
  "approved",
  "rejected",
  "receipt_received",
  "refunded",
  "received",
];

const EXPECTED_SUBSIDY_STATUSES = [
  "pending",
  "accounting_received",
  "approved",
  "rejected",
  "application_in_progress",
  "application_rejected",
  "receipt_submitted",
  "receipt_received",
  "paid",
  "unexecuted",
];

const SEMANTIC_VARIANTS = new Set([
  "success",
  "warning",
  "info",
  "neutral",
  "danger",
]);

function countSourceMatches(directory: string, phrase: string): number {
  return readdirSync(directory, { withFileTypes: true }).reduce(
    (count, entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return count + countSourceMatches(path, phrase);
      if (!/\.(ts|tsx|css)$/.test(entry.name)) return count;
      return count + (readFileSync(path, "utf8").match(new RegExp(phrase, "g"))?.length ?? 0);
    },
    0,
  );
}

describe("status display registry", () => {
  it("maps every transaction and subsidy status to a label and semantic variant", () => {
    expect(Object.keys(TRANSACTION_STATUS_DISPLAY).sort()).toEqual(
      EXPECTED_TRANSACTION_STATUSES.sort(),
    );
    expect(Object.keys(SUBSIDY_STATUS_DISPLAY).sort()).toEqual(
      EXPECTED_SUBSIDY_STATUSES.sort(),
    );

    for (const display of [
      ...Object.values(TRANSACTION_STATUS_DISPLAY),
      ...Object.values(SUBSIDY_STATUS_DISPLAY),
    ]) {
      expect(display.label.length).toBeGreaterThan(0);
      expect(SEMANTIC_VARIANTS.has(display.variant)).toBe(true);
    }
  });

  it("keeps subsidy approval distinct from transaction approval", () => {
    expect(getStatusDisplay("subsidy", "approved").label).toBe("審査通過");
    expect(getStatusDisplay("transaction", "approved").label).toBe("承認済");
  });

  it("keeps approval labels in this registry only", () => {
    const sourceRoots = ["components", "app", "lib"];
    const count = (phrase: string) =>
      sourceRoots.reduce(
        (total, root) => total + countSourceMatches(join(process.cwd(), root), phrase),
        0,
      );

    expect(count("審査通過")).toBe(1);
    expect(count("承認済")).toBe(1);
  });
});
