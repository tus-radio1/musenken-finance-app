import {
  PageLoadingShell,
  SkeletonBlock,
  SkeletonTable,
} from "@/components/page-loading";

export default function LedgerLoading() {
  return (
    <PageLoadingShell>
      {/* ヘッダーとフィルター */}
      <div className="flex justify-between items-center">
        <SkeletonBlock className="h-8 w-20" />
        <div className="flex gap-2">
          <SkeletonBlock className="h-10 w-32" />
          <SkeletonBlock className="h-10 w-32" />
        </div>
      </div>

      {/* データテーブル */}
      <SkeletonTable
        columns={["w-24", "w-20", "flex-1", "w-24", "w-20", "w-16"]}
        rows={8}
      />
    </PageLoadingShell>
  );
}
