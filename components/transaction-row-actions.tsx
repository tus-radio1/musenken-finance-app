"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteTransaction } from "@/app/actions";
import { toast } from "sonner";
import { TransactionForm } from "@/components/transaction-form";

type Props = {
  transaction: any;
  categories: any[];
  canEdit: boolean;
  canDelete: boolean;
  userRole?: "admin" | "accounting" | "general" | null;
  users?: { id: string; name: string }[];
  accountingUserId?: string;
};

export function TransactionRowActions({
  transaction,
  categories,
  canEdit,
  canDelete,
  userRole,
  users,
  accountingUserId,
}: Props) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = async () => {
    const res = await deleteTransaction(transaction.id);
    if ((res as any).error) {
      toast.error((res as any).error);
    } else {
      toast.success("削除しました");
      window.dispatchEvent(new Event("ledger-refresh"));
    }
  };

  if (!canEdit && !canDelete) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">メニューを開く</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
            <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              編集
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setShowDeleteDialog(true);
              }}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              削除
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>レコードの削除</AlertDialogTitle>
            <AlertDialogDescription>
              このレコードを削除しますか？この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {canEdit && (
        <TransactionForm
          categories={categories}
          initialData={transaction}
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          triggerButton={<span className="hidden" />}
          userRole={userRole}
          users={users}
          accountingUserId={accountingUserId}
        />
      )}
    </>
  );
}
