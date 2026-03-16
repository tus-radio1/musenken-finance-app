"use client";

import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import {
  ArrowUpDown,
  Search,
  Filter,
  Loader2,
  Edit,
  Receipt,
  Upload,
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
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { updateMySubsidyItem } from "@/app/subsidies/actions";
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
  requested_amount: number;
  approved_amount: number | null;
  status: string;
  accounting_group_id?: string;
  accounting_group_name: string;
  created_at: string;
  receipt_url?: string | null;
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

export function SubsidyItemsTable({
  items: initialItems,
  accountingGroups = [],
}: {
  items: SubsidyItem[];
  accountingGroups?: { id: string; name: string }[];
}) {
  const [items, setItems] = useState<SubsidyItem[]>(initialItems);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

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

  const publicReceiptBase = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/receipts/`
    : null;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const filtered = useMemo(() => {
    let result = [...items];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.accounting_group_name.toLowerCase().includes(q) ||
          (CATEGORY_LABELS[item.category] || "").toLowerCase().includes(q) ||
          (EXPENSE_TYPE_LABELS[item.expense_type] || "")
            .toLowerCase()
            .includes(q),
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((item) => item.status === statusFilter);
    }

    if (categoryFilter !== "all") {
      result = result.filter((item) => item.category === categoryFilter);
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
  }, [items, searchQuery, statusFilter, categoryFilter, sortKey, sortOrder]);



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

  // 支援金種別が変わったら経費種別と期をリセットするための効果
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
      {/* フィルタ・検索バー */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="項目名・会計区分で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="状態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="pending">申請中</SelectItem>
              <SelectItem value="approved">承認済</SelectItem>
              <SelectItem value="rejected">却下</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* テーブル */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {items.length === 0
            ? "まだ支援金の申請はありません。"
            : "条件に一致する申請がありません。"}
        </p>
      ) : (
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
                <TableHead>支援金種別</TableHead>
                <TableHead>期</TableHead>
                <TableHead>経費種別</TableHead>
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
                <TableHead>領収書</TableHead>
                <TableHead className="w-[100px]">状態</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {format(new Date(item.created_at), "yyyy/MM/dd")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={CATEGORY_BADGE_COLORS[item.category] || ""}
                    >
                      {CATEGORY_LABELS[item.category] || item.category}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.term}期</TableCell>
                  <TableCell className="text-sm">
                    {EXPENSE_TYPE_LABELS[item.expense_type] ||
                      item.expense_type}
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
                  <TableCell>
                    {item.receipt_url ? (
                      <a
                        href={
                          item.receipt_url.startsWith("http")
                            ? item.receipt_url
                            : publicReceiptBase
                              ? `${publicReceiptBase}${item.receipt_url}`
                              : "#"
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-blue-600 hover:underline text-xs"
                      >
                        <Receipt className="h-4 w-4 mr-1" />
                        確認
                      </a>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell><StatusBadge status={item.status} /></TableCell>
                  <TableCell className="text-right">
                    {item.status === "pending" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(item)}
                      >
                        <Edit className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-right">
        {filtered.length} / {items.length} 件表示
      </p>

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
