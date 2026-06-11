import {
  PageLoadingShell,
  SkeletonBlock,
  SkeletonTable,
} from "@/components/page-loading";

export default function SubsidiesManageLoading() {
  return (
    <PageLoadingShell>
      {/* ヘッダー */}
      <div className="space-y-2">
        <SkeletonBlock className="h-8 w-36" />
        <SkeletonBlock className="h-4 w-64" />
      </div>

      {/* フィルター */}
      <div className="flex gap-3">
        <SkeletonBlock className="h-10 w-40" />
        <SkeletonBlock className="h-10 w-40" />
        <SkeletonBlock className="h-10 w-32" />
      </div>

      {/* テーブル */}
      <SkeletonTable
        columns={["w-20", "w-28", "flex-1", "w-24", "w-16", "w-20"]}
        rows={6}
      />
    </PageLoadingShell>
  );
}
