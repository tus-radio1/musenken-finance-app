"use client";

import { useRouter } from "next/navigation";

interface YearSelectorProps {
  fiscalYears: Array<{ year: number; is_current: boolean }>;
  selectedYear?: number;
}

export function YearSelector({ fiscalYears, selectedYear }: YearSelectorProps) {
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

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const year = e.target.value;
    router.push(`/budget?year=${year}`);
  };

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium">年度:</label>
      <select
        name="year"
        value={selectedYear}
        className="border rounded px-3 py-1.5 text-sm"
        onChange={handleYearChange}
      >
        {fiscalYears.map((fy) => (
          <option key={fy.year} value={fy.year}>
            {fy.year}年度{fy.is_current ? " (現在)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
