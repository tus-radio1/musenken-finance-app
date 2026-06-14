"use client";

/**
 * Transfer form dialog for creating fund transfers between financial accounts.
 * Creates two transaction rows atomically via the create_transfer RPC.
 */

import { useState } from "react";
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
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { transferFormSchema } from "@/lib/schema";
import { parseDateInputValue } from "@/lib/date";
import { formatDateForDatabase } from "@/lib/date";
import { createTransfer } from "@/app/(authenticated)/ledger/actions";

type FinancialAccount = {
  id: string;
  name: string;
};

type Props = {
  financialAccounts: FinancialAccount[];
  triggerButton?: React.ReactNode;
};

type TransferFormValues = z.infer<typeof transferFormSchema>;

function TransferFormInner({
  financialAccounts,
  onClose,
}: {
  financialAccounts: FinancialAccount[];
  onClose: () => void;
}) {
  const router = useRouter();

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      date: new Date(),
      amount: 0,
      from_account_id: "",
      to_account_id: "",
      description: "",
      remarks: "",
    },
  });

  async function onSubmit(values: TransferFormValues) {
    try {
      const result = await createTransfer({
        date: formatDateForDatabase(values.date),
        amount: values.amount,
        fromAccountId: values.from_account_id,
        toAccountId: values.to_account_id,
        description: values.description,
        receiptUrl: values.receipt_url ?? null,
        remarks: values.remarks ?? null,
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("資金移動を登録しました");
      form.reset();
      onClose();
      window.dispatchEvent(new Event("ledger-refresh"));
      router.refresh();
    } catch (error) {
      console.error("Transfer submit error:", error);
      toast.error("予期せぬエラーが発生しました");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Date */}
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
                    <Button variant="outline" size="icon">
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

        {/* From / To accounts */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="from_account_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>移動元財布</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="選択" />
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

          <FormField
            control={form.control}
            name="to_account_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>移動先財布</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="選択" />
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
        </div>

        {/* Amount */}
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>金額 (円)</FormLabel>
              <FormControl>
                <Input type="number" placeholder="10000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Description */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>摘要</FormLabel>
              <FormControl>
                <Input
                  placeholder="例: 銀行口座から金庫へ移動"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Remarks */}
        <FormField
          control={form.control}
          name="remarks"
          render={({ field }) => (
            <FormItem>
              <FormLabel>備考 (任意)</FormLabel>
              <FormControl>
                <Input
                  placeholder="追加のメモ"
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          資金移動を登録
        </Button>
      </form>
    </Form>
  );
}

export function TransferForm({
  financialAccounts,
  triggerButton,
}: Props) {
  const [open, setOpen] = useState(false);
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
        {triggerButton || (
          <Button variant="outline">資金移動</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>資金移動の登録</DialogTitle>
          <DialogDescription>
            金庫と銀行口座間の資金移動を記録します。
          </DialogDescription>
        </DialogHeader>

        {open && (
          <TransferFormInner
            key={formKey}
            financialAccounts={financialAccounts}
            onClose={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
