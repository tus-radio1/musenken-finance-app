"use client";

/**
 * 支援金申請一覧: オーケストレーター
 * 状態管理とビジネスロジックを保持し、表示は components/subsidy/ 配下に委譲する。
 * 公開エクスポートパスは従来どおり @/components/subsidy-items-table を維持する。
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { updateMySubsidyItem, deleteMySubsidyItem } from "@/app/(authenticated)/subsidies/actions";
import { uploadReceiptAction } from "@/app/actions";
import { compressImageToWebp } from "@/lib/image";
import { getSortableDateValue } from "@/lib/date";
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
import {
  CATEGORY_TERMS,
  CATEGORY_EXPENSE_TYPES,
} from "@/lib/constants/subsidy";

import { ItemsFilterBar } from "@/components/subsidy/items-filter-bar";
import { ItemsDesktopTable } from "@/components/subsidy/items-desktop-table";
import { ItemsMobileCardList } from "@/components/subsidy/items-mobile-card-list";
import { ItemsEditDialog } from "@/components/subsidy/items-edit-dialog";
import type { SubsidyItem, SortKey, SortOrder, EditFormState } from "@/components/subsidy/types";

export function SubsidyItemsTable({
  items: initialItems,
  accountingGroups = [],
  isGlobalAdmin = false,
}: {
  items: SubsidyItem[];
  accountingGroups?: { id: string; name: string }[];
  isGlobalAdmin?: boolean;
}) {
  const [items, setItems] = useState<SubsidyItem[]>(initialItems);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  // --- フィルタ・ソート状態 ---
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [incomeTypeFilter, setIncomeTypeFilter] = useState<string>("all");
  const [accountingGroupFilter, setAccountingGroupFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());

  // --- 編集状態 ---
  const [editingItem, setEditingItem] = useState<SubsidyItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState>({
    category: "",
    term: "1",
    accounting_group_id: "",
    expense_type: "",
    name: "",
    requested_amount: 0,
    usage_period: "",
    income_type: "expense",
    date: new Date() as Date | undefined,
    justification: "",
    remarks: "",
  });
  const [file, setFile] = useState<File | null>(null);

  // --- 削除確認状態 ---
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingItem, setDeletingItem] = useState<SubsidyItem | null>(null);

  // --- ソート・トグル ---
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const toggleCard = (id: string) => {
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // --- フィルタリング ---
  const filtered = useMemo(() => {
    let result = [...items];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((item) =>
        item.name.toLowerCase().includes(q),
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((item) => item.status === statusFilter);
    }

    if (categoryFilter !== "all") {
      result = result.filter((item) => item.category === categoryFilter);
    }

    if (incomeTypeFilter !== "all") {
      result = result.filter((item) => item.income_type === incomeTypeFilter);
    }

    if (accountingGroupFilter !== "all") {
      result = result.filter((item) => item.accounting_group_id === accountingGroupFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "created_at") {
        const da = getSortableDateValue(a.created_at);
        const db = getSortableDateValue(b.created_at);
        cmp = da - db;
      } else if (sortKey === "requested_amount") {
        cmp = a.requested_amount - b.requested_amount;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return result;
  }, [items, searchQuery, statusFilter, categoryFilter, incomeTypeFilter, accountingGroupFilter, sortKey, sortOrder]);

  // --- 編集操作ハンドラ ---
  const handleEditClick = (item: SubsidyItem) => {
    setEditForm({
      category: item.category,
      term: item.term.toString(),
      accounting_group_id: item.accounting_group_id || "",
      expense_type: item.expense_type,
      name: item.name,
      requested_amount: item.requested_amount,
      usage_period: item.usage_period || "",
      income_type: item.income_type || "expense",
      date: item.date ? new Date(item.date) : new Date(),
      justification: item.justification || "",
      remarks: item.remarks || "",
    });
    setFile(null);
    setEditingItem(item);
  };

  const handleDeleteClick = (item: SubsidyItem) => {
    setDeletingItem(item);
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    const res = await deleteMySubsidyItem(deletingItem.id);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("削除しました");
      setItems((prev) => prev.filter((i) => i.id !== deletingItem.id));
    }
    setDeletingItem(null);
    setShowDeleteDialog(false);
  };

  const handleEditSubmit = async () => {
    if (!editingItem) return;
    setIsSubmitting(true);

    const isApproved = editingItem.status === "approved";
    let uploadedFileUrl = isApproved
      ? editingItem.receipt_url
      : editingItem.evidence_url ?? null;

    if (file) {
      try {
        const compressedFile = await compressImageToWebp(file);
        const fileExt = compressedFile.name.split(".").pop();
        const fileName = `${editingItem.id}_${Date.now()}.${fileExt}`;

        const formData = new FormData();
        formData.append("file", compressedFile);
        formData.append("fileName", fileName);
        const existingPath = isApproved
          ? editingItem.receipt_url
          : editingItem.evidence_url;
        if (existingPath) {
          formData.append("existingPath", existingPath);
        }

        const result = await uploadReceiptAction(formData);
        if (result.error) {
          toast.error(result.error);
          setIsSubmitting(false);
          return;
        }
        uploadedFileUrl = result.filePath;
      } catch (error) {
        console.error("Image processing error:", error);
        toast.error("画像の再処理またはアップロード中にエラーが発生しました");
        setIsSubmitting(false);
        return;
      }
    }

    let updateValues: Parameters<typeof updateMySubsidyItem>[1];
    if (isApproved) {
      updateValues = { receipt_url: uploadedFileUrl };
    } else {
      updateValues = {
        category: editForm.category,
        term: parseInt(editForm.term, 10),
        accounting_group_id: editForm.accounting_group_id || undefined,
        expense_type: editForm.expense_type,
        name: editForm.name,
        requested_amount: editForm.requested_amount,
        usage_period: editForm.usage_period || undefined,
        income_type: editForm.income_type || undefined,
        date: editForm.date || undefined,
        justification: editForm.justification || undefined,
        remarks: editForm.remarks || null,
        evidence_url: uploadedFileUrl,
      };
    }

    const result = await updateMySubsidyItem(editingItem.id, updateValues);
    setIsSubmitting(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("申請情報を更新しました");

      const publicBase = process.env.NEXT_PUBLIC_SUPABASE_URL
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/receipts/`
        : null;
      const buildPublicUrl = (path: string | null | undefined) =>
        path
          ? path.startsWith("http")
            ? path
            : publicBase
              ? `${publicBase}${path}`
              : null
          : null;

      const updatedGroup = accountingGroups.find(
        (g) => g.id === editForm.accounting_group_id,
      );

      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== editingItem.id) return i;
          if (isApproved) {
            return {
              ...i,
              receipt_url: uploadedFileUrl,
              receipt_public_url: buildPublicUrl(uploadedFileUrl),
            };
          }
          return {
            ...i,
            ...editForm,
            term: parseInt(editForm.term, 10),
            date: editForm.date
              ? editForm.date.toISOString().split("T")[0]
              : i.date,
            accounting_group_name: updatedGroup
              ? updatedGroup.name
              : i.accounting_group_name,
            evidence_url: uploadedFileUrl,
            evidence_public_url: buildPublicUrl(uploadedFileUrl),
          };
        }),
      );
      setEditingItem(null);
      setFile(null);
    }
  };

  const availableTerms = useMemo(
    () => CATEGORY_TERMS[editForm.category] || [1],
    [editForm.category],
  );

  const availableExpenseTypes = useMemo(
    () => CATEGORY_EXPENSE_TYPES[editForm.category] || [],
    [editForm.category],
  );

  /**
   * カテゴリ変更時に期と経費種別を自動リセットする。
   * B-4修正: editingItemが存在するときだけ実行し、
   * setEditFormの関数型更新で依存配列から editForm.term, editForm.expense_type を除外して
   * 無限ループを防ぐ。editingItem は安定参照（nullか同一オブジェクト）。
   */
  const resetDependentFields = useCallback(
    (category: string) => {
      if (!editingItem) return;

      const validTerms = CATEGORY_TERMS[category] || [1];
      const validExpenseTypes = CATEGORY_EXPENSE_TYPES[category] || [];

      setEditForm((prev) => {
        let updated = prev;
        if (!validTerms.includes(parseInt(prev.term, 10))) {
          updated = { ...updated, term: validTerms[0].toString() };
        }
        if (prev.expense_type && !validExpenseTypes.includes(prev.expense_type)) {
          updated = { ...updated, expense_type: validExpenseTypes[0] };
        }
        return updated;
      });
    },
    [editingItem],
  );

  // カテゴリ変更を検知して依存フィールドをリセット
  useEffect(() => {
    resetDependentFields(editForm.category);
  }, [editForm.category, resetDependentFields]);

  return (
    <div className="space-y-4">
      {/* フィルタ・検索バー */}
      <ItemsFilterBar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        incomeTypeFilter={incomeTypeFilter}
        onIncomeTypeFilterChange={setIncomeTypeFilter}
        accountingGroupFilter={accountingGroupFilter}
        onAccountingGroupFilterChange={setAccountingGroupFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        accountingGroups={accountingGroups}
      />

      {/* テーブル / カード表示 */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {items.length === 0
            ? "まだ支援金の申請はありません。"
            : "条件に一致する申請がありません。"}
        </p>
      ) : (
        <>
          {/* PC table (xl and above) */}
          <ItemsDesktopTable
            items={filtered}
            openCards={openCards}
            onToggleCard={toggleCard}
            onToggleSort={toggleSort}
            onEditClick={handleEditClick}
            onDeleteClick={handleDeleteClick}
            isGlobalAdmin={isGlobalAdmin}
          />

          {/* Mobile / Tablet card layout (below xl) */}
          <ItemsMobileCardList
            items={filtered}
            openCards={openCards}
            onToggleCard={toggleCard}
            onEditClick={handleEditClick}
            onDeleteClick={handleDeleteClick}
            isGlobalAdmin={isGlobalAdmin}
          />
        </>
      )}

      {/* Count display */}
      <p className="text-xs text-muted-foreground text-right">
        {filtered.length} / {items.length} 件表示
      </p>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>申請の削除</AlertDialogTitle>
            <AlertDialogDescription>
              この申請を削除しますか？この操作は元に戻せません。
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

      {/* Edit dialog */}
      <ItemsEditDialog
        editingItem={editingItem}
        onClose={() => setEditingItem(null)}
        editForm={editForm}
        onEditFormChange={setEditForm}
        onSubmit={handleEditSubmit}
        isSubmitting={isSubmitting}
        file={file}
        onFileChange={setFile}
        accountingGroups={accountingGroups}
        availableTerms={availableTerms}
        availableExpenseTypes={availableExpenseTypes}
      />
    </div>
  );
}
