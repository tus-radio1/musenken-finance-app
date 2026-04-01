"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarIcon, Loader2, FileText } from "lucide-react";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Upload } from "lucide-react";
import {
  createTransaction,
  updateTransaction,
  uploadReceiptAction,
} from "@/app/actions";

import { formSchema } from "@/lib/schema";
import { ROLE_TYPES } from "@/lib/roles/constants";
import { compressImageToWebp } from "@/lib/image";
import { parseDateInputValue, parseDateOnly } from "@/lib/date";
import { ACCOUNTING_USER_ID_FALLBACK } from "@/lib/system-config.shared";

// DBから取得したカテゴリーの型定義
type Category = {
  id: string;
  name: string;
};
type Props = {
  categories: Category[];
  initialData?: any;
  triggerButton?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  userRole?: "admin" | "accounting" | "general" | null;
  users?: { id: string; name: string }[];
  accountingUserId?: string;
};

export function TransactionForm({
  categories,
  initialData,
  triggerButton,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  userRole,
  users,
  accountingUserId = ACCOUNTING_USER_ID_FALLBACK,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen: (open: boolean) => void = isControlled
    ? (setControlledOpen ?? (() => {}))
    : setInternalOpen;

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const router = useRouter();

  const isEditing = !!initialData;
  // 編集権限(canEdit)の確認は呼び出し元やサーバー側で行われているため、フォームが開けたならコア編集可能
  const preventCoreEdits = false;

  const defaultValues = initialData
    ? {
        date: parseDateOnly(initialData.date),
        amount: Math.abs(initialData.amount),
        type: initialData.amount < 0 ? "expense" : "income",
        accounting_group_id: initialData.accounting_group_id,
        description: initialData.description,
        remarks: initialData.remarks || "",
        created_by: initialData.created_by,
        approved_by: initialData.approved_by || null,
        approval_status: initialData.approval_status || "pending",
      }
    : {
        date: new Date(),
        amount: 0,
        type: "expense",
        description: "",
        remarks: "",
      };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues as any,
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultValues as any);
      setFile(null);
    }
  }, [open, initialData]);

  // 送信時の処理
  async function onSubmit(values: z.input<typeof formSchema>) {
    try {
      let receiptPath: string | null | undefined = undefined;
      const transactionId = initialData?.id || crypto.randomUUID();

      // 1. ファイルがあればストレージにアップロード
      if (file) {
        setIsUploading(true);

        try {
          // 画像の圧縮とWebP化
          const compressedFile = await compressImageToWebp(file);

          const fileExt = compressedFile.name.split(".").pop();
          const fileName = `${transactionId}_${Date.now()}.${fileExt}`;

          const formData = new FormData();
          formData.append("file", compressedFile);
          formData.append("fileName", fileName);
          // Pass existing receipt path so the server can delete the old file
          // when the extension changes (e.g., .webp -> .pdf)
          if (initialData?.receipt_url) {
            formData.append("existingPath", initialData.receipt_url);
          }

          const result = await uploadReceiptAction(formData);

          if (result.error) {
            toast.error(result.error);
            setIsUploading(false);
            return;
          }

          receiptPath = result.filePath;
        } catch (error) {
          console.error("Image processing error:", error);
          toast.error("画像の処理中にエラーが発生しました");
          setIsUploading(false);
          return;
        }

        setIsUploading(false);
      }

      if (!initialData && receiptPath === undefined) {
        receiptPath = null;
      }

      let result;
      if (initialData) {
        result = await updateTransaction(initialData.id, {
          ...(values as any),
          receipt_url: receiptPath,
        });
      } else {
        result = await createTransaction(
          values as z.infer<typeof formSchema>,
          receiptPath,
          transactionId,
        );
      }

      if ((result as any).error) {
        toast.error((result as any).error);
        return;
      }

      toast.success(initialData ? "変更を保存しました" : "取引を登録しました");
      form.reset();
      setFile(null);
      setOpen(false);
      // Server ActionのrevalidatePathにより次回ナビゲーション時にデータが更新される
      // 現在のページを即座にリフレッシュするためwindow.dispatchEventでカスタムイベントを発信し、router.refreshでサーバーデータを再取得
      window.dispatchEvent(new Event("ledger-refresh"));
      router.refresh();
    } catch (error) {
      console.error("Transaction submit error:", error);
      toast.error("予期せぬエラーが発生しました");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerButton ? triggerButton : <Button>＋ 新規申請</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialData ? "取引の編集" : "新規取引の登録"}
          </DialogTitle>
          <DialogDescription>
            領収書の内容を入力してください。
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* 収支タイプ (ラジオボタン) */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem className="space-y-3">
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

            <div className="grid grid-cols-2 gap-4">
              {/* 日付選択 */}
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
                            disabled={preventCoreEdits}
                          >
                            <CalendarIcon className="h-4 w-4" />
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

              {/* 金額入力 */}
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

            {/* カテゴリー選択 */}
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

            {/* 概要入力 */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
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

            {/* Admin用: 申請者変更 */}
            {initialData && userRole === ROLE_TYPES.ADMIN && users && (
              <FormField
                control={form.control}
                name="created_by"
                render={({ field }) => {
                  const options = users.some(
                    (u) => u.id === accountingUserId,
                  )
                    ? users
                    : [
                        {
                          id: accountingUserId,
                          name: "会計",
                        },
                        ...users,
                      ];
                  return (
                    <FormItem>
                      <FormLabel>申請者</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="申請者を選択" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {options.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            )}

            {/* Admin/Accounting用: 承認ステータス変更 */}
            {initialData &&
              (userRole === ROLE_TYPES.ADMIN || userRole === ROLE_TYPES.ACCOUNTING) && (
                <FormField
                  control={form.control}
                  name="approval_status"
                  render={({ field }) => {
                    const currentType = form.watch("type");

                    // Statuses per type
                    const statuses =
                      currentType === "expense"
                        ? [
                            { value: "pending", label: "受付中" },
                            { value: "accepted", label: "受付済" },
                            { value: "approved", label: "承認済" },
                            { value: "rejected", label: "却下" },
                            { value: "refunded", label: "返金済" },
                          ]
                        : [
                            { value: "pending", label: "受付中" },
                            { value: "accepted", label: "受付済" },
                            { value: "approved", label: "承認済" },
                            { value: "rejected", label: "却下" },
                            { value: "received", label: "受領済" },
                          ];

                    return (
                      <FormItem>
                        <FormLabel>承認ステータス</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="ステータスを選択" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {statuses.map((st) => (
                              <SelectItem key={st.value} value={st.value}>
                                {st.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              )}

            {/* Admin用: 承認者変更 */}
            {initialData && userRole === ROLE_TYPES.ADMIN && users && (
              <FormField
                control={form.control}
                name="approved_by"
                render={({ field }) => {
                  const options = users.some(
                    (u) => u.id === accountingUserId,
                  )
                    ? users
                    : [
                        {
                          id: accountingUserId,
                          name: "会計",
                        },
                        ...users,
                      ];
                  return (
                    <FormItem>
                      <FormLabel>承認者</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || undefined}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="承認者を選択" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="clear" className="text-gray-400">
                            (未設定)
                          </SelectItem>
                          {options.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            )}

            {/* 備考 (全ユーザー編集可能) */}
            <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
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

            <div className="space-y-2">
              <FormLabel>領収書データ (任意)</FormLabel>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      document.getElementById("receipt-upload")?.click()
                    }
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {file ? "データを変更" : "データを選択"}
                  </Button>
                  <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                    {file ? file.name : "選択されていません"}
                  </span>
                  <Input
                    id="receipt-upload"
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden" // 見た目を隠してButtonで制御
                    onChange={(e) => {
                      const selectedFile = e.target.files?.[0];
                      if (selectedFile) setFile(selectedFile);
                    }}
                  />
                </div>
                {file && file.type.startsWith("image/") && (
                  <div className="w-full max-w-[200px] border rounded-md overflow-hidden bg-muted flex flex-col items-center justify-center p-2">
                    <img
                      src={URL.createObjectURL(file)}
                      alt="プレビュー"
                      className="object-contain max-h-[150px] w-auto h-auto rounded-sm"
                    />
                  </div>
                )}
                {file && file.type === "application/pdf" && (
                  <div className="w-full max-w-[200px] h-24 border rounded-md bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground flex-col gap-2">
                    <FileText className="h-8 w-8 text-muted-foreground/60" />
                    <span>PDFデータ</span>
                  </div>
                )}
              </div>
            </div>

            {/* 大学支援の設定はスキーマ変更に伴い削除 */}

            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting || isUploading}
            >
              {(form.formState.isSubmitting || isUploading) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isUploading ? "画像を送信中..." : "登録する"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
