"use client";

/**
 * 取引登録/編集フォーム。
 * 管理者フィールドは components/transaction/admin-fields.tsx に分離。
 * 領収書アップロードは components/transaction/receipt-upload.tsx に分離。
 * P-6: URL.createObjectURL のリークを ReceiptUpload 内で修正済み。
 * B-4: useEffect の exhaustive-deps 警告を key によるリマウントで回避。
 */

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createTransaction,
  updateTransaction,
} from "@/app/actions";

import { formSchema } from "@/lib/schema";
import { useReceiptUpload } from "@/components/receipt/use-receipt-upload";
import { parseDateInputValue, parseDateOnly } from "@/lib/date";
import { ACCOUNTING_USER_ID_FALLBACK } from "@/lib/system-config.shared";

import { ReceiptUpload } from "@/components/transaction/receipt-upload";
import { AdminFields } from "@/components/transaction/admin-fields";
import { DIALOG_WIDTH_CLASS } from "@/components/layout/page-shell";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type Category = {
  id: string;
  name: string;
};

type TransactionData = {
  id: string;
  date: string | null;
  amount: number;
  description: string | null;
  accounting_group_id?: string | null;
  financial_account_id?: string | null;
  approval_status?: string | null;
  receipt_url?: string | null;
  remarks?: string | null;
  created_by?: string | null;
  approved_by?: string | null;
};

type FinancialAccount = {
  id: string;
  name: string;
};

type Props = {
  categories: Category[];
  initialData?: TransactionData;
  triggerButton?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  userRole?: "admin" | "accounting" | "general" | null;
  users?: { id: string; name: string }[];
  accountingUserId?: string;
  financialAccounts?: FinancialAccount[];
  /** Default financial_account_id to pre-select */
  defaultFinancialAccountId?: string;
  /** Whether the approval status field is shown (edit form only). */
  canChangeApprovalStatus?: boolean;
};

// ---------------------------------------------------------------------------
// フォーム内部コンポーネント — key でリマウントして exhaustive-deps を回避 (B-4)
// ---------------------------------------------------------------------------

type FormValues = z.infer<typeof formSchema>;

