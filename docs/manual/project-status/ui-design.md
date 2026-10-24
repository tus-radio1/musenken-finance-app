# UI・デザイン・レイアウトの現状と統一方針

調査日: 2026-10-22 / 対象ブランチ: `develop`（コミット `b04402e`）

ソースは変更せず、コードを読んだ結果だけをまとめています。行番号は調査時点のものです。

## 現状のスタイリング構成

| 項目 | 現状 | 根拠 |
|------|------|------|
| CSS 基盤 | Tailwind CSS v4（`@tailwindcss/postcss`）と `tw-animate-css`。`tailwind.config` は無く、`@theme inline` で定義 | `app/globals.css:1-44`, `package.json` devDependencies |
| コンポーネントライブラリ | shadcn/ui（style `new-york`、baseColor `zinc`、CSS 変数あり）。`components/ui/` に 22 個 | `components.json:3-11` |
| デザイントークン | shadcn 標準の zinc 系 OKLCH 変数（`--primary`、`--muted`、`--destructive`、`--chart-*`、`--sidebar-*`）。成功・警告・情報系の色トークンは **無い** | `app/globals.css:46-113` |
| ダークモード | `next-themes`（`attribute="class"`、`defaultTheme="system"`）。トークンはダーク版もある | `app/layout.tsx:32-37`, `app/globals.css:81-113` |
| フォント | Geist / Geist Mono（`subsets: ["latin"]` のみ）。日本語は OS のフォントにフォールバックする | `app/layout.tsx:7-15` |
| アイコン | `lucide-react` | `components.json:13` |
| トースト | `sonner`。ルートレイアウトに `<Toaster />` を 1 つ置く | `app/layout.tsx:39` |
| 認証後レイアウト | `AppSidebar`（md 以上）、`MobileSidebar`（ハンバーガー）、`MobileBottomNav`（md 未満）。ページ本体の `<main>` は各ページが自分で書く | `app/(authenticated)/layout.tsx:12-23` |
| 共通シェル | ローディング用の `PageLoadingShell` / `SkeletonBlock` / `SkeletonTable` だけがある。通常ページ用のシェルは無い | `components/page-loading.tsx:16-71` |
| Radix の導入方法 | 個別の `@radix-ui/react-*` と umbrella の `radix-ui` が混在している（`alert-dialog`、`tabs`、`collapsible` は umbrella から import） | `package.json:17-28,41`, `components/ui/alert-dialog.tsx:4`, `components/ui/tabs.tsx:5`, `components/ui/collapsible.tsx:4` |

まとめると、土台（shadcn/ui と Tailwind v4 のトークン）は揃っています。一方で、ページの外枠・見出し・状態色・空/エラー表示はページごとに手書きで、ここで不統一が生じています。

## 不統一な箇所

