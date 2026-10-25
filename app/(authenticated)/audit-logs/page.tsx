import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentRoles, getCurrentUser } from "@/lib/auth/context";
import { canViewAuditLogs } from "@/lib/roles/permissions";
import {
  AUDIT_ACTION_LABELS, AUDIT_PAGE_SIZE, AUDIT_TABLE_LABELS,
  auditChangedFields, auditDateBounds, auditLogParamsSchema, auditPageHref,
  auditRecordSummary, auditValueText, formatAuditTimestamp,
} from "@/lib/audit-log-display";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { AccessDenied } from "@/components/feedback/access-denied";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export default async function AuditLogsPage({ searchParams }: Props) {
  const auth = await getCurrentUser();
  if (!auth) redirect("/login");
  const access = await getCurrentRoles();
  if (!canViewAuditLogs(access)) {
    return <PageShell><AccessDenied description="変更履歴は管理者と会計のみ閲覧できます。" /></PageShell>;
  }

  const parsed = auditLogParamsSchema.safeParse(await searchParams);
  if (!parsed.success) {
    return <PageShell>
      <PageHeader title="変更履歴" />
      <ErrorState title="検索条件が不正です" description="日付の範囲やページ番号を確認してください。" />
      <Button asChild variant="outline"><Link href="/audit-logs">検索条件をリセット</Link></Button>
    </PageShell>;
  }
  const params = parsed.data;
  const bounds = auditDateBounds(params);
  let query = auth.supabase.from("audit_logs")
    .select("id, table_name, record_id, action, old_data, new_data, changed_by, changed_at", { count: "exact" });
  if (params.table) query = query.eq("table_name", params.table);
  if (params.action) query = query.eq("action", params.action);
  if (params.actor) query = query.eq("changed_by", params.actor);
  if (bounds.from) query = query.gte("changed_at", bounds.from);
  if (bounds.until) query = query.lt("changed_at", bounds.until);
  const offset = (params.page - 1) * AUDIT_PAGE_SIZE;
  // The user's client applies RLS. Profiles deliberately include soft-deleted actors.
  const [logs, profiles] = await Promise.all([
    query.order("changed_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + AUDIT_PAGE_SIZE - 1),
    auth.supabase.from("profiles").select("id, name, deleted_at").order("name"),
  ]);
  if (logs.error || profiles.error) {
    console.error("[audit-logs] Read failed:", logs.error ?? profiles.error);
    return <PageShell><PageHeader title="変更履歴" />
      <ErrorState description="変更履歴を取得できませんでした。時間をおいて再度お試しください。" />
    </PageShell>;
  }
  const actors = new Map((profiles.data ?? []).map((profile) => [profile.id, profile.name]));
  const total = logs.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

  return <PageShell>
    <PageHeader title="変更履歴" description="登録・更新・削除の履歴を確認できます。日時は日本時間（JST）です。" />
    <form action="/audit-logs" method="get" className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-2">
        <Label htmlFor="audit-table">対象</Label>
        <select id="audit-table" name="table" defaultValue={params.table ?? ""} className={selectClass}>
          <option value="">すべて</option>
          {Object.entries(AUDIT_TABLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="audit-action">操作</Label>
        <select id="audit-action" name="action" defaultValue={params.action ?? ""} className={selectClass}>
          <option value="">すべて</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="audit-actor">変更者</Label>
        <select id="audit-actor" name="actor" defaultValue={params.actor ?? ""} className={selectClass}>
          <option value="">すべて</option>
          {(profiles.data ?? []).map((profile) => <option key={profile.id} value={profile.id}>
            {profile.name || "不明"}{profile.deleted_at ? "（削除済み）" : ""}
          </option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="audit-from">開始日</Label>
        <Input id="audit-from" name="from" type="date" defaultValue={params.from} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="audit-to">終了日</Label>
        <Input id="audit-to" name="to" type="date" defaultValue={params.to} />
      </div>
      <div className="flex items-end gap-2">
        <Button type="submit">絞り込む</Button>
        <Button variant="outline" asChild><Link href="/audit-logs">リセット</Link></Button>
      </div>
    </form>

    <p className="text-sm text-muted-foreground">全 {total} 件・{params.page} / {totalPages} ページ（1ページ {AUDIT_PAGE_SIZE} 件）</p>
    {logs.data.length === 0 ? <EmptyState message="条件に一致する変更履歴がありません" /> : (
      <ol className="space-y-3" aria-label="変更履歴一覧">
        {logs.data.map((log) => {
          const changes = auditChangedFields(log.old_data, log.new_data);
          return <li key={log.id} className="rounded-lg border bg-card p-4" data-audit-id={log.id}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <time dateTime={log.changed_at}>{formatAuditTimestamp(log.changed_at)}</time>
              <span>{(log.changed_by && actors.get(log.changed_by)) || "不明"}</span>
              <Badge variant="secondary">{AUDIT_TABLE_LABELS[log.table_name as keyof typeof AUDIT_TABLE_LABELS] ?? log.table_name}</Badge>
              <Badge variant="outline">{AUDIT_ACTION_LABELS[log.action as keyof typeof AUDIT_ACTION_LABELS] ?? log.action}</Badge>
            </div>
            <p className="mt-2 break-words text-sm">{auditRecordSummary(log.table_name, log.old_data, log.new_data, log.record_id)}</p>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">変更内容（{changes.length} 項目）</summary>
              <p className="mt-2 break-all text-xs text-muted-foreground">レコードID: {log.record_id}</p>
              {changes.length === 0 ? <p className="mt-2">変更された項目はありません</p> : (
                <dl className="mt-2 space-y-2">
                  {changes.map((change) => <div key={change.key} className="rounded bg-muted p-2">
                    <dt className="font-medium break-all">{change.key}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-all">
                      <span>{auditValueText(change.before)}</span>{" → "}<span>{auditValueText(change.after)}</span>
                    </dd>
                  </div>)}
                </dl>
              )}
            </details>
          </li>;
        })}
      </ol>
    )}
    <nav aria-label="変更履歴のページ切替" className="flex items-center gap-3">
      {params.page > 1 && <Button variant="outline" asChild><Link href={auditPageHref(params, params.page - 1)}>前へ</Link></Button>}
      {params.page < totalPages && <Button variant="outline" asChild><Link href={auditPageHref(params, params.page + 1)}>次へ</Link></Button>}
    </nav>
  </PageShell>;
}
