"use client";

/**
 * 管理者/会計担当者向けの追加フォームフィールド。
 * 申請者変更・承認ステータス変更・承認者変更を担当する。
 * form.watch を useWatch に置き換えて incompatible-library 警告を解消。
 */

import { useWatch, type UseFormReturn } from "react-hook-form";
import type { z } from "zod";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_TYPES } from "@/lib/roles/constants";
import type { formSchema } from "@/lib/schema";

type FormValues = z.infer<typeof formSchema>;

type Props = {
  form: UseFormReturn<FormValues>;
  userRole?: "admin" | "accounting" | "general" | null;
  users?: { id: string; name: string }[];
  accountingUserId: string;
  isEditing: boolean;
};

export function AdminFields({
  form,
  userRole,
  users,
  accountingUserId,
  isEditing,
}: Props) {
  // useWatch で type フィールドを監視し incompatible-library 警告を回避
  const currentType = useWatch({ control: form.control, name: "type" });

  if (!isEditing) return null;

  // 会計ユーザーを含むユーザーリスト
  const buildOptions = () => {
    if (!users) return [];
    return users.some((u) => u.id === accountingUserId)
      ? users
      : [{ id: accountingUserId, name: "会計" }, ...users];
  };

  return (
    <>
      {/* Admin用: 申請者変更 */}
      {userRole === ROLE_TYPES.ADMIN && users && (
        <FormField
          control={form.control}
          name="created_by"
          render={({ field }) => {
            const options = buildOptions();
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
      {(userRole === ROLE_TYPES.ADMIN || userRole === ROLE_TYPES.ACCOUNTING) && (
        <FormField
          control={form.control}
          name="approval_status"
          render={({ field }) => {
            const statuses =
              currentType === "expense"
                ? [
                    { value: "pending", label: "受付中" },
                    { value: "accepted", label: "受付済" },
                    { value: "approved", label: "承認済" },
                    { value: "rejected", label: "却下" },
                    { value: "refunded", label: "処理済(確定)" },
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
      {userRole === ROLE_TYPES.ADMIN && users && (
        <FormField
          control={form.control}
          name="approved_by"
          render={({ field }) => {
            const options = buildOptions();
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
    </>
  );
}
