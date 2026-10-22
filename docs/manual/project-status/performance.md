# パフォーマンスの現状とボトルネック候補

調査日: 2026-10-22 / 対象ブランチ: `develop`（コミット `b04402e`）

コードの静的な読解と、隔離環境での本番ビルドをもとにまとめています。リモートの Supabase には接続していないので、**実測のレイテンシは含みません**。「推定影響」は、コード上の往復回数と処理内容から見積もったものです。

## 構成の概要

| 項目 | 現状 | 根拠 |
|------|------|------|
| フレームワーク | Next.js 16.0.10（App Router、`next build --webpack`）、React 19.2 | `package.json` |
| レンダリング | 認証後の全ページが動的 SSR（`ƒ`）。静的なのは `/login`、`/_not-found`、`/admin/users` だけ | 下記ビルド結果 |
| 認証 | `proxy.ts`（旧 middleware）が全リクエストで `supabase.auth.getUser()` を呼ぶ。各ページと各 Server Action も、それぞれ `getUser()` を呼び直す | `proxy.ts:47-49`, `lib/auth/context.ts:15-17` |
| データ取得 | Server Component から `@supabase/ssr` で直接クエリする。出納帳の切替・再取得は Server Action（`fetchLedgerTransactions`）経由 | `app/(authenticated)/ledger/actions.ts:32-211` |
| サーバーキャッシュ | `unstable_cache` を使うのは `accounting_groups`（3600 秒）、`fiscal_years`（300 秒）、`system_config`（3600 秒）だけ。予算系の更新では `updateTag` で無効化している | `lib/cache.ts:17-55`, `lib/system-config.ts:23-39`, `app/(authenticated)/budget/actions.ts` |
| クライアント取得 | サイドバー（ロール・氏名・申請中の支援金）はブラウザから SWR で取得する。出納帳は Supabase Realtime を購読する | `lib/use-sidebar-data.ts:84-145`, `components/ledger-view.tsx:213-227` |
| 画像 | 選択した画像をクライアントで Canvas により WebP（長辺 1200px、品質 0.7）に変換し、Server Action 経由で Storage にアップロードする。表示は public バケットの URL | `lib/image.ts:6-92`, `app/actions.ts:73-157` |
| 遅延読み込み | `next/dynamic` を使うのは予算ページのグラフ（recharts）だけ | `app/(authenticated)/budget/page.tsx:24-36` |

### ビルド結果

リポジトリ本体の `.next` と `.env*` に触れないよう、追跡対象のファイルだけをスクラッチ領域にコピーし、ダミーの環境変数でビルドしました（Supabase への接続は発生しません）。

```bash
# スクラッチ領域で実行（node_modules はシンボリックリンク）
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy \
  ./node_modules/.bin/next build --webpack
```

- 結果: **成功**（Compiled successfully in 24.6s、14 ページを生成）。警告は `baseline-browser-mapping` のデータが古いという通知だけです。
- Next 16 のビルド出力にはページごとの JS サイズが表示されないため、`.next/static/chunks` を gzip して計測しました。

| チャンク | gzip 後 | 主な中身 | 読み込まれる場所 |
|----------|---------|----------|------------------|
| 共通ベース（framework + main + webpack） | 約 114 KB | React、Next ランタイム | 全ページ（別途 polyfills 約 39 KB があるが、`nomodule` なので新しいブラウザでは読み込まれない） |
| `252-*.js` | 約 98 KB | recharts | `/budget` のみ（`next/dynamic`） |
| `6438-*.js` | 約 46 KB | react-day-picker、date-fns | 日付入力を持つフォーム（ホームの FAB、経費、支援金、出納帳など） |
| `8075-*.js` | 約 46 KB | supabase-js（GoTrue、Realtime） | 認証後の全ページ（サイドバーの SWR がブラウザで Supabase クライアントを使うため） |

client reference manifest から集計したページごとの合計は、gzip 後 354〜462 KB（最大は `/budget`）でした。ただしこの manifest にはそのページで使われないモジュールも含まれうるので、**上限の目安**として扱ってください。

## ボトルネック候補

影響度の高い順です。工数感は S = 半日以内、M = 1〜2 日、L = 3 日以上。

