# リファクタリング候補と実施順序

調査日: 2026-10-22（ブランチ `develop`、HEAD `b04402e`）

今後の予定作業（領収書のドラッグ&ドロップアップロード、CI/E2E テスト、UI 統一、パフォーマンス改善）と並行して、どのリファクタリングをいつ行うかを判断するための資料です。見た目の不統一は UI 監査（`ui-design.md`）、速度の詳細は `performance.md`、テスト体制は `testing-ci.md` を参照してください。

## 調べ方

- ソースの通読と `grep` による参照追跡（未使用 export、重複コード、権限判定の箇所）
- `wc -l` で 300 行超のファイルを列挙
- `npx tsc --noEmit`（エラー 0）、`npx eslint .`（指摘 0）、`npx vitest run`（7 ファイル・161 テストすべて成功）
- 作業用コピーで `lib/auth/types.ts` を `SupabaseClient<Database>` に変えた場合の `tsc` を実行（エラー 4 件。本体のソースは変更していません）
- Codex（`gpt-6.1-sol`、read-only）に優先順位と順序をレビューさせ、指摘はすべてコードで裏取りしてから採用しました（ログ: `.claude/logs/codex/20261022T072142Z-refactor-plan.md`）

## 現状の構造

| 層 | 場所 | 実態 |
|----|------|------|
| ルーティング・認証ガード | `proxy.ts` | 未ログインなら `/login` へリダイレクトします。`utils/supabase/middleware.ts` の `updateSession` とほぼ同じ処理を重複して持っており、`updateSession` 側はどこからも呼ばれていません。 |
| ページ（Server Component） | `app/(authenticated)/*/page.tsx` | 型付きの `createClient()`（`utils/supabase/server.ts`）で Supabase を直接クエリし、ロール判定・会計年度決定・表示用データ整形までページ内で行っています。 |
| 書き込み（Server Actions） | `app/actions.ts`、`app/(authenticated)/*/actions.ts` | 1 関数の中で「認証 → 入力検証 → 権限判定 → DB 書き込み → 監査ログ → `revalidatePath`」をすべて行います。データアクセス層はありません。API Route（`app/api`）はありません。 |
| 認証・権限 | `lib/auth/*`、`lib/roles/*` | `resolveAuthWithRoles()` と `getUserRoleAccess()` が正規の入口です。ただしページや `lib/teams.ts`、クライアント側の `lib/use-sidebar-data.ts` がそれぞれ独自にロールを解析しています。 |
| サービスロール | `createAdminClient()` | `app/actions.ts`、`budget/actions.ts`、`members/manage/actions.ts`、`subsidies/actions.ts`、`admin/create-user.ts`、`lib/cache.ts`、`lib/system-config.ts` で RLS（行レベルセキュリティ）をバイパスして使われています。 |
| クライアント | `components/*`、`app/**/_components/*` | フォームやテーブルの中でアップロード処理（圧縮 → `FormData` → `uploadReceiptAction`）を直接書いています。`components/ledger-view.tsx` はブラウザ用クライアントで Realtime を購読しています。 |
| 純粋ロジック | `lib/ledger.ts`、`lib/date.ts`、`lib/format.ts`、`lib/validations.ts` など | テストがあるのはここ（`tests/lib/*`）だけです。Server Actions とページはテストされていません。 |
| 型 | `lib/database.types.ts` | 生成型はあります。ただし `lib/auth/types.ts:3` が `SupabaseServerClient = SupabaseClient`（`Database` 型引数なし）のため、Server Actions 内の `auth.supabase` 経由のクエリはすべて型なしになっています。生成型自体もマイグレーションとずれています（`.github/workflows/ci.yml:56-60` のドリフトチェックは `continue-on-error`）。 |

`any` は 0 件ですが、`as unknown as` が 4 件あります（`lib/roles/access.ts:34`、`lib/teams.ts:52`、`budget/page.tsx:104`、`subsidies/manage/actions.ts:80`）。いずれも型なしクライアントや JOIN 結果の型づけの弱さを埋めるためのものです。

## リファクタ前に直すべきセキュリティ問題

リファクタリングの調査中に、権限まわりの欠陥が見つかりました。これらはリファクタリングではなくバグ修正として、ほかのどの作業よりも先に対応してください。

