import {
  PageLoadingShell,
  SkeletonBlock,
  SkeletonTable,
} from "@/components/page-loading";

export default function ApplicationsLoading() {
  return (
    <PageLoadingShell>
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <SkeletonBlock className="h-8 w-32" />
          <SkeletonBlock className="h-4 w-64" />
        </div>
        <SkeletonBlock className="hidden md:block h-10 w-28" />
      </div>

      {/* テーブル */}
      <SkeletonTable
        columns={["w-24", "w-20", "flex-1", "w-20", "w-16"]}
        rows={5}
      />
    </PageLoadingShell>
  );
}
