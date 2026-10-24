import { describe, expect, it, vi } from "vitest";
import {
  areConfirmDialogButtonsDisabled,
  runConfirmDialogDecision,
  type ConfirmDialogState,
} from "./confirm-dialog";

describe("ConfirmDialog decision logic", () => {
  it("does not run the action when cancelled", () => {
    const state: ConfirmDialogState = { pending: false, confirmed: false };
    const onConfirm = vi.fn();

    const result = runConfirmDialogDecision("cancel", state, onConfirm);

    expect(result).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("runs the action only once when confirmed", () => {
    const state: ConfirmDialogState = { pending: false, confirmed: false };
    const onConfirm = vi.fn();

    expect(runConfirmDialogDecision("confirm", state, onConfirm)).toBe(true);
    expect(runConfirmDialogDecision("confirm", state, onConfirm)).toBe(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while pending", () => {
    expect(areConfirmDialogButtonsDisabled(true)).toBe(true);
    expect(areConfirmDialogButtonsDisabled(false)).toBe(false);
  });
});
