# 実装状況インベントリ（2026-10-22 時点 / `develop` ブランチ）

このドキュメントは、TODO リストを作るための現状把握用です。記載内容はすべて、リポジトリ内のファイルと、この調査で実行したコマンド（`git log`、`gh issue list`、`gh pr list`、`grep` など）の結果にもとづいています。テストや CI、UI デザイン、パフォーマンスの監査は対象外です。

要件定義の本体は `.claude/docs/DESIGN.md` です。機能仕様の原本はローカル専用の `docs/specification.md`（`.gitignore` の 45〜49 行目により `docs/manual/` 以外の `docs/` は Git 管理外）にあります。

## 概要とスタック

| 項目 | 内容 | 根拠 |
| --- | --- | --- |
| フレームワーク | Next.js `16.0.10`（App Router、Server Actions）、React `19.2.0`、TypeScript | `package.json` |
| UI | Tailwind CSS v4、Radix UI / shadcn/ui（`components/ui/`）、lucide-react、sonner（トースト）、recharts、next-themes | `package.json`、`components.json` |
| フォーム | react-hook-form + zod（`lib/schema.ts`、`lib/validations.ts`） | `package.json` |
| データ取得 | Server Components + Server Actions、サイドバーのみ SWR（`lib/use-sidebar-data.ts`） | |
| DB / 認証 / ストレージ | Supabase（Postgres + RLS、Supabase Auth、Storage バケット `receipts`）。`@supabase/ssr` でクッキーセッションを扱う | `utils/supabase/*.ts`、`proxy.ts` |
| 認証ガード | `proxy.ts`（Next.js 16 の middleware 相当）で未ログイン時に `/login` へリダイレクト | `proxy.ts:57-61` |
| ログイン方式 | 学籍番号 + パスワード | `app/login/actions.ts:12` |
| Edge Function | `update-fiscal-year`（毎年 4/1 0:00 JST に `pg_cron` + `pg_net` で起動） | `supabase/functions/update-fiscal-year/index.ts`、`supabase/migrations/20260401023041_schedule_update_fiscal_year.sql` |
| ホスティング | フロントエンドは Vercel の Git 連携、DB は GitHub Actions からデプロイ | `README.md`、`docs/manual/dev-environment/ci-cd.md` |
| パッケージ管理 | npm（`package-lock.json`）。Node.js 22 | `README.md` |
| テスト | Vitest（`tests/lib/*.test.ts`、`lib/` の純粋関数のみ） | `vitest.config.mts` |

### ディレクトリ構成

```
app/
  (authenticated)/      ログイン後の画面（layout.tsx でサイドバー等を描画）
    page.tsx            ホーム
    applications/       経費申請
    subsidies/          支援金申請（manage/ は支援金管理）
    ledger/             出納帳（班別・部全体）
    members/            部員情報（manage/ は部員管理）
    budget/             予算管理
    settings/           設定
    admin/              廃止済み（users/page.tsx は notFound）
  actions.ts            取引系 Server Actions とファイルアップロード
  login/                ログイン
components/             画面部品（transaction/、subsidy/、ledger/、ui/）
lib/                    認可（auth/、roles/）、スキーマ、集計ロジック、画像圧縮など
utils/supabase/         Supabase クライアント生成
supabase/               config.toml、migrations/（27 本）、seed.sql、functions/
tests/lib/              Vitest のユニットテスト
docs/manual/            日本語マニュアル（Git 管理対象）
```

## 機能一覧と完成度

状態の凡例: **完了** = 仕様の主要項目が UI とサーバーの両方で動く / **一部** = 一部の仕様が未実装または仕様と食い違う / **未接続** = サーバー側だけあって UI から到達できない / **廃止** = 意図的に無効化。

