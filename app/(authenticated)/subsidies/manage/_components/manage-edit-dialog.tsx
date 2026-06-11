"use client";

/**
 * 支援金管理画面: 編集ダイアログ
 * 管理者/非管理者で表示フィールドが分岐する申請情報の編集フォーム。
 */

import { Upload, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CATEGORY_LABELS as CATEGORY_MAP,
  EXPENSE_TYPE_LABELS as EXPENSE_TYPE_MAP,
} from "@/lib/constants/subsidy";
import type { SubsidyItem, EditFormState } from "./types";

type AccountingGroup = { id: string; name: string };
type Profile = { id: string; name: string };

type ManageEditDialogProps = {
  editingItem: SubsidyItem | null;
  onClose: () => void;
  editForm: EditFormState;
  onEditFormChange: (form: EditFormState) => void;
  onSubmit: () => void;
  onDelete: (id: string) => void;
  isSubmitting: boolean;
  isAdmin: boolean;
  profiles: Profile[];
  accountingGroups: AccountingGroup[];
  file: File | null;
  onFileChange: (file: File | null) => void;
  evidenceFile: File | null;
  onEvidenceFileChange: (file: File | null) => void;
};

export function ManageEditDialog({
  editingItem,
  onClose,
  editForm,
  onEditFormChange,
  onSubmit,
  onDelete,
  isSubmitting,
  isAdmin,
  profiles,
  accountingGroups,
  file,
  onFileChange,
  evidenceFile,
  onEvidenceFileChange,
}: ManageEditDialogProps) {
  return (
    <Dialog
      open={editingItem !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>申請情報の編集</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto">
          {/* 非管理者: 申請理由の読み取り専用表示 */}
          {!isAdmin && editingItem?.justification && (
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right text-sm pt-1">申請理由</Label>
              <div className="col-span-3 text-sm whitespace-pre-wrap break-words bg-muted/50 rounded-md p-2">
                {editingItem.justification}
              </div>
            </div>
          )}

          {/* 管理者専用フィールド */}
          {isAdmin && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right text-sm">申請者</Label>
                <div className="col-span-3">
                  <Select
                    value={editForm.applicant_id}
                    onValueChange={(val) =>
                      onEditFormChange({ ...editForm, applicant_id: val })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="申請者を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((p) => (
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
                      onEditFormChange({ ...editForm, created_at: e.target.value })
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
                      onEditFormChange({
                        ...editForm,
                        receipt_date: e.target.value,
                      })
                    }
                  />
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
                      {Object.entries(EXPENSE_TYPE_MAP).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-right text-sm pt-1">申請理由</Label>
                <div className="col-span-3">
                  <Textarea
                    value={editForm.justification}
                    onChange={(e) =>
                      onEditFormChange({ ...editForm, justification: e.target.value })
                    }
                    placeholder="申請理由を入力"
                    className="resize-none"
                    rows={3}
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right text-sm">根拠書類</Label>
                <div className="col-span-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    対応形式: JPEG / PNG / WebP / GIF / HEIC / TIFF / BMP / PDF &nbsp;|&nbsp; 最大サイズ: 10MB
                  </p>
                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        document.getElementById("admin-evidence-upload")?.click()
                      }
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {evidenceFile ? "ファイルを変更" : "ファイルを選択"}
                    </Button>
                    <span className="text-sm text-muted-foreground truncate max-w-[150px]">
                      {evidenceFile
                        ? evidenceFile.name
                        : editingItem?.evidence_url
                          ? "登録済み(変更可)"
                          : "未登録"}
                    </span>
                    <Input
                      id="admin-evidence-upload"
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const selectedFile = e.target.files?.[0];
                        if (selectedFile) onEvidenceFileChange(selectedFile);
                      }}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 共通フィールド */}
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
                  onEditFormChange({ ...editForm, term: val })
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
            <Label className="text-right text-sm">算定額</Label>
            <div className="col-span-3">
              <Input
                type="number"
                value={editForm.calculated_amount}
                onChange={(e) =>
                  onEditFormChange({
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
                  onEditFormChange({
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
              <p className="text-xs text-muted-foreground mb-2">
                対応形式: JPEG / PNG / WebP / GIF / HEIC / TIFF / BMP / PDF &nbsp;|&nbsp; 最大サイズ: 10MB
              </p>
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
                    if (selectedFile) onFileChange(selectedFile);
                  }}
                />
              </div>
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

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right text-sm">備考</Label>
            <div className="col-span-3">
              <Input
                value={editForm.remarks}
                onChange={(e) =>
                  onEditFormChange({ ...editForm, remarks: e.target.value })
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
              if (editingItem) onDelete(editingItem.id);
            }}
            disabled={isSubmitting}
          >
            削除
          </Button>
          <div className="flex gap-2">
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
