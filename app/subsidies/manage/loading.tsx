export default function SubsidiesManageLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        <div className="hidden md:block w-64 border-r bg-card" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6 pt-16 md:pt-6 pb-20 md:pb-6">
            <div className="max-w-7xl mx-auto w-full space-y-6">
              {/* Header */}
              <div className="space-y-2">
                <div className="h-8 bg-muted rounded animate-pulse w-36" />
                <div className="h-4 bg-muted rounded animate-pulse w-64" />
              </div>

              {/* Filters */}
              <div className="flex gap-3">
                <div className="h-10 bg-muted rounded animate-pulse w-40" />
                <div className="h-10 bg-muted rounded animate-pulse w-40" />
                <div className="h-10 bg-muted rounded animate-pulse w-32" />
              </div>

              {/* Table */}
              <div className="rounded-lg border bg-card">
                <div className="px-6 py-4">
                  <div className="flex gap-4 py-3 border-b">
                    <div className="h-4 bg-muted rounded animate-pulse w-20" />
                    <div className="h-4 bg-muted rounded animate-pulse w-28" />
                    <div className="h-4 bg-muted rounded animate-pulse flex-1" />
                    <div className="h-4 bg-muted rounded animate-pulse w-24" />
                    <div className="h-4 bg-muted rounded animate-pulse w-16" />
                    <div className="h-4 bg-muted rounded animate-pulse w-20" />
                  </div>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex gap-4 py-3 border-b last:border-b-0">
                      <div className="h-4 bg-muted rounded animate-pulse w-20" />
                      <div className="h-4 bg-muted rounded animate-pulse w-28" />
                      <div className="h-4 bg-muted rounded animate-pulse flex-1" />
                      <div className="h-4 bg-muted rounded animate-pulse w-24" />
                      <div className="h-4 bg-muted rounded animate-pulse w-16" />
                      <div className="h-4 bg-muted rounded animate-pulse w-20" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
