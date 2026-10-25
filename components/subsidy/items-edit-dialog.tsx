"use client";

/**
 * 支援金申請一覧: 編集ダイアログ
 * Approved status allows receipt upload only; other statuses allow full editing.
 */

import { Loader2, CalendarIcon } from "lucide-react";
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
import { FileDropzone } from "@/components/receipt/file-dropzone";
import { DIALOG_WIDTH_CLASS } from "@/components/layout/page-shell";

type AccountingGroup = { id: string; name: string };

type ItemsEditDialogProps = {
  editingItem: SubsidyItem | null;
  onClose: () => void;
  editForm: EditFormState;
  onEditFormChange: (form: EditFormState) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  uploadError?: string | null;
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
  uploadError,
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
      <DialogContent className={`${DIALOG_WIDTH_CLASS.form} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>
            {editingItem?.status === "approved" ? "領収書のアップロード" : "申請内容の修正"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]">
          {editingItem?.status === "approved" ? (
            /* Approved status: receipt upload only. */
            <div className="px-1 lg:col-span-2">
              <FileDropzone
                label="領収書画像"
                file={file}
                onFileChange={onFileChange}
                existingUrl={editingItem?.receipt_url}
                disabled={isSubmitting}
                error={uploadError}
                className="flex flex-col"
                dropzoneClassName="lg:min-h-56"
              />
            </div>
          ) : (
            /* 未承認: 全フィールド編集 */
            <>
              <div className="grid content-start gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="items-edit-category">カテゴリ</Label>
                  <div className="col-span-3">
                    <Select
                      value={editForm.category}
                      onValueChange={(val) =>
                        onEditFormChange({ ...editForm, category: val })
                      }
                    >
                      <SelectTrigger id="items-edit-category">
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
                <div className="space-y-2">
                  <Label id="items-edit-income-label">収支区分</Label>
                  <div className="col-span-3">
                    <RadioGroup
                      value={editForm.income_type}
                      onValueChange={(val) =>
                        onEditFormChange({ ...editForm, income_type: val })
                      }
                      className="flex gap-4"
                      aria-labelledby="items-edit-income-label"
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
                <div className="space-y-2">
                  <Label id="items-edit-date-label">日付</Label>
                  <div className="col-span-3">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          aria-labelledby="items-edit-date-label"
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
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" aria-hidden="true" />
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

                <div className="space-y-2">
                  <Label htmlFor="items-edit-term">期</Label>
                  <div className="col-span-3">
                    <Select
                      value={editForm.term}
                      onValueChange={(val) =>
                        onEditFormChange({ ...editForm, term: val })
                      }
                    >
                      <SelectTrigger id="items-edit-term">
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

                <div className="space-y-2">
                  <Label htmlFor="items-edit-expense-type">経費種別</Label>
                  <div className="col-span-3">
                    <Select
                      value={editForm.expense_type}
                      onValueChange={(val) =>
                        onEditFormChange({ ...editForm, expense_type: val })
                      }
                    >
                      <SelectTrigger id="items-edit-expense-type">
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

                <div className="space-y-2">
                  <Label htmlFor="items-edit-accounting-group">会計区分</Label>
                  <div className="col-span-3">
                    <Select
                      value={editForm.accounting_group_id}
                      onValueChange={(val) =>
                        onEditFormChange({ ...editForm, accounting_group_id: val })
                      }
                    >
                      <SelectTrigger id="items-edit-accounting-group">
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

                <div className="space-y-2">
                  <Label htmlFor="items-edit-name">項目名</Label>
                  <div className="col-span-3">
                    <Input
                      id="items-edit-name"
                      value={editForm.name}
                      onChange={(e) =>
                        onEditFormChange({ ...editForm, name: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="items-edit-requested-amount">申請額</Label>
                  <div className="col-span-3">
                    <Input
                      id="items-edit-requested-amount"
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

                <div className="space-y-2">
                  <Label htmlFor="items-edit-usage-period">使用時期</Label>
                  <div className="col-span-3">
                    <Input
                      id="items-edit-usage-period"
                      value={editForm.usage_period}
                      onChange={(e) =>
                        onEditFormChange({ ...editForm, usage_period: e.target.value })
                      }
                      placeholder="例：2026年4月〜6月"
                    />
                  </div>
                </div>

                {/* 申請理由 */}
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="items-edit-justification">申請理由</Label>
                  <div className="col-span-3">
                    <Textarea
                      id="items-edit-justification"
                      value={editForm.justification}
                      onChange={(e) =>
                        onEditFormChange({ ...editForm, justification: e.target.value })
                      }
                      placeholder="支援が必要な理由を記載してください..."
                      className="resize-none"
                      rows={2}
                    />
                  </div>
                </div>

                {/* 備考 */}
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="items-edit-remarks">備考</Label>
                  <div className="col-span-3">
                    <Textarea
                      id="items-edit-remarks"
                      value={editForm.remarks}
                      onChange={(e) =>
                        onEditFormChange({ ...editForm, remarks: e.target.value })
                      }
                      placeholder="補足事項があれば記載してください..."
                      className="resize-none"
                      rows={2}
                    />
                  </div>
                </div>

              </div>

              <div className="flex min-w-0 flex-col px-1 lg:min-h-[24rem]">
                <FileDropzone
                  label="根拠書類 (任意)"
                  file={file}
                  onFileChange={onFileChange}
                  existingUrl={editingItem?.evidence_url}
                  disabled={isSubmitting}
                  error={uploadError}
                  className="flex flex-1 flex-col"
                  dropzoneClassName="lg:flex-1"
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="w-full md:w-auto"
            onClick={onClose}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
          <Button className="w-full md:w-auto" onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
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