| # | 箇所 | 原因 | 推定影響 | 対策 | 工数感 |
|---|------|------|----------|------|--------|
| 1 | 領収書アップロード（`lib/image.ts:52-77`, `next.config.ts:8`, `app/actions.ts:117-121`, `components/transaction/receipt-upload.tsx:62`） | (a) Safari/iOS は Canvas の WebP エンコードに対応しておらず、`toBlob(…, "image/webp")` は**黙って PNG を返す**。コードは `blob.type` を確認せず、`.webp` の名前と `image/webp` の型を付けて送るので、iPhone からの領収書は中身が PNG のまま（JPEG 元画像より数倍大きくなりうる）保存される。(b) Server Action の body 上限が `5mb` なのに、UI とサーバーの検証は「最大 10MB」とうたっている。圧縮されない PDF や Safari で PNG 化された画像が 5MB を超えると、親切なエラー文ではなくフレームワーク側のエラーで失敗する。(c) ファイルは ブラウザ → Vercel 関数 → Storage と 2 回転送される。(d) `FileReader.readAsDataURL` で base64 化してから decode するので、大きな写真ではメモリと時間を余分に使う | **高**: 主な利用者（スマホで領収書を撮る部員）の中心的な操作が、遅くなるか失敗する | `blob.type !== "image/webp"` なら JPEG（0.8 前後）で再エンコードし、拡張子と型を実際の値に合わせる。上限値（`bodySizeLimit`・UI 文言・`MAX_FILE_SIZE`・バケットの `file_size_limit`）を 1 つに揃える。中期的には `createSignedUploadUrl` によるブラウザからの直接アップロードに移行する。decode には `createImageBitmap` か `URL.createObjectURL` を使う | S（a, b, d）/ M（c） |
| 2 | 出納帳ページの初期表示（`app/(authenticated)/ledger/page.tsx:17-45,83-89,137-140`, `ledger/actions.ts:41-62,117-129,175-179`） | 直列の往復が多い。proxy の `getUser` → ページの `getUser` → `Promise.all`（ロール・キャッシュ・全プロフィール）→ Action 内で `getUser` をもう一度 → `user_roles` をもう一度 → `accounting_groups.type` → `Promise.all`（取引・支援金・予算）→ `financial_accounts` → `profiles`。今年度表示でも **約 9 段の直列往復**（うち Auth API が 3 回）になる。さらにハイドレーション後に `fetchFinancialAccounts`（`components/ledger-view.tsx:154-161`）が、認証とロール取得を含めて 3 段を追加する | **高**: 最もよく使われる画面の TTFB が往復回数に比例して伸びる | ページからは Server Action ではなく内部関数を呼び、すでに解決済みの `auth`/`access` を渡す。`getUser` と `getUserRoleAccess` を React の `cache()` で包み、同じリクエスト内での重複をなくす。`financial_accounts` は `unstable_cache` に入れ、`groupInfo` は取得済みの `getAccountingGroups()` から引く。`financial_accounts` と `profiles` の取得は並列化する | M |
| 3 | 全ページ共通の認証往復（`proxy.ts:47-49`、各 `page.tsx` 冒頭、`lib/auth/context.ts:15-17`） | `getUser()` は毎回 Supabase Auth API へ HTTP で問い合わせる。1 回のページ遷移で proxy とページの最低 2 回、Server Action を呼べばさらに 1 回増える。proxy の matcher は `next/link` のプリフェッチ要求にも一致するので、サイドバーのリンクが表示されるたびに、プリフェッチの本数分だけ Auth API への問い合わせが増える（`proxy.ts:66-75`） | **中〜高**: 全画面の TTFB に固定で上乗せされる | proxy では `supabase.auth.getClaims()`（非対称 JWT 署名鍵ならローカル検証）でセッションを確認し、ページ側は `cache()` で包んだ 1 回だけにする。署名鍵の設定は Supabase 側で**要確認** | S〜M |
| 4 | Vercel 関数と Supabase のリージョン（**要確認**） | リポジトリに `vercel.json` もリージョン指定も無い。Vercel 関数のリージョンが既定（米国東部）のままで Supabase が東京にある場合、往復 1 回に 100〜200ms 程度かかり、#2 の 9 段がそのまま秒単位の遅延になる | **高（未確認）** | Vercel の Project Settings → Functions → Region が Supabase プロジェクトのリージョンと一致しているか確認する。ずれていれば合わせる（コード変更は不要） | S |
| 5 | サイドバーのクライアント取得（`app/(authenticated)/layout.tsx:12`, `lib/use-sidebar-data.ts:84-145`） | ロールと氏名をハイドレーション後にブラウザから取得する（`getUser` + 3 クエリ）。そのため (a) 管理者向けメニュー（予算管理・支援金管理・部員管理）が遅れて現れ、レイアウトがずれる。(b) supabase-js（約 46 KB gz）が全ページの初期 JS に入る | **中**: 毎回のフル読み込みで、ナビのちらつきと追加リクエストが発生する | 認証後レイアウト（Server Component）でロールを取得して props で渡す（#2 の `cache()` と共用できる）。申請中の支援金リストもサーバーで取得する | M |
| 6 | 直列の await（各ページ） | 互いに依存しないクエリを順番に待っている。`subsidies/page.tsx:51,54,61`（`getUserTeams` → `accounting_groups` → `subsidy_items`）、`applications/page.tsx:32,38`、`members/page.tsx:32,34`、`members/manage/page.tsx:69,98,101,114`（4 段） | **中**: 各画面で 1〜3 往復ずつ余分にかかる | `Promise.all` で並列化する。`subsidies/page.tsx:54` の `accounting_groups` は、キャッシュ済みの `getAccountingGroups()` を絞り込めば足りる | S |
| 7 | 出納帳の Realtime 再取得（`components/ledger-view.tsx:213-227`） | `transactions` の変更イベントごとに、Server Action で全件を取り直す（#2 の約 6 段を毎回実行）。デバウンスが無く、`ledger-refresh` イベントとも重なる | **中（同時操作時）**: 会計班が一括承認すると、閲覧中の全員が連続で再取得する | 300〜500ms のデバウンスを入れ、取得中なら 1 回にまとめる。将来的には変更行だけ差分で反映する | S |
| 8 | ホームの集計（`app/(authenticated)/page.tsx:43-63,100-129`） | 件数と合計額を出すために、今年度の自分の取引と支援金を**全件**取得して JS で集計している（`limit` 無し） | **低〜中**: 今は数十件だが、件数に比例して重くなる | 直近 5 件は `limit(5)` で取得し、件数・合計は `count: "exact", head: true` か集計 RPC に分ける | S〜M |
| 9 | フォームの eager 読み込みと二重描画（`app/(authenticated)/applications/page.tsx:91,137`, `subsidies/page.tsx:149,242`, `components/mobile-new-transaction-fab.tsx:12`） | 日付ピッカーを含むフォームダイアログ（`6438` チャンク約 46 KB gz を含む）を、閉じた状態でも初期バンドルに含めている。経費・支援金ページでは、同じフォームをデスクトップ用とモバイル用に 2 つマウントしている | **低〜中**: 初期 JS とハイドレーション時間 | ダイアログの中身を `next/dynamic` で遅延読み込みする（トリガーボタンだけ先に描画）。フォームは 1 つだけマウントし、配置は CSS で切り替える | S |
| 10 | 更新後の二重再描画（例: `components/transaction-form.tsx:248` と `app/actions.ts:287-288`） | Server Action 内の `revalidatePath` で現在のルートは再描画されるのに、クライアントでも `router.refresh()` を呼んでいる。予算系のダイアログ 5 つも同じ | **低**: 更新のたびに RSC の再取得が 1 回多い | どちらか一方に統一する（Server Action 側の `revalidatePath` を残す） | S |
| 11 | RLS のポリシー評価（`supabase/migrations/20260612120000_add_club_wide_ledger.sql:363-372`, `20260320100100_add_rls_policies.sql:9-30,104-107`） | `transactions` の SELECT ポリシーが行ごとに `is_club_group(accounting_group_id)` を呼ぶ。`is_accounting_or_admin()` と `is_admin()` は `(select …)` で包まれていないので、行ごとに再評価されうる | **低（現状の件数では）**: 件数が増えると、出納帳と経費一覧の取得時間に効いてくる | `USING ((select is_accounting_or_admin()) OR …)` の形にして initPlan 化する。Supabase の Performance Advisor（`auth_rls_initplan`）で確認する | S |
| 12 | 複合インデックスの不足（`supabase/migrations/00000000000000_initial_schema.sql:162-176`） | 単一列のインデックスしか無い。よく使う絞り込みと並べ替えは `transactions(accounting_group_id, fiscal_year_id, date)`、`transactions(created_by, date)`、`subsidy_items(applicant_id, created_at) WHERE deleted_at IS NULL` | **低（現状の件数では）** | 実データで `EXPLAIN ANALYZE` を確認してから複合インデックスを追加する（先に足しても害は小さい） | S |
| 13 | `StatusBadge` ごとの `TooltipProvider`（`components/status-badge.tsx:78`） | 一覧の行ごとに Provider と Tooltip を生成している | **低**: 長い一覧での描画コスト | Provider をレイアウトに 1 つだけ置く | S |

