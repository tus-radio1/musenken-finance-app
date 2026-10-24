"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteGroupYearData } from "../actions";
import { DIALOG_WIDTH_CLASS } from "@/components/layout/page-shell";

type DeleteGroupYearButtonProps = {
  groupId: string;
  groupName: string;
  fiscalYear: number;
};

export function DeleteGroupYearButton({
  groupId,
  groupName,
  fiscalYear,
}: DeleteGroupYearButtonProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteGroupYearData(groupId, fiscalYear);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          aria-label="年度予算を削除"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className={DIALOG_WIDTH_CLASS.confirm}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {`「${groupName}」の${fiscalYear}年度データを削除しますか？`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            この操作は取り消せません。予算データおよびすべての出納帳（取引記録）が完全に削除されます。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            キャンセル
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? "削除中..." : "削除する"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
