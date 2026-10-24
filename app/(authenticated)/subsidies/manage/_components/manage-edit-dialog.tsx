"use client";

/**
 * 支援金管理画面: 編集ダイアログ
 * 管理者/非管理者で表示フィールドが分岐する申請情報の編集フォーム。
 */

import { Loader2 } from "lucide-react";
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
import { FileDropzone } from "@/components/receipt/file-dropzone";
import { DIALOG_WIDTH_CLASS } from "@/components/layout/page-shell";

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
  uploadError?: string | null;
  evidenceUploadError?: string | null;
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
  uploadError,
  evidenceUploadError,
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
      <DialogContent className={`${DIALOG_WIDTH_CLASS.form} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>申請情報の編集</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]">
          <div className="grid content-start gap-3 md:grid-cols-2">
            {/* 非管理者: 申請理由の読み取り専用表示 */}
            {!isAdmin && editingItem?.justification && (
              <div className="space-y-2 md:col-span-2">
                <p className="text-sm font-medium">申請理由</p>
                <div className="text-sm whitespace-pre-wrap break-words bg-muted/50 rounded-md p-2">
                  {editingItem.justification}
                </div>
              </div>
            )}

            {/* 管理者専用フィールド */}
            {isAdmin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="manage-edit-applicant">申請者</Label>
                  <div className="col-span-3">
                    <Select
                      value={editForm.applicant_id}
                      onValueChange={(val) =>
                        onEditFormChange({ ...editForm, applicant_id: val })
                      }
                    >
                      <SelectTrigger id="manage-edit-applicant">
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

                <div className="space-y-2">
                  <Label htmlFor="manage-edit-created-at">申請日時</Label>
                  <div className="col-span-3">
                    <Input
                      id="manage-edit-created-at"
                      type="date"
                      value={editForm.created_at}
                      onChange={(e) =>
                        onEditFormChange({ ...editForm, created_at: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manage-edit-receipt-date">受領日</Label>
                  <div className="col-span-3">
                    <Input
                      id="manage-edit-receipt-date"
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

                <div className="space-y-2">
                  <Label htmlFor="manage-edit-expense-type">経費種別</Label>
                  <div className="col-span-3">
                    <Select
                      value={editForm.expense_type}
                      onValueChange={(val) =>
                        onEditFormChange({ ...editForm, expense_type: val })
                      }
                    >
                      <SelectTrigger id="manage-edit-expense-type">
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

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="manage-edit-justification">申請理由</Label>
                  <div className="col-span-3">
                    <Textarea
                      id="manage-edit-justification"
                      value={editForm.justification}
                      onChange={(e) =>
                        onEditFormChange({ ...editForm, justification: e.target.value })
                      }
                      placeholder="申請理由を入力"
                      className="resize-none"
                      rows={2}
                    />
                  </div>
                </div>
              </>
            )}

            {/* 共通フィールド */}
            <div className="space-y-2">
              <Label htmlFor="manage-edit-category">カテゴリ</Label>
              <div className="col-span-3">
                <Select
                  value={editForm.category}
                  onValueChange={(val) =>
                    onEditFormChange({ ...editForm, category: val })
                  }
                >
                  <SelectTrigger id="manage-edit-category">
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

            <div className="space-y-2">
              <Label htmlFor="manage-edit-term">期</Label>
              <div className="col-span-3">
                <Select
                  value={editForm.term}
                  onValueChange={(val) =>
                    onEditFormChange({ ...editForm, term: val })
                  }
                >
                  <SelectTrigger id="manage-edit-term">
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

            <div className="space-y-2">
              <Label htmlFor="manage-edit-accounting-group">会計区分</Label>
              <div className="col-span-3">
                <Select
                  value={editForm.accounting_group_id}
                  onValueChange={(val) =>
                    onEditFormChange({ ...editForm, accounting_group_id: val })
                  }
                >
                  <SelectTrigger id="manage-edit-accounting-group">
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
              <Label htmlFor="manage-edit-name">項目名</Label>
              <div className="col-span-3">
                <Input
                  id="manage-edit-name"
                  value={editForm.name}
                  onChange={(e) =>
                    onEditFormChange({ ...editForm, name: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manage-edit-requested-amount">申請額</Label>
              <div className="col-span-3">
                <Input
                  id="manage-edit-requested-amount"
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
              <Label htmlFor="manage-edit-calculated-amount">算定額</Label>
              <div className="col-span-3">
                <Input
                  id="manage-edit-calculated-amount"
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

            <div className="space-y-2">
              <Label htmlFor="manage-edit-actual-amount">実経費額</Label>
              <div className="col-span-3">
                <Input
                  id="manage-edit-actual-amount"
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

            <div className="space-y-2">
              <Label htmlFor="manage-edit-usage-period">使用時期</Label>
              <div className="col-span-3">
                <Input
                  id="manage-edit-usage-period"
                  value={editForm.usage_period}
                  onChange={(e) =>
                    onEditFormChange({ ...editForm, usage_period: e.target.value })
                  }
                  placeholder="例：2026年4月〜6月"
                />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="manage-edit-remarks">備考</Label>
              <div className="col-span-3">
                <Input
                  id="manage-edit-remarks"
                  value={editForm.remarks}
                  onChange={(e) =>
                    onEditFormChange({ ...editForm, remarks: e.target.value })
                  }
                  placeholder="備考を入力"
                />
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-3 lg:min-h-[24rem]">
            {isAdmin && (
              <FileDropzone
                label="根拠書類"
                file={evidenceFile}
                onFileChange={onEvidenceFileChange}
                existingUrl={editingItem?.evidence_url}
                disabled={isSubmitting}
                error={evidenceUploadError}
                className="flex flex-1 flex-col"
                dropzoneClassName="lg:flex-1"
              />
            )}
            <FileDropzone
              label="領収書画像"
              file={file}
              onFileChange={onFileChange}
              existingUrl={editingItem?.receipt_url}
              disabled={isSubmitting}
              error={uploadError}
              className="flex flex-1 flex-col"
              dropzoneClassName="lg:flex-1"
            />
          </div>
          <DialogFooter className="lg:col-span-2">
            <Button
              variant="destructive"
              className="w-full md:w-auto"
              onClick={() => {
                if (editingItem) onDelete(editingItem.id);
              }}
              disabled={isSubmitting}
            >
              削除
            </Button>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