### 参考: セキュリティに関わる所見（性能の範囲外）

- `receipts` バケットは `public = true` です（`supabase/migrations/20261008120000_ensure_receipts_bucket.sql:13`）。アプリも `/storage/v1/object/public/receipts/` の URL を組み立てて表示しています（`app/(authenticated)/ledger/actions.ts:190-206` のほか 4 ファイル）。ファイル名は UUID なので推測は難しいものの、URL を知っていれば**ログイン無しで領収書を閲覧できます**。署名付き URL（`createSignedUrl`）への移行を検討してください。移行するとキャッシュ戦略が変わるため、性能面の判断（有効期限、一覧での一括発行）も一緒に必要になります。
- ホームのエラー表示が DB のエラー文言をそのまま画面に出しています（`app/(authenticated)/page.tsx:131-137`）。

## 計測方法の提案

| 目的 | 方法 |
|------|------|
| 実ユーザーの体感（LCP、INP、TTFB） | Vercel Speed Insights を有効にするか、`useReportWebVitals` でページ別に収集する。特に `/ledger` と `/` の TTFB を見る |
| サーバー側の往復回数と時間 | `ledger/page.tsx` と `fetchLedgerTransactions` の各 await の前後を `performance.now()` で計測し、`Server-Timing` ヘッダーかログに出す（一時的な計測用のコード）。#2〜#4 の改善前後で比較する |
| リージョンのずれ | Vercel の関数ログでリージョンを確認し、Supabase ダッシュボードの Project Settings でプロジェクトのリージョンを確認する |
| DB クエリ | Supabase ダッシュボードの Query Performance（`pg_stat_statements`）で遅いクエリを洗い出す。Performance / Security Advisor の RLS 関連の警告を確認する。ローカル（`npm run db:start`）で seed を増やして `EXPLAIN ANALYZE` を取る |
| バンドル | 今回の手順（スクラッチ領域でのビルドと chunk の gzip 計測）を再利用する。内訳まで見たい場合は `@next/bundle-analyzer` の導入を検討する（依存の追加になるので要判断） |
| アップロード | iPhone の Safari で領収書を撮影してアップロードし、Storage に保存されたファイルの実際の形式（先頭バイトが `RIFF…WEBP` か `89 50 4E 47`（PNG）か）とサイズを確認する。Chrome の DevTools で「Fast 4G」に絞った場合のアップロード時間も見る |

## 推奨する改善順序

1. **#4 リージョンの確認**（コード変更なし。ずれていれば最大の改善になる）。
2. **#1 領収書アップロード**の (a)(b)(d): `blob.type` の確認と JPEG へのフォールバック、上限値の統一。実害（失敗と肥大化）に直結し、修正範囲は `lib/image.ts` と設定値だけ。
3. **#2・#3・#5 をまとめて**: `getUser` / ロール取得を `cache()` 化した共通ヘルパーにし、レイアウト・ページ・出納帳の初期取得で共有する。proxy は `getClaims()` を検討する。
4. **#6 直列 await の並列化**と **#10 二重再描画の解消**（小さな差分の積み重ね）。
5. **#7 Realtime のデバウンス**、**#8 ホーム集計の分離**、**#9 フォームの遅延読み込み**。
6. **#11 RLS** と **#12 インデックス**: 件数が増えてきた段階で、Advisor と `EXPLAIN` の結果を見て対応する。
7. 並行して、領収書の public バケットを署名付き URL へ移行するかどうかを判断する（セキュリティ上の判断。性能面の設計も伴う）。

各段階の前後で「計測方法の提案」の TTFB とアップロード時間を記録し、効果を確認してから次に進めることを推奨します。