| 機能 | 主なファイル | 状態 | 備考 |
| --- | --- | --- | --- |
| ログイン / ログアウト | `app/login/page.tsx`、`app/login/actions.ts`、`app/actions.ts:65`（`signOut`） | 完了 | 学籍番号でログイン。`lib/rate-limit.ts` にログイン用のレート制限あり |
| ホーム（直近 5 件・今年度集計） | `app/(authenticated)/page.tsx`、`components/dashboard-stats.tsx`、`components/recent-applications.tsx` | 完了 | 経費と支援金を合算して集計（`page.tsx:112-120`） |
| 経費申請 一覧・新規・編集・削除 | `app/(authenticated)/applications/page.tsx`、`components/applications-table.tsx`、`components/transaction-form.tsx`、`components/transaction-row-actions.tsx`、`app/actions.ts` | 一部 | 検索・フィルタ・ソートあり。仕様では「削除は admin のみ」だが、実装は作成者本人が `pending` のものを削除できる（`app/actions.ts:9`、RLS `transactions_delete_own_pending`）。仕様側の更新漏れの可能性あり |
| 経費の承認 / 却下 | `components/approval-actions.tsx`、`app/actions.ts:292`（`updateTransactionStatus`） | 完了 | admin または対象グループの leader。本人の申請は承認不可 |
| 領収書アップロード（経費） | `components/transaction/receipt-upload.tsx`、`lib/image.ts`、`app/actions.ts:73` | 一部 | 詳細は後述。ボタンでファイルを選ぶ方式のみで、D&D はない |
| 支援金申請 一覧・新規・編集・削除 | `app/(authenticated)/subsidies/page.tsx`、`components/subsidy-form.tsx`、`components/subsidy-items-table.tsx`、`components/subsidy/items-edit-dialog.tsx`、`app/(authenticated)/subsidies/actions.ts` | 一部 | 新規申請時は「根拠書類」（見積書等）のアップロードが必須。仕様 C3 の「領収書（必須）」とは異なり、領収書は承認後に提出する流れ（`subsidies/actions.ts:9`）。実装が新しく、仕様書が古い可能性が高い |
| 支援金管理（ステータス変更・詳細編集・削除） | `app/(authenticated)/subsidies/manage/*` | 完了 | admin / 会計のみ（`subsidies/manage/actions.ts:21`）。過年度は admin 以外は読み取り専用（`subsidies/manage/page.tsx:53`） |
| 出納帳（班別） | `app/(authenticated)/ledger/page.tsx`、`app/(authenticated)/ledger/actions.ts`、`components/ledger-view.tsx`、`components/ledger/*`、`lib/ledger.ts` | 完了 | 支援金を仮想行として統合。グループ閲覧制限はサーバー側で判定（`ledger/actions.ts:64-76`）。Realtime 購読あり（`components/ledger-view.tsx:212-227`） |
| 部全体会計・財布別残高 | `supabase/migrations/20260612120000_add_club_wide_ledger.sql`、`components/ledger/club-ledger-summary.tsx`、`lib/auth/permissions.ts`（`canViewClubLedger`） | 一部 | 閲覧・集計・財布フィルタは実装済み。財布マスタ（`financial_accounts`）を管理する UI はない（`canManageFinancialAccounts` は定義のみで未使用） |
| 資金移動（金庫 ⇔ 銀行） | `components/transfer-form.tsx:294`（`TransferForm`）、`app/(authenticated)/ledger/actions.ts:240`（`createTransfer`）、RPC `create_transfer` | 未接続 | `TransferForm` はどこからも import されておらず（`grep -rln TransferForm app components` の結果は自ファイルのみ）、画面から資金移動を登録できない。仕様は `docs/club-wide-ledger-spec.md:218-228` |
| 部員情報 | `app/(authenticated)/members/page.tsx`、`components/members-table.tsx` | 完了 | |
| 部員管理（追加・編集・退部・削除・PW リセット） | `app/(authenticated)/members/manage/*` | 完了 | 会計・部長・副部長・admin。追加時に「仮部員」ロールを自動付与（`members/manage/actions.ts:106`） |
| 予算管理（年度予算・グループ追加・有効/無効・年度データ削除） | `app/(authenticated)/budget/*` | 完了 | 繰入金・収入（carryover）にも対応（`20260426130000_add_carryover_and_income.sql`） |
| 会計年度の自動切替 | `supabase/functions/update-fiscal-year/index.ts` | 完了 | 本番では `pg_cron` / `pg_net` / `supabase_vault` 拡張の有効化が前提（マイグレーション内の NOTE） |
| 設定（パスワード変更・テーマ） | `app/(authenticated)/settings/*` | 完了 | |
| 監査ログ | `lib/audit-log.ts`、`20260320100200_add_audit_log.sql` | 一部 | 書き込みのみ（`logAuditEvent` の呼び出しは `app/` 内で 9 件）。閲覧 UI はない |
| 旧 admin 画面 | `app/(authenticated)/admin/users/page.tsx`、`admin/actions.ts`、`admin/create-user.ts` | 廃止 | ページは `notFound()`。`setGlobalAdmin` などの Server Action は `lib/validations.ts` 以外から参照されておらず、デッドコード |
| Tier 7（仮部員・OB/OG）のアクセス制限 | `lib/use-sidebar-data.ts:161-177` | 一部 | 仕様では Tier 7 は経費申請・支援金申請・出納帳・部員情報に入れないが、ナビ・ページともに制限がない。一方、ローカルの `docs/beta-test/README.md` は仮部員・OB/OG も「閲覧・申請のみ」可能と書いており、仕様書と矛盾している。どちらが正かの判断が必要 |

