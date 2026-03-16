"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  updateSubsidyStatus,
  updateSubsidyItem,
  deleteSubsidyItem,
} from "./actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Receipt, Upload, Loader2 } from "lucide-react";
import { uploadReceiptAction } from "@/app/actions";
import { compressImageToWebp } from "@/lib/image";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type SubsidyItem = {
  id: string;
  category: string;
  term: number;
  expense_type: string;
  name: string;
  applicant_id: string;
  accounting_group_id?: string;
  requested_amount: number;
  calculated_amount: number;
  actual_expense: number;
  status: string;
  created_at: string;
  applicant_name: string;
  accounting_group_name?: string;
  receipt_date?: string | null;
  receipt_url?: string | null;
  remarks?: string;
};

const CATEGORY_MAP: Record<string, string> = {
  activity: "活動支援金",
  league: "連盟支援金",
  special: "特別支援金",
};

const EXPENSE_TYPE_MAP: Record<string, string> = {
  facility: "施設利用料",
  participation: "参加費",
  equipment: "備品費",
  registration: "登録費",
  travel: "交通費",
  accommodation: "宿泊費",
  other: "その他",
};

const STATUS_MAP: Record<string, { label: string; variant: any }> = {
  pending: { label: "受付中", variant: "secondary" },
  accounting_received: { label: "受付済", variant: "outline" },
  rejected: { label: "却下", variant: "destructive" },
  application_in_progress: { label: "申請中", variant: "secondary" },
  approved: { label: "審査通過", variant: "default" },
  application_rejected: { label: "申請拒否", variant: "destructive" },
  receipt_submitted: { label: "領収書提出済", variant: "default" },
  paid: { label: "返金済", variant: "default" },
  unexecuted: { label: "未執行", variant: "outline" },
};

