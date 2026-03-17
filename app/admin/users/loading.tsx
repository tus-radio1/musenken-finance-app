export default function AdminUsersLoading() {
  return (
    <div className="min-h-screen bg-background/50">
      <main className="container mx-auto py-10 max-w-6xl">
        <div className="rounded-lg border bg-card">
          <div className="p-6 space-y-2">
            <div className="h-6 bg-muted rounded animate-pulse w-32" />
            <div className="h-4 bg-muted rounded animate-pulse w-56" />
          </div>
          <div className="px-6 pb-6">
            {/* Create user form placeholder */}
            <div className="flex gap-3 mb-6">
              <div className="h-10 bg-muted rounded animate-pulse w-40" />
              <div className="h-10 bg-muted rounded animate-pulse w-40" />
              <div className="h-10 bg-muted rounded animate-pulse w-24" />
            </div>
            {/* Table header */}
            <div className="flex gap-4 py-3 border-b">
              <div className="h-4 bg-muted rounded animate-pulse w-32" />
              <div className="h-4 bg-muted rounded animate-pulse w-28" />
              <div className="h-4 bg-muted rounded animate-pulse flex-1" />
              <div className="h-4 bg-muted rounded animate-pulse w-20" />
            </div>
            {/* Table rows */}
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4 py-3 border-b last:border-b-0">
                <div className="space-y-1 w-32">
                  <div className="h-4 bg-muted rounded animate-pulse w-20" />
                  <div className="h-3 bg-muted rounded animate-pulse w-16" />
                </div>
                <div className="h-4 bg-muted rounded animate-pulse w-28" />
                <div className="h-4 bg-muted rounded animate-pulse flex-1" />
                <div className="flex gap-2 w-20">
                  <div className="h-8 bg-muted rounded animate-pulse w-8" />
                  <div className="h-8 bg-muted rounded animate-pulse w-8" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