| # | 分類 | 内容 | 該当箇所 | 影響 |
|---|------|------|----------|------|
| 1 | ステータス表示 | 同じ支援金の `approved` が、`StatusBadge` では「承認済」、支援金用の定数では「審査通過」と表示される。管理画面ではデスクトップが `Select`（「審査通過」）、モバイルが `StatusBadge`（「承認済」）なので、**画面幅によって同じ申請の表示名が変わる** | `components/status-badge.tsx:21-22`, `lib/constants/subsidy.ts:43-70`, `app/(authenticated)/subsidies/manage/_components/manage-desktop-table.tsx:151-167`, `.../manage-mobile-card-list.tsx:97` | 高（利用者の誤解） |
| 2 | ステータス表示 | ラベルと色の定義が 3 系統ある: `StatusBadge` の switch（生の Tailwind 色）、`STATUS_LABELS`、`STATUS_VARIANT_MAP`（shadcn の variant）。経費用のフィルタ選択肢はさらに別にハードコードされている | `components/status-badge.tsx:20-75`, `lib/constants/subsidy.ts:42-67`, `components/applications-table.tsx:187`, `components/ledger/ledger-filter-bar.tsx:105`, `components/transaction/admin-fields.tsx:103-110` | 高 |
| 3 | 色の意味 | 生のパレット色が 28 ファイル・約 130 箇所にある（`grep -rnoE "(text\|bg\|border)-(red\|green\|…)-[0-9]+"` で計測）。収入の色は、経費一覧では青、出納帳では緑 | `components/applications-table.tsx:286,353`, `components/ledger/ledger-desktop-table.tsx:224-228`, `components/ledger/ledger-mobile-cards.tsx:104-105` | 中 |
| 4 | ページ外枠 | `<main className="flex-1 flex flex-col p-6 pt-16 md:pt-6 pb-20 md:pb-6 overflow-y-auto">` を 12 箇所でコピペしている。`subsidies/manage` だけクラス構成が違う（`flex flex-col` が無い） | `app/(authenticated)/page.tsx:140`, `applications/page.tsx:79`, `ledger/page.tsx:147`, `subsidies/manage/page.tsx:66` ほか | 中（モバイル余白を変えると 12 箇所の修正が必要） |
| 5 | コンテンツ幅 | `max-w-7xl`（ホーム・経費・支援金・出納帳・支援金管理）、`max-w-6xl`（部員情報・部員管理）、`max-w-5xl`（予算）、`max-w-2xl`（設定）が混在している | `grep -rnoE "max-w-(2xl\|…\|7xl)" app --include=page.tsx` | 低〜中 |
| 6 | ページ見出し | 多くのページは `<h1 className="text-2xl font-bold tracking-tight">`。支援金管理は `<h2>`、部員情報・部員管理は h1 が無く `CardTitle` で代用、出納帳は h1 の中に `Select` を埋め込んでいる | `subsidies/manage/page.tsx:69`, `members/page.tsx:76-81`, `members/manage/page.tsx:152-157`, `components/ledger-view.tsx:328-341` | 中（見出し構造と a11y） |
| 7 | 縦方向の間隔 | ページ直下の `space-y-8`（ホーム・予算・出納帳）と `space-y-6`（経費・支援金・設定・支援金管理）が混在している | `page.tsx:141`, `budget/page.tsx:213`, `applications/page.tsx:80` | 低 |
| 8 | 権限エラー表示 | 予算は `Card`、部員管理は赤い `h1`、支援金管理は `text-destructive` の `p`。同じ「権限なし」が 3 通りの見た目になっている | `budget/page.tsx:119-133`, `members/manage/page.tsx:82-95`, `subsidies/manage/page.tsx:55-63` | 中 |
| 9 | エラー表示 | ホームだけ英語の生メッセージ `Error loading data: {error.message}` を `text-red-500` で出す（DB のエラー文言がそのまま画面に出る） | `app/(authenticated)/page.tsx:131-137` | 中（文言と情報露出） |
| 10 | エラー境界 | `error.tsx` が 7 つあり、文言以外はほぼ同じ内容のコピペ | `app/error.tsx`, `app/(authenticated)/{admin,applications,budget,ledger,members,subsidies}/error.tsx` | 低（保守性） |
| 11 | ローディング | 各ページの `loading.tsx` は `PageLoadingShell` を使うが、`app/loading.tsx` は同じ構造を手書きしている。`(authenticated)/loading.tsx` が無いので、ホームのスケルトンはサイドバーの外側（ルートレイアウト直下）で描画される | `app/loading.tsx:1-34`, `components/page-loading.tsx:16-27` | 低〜中 |
| 12 | 空状態 | 「まだ申請はありません。」「該当する…はありません」「取引データがありません」など文言と装飾がばらばら。共通の EmptyState が無い | `components/applications-table.tsx:203-204`, `components/subsidy-items-table.tsx:361-362`, `components/ledger/ledger-mobile-cards.tsx:72`, `.../manage-desktop-table.tsx:105` | 低 |
| 13 | 失敗時の通知 | 多くの操作は `sonner` の `toast` で通知する（12 ファイル）。出納帳は取得失敗時に何も通知せず空表示になり、「データ無し」と区別できない | `components/ledger-view.tsx:181-184` | 中 |
| 14 | 確認ダイアログ | 予算の削除などは `AlertDialog` を使うが、承認・却下はブラウザ標準の `confirm()`、支援金削除は `window.confirm()` | `components/approval-actions.tsx:50`, `app/(authenticated)/subsidies/manage/client-page.tsx:344`, `app/(authenticated)/budget/_components/delete-group-year-button.tsx:49-62` | 中 |
| 15 | テーブル | 支援金管理のデスクトップ表だけ素の `<table>`/`<td className="p-3">` を使い、他は shadcn の `Table` | `.../manage-desktop-table.tsx:54,151` | 低 |
| 16 | 年度セレクタ | 年度切替だけネイティブ `<select>`。しかも同じものが 2 つある（`FiscalYearSelector` と予算専用の `YearSelector`。違いは遷移先のパスだけ）。出納帳では隣の Radix `Select` と見た目が揃わない | `components/fiscal-year-selector.tsx:40-56`, `app/(authenticated)/budget/_components/year-selector.tsx:30-34` | 中 |
| 17 | 金額フォーマット | `lib/format.ts` に `formatCurrency` があるのに、`Intl.NumberFormat` を各所で再定義している | `app/(authenticated)/subsidies/page.tsx:130`, `components/recent-applications.tsx:7`, `components/dashboard-stats.tsx:5`, `components/applications-table.tsx:139`, `.../budget-update-dialog.tsx:139` | 低 |
| 18 | ダイアログ幅 | `sm:max-w-[500px]`、`sm:max-w-[700px]`、`sm:max-w-md`、`sm:max-w-lg`、`sm:max-w-2xl` が混在している | `grep -rn "<DialogContent" app components` | 低 |
| 19 | 文字サイズ | `text-[10px]`、`text-[11px]`、`text-[0.65rem]`、`text-[0.7rem]` といった任意値が計 14 箇所ある | `components/app-sidebar.tsx:49,77`, `components/recent-applications.tsx:47` ほか | 低 |
| 20 | FAB | モバイルの新規申請 FAB だけ素の `<button>` に `bg-blue-600` を付けている（`primary` トークンを使っていない） | `components/mobile-new-transaction-fab.tsx:17` | 低 |
| 21 | 集計の不整合（参考） | 支援金ページの集計カード（件数・合計額）は、ページング後の現在ページ 50 件だけから計算している。一方「全申請数」の横にある件数表示は `count` を使っている | `app/(authenticated)/subsidies/page.tsx:118-128,189-190` vs `:212` | 中（表示値が誤る。UI というよりロジックの不具合） |

