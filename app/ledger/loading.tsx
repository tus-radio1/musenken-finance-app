export default function LedgerLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        <div className="hidden md:block w-64 border-r bg-card" />
        <div className="flex-1 flex flex-col">
          <main className="flex-1 flex flex-col p-6 pt-16 md:pt-6 pb-20 md:pb-6 overflow-y-auto">
            <div className="max-w-7xl mx-auto w-full space-y-8">
              {/* Header with filters */}
              <div className="flex justify-between items-center">
                <div className="h-8 bg-muted rounded animate-pulse w-20" />
                <div className="flex gap-2">
                  <div className="h-10 bg-muted rounded animate-pulse w-32" />
                  <div className="h-10 bg-muted rounded animate-pulse w-32" />
                </div>
              </div>

              {/* Data table */}
              <div className="rounded-lg border bg-card">
                <div className="px-6 py-4">
                  {/* Table header */}
                  <div className="flex gap-4 py-3 border-b">
                    <div className="h-4 bg-muted rounded animate-pulse w-24" />
                    <div className="h-4 bg-muted rounded animate-pulse w-20" />
                    <div className="h-4 bg-muted rounded animate-pulse flex-1" />
                    <div className="h-4 bg-muted rounded animate-pulse w-24" />
                    <div className="h-4 bg-muted rounded animate-pulse w-20" />
                    <div className="h-4 bg-muted rounded animate-pulse w-16" />
                  </div>
                  {/* Table rows */}
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex gap-4 py-3 border-b last:border-b-0">
                      <div className="h-4 bg-muted rounded animate-pulse w-24" />
                      <div className="h-4 bg-muted rounded animate-pulse w-20" />
                      <div className="h-4 bg-muted rounded animate-pulse flex-1" />
                      <div className="h-4 bg-muted rounded animate-pulse w-24" />
                      <div className="h-4 bg-muted rounded animate-pulse w-20" />
                      <div className="h-4 bg-muted rounded animate-pulse w-16" />
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