| # | 箇所 | 問題 | 優先度 |
|---|------|------|--------|
| S1 | `app/(authenticated)/members/manage/actions.ts:130-200`、`members/manage/page.tsx:101-110` | `updateMember` は部員管理権限（部長・副部長・会計）しか確認しないまま、サービスロールで任意の `role_ids` を削除・付与します。画面にも admin 種別を含む全ロールが並ぶため、部長などが自分自身にグローバル管理者ロールを付与できます。 | P0 |
| S2 | `app/(authenticated)/subsidies/actions.ts:143-200` | `updateMySubsidyItem` は検証済みデータではなく元の `values` を展開して（:186-187）、サービスロールで更新します（:195-200）。そのため Zod が除去するはずの `status`、`approved_amount`、`applicant_id` などがそのまま書き込まれます（Codex がローカルで再現し、コードでも確認済み）。 | P0 |
| S3 | `app/actions.ts:73-159` | `uploadReceiptAction` は、クライアントが指定した `existingPath` を書式チェックだけで削除し（:131-146）、クライアントが決めた `fileName` に `upsert: true` で書き込みます（:149-151）。いずれもサービスロールで実行されるため、ログイン済みユーザーなら誰でも他人の領収書を削除・上書きできます。 | P0 |
| S4 | `app/actions.ts:404-467` | `updateTransaction` は変更前のグループで権限を判定しますが、変更先の `accounting_group_id`（:464）は検証しません。部全体（club）グループへの移動に対する権限チェック（`createTransaction` の :238-251 にはある）が欠けています。 | P1 |
| S5 | `supabase/migrations/20261008120000_ensure_receipts_bucket.sql:13`、`20260325120000_add_storage_policies.sql:16-18` | `receipts` バケットは public で、SELECT ポリシーも認証済みユーザー全員に読み取りを許可しています。本番バケットの実際の設定は未確認です（このマイグレーションは既存バケットを変更しないため）。 | P1 |
| S6 | `app/(authenticated)/page.tsx:131-136` | DB エラーの `message` をそのまま画面に表示しています。 | P2 |

## リファクタリング候補

列の意味は次のとおりです。

- 影響: 放置した場合の影響
- リスク: リファクタリング自体が回帰を起こす危険度
- 工数感: 学生 1 人で作業する前提（S = 1〜4 時間、M = 4〜12 時間、L = 12 時間以上）
- 関連作業: A = 領収書 D&D、B = CI/E2E テスト、C = UI 統一、D = パフォーマンス

