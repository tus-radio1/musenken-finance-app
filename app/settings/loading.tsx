export default function SettingsLoading() {
  return (
    <div className="flex bg-background min-h-screen">
      <div className="hidden md:block w-64 border-r bg-card" />
      <main className="flex-1 p-8 pt-16 md:pt-8 pb-20 md:pb-8 h-screen overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-6 flex-shrink-0">
          <div className="space-y-2">
            <div className="h-8 bg-muted rounded animate-pulse w-16" />
            <div className="h-4 bg-muted rounded animate-pulse w-56" />
          </div>
        </div>
        <div className="flex-1 space-y-6">
          {/* Settings sections */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-6 space-y-4">
              <div className="h-5 bg-muted rounded animate-pulse w-32" />
              <div className="h-4 bg-muted rounded animate-pulse w-full" />
              <div className="h-10 bg-muted rounded animate-pulse w-48" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