function TransactionFormInner({
  categories,
  initialData,
  userRole,
  users,
  accountingUserId,
  onClose,
  financialAccounts,
  defaultFinancialAccountId,
  canChangeApprovalStatus,
}: {
  categories: Category[];
  initialData?: TransactionData;
  userRole?: "admin" | "accounting" | "general" | null;
  users?: { id: string; name: string }[];
  accountingUserId: string;
  onClose: () => void;
  financialAccounts?: FinancialAccount[];
  defaultFinancialAccountId?: string;
  canChangeApprovalStatus?: boolean;
}) {
  const { file, setFile, upload, withSubmission, isUploading, error: uploadError } = useReceiptUpload();
  const router = useRouter();

  const preventCoreEdits = false;

  const defaultValues = useMemo(
    (): FormValues =>
      initialData
        ? {
            date: parseDateOnly(initialData.date ?? ""),
            amount: Math.abs(initialData.amount),
            type: (initialData.amount < 0 ? "expense" : "income") as FormValues["type"],
            accounting_group_id: initialData.accounting_group_id ?? "",
            financial_account_id:
              initialData.financial_account_id ??
              defaultFinancialAccountId ??
              financialAccounts?.[0]?.id ??
              "",
            description: initialData.description ?? "",
            remarks: initialData.remarks || "",
            created_by: initialData.created_by ?? undefined,
            approved_by: initialData.approved_by || null,
            approval_status: (initialData.approval_status || "pending") as FormValues["approval_status"],
          }
        : {
            date: new Date(),
            amount: 0,
            type: "expense",
            accounting_group_id: "",
            financial_account_id:
              defaultFinancialAccountId ??
              financialAccounts?.[0]?.id ??
              "",
            description: "",
            remarks: "",
          },
    [initialData, financialAccounts, defaultFinancialAccountId],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  async function onSubmit(values: z.input<typeof formSchema>) {
    await withSubmission(async () => {
      try {
        let receiptPath: string | null | undefined = undefined;
        const transactionId = initialData?.id || crypto.randomUUID();

        if (file) {
          const uploaded = await upload();
          if (uploaded.error !== undefined) {
            toast.error(uploaded.error);
            return;
          }
          receiptPath = uploaded.filePath;
        }

        if (!initialData && receiptPath === undefined) {
          receiptPath = null;
        }

        let result;
        if (initialData) {
          result = await updateTransaction(initialData.id, {
            ...values,
            receipt_url: receiptPath,
          });
        } else {
          result = await createTransaction(
            values as z.infer<typeof formSchema>,
            receiptPath,
            transactionId,
          );
        }

        if ("error" in result) {
          toast.error(result.error);
          return;
        }

        toast.success(initialData ? "変更を保存しました" : "取引を登録しました");
        form.reset();
        setFile(null);
        onClose();
        window.dispatchEvent(new Event("ledger-refresh"));
        router.refresh();
      } catch (error) {
        console.error("Transaction submit error:", error);
        toast.error("予期せぬエラーが発生しました");
      }
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]"
      >
        <div className="grid content-start gap-3 md:grid-cols-2">
          {/* 収支タイプ */}
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem
                className={
                  financialAccounts?.length
                    ? "space-y-2 md:col-span-2"
                    : "space-y-2"
                }
              >
                <FormLabel>収支区分</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    className="flex space-x-4"
                    disabled={preventCoreEdits}
                  >
                    <FormItem className="flex items-center space-x-2 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="expense" />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        支出
                      </FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-2 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="income" />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        収入
                      </FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
              </FormItem>
            )}
          />

          {/* 会計グループ */}
          <FormField
            control={form.control}
            name="accounting_group_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>会計グループ</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={preventCoreEdits}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="グループを選択してください" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 財布 (Financial Account) */}
          {financialAccounts && financialAccounts.length > 0 && (
            <FormField
              control={form.control}
              name="financial_account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>財布</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="財布を選択してください" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {financialAccounts.map((fa) => (
                        <SelectItem key={fa.id} value={fa.id}>
                          {fa.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* 日付 + 金額 */}
          <div className="grid gap-3 md:grid-cols-2 md:col-span-2">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>日付</FormLabel>
                  <div className="flex gap-2 items-center">
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="2024/01/01"
                        disabled={preventCoreEdits}
                        value={
                          field.value ? format(field.value, "yyyy/MM/dd") : ""
                        }
                        onChange={(e) => {
                          const parsed = parseDateInputValue(e.target.value);
                          if (parsed) {
                            field.onChange(parsed);
                          }
                        }}
                        className="w-[140px]"
                      />
                    </FormControl>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          size="icon"
                          aria-label="日付を選択"
                          disabled={preventCoreEdits}
                        >
                          <CalendarIcon className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date > new Date() || date < new Date("1900-01-01")
                          }
                          locale={ja}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>金額 (円)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="1000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* 概要 */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>概要</FormLabel>
                <FormControl>
                  <Input placeholder="例: 秋月電子 パーツ代" {...field} />
                </FormControl>
                <FormDescription>
                  具体的な購入内容や店名を記載してください。
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 管理者/会計担当者用フィールド — 将来 transaction_kind / financial_account_id はここに追加 */}
          <AdminFields
            form={form}
            userRole={userRole}
            users={users}
            accountingUserId={accountingUserId}
            isEditing={!!initialData}
            canChangeApprovalStatus={canChangeApprovalStatus}
          />

          {/* 備考 */}
          <FormField
            control={form.control}
            name="remarks"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>備考 (任意)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="追加のコメントやメモ"
                    {...field}
                    value={field.value || ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

        </div>

        {/* 領収書アップロード */}
        <div className="min-w-0 lg:min-h-full">
          <ReceiptUpload
            file={file}
            onFileChange={setFile}
            existingUrl={initialData?.receipt_url}
            disabled={form.formState.isSubmitting || isUploading}
            error={uploadError}
            className="h-full lg:min-h-[24rem]"
            dropzoneClassName="lg:flex-1"
          />
        </div>

        <DialogFooter className="lg:col-span-2">
          <Button
            type="submit"
            className="w-full md:w-auto"
            disabled={form.formState.isSubmitting || isUploading}
          >
            {(form.formState.isSubmitting || isUploading) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {isUploading ? "画像を送信中..." : "登録する"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// ダイアログラッパー
// ---------------------------------------------------------------------------

export function TransactionForm({
  categories,
  initialData,
  triggerButton,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  userRole,
  users,
  accountingUserId = ACCOUNTING_USER_ID_FALLBACK,
  financialAccounts,
  defaultFinancialAccountId,
  canChangeApprovalStatus,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen: (open: boolean) => void = isControlled
    ? (setControlledOpen ?? (() => {}))
    : setInternalOpen;

  // open が変わるたびに key を更新し、フォームをリマウントして deps 問題を回避 (B-4)
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setFormKey((k) => k + 1);
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {triggerButton ? triggerButton : <Button>＋ 新規申請</Button>}
      </DialogTrigger>
      <DialogContent className={`${DIALOG_WIDTH_CLASS.form} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>
            {initialData ? "取引の編集" : "新規取引の登録"}
          </DialogTitle>
          <DialogDescription>
            領収書の内容を入力してください。
          </DialogDescription>
        </DialogHeader>

        {open && (
          <TransactionFormInner
            key={formKey}
            categories={categories}
            initialData={initialData}
            userRole={userRole}
            users={users}
            accountingUserId={accountingUserId}
            onClose={() => setOpen(false)}
            financialAccounts={financialAccounts}
            defaultFinancialAccountId={defaultFinancialAccountId}
            canChangeApprovalStatus={canChangeApprovalStatus}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
