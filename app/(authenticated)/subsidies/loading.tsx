import {
  PageLoadingShell,
  SkeletonBlock,
  SkeletonTable,
} from "@/components/page-loading";

export default function SubsidiesLoading() {
  return (
    <PageLoadingShell>
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <SkeletonBlock className="h-8 w-36" />
          <SkeletonBlock className="h-4 w-72" />
        </div>
        <SkeletonBlock className="hidden md:block h-10 w-28" />
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
            <SkeletonBlock className="h-3 w-16" />
            <SkeletonBlock className="h-7 w-12" />
          </div>
        ))}
      </div>

      {/* テーブル */}
      <SkeletonTable
        columns={["w-20", "flex-1", "w-24", "w-16"]}
        rows={5}
      />
    </PageLoadingShell>
  );
}