## 共通化すべきコンポーネント

| 候補 | 現状の重複 | 置き換え先（提案） |
|------|-----------|--------------------|
| `PageShell` / `PageHeader` | `<main>` の外枠（12 箇所）、h1 と説明文と右側アクションの組み合わせ（6 箇所） | `components/layout/page-shell.tsx`（`maxWidth` は `narrow` / `default` / `wide` の 3 段階に制限）、`PageHeader({ title, description, actions })` |
| `StatusBadge` と状態定義 | ラベルと色の定義が 3 系統（上表 #1, #2） | `lib/constants/status.ts` に経費・支援金ごとの `{ label, tone, description }` を 1 か所で定義し、`StatusBadge`・フィルタ選択肢・管理画面の `Select` をすべてそこから生成する |
| 意味を持つ色トークン | 生のパレット色が約 130 箇所 | `globals.css` に `--success` / `--warning` / `--info`（ダーク版も）と `--income` / `--expense` を追加し、`Badge` に `success`・`warning`・`info` variant を足す |
| `AccessDenied` / `ErrorState` / `EmptyState` | 権限なし 3 通り、`error.tsx` 7 つ、空状態 6 種以上 | `components/feedback/` に 3 つ用意し、`error.tsx` は 1 行のラッパーにする |
| `ConfirmDialog` | `confirm()` と `AlertDialog` の混在 | `AlertDialog` を包んだ `ConfirmDialog`（または `useConfirm()`） |
| `FiscalYearSelector` | 2 つの実装と、ネイティブ `select` | `basePath` 付きの 1 実装に統合し、中身を shadcn の `Select` に変える |
| `ResponsiveList`（表とカードの切替） | 出納帳・経費・支援金・支援金管理がそれぞれ `*-desktop-table` と `*-mobile-card(s)` の組を持ち、`hidden xl:block` / `xl:hidden` を個別に書いている | 切替ブレークポイントとラッパーだけを共通化する（表とカードの中身はドメインごとに残す） |
| ナビゲーション | `AppSidebar` と `MobileSidebar` が、ナビ項目・申請中の支援金リスト・ロール表示の JSX をほぼ二重に持つ | `SidebarNavList` と `PendingSubsidyList` を切り出して両方から使う（`components/app-sidebar.tsx:25-110`, `components/mobile-sidebar.tsx:111-165`） |
| `formatCurrency` | 5 箇所で再定義 | `lib/format.ts` の関数に寄せる |

