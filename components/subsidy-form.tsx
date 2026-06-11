"use client";

/**
 * 支援金申請フォーム
 * ダイアログ内に表示される新規申請フォーム。
 * セクション: 種別選択 → 収支・日付 → 期・経費種別 → グループ → 項目・金額 → 理由・備考 → 書類
 */

import { useEffect, useState, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Upload, CalendarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { subsidyFormSchema } from "@/lib/schema";
import { uploadReceiptAction } from "@/app/actions";
import { createSubsidyItem } from "@/app/(authenticated)/subsidies/actions";
import { compressImageToWebp } from "@/lib/image";
import {
  CATEGORY_LABELS,
  CATEGORY_TERMS,
  EXPENSE_TYPE_LABELS,
  CATEGORY_EXPENSE_TYPES,
} from "@/lib/constants/subsidy";

type Category = {
  id: string;
  name: string;
};

type Props = {
  categories: Category[];
  triggerButton?: React.ReactNode;
};

/** Generate a unique file name for subsidy evidence uploads (module-scoped to avoid purity lint) */
function generateEvidenceFileName(fileExt: string | undefined): string {
  return `subsidy-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
}


export function SubsidyForm({ categories, triggerButton }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<z.infer<typeof subsidyFormSchema>>({
    resolver: zodResolver(subsidyFormSchema),
    defaultValues: {
      category: "activity",
      term: 1,
      expense_type: "facility",
      name: "",
      requested_amount: 0,
      justification: "",
      usage_period: "",
      remarks: "",
      income_type: "expense",
      date: new Date(),
      evidence_url: "",
    },
  });

  // useWatch で category を監視 (react-hooks/incompatible-library 回避)
  const selectedCategory = useWatch({ control: form.control, name: "category" });

  // 支援金種別が変わったら経費種別と期をリセット
  useEffect(() => {
    const validTerms = CATEGORY_TERMS[selectedCategory] || [1];
    const currentTerm = form.getValues("term");
    if (!validTerms.includes(currentTerm)) {
      form.setValue("term", validTerms[0]);
    }

    const validExpenseTypes = CATEGORY_EXPENSE_TYPES[selectedCategory] || [];
    const currentExpenseType = form.getValues("expense_type");
    if (!currentExpenseType || !validExpenseTypes.includes(currentExpenseType)) {
      form.setValue("expense_type", validExpenseTypes[0] as z.infer<typeof subsidyFormSchema>["expense_type"]);
    }
  }, [selectedCategory, form]);

  // ダイアログの開閉時にフォームとファイルをリセットする
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      form.reset({
        category: "activity",
        term: 1,
        expense_type: "facility",
        name: "",
        requested_amount: 0,
        justification: "",
        usage_period: "",
        remarks: "",
        income_type: "expense",
        date: new Date(),
        evidence_url: "",
      });
      setFile(null);
    }
    setOpen(nextOpen);
  };

  const availableTerms = useMemo(
    () => CATEGORY_TERMS[selectedCategory] || [1],
    [selectedCategory],
  );

  const availableExpenseTypes = useMemo(
    () => CATEGORY_EXPENSE_TYPES[selectedCategory] || [],
    [selectedCategory],
  );

  // --- 送信処理 ---
  async function onSubmit(values: z.infer<typeof subsidyFormSchema>) {
    try {
      if (!file) {
        toast.error("根拠書類をアップロードしてください");
        return;
      }

      let evidenceUrl: string = "";

      setIsUploading(true);
      try {
        const compressedFile = await compressImageToWebp(file);
        const fileExt = compressedFile.name.split(".").pop();
        const fileName = generateEvidenceFileName(fileExt);

        const formData = new FormData();
        formData.append("file", compressedFile);
        formData.append("fileName", fileName);

        const uploadResult = await uploadReceiptAction(formData);
        if (uploadResult.error) {
          toast.error("書類のアップロードに失敗しました");
          setIsUploading(false);
          return;
        }

        evidenceUrl = uploadResult.filePath ?? "";
      } catch {
        toast.error("書類のアップロード中にエラーが発生しました");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);

      const result = await createSubsidyItem({
        ...values,
        evidence_url: evidenceUrl,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("支援金申請を登録しました");
      form.reset();
      setFile(null);
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Subsidy submit error:", error);
      toast.error("予期せぬエラーが発生しました");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {triggerButton ? triggerButton : <Button>＋ 支援金申請</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>支援金の新規申請</DialogTitle>
          <DialogDescription>
            課外活動支援金等の申請内容を入力してください。
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* --- セクション: 支援金種別 --- */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>支援金種別</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-wrap gap-4"
                    >
                      {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                        <FormItem
                          key={val}
                          className="flex items-center space-x-2 space-y-0"
                        >
                          <FormControl>
                            <RadioGroupItem value={val} />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">
                            {label}
                          </FormLabel>
                        </FormItem>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* --- セクション: 収支区分・日付 --- */}
            <div className="grid grid-cols-2 gap-4">
              {/* 収支区分 */}
              <FormField
                control={form.control}
                name="income_type"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>収支区分</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex gap-4"
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 日付 */}
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col space-y-3 justify-end">
                    <FormLabel className="mb-1">日付</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            {field.value ? (
                              format(field.value, "yyyy年MM月dd日")
                            ) : (
                              <span>日付を選択</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          locale={ja}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* --- セクション: 申請期・経費種別 --- */}
            <div className="grid grid-cols-2 gap-4">
              {/* 申請期 */}
              <FormField
                control={form.control}
                name="term"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>申請期</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={String(field.value)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="期を選択" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableTerms.map((t) => (
                          <SelectItem key={t} value={String(t)}>
                            {t}期
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 経費種別 */}
              <FormField
                control={form.control}
                name="expense_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>経費種別</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="種別を選択" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableExpenseTypes.map((et) => (
                          <SelectItem key={et} value={et}>
                            {EXPENSE_TYPE_LABELS[et] || et}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* --- セクション: 会計グループ --- */}
            <FormField
              control={form.control}
              name="accounting_group_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>会計グループ</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="グループを選択してください" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* --- セクション: 項目名・金額 --- */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>項目名</FormLabel>
                  <FormControl>
                    <Input placeholder="例: テニスコート利用料" {...field} />
                  </FormControl>
                  <FormDescription>
                    申請する経費の具体的な品名を記載してください。
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="requested_amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>申請金額 (円)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="10000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* --- セクション: 申請理由・使用時期・備考 --- */}
            <FormField
              control={form.control}
              name="justification"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>申請理由</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="支援が必要な理由を記載してください..."
                      className="resize-none"
                      rows={3}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="usage_period"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>使用時期</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="例：2026年4月〜6月"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>備考（任意）</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="補足事項があれば記載してください..."
                      className="resize-none"
                      rows={3}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* --- セクション: 根拠書類アップロード --- */}
            <div className="space-y-2">
              <FormLabel>根拠書類</FormLabel>
              <FormDescription>
                見積書やHP等の料金が記載された資料をアップロードしてください。
              </FormDescription>
              <p className="text-xs text-muted-foreground">
                対応形式: JPEG / PNG / WebP / GIF / HEIC / TIFF / BMP / PDF &nbsp;|&nbsp; 最大サイズ: 10MB
              </p>
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    document.getElementById("subsidy-evidence-upload")?.click()
                  }
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {file ? "ファイルを変更" : "ファイルを選択"}
                </Button>
                <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                  {file ? file.name : "選択されていません"}
                </span>
                <Input
                  id="subsidy-evidence-upload"
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

            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting || isUploading}
            >
              {(form.formState.isSubmitting || isUploading) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isUploading ? "書類を送信中..." : "申請する"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
