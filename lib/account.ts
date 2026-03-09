import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(1, "氏名は必須です"),
  student_number: z.string().regex(/^\d{7}$/g, "学籍番号は7桁の数字です"),
  grade: z
    .number({ invalid_type_error: "学年は数値で入力してください" })
    .int()
    .min(1)
    .max(4),
  useCampusEmail: z.boolean().default(true),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// 学籍番号から入学年度の下二桁を抽出（3-4桁目）
export function deriveEntryYearYY(studentNumber: string): string {
  if (!/^\d{7}$/.test(studentNumber))
    throw new Error("学籍番号は7桁の数字です");
  return studentNumber.slice(2, 4);
}

export function deriveInitialPassword(studentNumber: string): string {
  const yy = deriveEntryYearYY(studentNumber);
  return `${yy}rc${studentNumber}`;
}

export function deriveEmail(studentNumber: string, useCampusEmail: boolean) {
  if (useCampusEmail) return `${studentNumber}@ed.tus.ac.jp`;
  return `${studentNumber}@no-mail.local`;
}

export function extractStudentNumberFromUser(
  user: {
    user_metadata?: Record<string, unknown> | null;
    email?: string | null;
  } | null
): string | null {
  const meta = user?.user_metadata as { student_number?: unknown } | undefined;
  const metaNumber = meta?.student_number;
  if (typeof metaNumber === "string" && /^\d{7}$/.test(metaNumber)) {
    return metaNumber;
  }
  const email = user?.email ?? "";
  const match = typeof email === "string" ? email.match(/^(\d{7})@/) : null;
  return match ? match[1] : null;
}

export async function findProfileIdByStudentNumber(
  supabase: any,
  _studentNumber: string | null
): Promise<string | null> {
  // プロファイルIDはAuthユーザーIDと一致するため、学籍番号検索は行わず
  // 認証情報から直接IDを取得する（RLSによる500回避）
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}
