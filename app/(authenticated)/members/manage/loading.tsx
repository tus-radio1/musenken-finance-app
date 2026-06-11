import {
  PageLoadingShell,
  SkeletonBlock,
  SkeletonTable,
} from "@/components/page-loading";

export default function MembersManageLoading() {
  return (
    <PageLoadingShell maxWidth="max-w-6xl">
      <div className="rounded-lg border bg-card p-6 space-y-2">
        <SkeletonBlock className="h-6 w-24" />
        <SkeletonBlock className="h-4 w-72" />
      </div>

      {/* 検索・フィルターバー */}
      <div className="flex gap-3">
        <SkeletonBlock className="h-10 w-48" />
        <SkeletonBlock className="h-10 w-28" />
      </div>

      {/* テーブル */}
      <SkeletonTable
        columns={["w-24", "w-24", "w-16", "w-28", "w-20"]}
        rows={8}
      />
    </PageLoadingShell>
  );
}
