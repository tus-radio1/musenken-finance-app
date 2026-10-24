export type ConfirmDialogDecision = "cancel" | "confirm";

export type ConfirmDialogState = {
  pending: boolean;
  confirmed: boolean;
};

export function runConfirmDialogDecision(
  decision: ConfirmDialogDecision,
  state: ConfirmDialogState,
  onConfirm: () => void,
): boolean {
  if (decision !== "confirm" || state.pending || state.confirmed) return false;

  state.confirmed = true;
  onConfirm();
  return true;
}

export function areConfirmDialogButtonsDisabled(pending: boolean): boolean {
  return pending;
}