段階 2 の実装では、一覧ページの幅を `max-w-7xl`、設定などのフォームページの幅を `max-w-3xl` に統一します。ページ本体の横幅は `PageShell` の `list` / `form` で選び、モバイル余白と縦方向の間隔も同じシェルで管理します。

## アクセシビリティ・レスポンシブ

### アクセシビリティ

- **コントラスト不足**: `StatusBadge` は `bg-yellow-500` / `bg-teal-500` / `bg-emerald-500` / `bg-green-500` の上に白文字を置いている（`components/status-badge.tsx:23-72`）。黄色地の白文字は WCAG AA（4.5:1）を大きく下回る見込みで、「受付中」が最も多く表示されるステータスです。トークン化の際に `text-*-900` と淡い背景の組み合わせへ変える必要があります。
- **ラベルが関連付けられていない**: `htmlFor` の無い素の `<label>` が 18 箇所あり、スクリーンリーダーでは入力欄の名前になりません。例: `components/members-table.tsx:173,187,201,219`、`app/(authenticated)/subsidies/manage/_components/manage-filter-bar.tsx:71,87,102,119`、`components/fiscal-year-selector.tsx:42`。shadcn の `Label` と `id` の組み合わせに置き換えます。
- **アイコンだけのボタンに名前が無い**: `size="icon"` のボタン 7 個のうち `aria-label` があるのは `components/mobile-sidebar.tsx:95` の 1 個だけです。承認・却下（`components/approval-actions.tsx:76,99`）は Tooltip だけで、アクセシブルネームがありません。他に `delete-group-year-button.tsx:53`、`transfer-form.tsx:145`、`transaction-form.tsx:324`、`new-fiscal-year-dialog.tsx:277`。FAB（`mobile-new-transaction-fab.tsx:17`）にも名前がありません。
- **フォーカス表示の除去**: 出納帳のグループ選択 `SelectTrigger` に `focus:ring-0` が付いており、キーボード操作時にフォーカス位置が見えません（`components/ledger-view.tsx:330`）。
- **タップ領域**: 承認・却下ボタンは `h-7 w-7`（28px）で、推奨の 44px に届きません（`components/approval-actions.tsx:78,101`）。
- **見出し構造**: 部員系のページに h1 が無く、支援金管理は h2 から始まります（上表 #6）。
- **`StatusBadge` のツールチップ**: `Badge` はフォーカスできない要素なので、キーボードでは補足説明に到達できません（`components/status-badge.tsx:78-88`）。
- **ダークモード**: テーマ切替はできますが、生パレット色に `dark:` を付けているのは 4 ファイルだけです（`grep -rno "dark:"`）。`bg-blue-100 text-blue-800`（`components/ledger/ledger-desktop-table.tsx:194`）や `CATEGORY_BADGE_COLORS`（`lib/constants/subsidy.ts:73-77`）は、ダーク時に明るい箱のまま浮きます。
- **日本語フォント**: Geist は `latin` サブセットだけなので、日本語は OS フォントで表示されます。英数字と和文の字形が混ざるため、`Noto Sans JP` などを `next/font` で追加するか、和文フォールバックを明示的に指定することを検討してください。

### レスポンシブ

