/**
 * 日付変換・フォーマットユーティリティ。
 *
 * すべての日付処理は JST (Asia/Tokyo) を基準にする。
 * DB には "YYYY-MM-DD" 形式の date-only 文字列で保存し、
 * タイムゾーンずれによる日付境界の食い違いを防いでいる。
 *
 * 会計年度の定義: N年4月〜N+1年3月 を「N年度」とする。
 * 3/31 は前年度、4/1 は当年度に属する。
 * この境界ロジックは supabase/functions/update-fiscal-year/index.ts の
 * computeFiscalYear() と fiscal_years テーブルの start_date/end_date で管理する。
 */

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const JAPAN_TIME_ZONE = "Asia/Tokyo";

function formatDatePartsInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to format date parts");
  }

  return `${year}-${month}-${day}`;
}

export function isDateOnlyString(value: string): boolean {
  return DATE_ONLY_PATTERN.test(value);
}

export function formatDateForDatabase(date: Date): string {
  return formatDatePartsInTimeZone(date, JAPAN_TIME_ZONE);
}

export function parseDateOnly(value: string): Date {
  if (!isDateOnlyString(value)) {
    throw new Error(`Invalid date-only string: ${value}`);
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function parseDateInputValue(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/\//g, "-");
  if (isDateOnlyString(normalized)) {
    return parseDateOnly(normalized);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function formatStoredDate(
  value: string | null | undefined,
  separator = "/",
): string {
  if (!value) {
    return "";
  }

  if (isDateOnlyString(value)) {
    return value.replaceAll("-", separator);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return formatDatePartsInTimeZone(parsed, JAPAN_TIME_ZONE).replaceAll(
    "-",
    separator,
  );
}

export function toDateInputValue(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  if (isDateOnlyString(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return formatDatePartsInTimeZone(parsed, JAPAN_TIME_ZONE);
}

export function dateInputValueToJstTimestamp(value: string): string {
  if (!isDateOnlyString(value)) {
    throw new Error(`Invalid date input value: ${value}`);
  }

  return `${value}T00:00:00+09:00`;
}

export function getSortableDateValue(
  value: string | null | undefined,
): number {
  if (!value) {
    return 0;
  }

  if (isDateOnlyString(value)) {
    return parseDateOnly(value).getTime();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 0;
  }

  return parsed.getTime();
}