| # | 箇所 | 問題 | 影響 | リスク | 工数感 | 関連する今後の作業 |
|---|------|------|------|--------|--------|------------------|
| R1 | `components/transaction-form.tsx:185-215`、`components/subsidy-form.tsx:160-185`、`components/subsidy-items-table.tsx:193-215`、`subsidies/manage/client-page.tsx:216-236`・`:248-268` | 「圧縮 → ファイル名生成 → `FormData` → `uploadReceiptAction` → トースト」が 5 か所にコピーされています。ファイル名の規則も `${id}_${uuid}`、`${id}_${Date.now()}`、`evidence_…` とばらばらです。`<input type="file">` も 6 か所で手書きされています（`receipt-upload.tsx:79`、`subsidy-form.tsx:541`、`subsidy/items-edit-dialog.tsx:111,375`、`manage-edit-dialog.tsx:208,376`）。 | D&D を入れるには 5 か所すべてを改修する必要があり、挙動もずれます。 | 中 | L（共通フック＋ピッカー化に 12〜20 時間。D&D は別途） | **A の直接の前提です。** `useReceiptUpload()` と `<FileDropzone>` に集約すれば、D&D は 1 か所の変更で済みます。C にも再利用でき、B ではアップロードの E2E を 1 経路に絞れます。S3 の修正（キーをサーバー側で生成）と同時に行ってください。 |
| R2 | `ledger/actions.ts:190-192`、`applications/page.tsx:54-56`、`subsidies/page.tsx:78-84`（2 回）、`subsidy-items-table.tsx:252-254`、`subsidies/manage/client-page.tsx:89-91` | public URL（`…/storage/v1/object/public/receipts/`）の組み立てが 6 か所に重複しています。 | S5 で private バケット＋署名付き URL に移行するときに、6 か所を個別に直す必要があります。 | 低 | S | A、S5。単純な URL ヘルパーではなく、後で署名 URL に差し替えられる「添付ファイル解決関数」として 1 つにまとめます。 |
| R3 | `lib/auth/types.ts:3`、`lib/database.types.ts`、`ci.yml:56-60` | Server Actions のクライアントが型なしです。生成型を当てると `tsc` エラーが 4 件出ます（`app/actions.ts:272`、`subsidies/actions.ts:56`、`subsidies/manage/actions.ts:153`・`:248`）。生成型はマイグレーションともずれています（例: `transaction_kind` はマイグレーションでは `TEXT`＋CHECK 制約なのに、型では enum）。 | 列名の誤りや enum 外の値を型で検出できません（S2 のような任意フィールド混入も見逃します）。 | 低〜中 | M（ローカルで型を再生成してから 4〜8 時間） | B（ドリフトチェックを必須化できる）、ほかの全作業の安全網になります。 |
| R4 | `lib/roles/access.ts:28-38`（正規の実装）に対して、`lib/teams.ts:36-70`、`budget/page.tsx:87-116`、`members/manage/page.tsx:40-80`、`members/page.tsx:34-53`、`lib/use-sidebar-data.ts:65-82`・`:154-159`、`ledger/actions.ts:46-53` | ロール解析が 6 か所以上に重複しています。「部長・副部長・会計・管理者」の判定を `ledger/actions.ts` と `lib/teams.ts:67-70` で再計算しています。グループリーダー判定も `app/actions.ts:327-331`・`:423-427` でインライン化されていて、既存の `isGroupLeader`（`lib/roles/access.ts:78`）を使っていません。`isAdmin \|\| hasAccountingRole` は約 8 か所にあります。 | 権限仕様の変更漏れや、画面とサーバーの食い違い（R5）の原因になります。 | 中（認可ロジックのため） | M（6〜10 時間。呼び出し元を 1 つずつ移行） | B（権限マトリクスのテストを 1 か所に書ける）、C（ボタン表示条件の統一）、D（ロールの重複取得の削減と連動）。 |
| R5 | `budget/page.tsx:119`・`:205-209` と `lib/roles/access.ts:86-91`（`canManageBudget`） | 画面は会計にも編集 UI を見せますが、`upsertBudget` は管理者か対象グループのリーダーしか許可しません。逆にリーダーは :119 でページ自体に入れません。過年度の制限も画面にしかありません。 | 会計が保存すると必ず失敗します。仕様が不明確です。 | 低 | M（仕様を決めてから 4〜8 時間） | C（予算画面）の前に方針を決める必要があります。B で「ロール × グループ × 年度」をテストします。 |
| R6 | `members/manage/actions.ts:183-200`、`subsidies/manage/actions.ts:130-203`（:151 でステータス更新 → :172 で取引を物理削除）、`budget/actions.ts:203-252` | 複数ステップの書き込みがトランザクションになっていません。途中で失敗すると中途半端な状態が残ります。監査ログ（`logAuditEvent`）は `app/actions.ts`、`subsidies/manage/actions.ts`、`deleteMember` にしかなく、取引を削除する `deleteGroupYearData`、ロール変更、支援金の本人操作には記録がありません。 | データ整合性の破損や、会計監査の追跡不能につながります。 | 中〜高 | M〜L（ロール置換の RPC 化は 4〜6 時間程度。3 処理すべてで 20 時間以上） | B（失敗時の挙動テスト）。A・C・D とは独立して進められます。 |
| R7 | `ledger/page.tsx:52-73`（同じファイル内でも重複）、`budget/page.tsx:57-69`、`page.tsx:18-38`、`app/actions.ts:194-199`・`:446-451`、`subsidies/actions.ts:48-52`、`budget/actions.ts:43-53` | 「表示する会計年度の決定」と「日付から会計年度を引く」処理がページやアクションごとに書かれています。不正な `?year=` の扱いや、取得失敗時の挙動もそれぞれ違います。 | 年度境界のバグが箇所ごとに出ます。 | 低 | M（4〜6 時間） | B（境界値テスト）、C（年度セレクタの統一）。 |
| R8 | `app/actions.ts`（586 行）をはじめとする全 `actions.ts` | 1 関数に認証・検証・認可・DB・監査・再検証が混在しています。戻り値の形も統一されていません（`{error}`、`{success:true}`、`{success:false,error}`（`settings/actions.ts:14`）、`{error,data:[]}`、成功とエラーの同時返却（`budget/actions.ts:301`）、認証失敗を空配列で握りつぶす例（`subsidies/actions.ts:108`））。`lib/types.ts:14-21` の `ActionResult` は未使用で、成功側の型定義にも欠陥があります。 | テストを書きにくく、UI 側のエラー処理もばらばらになります。 | 中 | 1 ワークフローあたり M。全体をまとめて直すなら L（40 時間以上） | B（触るアクションから順に、権限・検証の純粋関数を切り出してテストする）、C（エラー表示の統一）。 |
| R9 | `admin/actions.ts`（全体）、`admin/create-user.ts`（全体）、`admin/users/page.tsx`（`notFound()` のみ）、`utils/supabase/middleware.ts`、`subsidies/actions.ts:84-123`（`fetchMySubsidyItems`・`fetchPendingSubsidyItems`）、`lib/auth/permissions.ts:80-92`、`lib/validations.ts:223-228`、`components/ui/progress.tsx`、依存の `dotenv`、`lib/teams.ts:21`（未使用の `admin` 引数。呼び出し側は同じクライアントを 2 回渡している） | 参照元のないコードが残っています。`lib/ledger.ts:1-13` のコメントは「transaction_kind は将来追加」と書かれたままで、実態と合っていません。 | 読み手が混乱し、検索結果のノイズにもなります。 | 低 | S（2〜4 時間） | 直接の前提にはなりません。`components/transfer-form.tsx`（資金移動フォーム）も未マウントですが、未完成の機能か廃止かの判断が必要なので、削除対象から外しています。 |
| R10 | `manage-members-client.tsx`（603 行）、`subsidy-form.tsx`（567）、`transaction-form.tsx`（552）、`applications-table.tsx`（468）、`ledger-view.tsx`（431）ほか、300 行超は計 19 ファイル（`wc -l` で確認） | 大きなクライアントコンポーネントが、フォーム状態・アップロード・Realtime 購読・フィルタ・ソートを抱え込んでいます。 | 変更範囲を把握しにくくなります。 | 中 | 抽出 1 件あたり S〜M | アップロード部分（R1）は A で、繰り返し出てくる表示部品は C で切り出します。`ledger-view.tsx:166-232` のデータ取得と Realtime 購読を 1 つのフックに分けると、D の計測がしやすくなります。 |
| R11 | `lib/`（`cache.ts`・`system-config.ts` はサーバー専用、`use-sidebar-data.ts`・`image.ts` はクライアント専用、ほかは共有） | サーバー用・クライアント用・共有のモジュールが同じ階層に混在しています。`components/subsidy/*`（部員向け）と `subsidies/manage/_components/*`（管理者向け）は似た構造の並行実装です（UI 面は `ui-design.md` を参照）。 | 誤った環境で import する事故のもとになります。 | 低 | S〜M | C（共通部品化は個別の部品単位で行い、画面の統合はしない）。 |
| R12 | `lib/system-config.shared.ts:1-2`、`lib/system-config.ts:14-39`、`proxy.ts:4`、`package.json` | 会計ユーザー ID の参照元が 3 段階（DB → 環境変数 → ハードコードされた UUID）あり、`getAccountingUserId`（DB）と `getAccountingUserIdSync`（環境変数）が混在しています（例: `ledger/actions.ts:169` は Sync 版、`ledger/page.tsx:42` は DB 版）。`proxy.ts` の `PUBLIC_PATHS` に、存在しない `/api` が入っています。Radix は個別パッケージ（`@radix-ui/react-*`）と一括パッケージ（`radix-ui`）が併存しています。 | 環境によって「会計」表示がずれる可能性があります。設定も散らばっています。 | 低 | S | B（staging と本番の差を減らす）。 |
| R13 | `subsidies/manage/actions.ts:51,123,158,253,300`、`subsidies/actions.ts:266` と、それ以外の `console.error` | ログの形式（`JSON.stringify` か生オブジェクトか、`[関数名]` プレフィックスの有無）がばらばらです。 | 本番障害の調査がしにくくなります。 | 低 | S | R8 で触るアクションから順にそろえます。 |
| R14 | `proxy.ts` → 各 `page.tsx` → `getUserTeams` → `fetchLedgerTransactions`（`resolveAuthWithRoles`）、およびクライアントの `use-sidebar-data.ts:84-109` | 1 回のリクエストで `auth.getUser()` とロール取得が何度も走ります。 | 体感速度が落ちます（詳細は `performance.md`）。 | 中（認可を壊しやすい） | M | D。R4 で `getUserRoleAccess` を共通化したうえで、React `cache()` などリクエスト単位の再利用を検討します。 |