## データモデルと権限

### テーブル・型・関数

マイグレーションは `supabase/migrations/` に 27 本（初期スキーマ `00000000000000_initial_schema.sql` から `20261008120000_ensure_receipts_bucket.sql` まで）。

- テーブル: `profiles`、`roles`、`user_roles`、`accounting_groups`、`fiscal_years`、`budgets`、`transactions`、`subsidy_items`、`audit_logs`、`system_config`、`financial_accounts`
- ビュー: `v_ledger_transactions`（`20260327130000_add_ledger_view.sql`、部全体会計マイグレーションで再定義）
- ENUM: `approval_status`（`pending` / `accepted` / `approved` / `rejected` / `receipt_received` / `refunded` / `received`）、`subsidy_status`（初期 6 値に `application_rejected` / `unexecuted` / `accounting_received` / `application_in_progress` などを追加）、`subsidy_category`、`subsidy_expense_type`、`income_type`
- 関数: `is_admin()`、`has_role()`、`is_accounting_or_admin()`、`is_club_group()`、`get_budget_usage()`、`create_transfer()`
- 論理削除: `transactions` / `subsidy_items` などに `deleted_at`（`20260320100000_add_soft_delete_columns.sql`）
- 型定義: `lib/database.types.ts`（`npm run db:types` で生成）

### RLS

全 11 テーブルで RLS が有効です。主なポリシーは `20260320100100_add_rls_policies.sql` と `20260612120000_add_club_wide_ledger.sql` にあります。

- `transactions` の SELECT は「論理削除されていない」かつ「部全体グループでない、または会計/admin」のみが条件です（`add_club_wide_ledger.sql:363-369`）。**班ごとの閲覧制限は DB では行っておらず、アプリ側（`ledger/actions.ts:76`）だけで判定**しています。
- `subsidy_items` の SELECT は `deleted_at IS NULL` のみで、ログインユーザーは全員の申請を読めます（`add_rls_policies.sql:116-119`）。
- 書き込みの多くは `createAdminClient()`（service role）経由で RLS をバイパスし、権限判定は Server Action 側の `resolveAuthWithRoles()` と `lib/auth/permissions.ts` が担います。

### ロールと権限

- ロール種別: `admin` / `accounting` / `leader` / `general`（`lib/roles/constants.ts`）
- 日本語ロール名: 会計・部長・副部長・仮部員・OB・OG（同上）
- 判定ロジック: `lib/roles/access.ts`（`isAdmin`、`hasAccountingRole`、`canManageMembers`、グループ別ロール）
- ナビ表示: 予算管理と支援金管理は会計または admin、部員管理は会計・部長・副部長・admin（`lib/use-sidebar-data.ts:153-175`）
- ページ側の権限チェック: `/budget`（`budget/page.tsx:119`）、`/members/manage`、`/subsidies/manage`（`fetchAllSubsidies` 内）はサーバー側で拒否します。

## 環境とデプロイ

| 環境 | DB | フロントエンド | 手順書 |
| --- | --- | --- | --- |
| ローカル | Docker 上の Supabase（`npm run db:start` / `db:reset` で migrations と `seed.sql` を適用） | `npm run dev` | `docs/manual/dev-environment/local-setup.md` |
| staging | `develop` への push で `deploy-db.yml` がマイグレーションと Edge Function をデプロイ | Vercel Preview | `docs/manual/dev-environment/staging-setup.md` |
| production | `main` への push 後、`production` Environment の承認者が承認するとデプロイ | Vercel Production | `docs/manual/dev-environment/ci-cd.md` |

