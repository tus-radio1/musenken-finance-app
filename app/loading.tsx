export default function HomeLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        {/* Sidebar placeholder */}
        <div className="hidden md:block w-64 border-r bg-card" />
        <div className="flex-1 flex flex-col">
          <main className="flex-1 flex flex-col p-6 pt-16 md:pt-6 pb-20 md:pb-6 overflow-y-auto">
            <div className="max-w-7xl mx-auto w-full space-y-8">
              {/* Page title */}
              <div className="h-8 bg-muted rounded animate-pulse w-24" />

              {/* Recent applications card */}
              <div className="rounded-lg border bg-card p-6 space-y-4">
                <div className="h-5 bg-muted rounded animate-pulse w-40" />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="h-4 bg-muted rounded animate-pulse flex-1" />
                      <div className="h-4 bg-muted rounded animate-pulse w-20" />
                      <div className="h-4 bg-muted rounded animate-pulse w-16" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-lg border bg-card p-6 space-y-3">
                    <div className="h-4 bg-muted rounded animate-pulse w-1/3" />
                    <div className="h-8 bg-muted rounded animate-pulse w-1/2" />
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
