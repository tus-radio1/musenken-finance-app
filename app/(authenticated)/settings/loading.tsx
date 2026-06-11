import {
  PageLoadingShell,
  SkeletonBlock,
} from "@/components/page-loading";

export default function SettingsLoading() {
  return (
    <PageLoadingShell maxWidth="max-w-2xl">
      {/* ヘッダー */}
      <div className="space-y-2">
        <SkeletonBlock className="h-8 w-16" />
        <SkeletonBlock className="h-4 w-56" />
      </div>

      {/* 設定セクション */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-6 space-y-4">
          <SkeletonBlock className="h-5 w-32" />
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-10 w-48" />
        </div>
      ))}
    </PageLoadingShell>
  );
}
