"use client";

/**
 * 支援金管理画面: オーケストレーター
 * 状態管理とビジネスロジックを保持し、表示は子コンポーネントに委譲する。
 */

import { useState, useMemo } from "react";
import {
  updateSubsidyStatus,
  updateSubsidyItem,
  deleteSubsidyItem,
} from "./actions";
import { uploadReceiptAction } from "@/app/actions";
import { compressImageToWebp } from "@/lib/image";
import { toast } from "sonner";
import { dateInputValueToJstTimestamp, toDateInputValue } from "@/lib/date";

import { ManageFilterBar } from "./_components/manage-filter-bar";
import { ManageMobileCardList } from "./_components/manage-mobile-card-list";
import { ManageDesktopTable } from "./_components/manage-desktop-table";
import { ManageEditDialog } from "./_components/manage-edit-dialog";
import type { SubsidyItem, SortKey, SortOrder, EditFormState } from "./_components/types";

export function SubsidiesManageClientPage({
  initialData,
  profiles,
  accountingGroups = [],
  isAdmin = false,
  isReadOnly = false,
}: {
  initialData: SubsidyItem[];
  profiles: { id: string; name: string }[];
  accountingGroups?: { id: string; name: string }[];
  isAdmin?: boolean;
  isReadOnly?: boolean;
}) {
  const ACCOUNTING_USER_ID =
    process.env.NEXT_PUBLIC_ACCOUNTING_SYSTEM_USER_ID ??
    "9701edd2-bd9d-4d57-9dd6-7235686103bf";

  const augmentedProfiles = profiles.some(
    (p) => p.id === ACCOUNTING_USER_ID,
  )
    ? profiles
    : [
        { id: ACCOUNTING_USER_ID, name: "会計" },
        ...profiles,
      ];

  // --- フィルタ・ソート状態 ---
  const [items, setItems] = useState<SubsidyItem[]>(initialData);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedTerm, setSelectedTerm] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApplicant, setSelectedApplicant] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // --- UI展開状態 ---
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const [openDetailRows, setOpenDetailRows] = useState<Set<string>>(new Set());

  // --- 編集ダイアログ状態 ---
  const [editingItem, setEditingItem] = useState<SubsidyItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState>({
    category: "",
    term: "1",
    accounting_group_id: "",
    expense_type: "",
    name: "",
    applicant_id: "",
    requested_amount: 0,
    calculated_amount: 0,
    actual_amount: 0,
    created_at: "",
    receipt_date: "",
    receipt_url: "",
    remarks: "",
    usage_period: "",
    justification: "",
    evidence_url: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const publicReceiptBase = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/receipts/`
    : null;

  // --- トグル・ソートハンドラ ---
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

  const toggleDetailRow = (id: string) => {
    setOpenDetailRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSortToggle = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  // --- フィルタリング・ソート ---
  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.toLowerCase().trim();

    const filtered = items.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory)
        return false;
      if (selectedTerm !== "all" && item.term.toString() !== selectedTerm)
        return false;
      if (normalizedQuery && !item.name.toLowerCase().includes(normalizedQuery))
        return false;
      if (selectedApplicant !== "all" && item.applicant_id !== selectedApplicant)
        return false;
      if (selectedStatus !== "all" && item.status !== selectedStatus)
        return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "created_at") {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else {
        cmp = a.requested_amount - b.requested_amount;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [
    items,
    selectedCategory,
    selectedTerm,
    searchQuery,
    selectedApplicant,
    selectedStatus,
    sortKey,
    sortOrder,
  ]);

  // --- ステータス変更 ---
  const handleStatusChange = async (id: string, newStatus: string) => {
    const originalItems = [...items];
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: newStatus } : item,
      ),
    );

    const result = await updateSubsidyStatus(id, newStatus);
    if (result.error) {
      toast.error(result.error);
      setItems(originalItems);
    } else {
      toast.success("ステータスを更新しました");
    }
  };

  // --- 編集開始 ---
  const handleEditClick = (item: SubsidyItem) => {
    setEditForm({
      category: item.category,
      term: item.term.toString(),
      accounting_group_id: item.accounting_group_id || "",
      expense_type: item.expense_type,
      name: item.name,
      applicant_id: item.applicant_id,
      requested_amount: item.requested_amount,
      calculated_amount: item.calculated_amount,
      actual_amount: item.actual_expense || 0,
      created_at: toDateInputValue(item.created_at),
      receipt_date: toDateInputValue(item.receipt_date),
      receipt_url: item.receipt_url || "",
      remarks: item.remarks || "",
      usage_period: item.usage_period || "",
      justification: item.justification || "",
      evidence_url: item.evidence_url || "",
    });
    setFile(null);
    setEvidenceFile(null);
    setEditingItem(item);
  };

  // --- 編集送信 ---
  const handleEditSubmit = async () => {
    if (!editingItem) return;
    setIsSubmitting(true);

    let uploadedReceiptUrl = editingItem.receipt_url;

    if (file) {
      try {
        const compressedFile = await compressImageToWebp(file);
        const fileExt = compressedFile.name.split(".").pop();
        const fileName = `${editingItem.id}_${Date.now()}.${fileExt}`;

        const formData = new FormData();
        formData.append("file", compressedFile);
        formData.append("fileName", fileName);
        if (editingItem.receipt_url) {
          formData.append("existingPath", editingItem.receipt_url);
        }

        const result = await uploadReceiptAction(formData);

        if (result.error) {
          toast.error(result.error);
          setIsSubmitting(false);
          return;
        }

        uploadedReceiptUrl = result.filePath;
      } catch (error) {
        console.error("Image processing error:", error);
        toast.error("画像の再処理またはアップロード中にエラーが発生しました");
        setIsSubmitting(false);
        return;
      }
    }

    let uploadedEvidenceUrl = editingItem.evidence_url;

    if (evidenceFile) {
      try {
        const compressedFile = await compressImageToWebp(evidenceFile);
        const fileExt = compressedFile.name.split(".").pop();
        const fileName = `evidence_${editingItem.id}_${Date.now()}.${fileExt}`;
        const formData = new FormData();
        formData.append("file", compressedFile);
        formData.append("fileName", fileName);
        if (editingItem.evidence_url) {
          formData.append("existingPath", editingItem.evidence_url);
        }
        const evidenceResult = await uploadReceiptAction(formData);
        if (evidenceResult.error) {
          toast.error(evidenceResult.error);
          setIsSubmitting(false);
          return;
        }
        uploadedEvidenceUrl = evidenceResult.filePath;
      } catch (error) {
        console.error("Evidence file processing error:", error);
        toast.error("根拠書類のアップロード中にエラーが発生しました");
        setIsSubmitting(false);
        return;
      }
    }

    const result = await updateSubsidyItem(editingItem.id, {
      category: editForm.category,
      term: parseInt(editForm.term, 10),
      accounting_group_id: editForm.accounting_group_id || undefined,
      expense_type: editForm.expense_type,
      name: editForm.name,
      applicant_id: editForm.applicant_id,
      requested_amount: editForm.requested_amount,
      approved_amount: editForm.calculated_amount,
      actual_amount: editForm.actual_amount,
      created_at: editForm.created_at
        ? dateInputValueToJstTimestamp(editForm.created_at)
        : undefined,
      receipt_date: editForm.receipt_date || null,
      receipt_url: uploadedReceiptUrl,
      remarks: editForm.remarks,
      usage_period: editForm.usage_period || null,
      justification: editForm.justification || null,
      evidence_url: uploadedEvidenceUrl,
    });

    setIsSubmitting(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("申請情報を更新しました");
      const updatedProfile = augmentedProfiles.find(
        (p) => p.id === editForm.applicant_id,
      );
      const updatedGroup = accountingGroups.find(
        (g) => g.id === editForm.accounting_group_id,
      );

      setItems((prev) =>
        prev.map((i) =>
          i.id === editingItem.id
            ? {
                ...i,
                ...editForm,
                term: parseInt(editForm.term, 10),
                actual_expense: editForm.actual_amount,
                applicant_name: updatedProfile
                  ? updatedProfile.name
                  : i.applicant_name,
                accounting_group_name: updatedGroup
                  ? updatedGroup.name
                  : i.accounting_group_name,
                created_at: editForm.created_at
                  ? dateInputValueToJstTimestamp(editForm.created_at)
                  : i.created_at,
                receipt_date: editForm.receipt_date || null,
                receipt_url: uploadedReceiptUrl,
                remarks: editForm.remarks,
                usage_period: editForm.usage_period || null,
                justification: editForm.justification || null,
                evidence_url: uploadedEvidenceUrl,
              }
            : i,
        ),
      );
      setEditingItem(null);
      setFile(null);
      setEvidenceFile(null);
    }
  };

  // --- 削除 ---
  const handleDelete = async (id: string) => {
    if (!window.confirm("本当にこの申請を削除しますか？")) return;
    setIsSubmitting(true);
    const result = await deleteSubsidyItem(id);
    setIsSubmitting(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("申請を削除しました");
      setItems((prev) => prev.filter((i) => i.id !== id));
      setEditingItem(null);
    }
  };

  const handleEditDialogClose = () => {
    setEditingItem(null);
    setFile(null);
    setEvidenceFile(null);
  };

  return (
    <div className="space-y-6">
      {/* フィルタバー */}
      <ManageFilterBar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        selectedTerm={selectedTerm}
        onTermChange={setSelectedTerm}
        selectedApplicant={selectedApplicant}
        onApplicantChange={setSelectedApplicant}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        sortKey={sortKey}
        sortOrder={sortOrder}
        onSortToggle={handleSortToggle}
        profiles={augmentedProfiles}
      />

      {/* モバイルカード一覧 (xl未満) */}
      <div className="xl:hidden space-y-3">
        <ManageMobileCardList
          filteredItems={filteredItems}
          openCards={openCards}
          onToggleCard={toggleCard}
          onStatusChange={handleStatusChange}
          onEditClick={handleEditClick}
          isReadOnly={isReadOnly}
          publicReceiptBase={publicReceiptBase}
        />
      </div>

      {/* デスクトップテーブル (xl以上) */}
      <ManageDesktopTable
        filteredItems={filteredItems}
        openDetailRows={openDetailRows}
        onToggleDetailRow={toggleDetailRow}
        onStatusChange={handleStatusChange}
        onEditClick={handleEditClick}
        onSortToggle={handleSortToggle}
        sortKey={sortKey}
        sortOrder={sortOrder}
        isReadOnly={isReadOnly}
        publicReceiptBase={publicReceiptBase}
      />

      {/* 編集ダイアログ */}
      <ManageEditDialog
        editingItem={editingItem}
        onClose={handleEditDialogClose}
        editForm={editForm}
        onEditFormChange={setEditForm}
        onSubmit={handleEditSubmit}
        onDelete={handleDelete}
        isSubmitting={isSubmitting}
        isAdmin={isAdmin}
        profiles={augmentedProfiles}
        accountingGroups={accountingGroups}
        file={file}
        onFileChange={setFile}
        evidenceFile={evidenceFile}
        onEvidenceFileChange={setEvidenceFile}
      />
    </div>
  );
}
