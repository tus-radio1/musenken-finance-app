"use client";

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DIALOG_WIDTH_CLASS } from "@/components/layout/page-shell";
import {
  areConfirmDialogButtonsDisabled,
  runConfirmDialogDecision,
} from "@/lib/confirm-dialog";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  pending = false,
  onConfirm,
}: ConfirmDialogProps): ReactElement {
  const [isConfirming, setIsConfirming] = useState(false);
  const decisionState = useRef({ pending: false, confirmed: false });
  const buttonsDisabled = areConfirmDialogButtonsDisabled(
    pending || isConfirming,
  );

  useEffect(() => {
    decisionState.current.pending = buttonsDisabled;
    if (!open) decisionState.current.confirmed = false;
  }, [buttonsDisabled, open]);

  const handleConfirm = async () => {
    const canConfirm = runConfirmDialogDecision(
      "confirm",
      decisionState.current,
      () => setIsConfirming(true),
    );
    if (!canConfirm) return;

    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsConfirming(false);
      decisionState.current.confirmed = false;
    }
  };

  const handleCancel = () => {
    runConfirmDialogDecision("cancel", decisionState.current, () => undefined);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={DIALOG_WIDTH_CLASS.confirm}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={buttonsDisabled}
            onClick={handleCancel}
          >
            キャンセル
          </AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => void handleConfirm()}
            disabled={buttonsDisabled}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
