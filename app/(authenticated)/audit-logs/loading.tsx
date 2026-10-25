import { PageLoadingShell, SkeletonBlock, SkeletonTable } from "@/components/page-loading";

export default function AuditLogsLoading() {
  return <PageLoadingShell width="list">
    <SkeletonBlock className="h-8 w-32" />
    <SkeletonBlock className="h-40 w-full" />
    <SkeletonTable columns={["w-36", "w-24", "w-20", "flex-1"]} rows={8} />
  </PageLoadingShell>;
}