## 推奨する実施順序

1. **セキュリティ修正（S1〜S4、続けて S5）**: 最優先です。ほかの作業より先に行い、新しい層の導入や E2E の完成も待ちません。修正ごとに最小限の回帰テストを付けます。S5（private 化）は A の前に方針だけ決めておきます。
2. **B の土台と R3・R5・R4（判定関数のみ）**: CI はすでに lint、typecheck、unit、build、DB reset、DB lint を実行しています。ここにテストユーザー・ロールの seed と、最小限の E2E（ログイン、経費申請、承認、権限拒否）を足します。並行してローカルで生成型を作り直し、ドリフトチェックを必須にしたうえで R3（型付きクライアント）を入れます。R5 の仕様を決め、R4 のロール解析と操作ごとの判定関数を `lib/roles` に集約します。**B は構造的なリファクタより先に始め、その後も並走させます。**
3. **R1・R2 を A の直前・A の一部として行う**: まず既存の 1 経路（`transaction-form.tsx` 推奨）を共通フックと共通ピッカーに置き換えて動作を確認します。そのあと残り 4 経路を移行し、最後に D&D を追加します。S3 の「キーはサーバー側で生成し、所有者を確認し、新ファイルの関連付けが成功してから旧ファイルを消す」もこの契約に含めます。**A は R1・R2 と S3 だけに依存し、それ以外のリファクタリングを待つ必要はありません。**
4. **R6（＋R8 の監査部分）を並走させる**: ロール置換 → 支援金ステータスと関連取引 → 年度データ削除の順に、1 処理ずつ RPC（DB 関数）でトランザクション化します。Supabase Auth のメタデータ更新はトランザクションに含められないため、リトライや補償処理を明示します。A・C とは独立しています。
5. **C の中で R7・R8・R10・R11 を必要な分だけ行う**: A で作ったピッカーを再利用し、ステータス表示、年度セレクタ（R7）、エラー表示（R8 の戻り値型）を部品単位でそろえます。部員向けと管理者向けの支援金画面は統合しません。
6. **D は計測してから行う**: B で挙動を守ったうえで、台帳とダッシュボードを計測し、R14（認証・ロールの重複取得）など根拠のある箇所だけを直します。計測自体は B と並行して始めて構いません。
7. **R9・R12・R13 はいつでも行える小さな掃除**: 各作業ブランチのついでではなく、独立した小さな PR にすると差分のレビューが楽になります。