- CI: `.github/workflows/ci.yml`（`develop` / `main` 向け PR と push で lint、型検査、テスト、ビルド、ローカル DB の reset と lint）
- 環境変数の雛形: `.env.example`、`.env.local.example`、`.env.production.example`。`.env.local` は `.gitignore:34` で除外済み
- `receipts` バケットは `20261008120000_ensure_receipts_bucket.sql` で作成されます（`public = true`、上限 10 MiB、許可 MIME 9 種）。既存の本番バケットは `ON CONFLICT DO NOTHING` のため変更されません
- ローカル専用メモ `docs/prod_migration/task.md` には、本番移行の Step 1〜4（スキーマ適用、データのダンプとリストア、`receipts` ストレージの移行）が未チェックのまま残っています。実施済みかどうかはこのリポジトリからは確認できません

## 直近の開発履歴

`git log --oneline` の総数は 108 コミット（2025-11-27〜2026-10-22）。直近の主な流れは次のとおりです。

| 時期 | PR / コミット | 内容 |
| --- | --- | --- |
| 2026-10-22 | #38 `feature/dev-env-ci` | ローカル開発環境・CI/CD（staging/production）の整備、seed 整備、README 更新 |
| 2026-10-21〜22 | #36, #37 `feature/update-orchestra` | Claude Code Orchestra 設定の更新（アプリ機能の変更なし） |
| 2026-08-06 | #35 | 取引の UUID 参照検証スキーマ追加、`financial_account_id` の扱いを各部品に反映 |
| 2026-06-23 | #34 | 部員追加でメール重複時のエラーメッセージ改善 |
| 2026-06-15 | #33 | 経費申請で財布未選択時にデフォルト財布を補完 |
| 2026-06-14 | #32 | 部全体会計・財布別記録機能の追加 |
| 2026-06-11 | #31 | 大規模リファクタリング（認可の共通化、部品分割など） |
| 2026-05 | #26〜#30 | 会計管理画面の機能追加、役職フィルター、ユーザー名の Unicode 対応、ロール同期の修正 |
| 2026-04 | #24, #25 | 支援金申請の編集項目追加、使用時期、繰入金・収入対応 |
| 2026-03〜04 | （コミットのみ） | 領収書のファイル名にタイムスタンプ付与、対応形式の拡張、古い領収書ファイルの削除、セキュリティヘッダー、会計年度の自動更新 |

`develop` のアプリ機能に関する最後の変更は 2026-08-06（#35）で、それ以降は開発環境と CI の整備が中心です。

## 未解決の Issue・PR

- `gh issue list --state open --limit 50`: **0 件**（`gh auth status` でログイン済みを確認したうえで空の結果）
- `gh pr list --state open`: **0 件**
- 参考までに、クローズ済みの Issue は #2・#4〜#7 の 5 件で、すべて 2026-03-25 にクローズされています（学籍番号検索エラー、経費申請の詳細閲覧・編集、支援金の新規申請不可、`/admin/users` の削除、「申請拒否」に変更できない問題）
- 利用者から要望が出ている「領収書の D&D アップロード」は Issue として登録されていません

## コード中の TODO

`app/`、`components/`、`lib/`、`utils/`、`supabase/`、`proxy.ts`、`next.config.ts` に対して `TODO|FIXME|XXX|HACK|未実装|仮実装|not implemented` を `grep` した結果、**該当は 0 件**です（`lib/database.types.ts` は除外）。

コメントで将来対応が示唆されている箇所は次のとおりです。

- `app/actions.ts:15-16`: `transaction_kind = "transfer"` の 2 行を同時に承認するロジックが将来必要になる、という注記
- `lib/rate-limit.ts:8-9`: インメモリ実装なので、複数インスタンス環境では Redis などが必要、という注記

## 領収書アップロードの現状と D&D 追加時の改修ポイント

### 現在の処理の流れ

1. **ファイル選択**: 非表示の `<Input type="file" accept="image/*,.pdf">` を、ボタンの `onClick` から `document.getElementById(...).click()` で開く方式です。D&D、クリップボードからの貼り付け、複数ファイル選択はありません。
2. **クライアント側の検証**: **ありません**。選んだファイルはそのまま state に入り、形式やサイズは送信時にサーバーで初めて検証されます。
3. **画像圧縮**: `lib/image.ts` の `compressImageToWebp()` が、PDF 以外を Canvas で最大 1200px、品質 0.7 の WebP に変換します。
4. **アップロード**: `uploadReceiptAction()`（`app/actions.ts:73-159`）が Server Action として受け取ります。処理内容は次のとおりです。
   - 認証チェック
   - レート制限（1 ユーザーあたり 10 回 / 時、`lib/rate-limit.ts:137-139`）
   - MIME 形式の許可リスト（`app/actions.ts:99`、9 種）
   - サイズ上限 10MB（`app/actions.ts:118`）
   - ファイル名のサニタイズ
   - service role で Storage にアップロード（`app/actions.ts:151`、`upsert: true`）
