export default function ApplicationsLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        <div className="hidden md:block w-64 border-r bg-card" />
        <div className="flex-1 flex flex-col">
          <main className="flex-1 flex flex-col p-6 pt-16 md:pt-6 pb-20 md:pb-6 overflow-y-auto">
            <div className="max-w-7xl mx-auto w-full space-y-6">
              {/* Header */}
              <div className="flex justify-between items-center">
                <div className="space-y-2">
                  <div className="h-8 bg-muted rounded animate-pulse w-32" />
                  <div className="h-4 bg-muted rounded animate-pulse w-64" />
                </div>
                <div className="hidden md:block h-10 bg-muted rounded animate-pulse w-28" />
              </div>

              {/* Table card */}
              <div className="rounded-lg border bg-card">
                <div className="p-6 space-y-2">
                  <div className="h-5 bg-muted rounded animate-pulse w-40" />
                </div>
                <div className="px-6 pb-6">
                  {/* Table header */}
                  <div className="flex gap-4 py-3 border-b">
                    <div className="h-4 bg-muted rounded animate-pulse w-24" />
                    <div className="h-4 bg-muted rounded animate-pulse w-20" />
                    <div className="h-4 bg-muted rounded animate-pulse flex-1" />
                    <div className="h-4 bg-muted rounded animate-pulse w-20" />
                    <div className="h-4 bg-muted rounded animate-pulse w-16" />
                  </div>
                  {/* Table rows */}
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-4 py-3 border-b last:border-b-0">
                      <div className="h-4 bg-muted rounded animate-pulse w-24" />
                      <div className="h-4 bg-muted rounded animate-pulse w-20" />
                      <div className="h-4 bg-muted rounded animate-pulse flex-1" />
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
