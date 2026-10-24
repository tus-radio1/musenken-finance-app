/**
 * Shared constants for subsidy (支援金) domain.
 *
 * Single source of truth consumed by subsidy-form, subsidy-items-table,
 * and subsidies/manage/client-page.
 */

/** 支援金種別の表示名 */
export const CATEGORY_LABELS: Record<string, string> = {
  activity: "活動支援金",
  league: "連盟登録支援金",
  special: "特別支援金",
};

/** 支援金種別ごとに選択可能な期数 */
export const CATEGORY_TERMS: Record<string, number[]> = {
  activity: [1, 2],
  league: [1, 2],
  special: [1, 2, 3],
};

/** 経費種別の表示名 */
export const EXPENSE_TYPE_LABELS: Record<string, string> = {
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

/** 支援金種別ごとに選択可能な経費種別 */
export const CATEGORY_EXPENSE_TYPES: Record<string, string[]> = {
  activity: ["facility", "participation", "equipment"],
  league: ["registration"],
  special: ["tournament", "expensive_goods", "other"],
};

/** 支援金種別バッジの色 (テーブル用) */
export const CATEGORY_BADGE_COLORS: Record<string, string> = {
  activity: "bg-emerald-100 text-emerald-800 border-emerald-200",
  league: "bg-sky-100 text-sky-800 border-sky-200",
  special: "bg-amber-100 text-amber-800 border-amber-200",
};
