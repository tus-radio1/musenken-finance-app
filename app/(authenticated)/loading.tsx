import {
  PageLoadingShell,
  SkeletonBlock,
  SkeletonTable,
} from "@/components/page-loading";

export default function AuthenticatedLoading() {
  return (
    <PageLoadingShell>
      <SkeletonBlock className="h-8 w-32" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-lg border bg-card p-6">
            <SkeletonBlock className="mb-3 h-4 w-1/2" />
            <SkeletonBlock className="h-8 w-2/3" />
          </div>
        ))}
      </div>
      <SkeletonTable columns={["w-24", "flex-1", "w-28", "w-20"]} />
    </PageLoadingShell>
  );
}