5. **保存先**: Supabase Storage の `receipts` バケット直下です。DB には相対パスだけを `transactions.receipt_url` / `subsidy_items.receipt_url` / `subsidy_items.evidence_url` として保存します。1 レコードに 1 ファイルです。
6. **表示**: `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/receipts/<path>` という公開 URL を組み立てて表示します（`applications/page.tsx:53-72`、`subsidies/page.tsx:77-108`、`subsidies/manage/client-page.tsx:90`）。

### ファイル入力がある場所（6 か所、4 ファイル）

| 用途 | ファイル | 行 | input の `id` | 送信処理 |
| --- | --- | --- | --- | --- |
| 経費の領収書（新規・編集） | `components/transaction/receipt-upload.tsx`（`transaction-form.tsx:472` から利用） | 66-90 | `receipt-upload` | `components/transaction-form.tsx:182-216` |
| 支援金の根拠書類（新規） | `components/subsidy-form.tsx` | 516-547 | `subsidy-evidence-upload` | `components/subsidy-form.tsx:162-185` |
| 支援金の領収書（申請者、承認後） | `components/subsidy/items-edit-dialog.tsx` | 85-120 | `receipt-upload`（経費フォームと同じ id） | `components/subsidy-items-table.tsx:195-209` |
| 支援金の根拠書類（申請者、承認前） | `components/subsidy/items-edit-dialog.tsx` | 355-385 | `evidence-upload` | 同上 |
| 支援金の根拠書類（管理者） | `app/(authenticated)/subsidies/manage/_components/manage-edit-dialog.tsx` | 188-215 | `admin-evidence-upload` | `subsidies/manage/client-page.tsx:251-260` |
| 支援金の領収書（管理者） | 同上 | 350-385 | `admin-receipt-upload` | `subsidies/manage/client-page.tsx:219-230` |

共通部品になっているのは経費用の `ReceiptUpload` だけです。残りの 5 か所は、同じマークアップをそれぞれの画面に直接書いています。プレビュー（画像のサムネイル、PDF アイコン）があるのも `ReceiptUpload` だけです。

### D&D を追加する場合に触る箇所

1. **共通部品を新設または拡張する**: `components/transaction/receipt-upload.tsx` を汎用化するか、`components/ui/file-dropzone.tsx` のような部品を新しく作ります。ラベル、説明文、既存ファイルの表示（「登録済み(変更可)」）、プレビューを props で受け取れるようにし、上の表の 6 か所をすべて置き換えます。置き換えないと、D&D が使える画面と使えない画面が混在します。
2. **ドロップ処理**: `onDragEnter`、`onDragOver`（`preventDefault` が必須）、`onDragLeave`、`onDrop` で `e.dataTransfer.files[0]` を受け取ります。ドラッグ中はハイライトを表示します。ダイアログ内でドロップ領域を外したときにブラウザがファイルを開いて画面遷移しないよう、ダイアログ表示中は `window` の `dragover` / `drop` も抑止します。
3. **複数ファイルの扱い**: DB は 1 レコード 1 ファイル（`receipt_url` は単一の text 列）です。D&D は単一ファイルとして実装し、2 ファイル以上がドロップされたらエラーを表示するのが現実的です。複数枚に対応するには、テーブル設計の変更（別テーブル化）が必要になります。
4. **クライアント側の検証を追加する**: ドロップされたファイルは `accept` 属性の制限を受けません。許可形式と 10MB の上限を、ドロップ時点で検証してトーストで知らせる必要があります。許可リストは現在 `app/actions.ts:99` に直書きされているので、`lib/constants/` などに切り出してサーバーとクライアントで共有するのが望ましいです。
5. **id の重複をなくす**: `document.getElementById` で固定 id を参照する方式をやめ、`useRef` か React の `useId()` を使います。経費フォームと支援金の編集ダイアログは、どちらも `receipt-upload` という同じ id を使っています。
6. **アクセシビリティとモバイル**: ドロップ領域はキーボード（Enter / Space）で選択ダイアログを開けるようにし、`role="button"` と `aria-label` を付けます。スマートフォンには D&D がないため、タップでの選択（カメラ起動を含む）は今までどおり残します。
7. **設定変更は不要**: CSP の `img-src` は `blob:` を許可済み（`next.config.ts` のヘッダー設定）なので、プレビュー表示のために設定を変える必要はありません。依存パッケージも、ネイティブの Drag and Drop API で足ります（`react-dropzone` の採用は任意です）。