## 今はやらない方がよいもの

- **全体を覆うデータアクセス層（リポジトリ層）の新設**: 40 時間を超えるうえ、A〜D のどれの前提にもなりません。必要な操作だけを、機能追加やセキュリティ修正のタイミングで切り出します。
- **300 行超のファイルを機械的に分割すること**: 行数は「中を見る目安」にすぎません。状態の持ち主や繰り返し使う UI を境界にして、必要な分だけ抽出します。
- **部員向けと管理者向けの支援金画面を、フラグ付きの 1 コンポーネントに統合すること**: 項目・権限・状態遷移が違います。共有するのはピッカーや入力欄などの部品までにします。
- **全 Server Actions の戻り値型を一度に統一すること**: 呼び出し側の UI も同時に直す必要があります。触るアクションから順に移行します。`lib/types.ts` の `ActionResult` は成功側の型に欠陥があるため、そのまま採用しないでください。
- **資金移動機能（`transfer-form.tsx`、`createTransfer`）の削除**: 未マウントなだけで、RPC とマイグレーションは生きています。残すか廃止するかを先に決めてください。
- **`lib/server`・`lib/client`・`lib/shared` への一斉移動**: `server-only` ガードはすでに要所に入っています。移動は import 事故が起きたときに個別に行えば十分です。
- **領収書の受け入れ条件（MIME 種別・10MB）を、ストレージアクセス方針（S5）を決める前に固めること**: 受け入れ条件はマイグレーション（`20261008120000_ensure_receipts_bucket.sql:14-24`）、サーバー（`app/actions.ts:99-121`）、UI 文言（`receipt-upload.tsx:62`）の 3 か所にあります。R1 では 1 つの定数に集約しますが、private 化の方針と合わせて決めてください。
