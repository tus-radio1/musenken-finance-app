"use client";

/**
 * 支援金申請一覧: 編集ダイアログ
 * 承認済み時は領収書アップロードのみ、それ以外は全フィールド編集可能。
 */

import { Loader2, Upload, CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABELS,
  EXPENSE_TYPE_LABELS,
} from "@/lib/constants/subsidy";
import type { SubsidyItem, EditFormState } from "./types";

type AccountingGroup = { id: string; name: string };

type ItemsEditDialogProps = {
  editingItem: SubsidyItem | null;
  onClose: () => void;
  editForm: EditFormState;
  onEditFormChange: (form: EditFormState) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  file: File | null;
  onFileChange: (file: File | null) => void;
  accountingGroups: AccountingGroup[];
  availableTerms: number[];
  availableExpenseTypes: string[];
};

export function ItemsEditDialog({
  editingItem,
  onClose,
  editForm,
  onEditFormChange,
  onSubmit,
  isSubmitting,
  file,
  onFileChange,
  accountingGroups,
  availableTerms,
  availableExpenseTypes,
}: ItemsEditDialogProps) {
  return (
    <Dialog
      open={editingItem !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>
            {editingItem?.status === "approved" ? "領収書のアップロード" : "申請内容の修正"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto">
          {editingItem?.status === "approved" ? (
            /* 承認済み: 領収書アップロードのみ */
            <div className="space-y-2 px-1">
              <Label>領収書画像</Label>
              <p className="text-xs text-muted-foreground">
                対応形式: JPEG / PNG / WebP / GIF / HEIC / TIFF / BMP / PDF | 最大サイズ: 10MB
              </p>
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
                    if (selectedFile) onFileChange(selectedFile);
                  }}
                />
              </div>
            </div>
          ) : (
            /* 未承認: 全フィールド編集 */
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right text-sm">カテゴリ</Label>
                <div className="col-span-3">
                  <Select
                    value={editForm.category}
                    onValueChange={(val) =>
                      onEditFormChange({ ...editForm, category: val })
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

              {/* 収支区分 */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right text-sm">収支区分</Label>
                <div className="col-span-3">
                  <RadioGroup
                    value={editForm.income_type}
                    onValueChange={(val) =>
                      onEditFormChange({ ...editForm, income_type: val })
                    }
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="expense" id="edit-income-type-expense" />
                      <Label htmlFor="edit-income-type-expense" className="font-normal cursor-pointer">
                        支出
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="income" id="edit-income-type-income" />
                      <Label htmlFor="edit-income-type-income" className="font-normal cursor-pointer">
                        収入
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>

              {/* 日付 */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right text-sm">日付</Label>
                <div className="col-span-3">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !editForm.date && "text-muted-foreground",
                        )}
                      >
                        {editForm.date ? (
                          format(editForm.date, "yyyy年MM月dd日")
                        ) : (
                          <span>日付を選択</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={editForm.date}
                        onSelect={(date) =>
                          onEditFormChange({ ...editForm, date: date ?? undefined })
                        }
                        locale={ja}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right text-sm">期</Label>
                <div className="col-span-3">
                  <Select
                    value={editForm.term}
                    onValueChange={(val) =>
                      onEditFormChange({ ...editForm, term: val })
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
                      onEditFormChange({ ...editForm, expense_type: val })
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
                      onEditFormChange({ ...editForm, accounting_group_id: val })
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
                      onEditFormChange({ ...editForm, name: e.target.value })
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
                      onEditFormChange({
                        ...editForm,
                        requested_amount: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right text-sm">使用時期</Label>
                <div className="col-span-3">
                  <Input
                    value={editForm.usage_period}
                    onChange={(e) =>
                      onEditFormChange({ ...editForm, usage_period: e.target.value })
                    }
                    placeholder="例：2026年4月〜6月"
                  />
                </div>
              </div>

              {/* 申請理由 */}
              <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-right text-sm pt-2">申請理由</Label>
                <div className="col-span-3">
                  <Textarea
                    value={editForm.justification}
                    onChange={(e) =>
                      onEditFormChange({ ...editForm, justification: e.target.value })
                    }
                    placeholder="支援が必要な理由を記載してください..."
                    className="resize-none"
                    rows={3}
                  />
                </div>
              </div>

              {/* 備考 */}
              <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-right text-sm pt-2">備考</Label>
                <div className="col-span-3">
                  <Textarea
                    value={editForm.remarks}
                    onChange={(e) =>
                      onEditFormChange({ ...editForm, remarks: e.target.value })
                    }
                    placeholder="補足事項があれば記載してください..."
                    className="resize-none"
                    rows={3}
                  />
                </div>
              </div>

              {/* 根拠書類アップロード */}
              <div className="space-y-2 px-1">
                <Label>根拠書類 (任意)</Label>
                <div className="flex items-center gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      document.getElementById("evidence-upload")?.click()
                    }
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {file ? "ファイルを変更" : "ファイルを選択"}
                  </Button>
                  <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                    {file
                      ? file.name
                      : editingItem?.evidence_url
                        ? "登録済み(変更可)"
                        : "選択されていません"}
                  </span>
                  <Input
                    id="evidence-upload"
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const selectedFile = e.target.files?.[0];
                      if (selectedFile) onFileChange(selectedFile);
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
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
  );
}
