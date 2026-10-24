import {
  PageLoadingShell,
  SkeletonBlock,
} from "@/components/page-loading";

export default function HomeLoading() {
  return (
    <PageLoadingShell>
      <SkeletonBlock className="h-8 w-24" />
      <div className="rounded-lg border bg-card p-6">
        <SkeletonBlock className="mb-4 h-5 w-40" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4">
              <SkeletonBlock className="h-4 flex-1" />
              <SkeletonBlock className="h-4 w-20" />
              <SkeletonBlock className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-lg border bg-card p-6">
            <SkeletonBlock className="mb-3 h-4 w-1/3" />
            <SkeletonBlock className="h-8 w-1/2" />
          </div>
        ))}
      </div>
    </PageLoadingShell>
  );
}
