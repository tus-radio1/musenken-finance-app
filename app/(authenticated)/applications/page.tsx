import { getCurrentUser, getCurrentRoles } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import Link from "next/link";
import { TransactionForm } from "@/components/transaction-form";
import { ApplicationsTable } from "@/components/applications-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { selectVisibleTeams } from "@/lib/teams";
import { getAccountingGroups } from "@/lib/cache";
import {
  canCreateClubTransaction,
  canFileTransactionInGroup,
} from "@/lib/roles/permissions";
import { Button } from "@/components/ui/button";
import { getReceiptViewUrl } from "@/lib/receipt-url";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";

const PAGE_SIZE = 50;

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;

  const auth = await getCurrentUser();
  if (!auth) redirect("/login");
  const { supabase, user } = auth;

  const page = Math.max(0, parseInt(params.page ?? "0", 10) || 0);
  const offset = page * PAGE_SIZE;

  const [access, allGroups, { data: transactions, count }] = await Promise.all([
    getCurrentRoles(),
    getAccountingGroups(),
    supabase.from("transactions")
      .select(
        "id, date, amount, description, approval_status, accounting_group_id, accounting_groups(name, type), financial_account_id, receipt_url, remarks, created_by",
        { count: "exact" },
      )
      .eq("created_by", user.id).order("date", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1),
  ]);
  const accountingGroups = selectVisibleTeams(access, allGroups);
  const writableGroups = accountingGroups.filter((group) =>
    canFileTransactionInGroup(access, group),
  );

  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;

  // テーブル用にデータを整形
  const tableData = (transactions || []).map((tx) => ({
    id: tx.id,
    isReadOnly:
      tx.accounting_groups?.type === "club" && !canCreateClubTransaction(access),
    date: tx.date,
    amount: tx.amount,
    description: tx.description,
    approval_status: tx.approval_status,
    accounting_group_id: tx.accounting_group_id || undefined,
    financial_account_id: tx.financial_account_id,
    accounting_group_name: tx.accounting_groups?.name || "-",
    receipt_url: tx.receipt_url || null,
    receipt_public_url: getReceiptViewUrl(tx.receipt_url),
    remarks: tx.remarks || null,
    created_by: tx.created_by,
  }));

  return (
    <PageShell>
      <PageHeader
        title="経費申請"
        description="無線研での活動費を経費として申請できます。"
        actions={
          <div className="hidden md:block">
            <TransactionForm categories={writableGroups} />
          </div>
        }
      />

        <Card>
          <CardHeader>
            <CardTitle>あなたの申請一覧</CardTitle>
          </CardHeader>
          <CardContent>
            <ApplicationsTable transactions={tableData} accountingGroups={accountingGroups || []} access={access} actorId={user.id} />
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {totalCount}件中 {offset + 1}〜{Math.min(offset + PAGE_SIZE, totalCount)}件
            </p>
            <div className="flex gap-2">
              {hasPrev ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/applications?page=${page - 1}`}>
                    前へ
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  前へ
                </Button>
              )}
              {hasNext ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/applications?page=${page + 1}`}>
                    次へ
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  次へ
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="md:hidden">
          <TransactionForm categories={writableGroups} />
        </div>
    </PageShell>
  );
}
