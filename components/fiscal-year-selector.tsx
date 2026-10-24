"use client";

/**
 * 会計年度セレクタ。
 *
 * 年度一覧は fiscal_years テーブルから取得し、選択値を URL クエリパラメータ (?year=YYYY)
 * として反映する。年度の定義は4月始まり（lib/date.ts のヘッダーコメント参照）。
 */

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FiscalYearSelectorProps {
  fiscalYears: Array<{ year: number; is_current: boolean }>;
  selectedYear?: number;
  basePath: string;
}

export function FiscalYearSelector({
  fiscalYears,
  selectedYear,
  basePath,
}: FiscalYearSelectorProps) {
  const router = useRouter();

  if (!fiscalYears || fiscalYears.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          年度データがありません
        </span>
      </div>
    );
  }

  const handleYearChange = (year: string) => {
    router.push(`${basePath}?year=${year}`);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">年度:</span>
      <Select
        value={selectedYear?.toString()}
        onValueChange={handleYearChange}
      >
        <SelectTrigger aria-label="年度" className="w-[150px]">
          <SelectValue placeholder="年度" />
        </SelectTrigger>
        <SelectContent>
          {fiscalYears.map((fy) => (
            <SelectItem key={fy.year} value={String(fy.year)}>
              {fy.year}年度{fy.is_current ? " (現在)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
