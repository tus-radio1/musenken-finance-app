"use client";

import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
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
import { createClient } from "@/utils/supabase/client";
import { createSubsidyItem } from "@/app/subsidies/actions";

type Category = {
  id: string;
  name: string;
};

type Props = {
  categories: Category[];
  triggerButton?: React.ReactNode;
};

// 支援金種別ごとの表示名
const CATEGORY_LABELS: Record<string, string> = {
  activity: "活動支援金",
  league: "連盟登録支援金",
  special: "特別支援金",
};

// 支援金種別ごとに選択可能な期数
const CATEGORY_TERMS: Record<string, number[]> = {
  activity: [1, 2],
  league: [1, 2],
  special: [1, 2, 3],
};

// 経費種別の表示名
const EXPENSE_TYPE_LABELS: Record<string, string> = {
  facility: "施設等使用料",
  participation: "試合等参加費",
  equipment: "備品購入費",
  registration: "連盟登録費",
  travel: "旅費",
  accommodation: "宿泊費",
  tournament: "大会参加費等",
  expensive_goods: "高額物品購入費等",
  other: "その他",
};

// 支援金種別ごとに選択可能な経費種別
const CATEGORY_EXPENSE_TYPES: Record<string, string[]> = {
  activity: ["facility", "participation", "equipment"],
  league: ["registration"],
  special: ["tournament", "expensive_goods", "other"],
};

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
      income_type: "expense",
      date: new Date(),
      evidence_url: "",
    },
  });

  const selectedCategory = form.watch("category");

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
      form.setValue("expense_type", validExpenseTypes[0] as any);
    }
  }, [selectedCategory, form]);

  useEffect(() => {
    if (open) {
      form.reset({
        category: "activity",
        term: 1,
        expense_type: "facility",
        name: "",
        requested_amount: 0,
        justification: "",
        income_type: "expense",
        date: new Date(),
        evidence_url: "",
      });
      setFile(null);
    }
  }, [open, form]);

  const availableTerms = useMemo(
    () => CATEGORY_TERMS[selectedCategory] || [1],
    [selectedCategory],
  );

  const availableExpenseTypes = useMemo(
    () => CATEGORY_EXPENSE_TYPES[selectedCategory] || [],
    [selectedCategory],
  );

  async function onSubmit(values: z.infer<typeof subsidyFormSchema>) {
    try {
      if (!file) {
        toast.error("根拠書類をアップロードしてください");
        return;
      }

      let evidenceUrl: string = "";

      // ファイルアップロード
      if (file) {
        setIsUploading(true);
        const supabase = createClient();
        const fileExt = file.name.split(".").pop();
        const fileName = `subsidy-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(fileName, file);

        if (uploadError) {
          toast.error("書類のアップロードに失敗しました");
          console.error(uploadError);
          setIsUploading(false);
          return;
        }

        evidenceUrl = fileName;
        setIsUploading(false);
      }

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerButton ? triggerButton : <Button>＋ 支援金申請</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>支援金の新規申請</DialogTitle>
          <DialogDescription>
            課外活動支援金等の申請内容を入力してください。
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* 支援金種別 */}
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

            {/* 項目名 */}
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

            {/* 申請金額 */}
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

            {/* 申請理由 */}
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

            {/* 根拠書類アップロード */}
            <div className="space-y-2">
              <FormLabel>根拠書類</FormLabel>
              <FormDescription>
                見積書やHP等の料金が記載された資料をアップロードしてください。
              </FormDescription>
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
