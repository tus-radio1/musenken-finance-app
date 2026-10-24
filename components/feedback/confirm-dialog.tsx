"use client";

import { useRef, useState, type ReactElement, type ReactNode } from "react";
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
  // A ref blocks a double click that lands before the disabled state renders.
  const inFlight = useRef(false);
  const buttonsDisabled = pending || isConfirming;

  const handleOpenChange = (nextOpen: boolean) => {
    if (buttonsDisabled) return;
    onOpenChange(nextOpen);
  };

  const handleConfirm = async () => {
    if (inFlight.current || buttonsDisabled) return;
    inFlight.current = true;
    setIsConfirming(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      inFlight.current = false;
      setIsConfirming(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className={DIALOG_WIDTH_CLASS.confirm}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={buttonsDisabled}>
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
