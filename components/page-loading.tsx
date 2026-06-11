/**
 * ページローディング用の共通コンポーネント。
 * 各 loading.tsx から利用し、ローディング表示パターンを統一する。
 */

type PageLoadingShellProps = {
  /** コンテナの max-width クラス (例: "max-w-7xl") */
  maxWidth?: string;
  children: React.ReactNode;
};

/**
 * ページローディング時の共通外枠。
 * padding・overflow・レスポンシブ余白を統一する。
 */
export function PageLoadingShell({
  maxWidth = "max-w-7xl",
  children,
}: PageLoadingShellProps) {
  return (
    <main className="flex-1 flex flex-col p-6 pt-16 md:pt-6 pb-20 md:pb-6 overflow-y-auto">
      <div className={`${maxWidth} mx-auto w-full space-y-6`}>
        {children}
      </div>
    </main>
  );
}

type SkeletonBlockProps = {
  className?: string;
};

/**
 * 単一のスケルトンブロック。animate-pulse による統一アニメーション。
 */
export function SkeletonBlock({ className = "h-4 w-full" }: SkeletonBlockProps) {
  return <div className={`bg-muted rounded animate-pulse ${className}`} />;
}

type SkeletonTableProps = {
  /** テーブルヘッダー列の幅クラス配列 (例: ["w-24", "w-20", "flex-1"]) */
  columns: string[];
  /** 表示するスケルトン行数 */
  rows?: number;
};

/**
 * テーブル風スケルトン。一覧系ページの loading.tsx で共通利用。
 */
export function SkeletonTable({ columns, rows = 5 }: SkeletonTableProps) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="px-6 py-4">
        {/* ヘッダー行 */}
        <div className="flex gap-4 py-3 border-b">
          {columns.map((w, i) => (
            <SkeletonBlock key={`h-${i}`} className={`h-4 ${w}`} />
          ))}
        </div>
        {/* データ行 */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 py-3 border-b last:border-b-0">
            {columns.map((w, j) => (
              <SkeletonBlock key={`r-${i}-${j}`} className={`h-4 ${w}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
