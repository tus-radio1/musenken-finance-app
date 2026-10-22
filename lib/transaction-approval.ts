/**
 * 取引の承認項目（approval_status / approved_by / approved_at /
 * rejected_reason）の更新内容を組み立てる純粋関数。
 */

import type { Database, TablesUpdate } from "@/lib/database.types";

export type ApprovalStatus = Database["public"]["Enums"]["approval_status"];

export type ApprovalFields = Pick<
  TablesUpdate<"transactions">,
  "approval_status" | "approved_by" | "approved_at" | "rejected_reason"
>;

/** Marker stored in audit rows for an admin's correction of their own row. */
export const ADMIN_SELF_ROW_CORRECTION = "admin_self_row_correction";

/**
 * Fields written when an admin / 会計 changes the status directly in the edit
 * form. Only a real status change is passed in.
 *   - pending: the decision is undone (approver, time and reason cleared)
 *   - approved / rejected: the editor becomes the approver
 *   - later statuses (accepted, refunded, ...): the original approver is kept
 */
export function approvalFieldsForStatusChange(
  status: ApprovalStatus,
  actorId: string,
  now: string,
): ApprovalFields {
  if (status === "pending") {
    return {
      approval_status: status,
      approved_by: null,
      approved_at: null,
      rejected_reason: null,
    };
  }
  if (status === "approved" || status === "rejected") {
    return {
      approval_status: status,
      approved_by: actorId,
      approved_at: now,
      rejected_reason: null,
    };
  }
  return { approval_status: status, rejected_reason: null };
}

/** Fields written by the normal approval action (pending → approved / rejected). */
export function approvalFieldsForDecision(
  status: "approved" | "rejected",
  actorId: string,
  now: string,
  reason?: string,
): ApprovalFields {
  return {
    approval_status: status,
    approved_by: actorId,
    approved_at: now,
    rejected_reason: status === "rejected" ? reason || null : null,
  };
}