export function SubsidiesManageClientPage({
  initialData,
  profiles,
  accountingGroups = [],
  isAdmin = false,
}: {
  initialData: SubsidyItem[];
  profiles: { id: string; name: string }[];
  accountingGroups?: { id: string; name: string }[];
  isAdmin?: boolean;
}) {
  const augmentedProfiles = profiles.some(
    (p) => p.id === "9701edd2-bd9d-4d57-9dd6-7235686103bf",
  )
    ? profiles
    : [
        { id: "9701edd2-bd9d-4d57-9dd6-7235686103bf", name: "会計" },
        ...profiles,
      ];

  const [items, setItems] = useState<SubsidyItem[]>(initialData);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedTerm, setSelectedTerm] = useState<string>("all");

  const [editingItem, setEditingItem] = useState<SubsidyItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editForm, setEditForm] = useState({
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
  });
  const [file, setFile] = useState<File | null>(null);

  const publicReceiptBase = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/receipts/`
    : null;

  const filteredItems = items.filter((item) => {
    if (selectedCategory !== "all" && item.category !== selectedCategory)
      return false;
    if (selectedTerm !== "all" && item.term.toString() !== selectedTerm)
      return false;
    return true;
  });

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
      created_at: format(new Date(item.created_at), "yyyy-MM-dd"),
      receipt_date: item.receipt_date
        ? format(new Date(item.receipt_date), "yyyy-MM-dd")
        : "",
      receipt_url: item.receipt_url || "",
      remarks: item.remarks || "",
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
        ? new Date(editForm.created_at).toISOString()
        : undefined,
      receipt_date: editForm.receipt_date
        ? new Date(editForm.receipt_date).toISOString()
        : null,
      receipt_url: uploadedReceiptUrl,
      remarks: editForm.remarks,
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
                  ? new Date(editForm.created_at).toISOString()
                  : i.created_at,
                receipt_date: editForm.receipt_date
                  ? new Date(editForm.receipt_date).toISOString()
                  : i.receipt_date,
                receipt_url: uploadedReceiptUrl,
                remarks: editForm.remarks,
              }
            : i,
        ),
      );
      setEditingItem(null);
      setFile(null);
    }
  };

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <h2 className="text-2xl font-bold tracking-tight">支援金管理</h2>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-muted/50 p-4 rounded-lg">
        <div className="w-full sm:w-64 space-y-2">
          <label className="text-sm font-medium">カテゴリ</label>
          <Tabs
            value={selectedCategory}
            onValueChange={setSelectedCategory}
            className="w-full"
          >
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="all">すべて</TabsTrigger>
              <TabsTrigger value="activity">活動</TabsTrigger>
              <TabsTrigger value="league">連盟</TabsTrigger>
              <TabsTrigger value="special">特別</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="w-full sm:w-48 space-y-2">
          <label className="text-sm font-medium">期</label>
          <Select value={selectedTerm} onValueChange={setSelectedTerm}>
            <SelectTrigger>
              <SelectValue placeholder="すべての期" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての期</SelectItem>
              <SelectItem value="1">第1期</SelectItem>
              <SelectItem value="2">第2期</SelectItem>
              <SelectItem value="3">第3期</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-lg overflow-x-auto bg-card">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 text-muted-foreground font-medium border-b hidden md:table-header-group">
            <tr>
              <th className="p-3 w-1/4">申請情報</th>
              <th className="p-3">項目名 / 申請者</th>
              <th className="p-3">状況</th>
              <th className="p-3 text-right">申請額</th>
              <th className="p-3 text-right">算定額</th>
              <th className="p-3 text-right">実経費額</th>
              <th className="p-3">受領日</th>
              <th className="p-3">領収書</th>
              <th className="p-3">備考</th>
              <th className="p-3 w-[80px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredItems.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="p-6 text-center text-muted-foreground"
                >
                  該当する支援金申請はありません
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-muted/50 transition-colors flex flex-col md:table-row"
                >
                  {/* Mobile header view */}
                  <td className="p-3 md:hidden border-b bg-muted/20 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.applicant_name}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() => handleEditClick(item)}
                      >
                        編集
                      </Button>
                    </div>
                    <div className="w-full">
                      <Select
                        value={item.status}
                        onValueChange={(val) =>
                          handleStatusChange(item.id, val)
                        }
                      >
                        <SelectTrigger className="w-full h-8 bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_MAP).map(
                            ([key, { label }]) => (
                              <SelectItem key={key} value={key}>
                                {label}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    {item.remarks && (
                      <div className="text-sm mt-1">
                        <span className="text-xs text-muted-foreground font-medium mr-2">
                          備考:
                        </span>
                        {item.remarks}
                      </div>
                    )}
                  </td>

                  {/* Desktop columns */}
                  <td className="p-3 flex md:table-cell flex-col gap-1">
                    <div className="flex flex-wrap gap-1 mb-1">
                      <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800 border border-blue-200">
                        {CATEGORY_MAP[item.category] || item.category}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground border">
                        第{item.term}期
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground border">
                        {EXPENSE_TYPE_MAP[item.expense_type] ||
                          item.expense_type}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground block">
                      {format(new Date(item.created_at), "yyyy/MM/dd")}
                    </span>
                  </td>

                  <td className="p-3 hidden md:table-cell">
                    <div className="font-medium">{item.name}</div>
                    <div
                      className="text-sm text-muted-foreground mt-0.5 max-w-[200px] truncate"
                      title={item.applicant_name}
                    >
                      {item.applicant_name}
                    </div>
                    {item.accounting_group_name &&
                      item.accounting_group_name !== "-" && (
                        <div className="text-xs text-muted-foreground mt-0.5 truncate bg-muted inline-block px-1 rounded">
                          {item.accounting_group_name}
                        </div>
                      )}
                  </td>

                  <td className="p-3 hidden md:table-cell">
                    <Select
                      value={item.status}
                      onValueChange={(val) => handleStatusChange(item.id, val)}
                    >
                      <SelectTrigger className="w-[120px] h-8 relative shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_MAP).map(([key, { label }]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>

                  <td className="p-3 md:text-right flex justify-between md:table-cell border-b md:border-b-0">
                    <span className="md:hidden text-muted-foreground text-xs font-medium">
                      申請額
                    </span>
                    <span className="font-medium">
                      ¥{item.requested_amount.toLocaleString()}
                    </span>
                  </td>

                  <td className="p-3 md:text-right flex justify-between md:table-cell border-b md:border-b-0">
                    <span className="md:hidden text-muted-foreground text-xs font-medium">
                      算定額 (承認額)
                    </span>
                    <span
                      className={
                        item.calculated_amount > 0
                          ? "font-medium text-emerald-600"
                          : "text-muted-foreground"
                      }
                    >
                      ¥{item.calculated_amount.toLocaleString()}
                    </span>
                  </td>

                  <td className="p-3 md:text-right flex justify-between md:table-cell border-b md:border-b-0">
                    <span className="md:hidden text-muted-foreground text-xs font-medium">
                      実経費額
                    </span>
                    <span
                      className={
                        item.actual_expense > 0
                          ? "font-medium text-blue-600"
                          : "text-muted-foreground"
                      }
                    >
                      ¥{item.actual_expense.toLocaleString()}
                    </span>
                  </td>

                  <td className="p-3 hidden md:table-cell text-sm">
                    {item.receipt_date
                      ? format(new Date(item.receipt_date), "yyyy/MM/dd")
                      : "-"}
                  </td>

                  <td className="p-3 hidden md:table-cell text-sm">
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
                  </td>

                  <td
                    className="p-3 hidden md:table-cell text-sm min-w-[150px] max-w-[300px] break-words whitespace-normal"
                    title={item.remarks}
                  >
                    {item.remarks || "-"}
                  </td>

                  <td className="p-3 hidden md:table-cell align-middle text-right shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditClick(item)}
                    >
                      編集
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={editingItem !== null}
        onOpenChange={(open) => !open && setEditingItem(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>申請情報の編集</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto">
            {isAdmin && (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-sm">申請者</Label>
                  <div className="col-span-3">
                    <Select
                      value={editForm.applicant_id}
                      onValueChange={(val) =>
                        setEditForm({ ...editForm, applicant_id: val })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="申請者を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {augmentedProfiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-sm">申請日時</Label>
                  <div className="col-span-3">
                    <Input
                      type="date"
                      value={editForm.created_at}
                      onChange={(e) =>
                        setEditForm({ ...editForm, created_at: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-sm">受領日</Label>
                  <div className="col-span-3">
                    <Input
                      type="date"
                      value={editForm.receipt_date}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          receipt_date: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </>
            )}

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
                    {Object.entries(CATEGORY_MAP).map(([key, label]) => (
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
                    <SelectItem value="1">第1期</SelectItem>
                    <SelectItem value="2">第2期</SelectItem>
                    <SelectItem value="3">第3期</SelectItem>
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

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-sm">算定額</Label>
              <div className="col-span-3">
                <Input
                  type="number"
                  value={editForm.calculated_amount}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      calculated_amount: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-sm">実経費額</Label>
              <div className="col-span-3">
                <Input
                  type="number"
                  value={editForm.actual_amount}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      actual_amount: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-sm">領収書画像</Label>
              <div className="col-span-3">
                <div className="flex items-center gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      document.getElementById("admin-receipt-upload")?.click()
                    }
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {file ? "画像を変更" : "画像を選択"}
                  </Button>
                  <span className="text-sm text-muted-foreground truncate max-w-[150px]">
                    {file
                      ? file.name
                      : editingItem?.receipt_url
                        ? "登録済み(変更可)"
                        : "未登録"}
                  </span>
                  <Input
                    id="admin-receipt-upload"
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

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-sm">備考</Label>
              <div className="col-span-3">
                <Input
                  value={editForm.remarks}
                  onChange={(e) =>
                    setEditForm({ ...editForm, remarks: e.target.value })
                  }
                  placeholder="備考を入力"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              variant="destructive"
              onClick={() => {
                if (editingItem) handleDelete(editingItem.id);
              }}
              disabled={isSubmitting}
            >
              削除
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditingItem(null);
                  setFile(null);
                }}
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
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
