import {
  PageLoadingShell,
  SkeletonBlock,
  SkeletonTable,
} from "@/components/page-loading";

export default function BudgetLoading() {
  return (
    <PageLoadingShell maxWidth="max-w-5xl">
      {/* ヘッダーと年度セレクター */}
      <div className="flex justify-between items-center">
        <SkeletonBlock className="h-8 w-28" />
        <SkeletonBlock className="h-10 w-32" />
      </div>

      {/* 予算概要チャート */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <SkeletonBlock className="h-5 w-32" />
        <SkeletonBlock className="h-48 w-full" />
      </div>

      {/* 予算テーブル */}
      <SkeletonTable
        columns={["w-28", "w-20", "w-20", "w-20", "w-20", "w-16"]}
        rows={4}
      />
    </PageLoadingShell>
  );
}