- **ブレークポイントが 2 段**: ナビゲーションは `md`（768px）で切り替わり（`components/app-sidebar.tsx:21`, `components/mobile-bottom-nav.tsx:18`）、一覧の表とカードは `xl`（1280px）で切り替わります（`components/applications-table.tsx:209,332`, `components/ledger/ledger-desktop-table.tsx:109`）。768〜1279px ではデスクトップのサイドバーとモバイル用カードが同時に出ます。意図的な設計なら問題ありませんが、意図であることを明文化しておくべきです。
- **部員一覧はカード表示が無い**: `members-table` と `manage-members-client` は表だけで、狭い画面では横スクロールになります（`app/(authenticated)/members/manage/_components/manage-members-client.tsx:375`）。
- **モバイル余白の決め打ち**: ハンバーガーボタンとボトムナビの高さを、各ページの `pt-16` / `pb-20` で避けています（上表 #4）。ボトムナビの高さ（`h-14`）を変えると全ページの修正が必要になります。
- **`h-screen`**: 認証後レイアウトは `h-screen` を使っています（`app/(authenticated)/layout.tsx:14`）。iOS Safari ではアドレスバーの分だけ下端が隠れることがあるので、`h-dvh` を推奨します。
- **フォームの二重描画**: 経費・支援金ページは、同じフォームダイアログを `hidden md:block` と `md:hidden` で 2 つ描画しています（`app/(authenticated)/applications/page.tsx:90-92,136-138`, `app/(authenticated)/subsidies/page.tsx:148-150,241-243`）。見た目には 1 つでも DOM と状態は 2 つあります。

## 統一方針の提案（段階別）

各段階は単独でリリースでき、前の段階に依存します。

### 段階 1: 土台（見た目はほぼ変えない、0.5〜1 日）

1. `globals.css` に意味を持つ色トークンを追加する: `--success` / `--warning` / `--info` / `--income` / `--expense`（ライト・ダーク両方）。
2. `Badge` に `success`・`warning`・`info` variant を追加する。
3. `lib/constants/status.ts` を作り、経費と支援金のステータス定義（ラベル・トーン・説明）を一元化する。`approved` の表示名をどちらにするかは**仕様判断が必要**です（会計班に確認）。
4. `formatCurrency` を `lib/format.ts` に寄せる。

### 段階 2: レイアウトの共通化（1〜2 日）

1. `PageShell`（外枠と幅の 3 段階）と `PageHeader`（h1・説明・アクション）を作り、全ページを置き換える。モバイル余白は `PageShell` に閉じ込める。
2. `(authenticated)/loading.tsx` を追加し、`app/loading.tsx` は `PageLoadingShell` を使う形に寄せる。
3. `AccessDenied` / `ErrorState` / `EmptyState` を作り、7 つの `error.tsx`、3 種類の権限エラー、ホームの英語エラーを置き換える。
4. 年度セレクタを 1 つにまとめ、shadcn の `Select` 化する。

### 段階 3: 部品の置き換えとアクセシビリティ（1〜2 日）

1. `StatusBadge` を段階 1 の定義に切り替える（コントラストもここで直る）。管理画面のステータス `Select` も同じ定義から生成する。
2. `confirm()` を `ConfirmDialog` に置き換える。
3. `htmlFor` の無い `<label>` を `Label` と `id` の組に置き換え、アイコンボタンに `aria-label` を付け、`focus:ring-0` を外す。
4. 生パレット色を段階 1 のトークンへ機械的に置き換える（`grep` で残りが 0 件になることを完了条件にする）。

### 段階 4: 構造的な重複の解消（任意、2〜3 日）

1. 表とカードの切替ラッパー（`ResponsiveList`）を作り、ブレークポイントを 1 つの定数にする。
2. サイドバーとモバイルシートのナビ JSX を共通化する。
3. 支援金管理のデスクトップ表を shadcn の `Table` に移行する。
4. 和文フォントの導入を判断する（バンドルとフォント配信量が増えるので、`performance.md` の計測とあわせて決める）。

完了の確認方法（提案）: 主要 8 画面について、ライト/ダーク × 375px/768px/1280px のスクリーンショットを比較し、axe などでラベル・コントラスト・ボタン名の違反が 0 件であることを確認します。
