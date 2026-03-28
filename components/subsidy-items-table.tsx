"use client";

import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import {
  ArrowUpDown,
  Search,
  Filter,
  Loader2,
  Upload,
  ExternalLink,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { updateMySubsidyItem, deleteMySubsidyItem } from "@/app/(authenticated)/subsidies/actions";
import { uploadReceiptAction } from "@/app/actions";
import { compressImageToWebp } from "@/lib/image";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SubsidyItem = {
  id: string;
  category: string;
  term: number;
  expense_type: string;
  name: string;
  income_type?: string;
  requested_amount: number;
  approved_amount: number | null;
  status: string;
  accounting_group_id?: string;
  accounting_group_name: string;
  created_at: string;
  receipt_url?: string | null;
  receipt_public_url?: string | null;
  evidence_public_url?: string | null;
  remarks?: string | null;
};

type SortKey = "created_at" | "requested_amount";
type SortOrder = "asc" | "desc";

const CATEGORY_LABELS: Record<string, string> = {
  activity: "活動支援金",
  league: "連盟登録支援金",
  special: "特別支援金",
};

const EXPENSE_TYPE_LABELS: Record<string, string> = {
  facility: "施設等使用料",
  participation: "試合等参加費",
  equipment: "備品購入費",
  registration: "連盟登録費",
  travel: "旅費",
  accommodation: "宿泊費",
  other: "その他",
};

const CATEGORY_BADGE_COLORS: Record<string, string> = {
  activity: "bg-emerald-100 text-emerald-800 border-emerald-200",
  league: "bg-sky-100 text-sky-800 border-sky-200",
  special: "bg-amber-100 text-amber-800 border-amber-200",
};

const CATEGORY_TERMS: Record<string, number[]> = {
  activity: [1, 2],
  league: [1, 2],
  special: [1, 2, 3],
};

const CATEGORY_EXPENSE_TYPES: Record<string, string[]> = {
  activity: ["facility", "participation", "equipment"],
  league: ["registration"],
  special: ["facility", "participation", "travel", "accommodation", "other"],
};

const STATUS_LABELS: Record<string, string> = {
  pending: "受付中",
  accounting_received: "受付済",
  approved: "審査通過",
  rejected: "却下",
  application_in_progress: "申請中",
  application_rejected: "申請拒否",
  receipt_submitted: "領収書提出済",
  paid: "返金済",
  unexecuted: "未執行",
};

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

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [incomeTypeFilter, setIncomeTypeFilter] = useState<string>("all");
  const [accountingGroupFilter, setAccountingGroupFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());

  const [editingItem, setEditingItem] = useState<SubsidyItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editForm, setEditForm] = useState({
    category: "",
    term: "1",
    accounting_group_id: "",
    expense_type: "",
    name: "",
    requested_amount: 0,
  });
  const [file, setFile] = useState<File | null>(null);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingItem, setDeletingItem] = useState<SubsidyItem | null>(null);

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
        const da = new Date(a.created_at).getTime();
        const db = new Date(b.created_at).getTime();
        cmp = da - db;
      } else if (sortKey === "requested_amount") {
        cmp = a.requested_amount - b.requested_amount;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return result;
  }, [items, searchQuery, statusFilter, categoryFilter, incomeTypeFilter, accountingGroupFilter, sortKey, sortOrder]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
    }).format(amount);

  const handleEditClick = (item: SubsidyItem) => {
    setEditForm({
      category: item.category,
      term: item.term.toString(),
      accounting_group_id: item.accounting_group_id || "",
      expense_type: item.expense_type,
      name: item.name,
      requested_amount: item.requested_amount,
    });
    setFile(null);
    setEditingItem(item);
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

    let uploadedReceiptUrl = editingItem.receipt_url;

    if (file) {
      try {
        const compressedFile = await compressImageToWebp(file);
        const fileExt = compressedFile.name.split(".").pop();
        const fileName = `${editingItem.id}.${fileExt}`;

        const formData = new FormData();
        formData.append("file", compressedFile);
        formData.append("fileName", fileName);
        // Pass existing receipt path so the server can delete the old file
        // when the extension changes (e.g., .webp -> .pdf)
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

    const result = await updateMySubsidyItem(editingItem.id, {
      category: editForm.category,
      term: parseInt(editForm.term, 10),
      accounting_group_id: editForm.accounting_group_id || undefined,
      expense_type: editForm.expense_type,
      name: editForm.name,
      requested_amount: editForm.requested_amount,
      receipt_url: uploadedReceiptUrl,
    });

    setIsSubmitting(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("申請情報を更新しました");
      const updatedGroup = accountingGroups.find(
        (g) => g.id === editForm.accounting_group_id,
      );

      const publicReceiptBase = process.env.NEXT_PUBLIC_SUPABASE_URL
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/receipts/`
        : null;
      const newReceiptPublicUrl = uploadedReceiptUrl
        ? uploadedReceiptUrl.startsWith("http")
          ? uploadedReceiptUrl
          : publicReceiptBase
            ? `${publicReceiptBase}${uploadedReceiptUrl}`
            : null
        : null;

      setItems((prev) =>
        prev.map((i) =>
          i.id === editingItem.id
            ? {
                ...i,
                ...editForm,
                term: parseInt(editForm.term, 10),
                accounting_group_name: updatedGroup
                  ? updatedGroup.name
                  : i.accounting_group_name,
                receipt_url: uploadedReceiptUrl,
                receipt_public_url: newReceiptPublicUrl,
              }
            : i,
        ),
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

  // Reset expense_type and term when category changes in edit form
  useEffect(() => {
    if (editingItem) {
      const validTerms = CATEGORY_TERMS[editForm.category] || [1];
      if (!validTerms.includes(parseInt(editForm.term, 10))) {
        setEditForm((prev) => ({ ...prev, term: validTerms[0].toString() }));
      }

      const validExpenseTypes = CATEGORY_EXPENSE_TYPES[editForm.category] || [];
      if (
        editForm.expense_type &&
        !validExpenseTypes.includes(editForm.expense_type)
      ) {
        setEditForm((prev) => ({
          ...prev,
          expense_type: validExpenseTypes[0],
        }));
      }
    }
  }, [editForm.category]);

  return (
    <div className="space-y-4">
      {/* Filter / search bar */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="概要で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="種別" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての種別</SelectItem>
              <SelectItem value="activity">活動支援金</SelectItem>
              <SelectItem value="league">連盟登録支援金</SelectItem>
              <SelectItem value="special">特別支援金</SelectItem>
            </SelectContent>
          </Select>
          <Select value={incomeTypeFilter} onValueChange={setIncomeTypeFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="支出・収入" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">支出・収入</SelectItem>
              <SelectItem value="expense">支出</SelectItem>
              <SelectItem value="income">収入</SelectItem>
            </SelectContent>
          </Select>
          <Select value={accountingGroupFilter} onValueChange={setAccountingGroupFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="会計区分" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての会計区分</SelectItem>
              {accountingGroups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="状態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての状態</SelectItem>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table / Cards */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {items.length === 0
            ? "まだ支援金の申請はありません。"
            : "条件に一致する申請がありません。"}
        </p>
      ) : (
        <>
          {/* PC table (xl and above) */}
          <div className="hidden xl:block">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 -ml-3 font-medium"
                        onClick={() => toggleSort("created_at")}
                      >
                        申請日
                        <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </TableHead>
                    <TableHead>カテゴリ</TableHead>
                    <TableHead>項目名</TableHead>
                    <TableHead>会計区分</TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 -ml-3 font-medium"
                        onClick={() => toggleSort("requested_amount")}
                      >
                        申請金額
                        <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </TableHead>
                    <TableHead>算定額</TableHead>
                    <TableHead className="w-[100px]">状態</TableHead>
                    <TableHead>備考</TableHead>
                    <TableHead className="w-[120px]">添付書類</TableHead>
                    <TableHead className="w-[60px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => {
                    const canEditOrDelete =
                      isGlobalAdmin || item.status === "pending";
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {format(new Date(item.created_at), "yyyy/MM/dd")}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="secondary" className="text-xs whitespace-nowrap">
                              {CATEGORY_LABELS[item.category] || item.category}
                            </Badge>
                            <Badge variant="outline" className="text-xs whitespace-nowrap">
                              第{item.term}期
                            </Badge>
                            <Badge variant="outline" className="text-xs whitespace-nowrap">
                              {EXPENSE_TYPE_LABELS[item.expense_type] || item.expense_type}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell
                          className="max-w-[200px] truncate"
                          title={item.name}
                        >
                          {item.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {item.accounting_group_name}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold">
                          {formatCurrency(item.requested_amount)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.approved_amount != null
                            ? formatCurrency(item.approved_amount)
                            : "-"}
                        </TableCell>
                        <TableCell><StatusBadge status={item.status} /></TableCell>
                        <TableCell className="max-w-[200px] whitespace-pre-wrap break-words">
                          {item.remarks || "\u2014"}
                        </TableCell>
                        <TableCell className="w-[120px]">
                          <div className="flex flex-col gap-1">
                            {item.receipt_public_url ? (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
                                <a href={item.receipt_public_url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  領収書
                                </a>
                              </Button>
                            ) : null}
                            {item.evidence_public_url ? (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
                                <a href={item.evidence_public_url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  根拠書類
                                </a>
                              </Button>
                            ) : null}
                            {!item.receipt_public_url && !item.evidence_public_url && (
                              <span className="text-muted-foreground">{"\u2014"}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {canEditOrDelete && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">メニューを開く</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditClick(item)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  編集
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    setDeletingItem(item);
                                    setShowDeleteDialog(true);
                                  }}
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  削除
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile / Tablet card layout (below xl) */}
          <div className="xl:hidden space-y-3">
            {filtered.map((item) => {
              const canEditOrDelete =
                isGlobalAdmin || item.status === "pending";
              return (
                <Collapsible
                  key={item.id}
                  open={openCards.has(item.id)}
                  onOpenChange={() => toggleCard(item.id)}
                >
                  <div className="border rounded-lg p-4 bg-card space-y-3">
                    {/* Header row: date + amount */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(item.created_at), "yyyy/MM/dd")}
                        </div>
                        <div className="font-medium truncate" title={item.name}>
                          {item.name}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold text-base">
                          {formatCurrency(item.requested_amount)}
                        </div>
                      </div>
                    </div>

                    {/* Second row: category badge + term */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={CATEGORY_BADGE_COLORS[item.category] || ""}
                        >
                          {CATEGORY_LABELS[item.category] || item.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {item.term}期
                        </span>
                        <StatusBadge status={item.status} />
                      </div>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 px-2">
                          詳細
                          <ChevronDown
                            className={`ml-1 h-3.5 w-3.5 transition-transform ${
                              openCards.has(item.id) ? "rotate-180" : ""
                            }`}
                          />
                        </Button>
                      </CollapsibleTrigger>
                    </div>

                    {/* Collapsible details */}
                    <CollapsibleContent className="space-y-3 pt-1">
                      {/* Remarks */}
                      <div className="text-sm">
                        <span className="text-muted-foreground font-medium">
                          備考:{" "}
                        </span>
                        <span className="whitespace-pre-wrap break-words">{item.remarks || "\u2014"}</span>
                      </div>

                      {/* Receipt link */}
                      <div className="text-sm">
                        <span className="text-muted-foreground font-medium">
                          領収書:{" "}
                        </span>
                        {item.receipt_public_url ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            asChild
                          >
                            <a
                              href={item.receipt_public_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              領収書
                            </a>
                          </Button>
                        ) : (
                          <span>{"\u2014"}</span>
                        )}
                      </div>

                      {/* Evidence link */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground font-medium min-w-[56px]">根拠書類:</span>
                        {item.evidence_public_url ? (
                          <Button variant="outline" size="sm" asChild>
                            <a href={item.evidence_public_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              確認する
                            </a>
                          </Button>
                        ) : (
                          <span className="text-sm">{"\u2014"}</span>
                        )}
                      </div>

                      {/* Action buttons (edit/delete) */}
                      {canEditOrDelete && (
                        <div className="flex items-center gap-1 pt-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">メニューを開く</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditClick(item)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                編集
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setDeletingItem(item);
                                  setShowDeleteDialog(true);
                                }}
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                削除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
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
      <Dialog
        open={editingItem !== null}
        onOpenChange={(open) => !open && setEditingItem(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>申請内容の修正</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-sm">カテゴリ</Label>
              <div className="col-span-3">
                <Select
                  value={editForm.category}
                  onValueChange={(val) =>
                    setEditForm({ ...editForm, category: val })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-sm">期</Label>
              <div className="col-span-3">
                <Select
                  value={editForm.term}
                  onValueChange={(val) =>
                    setEditForm({ ...editForm, term: val })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTerms.map((t) => (
                      <SelectItem key={String(t)} value={String(t)}>
                        第{t}期
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-sm">経費種別</Label>
              <div className="col-span-3">
                <Select
                  value={editForm.expense_type}
                  onValueChange={(val) =>
                    setEditForm({ ...editForm, expense_type: val })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableExpenseTypes.map((et) => (
                      <SelectItem key={et} value={et}>
                        {EXPENSE_TYPE_LABELS[et] || et}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-sm">会計区分</Label>
              <div className="col-span-3">
                <Select
                  value={editForm.accounting_group_id}
                  onValueChange={(val) =>
                    setEditForm({ ...editForm, accounting_group_id: val })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="会計区分を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountingGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-sm">項目名</Label>
              <div className="col-span-3">
                <Input
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-sm">申請額</Label>
              <div className="col-span-3">
                <Input
                  type="number"
                  value={editForm.requested_amount}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      requested_amount: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-2 px-1">
              <Label>領収書画像 (任意)</Label>
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    document.getElementById("receipt-upload")?.click()
                  }
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {file ? "画像を変更" : "画像を選択"}
                </Button>
                <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                  {file
                    ? file.name
                    : editingItem?.receipt_url
                      ? "登録済み(変更可)"
                      : "選択されていません"}
                </span>
                <Input
                  id="receipt-upload"
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile) setFile(selectedFile);
                  }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingItem(null)}
              disabled={isSubmitting}
            >
              キャンセル
            </Button>
            <Button onClick={handleEditSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                "保存"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
