import { describe, expect, it } from "vitest";
import {
  approvalFieldsForDecision,
  approvalFieldsForStatusChange,
} from "@/lib/transaction-approval";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-10-22T00:00:00.000Z";

describe("approvalFieldsForStatusChange", () => {
  it("undoes the decision when the status goes back to pending", () => {
    expect(approvalFieldsForStatusChange("pending", ACTOR_ID, NOW)).toEqual({
      approval_status: "pending",
      approved_by: null,
      approved_at: null,
      rejected_reason: null,
    });
  });

  it.each(["approved", "rejected"] as const)("records the editor as approver for %s", (status) => {
    expect(approvalFieldsForStatusChange(status, ACTOR_ID, NOW)).toEqual({
      approval_status: status,
      approved_by: ACTOR_ID,
      approved_at: NOW,
      rejected_reason: null,
    });
  });

  it.each(["accepted", "receipt_received", "refunded", "received"] as const)(
    "keeps the original approver for %s",
    (status) => {
      expect(approvalFieldsForStatusChange(status, ACTOR_ID, NOW)).toEqual({
        approval_status: status,
        rejected_reason: null,
      });
    },
  );
});

describe("approvalFieldsForDecision", () => {
  it("drops a reason on approval and keeps it on rejection", () => {
    expect(approvalFieldsForDecision("approved", ACTOR_ID, NOW, "x")).toMatchObject({
      rejected_reason: null,
    });
    expect(approvalFieldsForDecision("rejected", ACTOR_ID, NOW, "x")).toMatchObject({
      rejected_reason: "x",
    });
    expect(approvalFieldsForDecision("rejected", ACTOR_ID, NOW, "")).toMatchObject({
      rejected_reason: null,
    });
  });
});