## 気になった問題点

コードを読んで見つけた点です。実機での再現確認はしていません。

1. **PDF のサイズ上限が実質 5MB**: UI とサーバーは「最大 10MB」と案内しています（`receipt-upload.tsx:62`、`app/actions.ts:118`）。しかし `next.config.ts:8` の `serverActions.bodySizeLimit` は `"5mb"` です。PDF は圧縮されないため、5MB を超える PDF は Server Action の段階で失敗すると考えられます。画像は WebP に圧縮されるので通常は影響しません。
2. **HEIC / TIFF は多くのブラウザで処理に失敗する可能性**: `compressImageToWebp()` は `<img>` と Canvas でデコードします。そのため、HEIC や TIFF を描画できない Chrome / Firefox では `onerror` で reject され、「画像の処理中にエラーが発生しました」になる見込みです（`transaction-form.tsx:210-214`）。対応形式の案内と実際の挙動が一致していません。
3. **アップロード失敗時に元の領収書が消える**: `uploadReceiptAction` は、新しいファイルをアップロードする**前に**既存ファイルを削除します（`app/actions.ts:129-146`）。新しいファイル名には毎回ランダムな値が入るため、`existingPath !== sanitizedFileName` は常に真です。その後アップロードや DB 更新が失敗すると、DB には削除済みファイルへのパスが残り、リンク切れになります。
4. **孤立ファイルが残る**: アップロードが成功したあとで取引や支援金の作成が失敗すると、Storage にファイルだけが残ります（`transaction-form.tsx:182-235`、`subsidy-form.tsx:162-195`）。
5. **レート制限が会計担当の作業を止める可能性があり、防御としても効かない**: 上限は 10 回 / 時 / ユーザーです。管理画面では 1 件の編集で領収書と根拠書類の 2 回アップロードすることがあるので、5 件ほど処理すると上限に達します。一方で実装はインメモリ（`lib/rate-limit.ts:8-9`）なので、Vercel のように複数インスタンスで動く環境では制限が正しく効きません。また `subsidy-form.tsx:176-178` はサーバーのエラー文言を捨てて汎用メッセージを出すため、レート制限に達しても利用者には理由が分かりません。
6. **領収書が公開 URL で誰でも見られる**: `receipts` バケットは `public = true`（`20261008120000_ensure_receipts_bucket.sql`）です。認証済みユーザー向けの SELECT ポリシー（`20260325120000_add_storage_policies.sql`）があっても、公開 URL ではそれを経由しません。パスに UUID が入っているので推測は難しいものの、URL が漏れれば誰でも閲覧できます。個人情報を含む領収書であれば、非公開バケットと署名付き URL への移行を検討する価値があります。なお同じファイルの INSERT ポリシーは `<uid>/` フォルダ配下を前提にしていますが、実際のアップロードは service role でバケット直下に置くため、このポリシーは使われていません。
7. **DB レベルの閲覧制限が弱い**: `transactions` は班をまたいで、`subsidy_items` は全件、ログインユーザーなら anon key で直接読めます。画面上の閲覧制限はアプリ側だけで実装されています。
8. **部全体グループの判定方法が食い違っている**: サーバーは `accounting_groups.type === "club"`（`ledger/actions.ts:64`）で判定し、クライアントはグループ名 `"部全体"`（`components/ledger-view.tsx:127`）で判定しています。グループ名を変えると、集計カードや拡張列が表示されなくなります。
9. **資金移動 UI が未接続**: 上の機能表のとおり、`TransferForm` はどこからも使われていません。
10. **仕様書と実装の食い違い**: Tier 7 のアクセス制限、経費申請の削除権限、支援金申請時の書類の扱いが、`docs/specification.md` と実装で異なります。仕様書が Git 管理外のため、どちらを正とするかを決めて、仕様を `docs/manual/` か `.claude/docs/DESIGN.md` に取り込む必要があります。
11. **デッドコード**: `app/(authenticated)/admin/actions.ts`、`admin/create-user.ts`、`lib/auth/permissions.ts` の `canManageFinancialAccounts` は、どこからも呼ばれていません。
