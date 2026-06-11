import {
  PageLoadingShell,
  SkeletonBlock,
  SkeletonTable,
} from "@/components/page-loading";

export default function MembersLoading() {
  return (
    <PageLoadingShell maxWidth="max-w-6xl">
      <div className="rounded-lg border bg-card p-6 space-y-2">
        <SkeletonBlock className="h-6 w-32" />
        <SkeletonBlock className="h-4 w-64" />
      </div>
      <SkeletonTable
        columns={["w-24", "w-24", "w-16", "w-20"]}
        rows={8}
      />
    </PageLoadingShell>
  );
}
