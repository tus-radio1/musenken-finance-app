# テストと CI/CD の現状（2026-10-22 時点、`develop` ブランチ）

結論: ユニットテスト（Vitest、161 件）・lint・型検査・ビルド・ローカル Supabase のマイグレーション検証は CI で動いていて、すべて成功しています。一方、E2E テスト、Server Action のテスト、RLS（Row Level Security）のテストは一つもありません。テストが届いているのは `lib/` の純粋関数だけで、`app/**` のカバレッジは 0% です。CI の `db` ジョブでローカル Supabase を起動する仕組みはすでにあるので、これを土台にすれば Playwright による E2E を CI に追加できます。

---

## 現状のテスト構成

### フレームワークと設定

| 項目 | 現状 | 根拠 |
| --- | --- | --- |
| テストランナー | Vitest `^4.1.8`（実行時は 4.1.8） | `package.json` の `devDependencies`、`npx vitest --version` |
| 実行コマンド | `npm test`（= `vitest run`） | `package.json` の `scripts.test` |
| 対象ファイル | `tests/**/*.test.ts` のみ。環境は既定の `node`（jsdom なし）。`@` を repo ルートへの alias に設定 | `vitest.config.mts` |
| カバレッジ | `@vitest/coverage-v8` は導入済み。ただし script、閾値、CI での計測はどれも無い | `package.json`、`.github/workflows/ci.yml` |
| Lint | ESLint 9 + `eslint-config-next`（core-web-vitals / typescript） | `eslint.config.mjs`、`npm run lint` |
| 型検査 | `tsc --noEmit`（`strict: true`）。`supabase/functions/**` は対象外 | `tsconfig.json`、`npm run typecheck` |
| フォーマッタ | 無し（Prettier などの設定も、CI でのフォーマット検査も無い） | ルートに設定ファイルが無い |
| E2E | 無し（Playwright・Cypress とも未導入） | `package.json` |
| コンポーネントテスト | 無し（`@testing-library/*` も jsdom も未導入） | `package.json` |
| DB テスト | 無し（`supabase/tests/` が無く、pgTAP も未使用） | `ls supabase` → `config.toml functions migrations seed.sql` |
| Edge Function のテスト | 無し（`supabase/functions/update-fiscal-year/index.ts` だけ） | `ls supabase/functions/update-fiscal-year` |
| E2E 用セレクタ | `data-testid` は 0 件 | `grep -rn "data-testid" app components \| wc -l` → `0` |

### テストファイルの対象（すべて `tests/lib/` 配下の純粋関数）

| ファイル | 対象 | 主な検証内容 |
| --- | --- | --- |
| `tests/lib/account.test.ts` | `lib/account.ts` | 学籍番号から入学年度・初期パスワード・メールを導出する処理、`createUserSchema` |
| `tests/lib/club-ledger.test.ts` | `lib/ledger.ts`、`lib/auth/permissions.ts` | 部全体出納帳の集計（振替を除外、pending/rejected を除外、財布ごとの残高）と、`canViewClubLedger` などの権限判定関数 |
| `tests/lib/date.test.ts` | `lib/date.ts` | JST での日付変換、年度境界（3/31、年またぎ） |
| `tests/lib/format.test.ts` | `lib/format.ts` | `formatCurrency` |
| `tests/lib/ledger.test.ts` | `lib/ledger.ts` | 収入・支出の合計、予算残、補助金明細から行を合成する処理 |
| `tests/lib/transfer-validation.test.ts` | `lib/validations.ts`、`lib/schema.ts` | 振替の zod スキーマ |
| `tests/lib/validations.test.ts` | `lib/validations.ts` | UUID、学籍番号、承認ステータス、パスワード強度、予算、部員追加の各スキーマ |

### テストが無い領域

- Server Action（`app/actions.ts`、`app/login/actions.ts`、`app/(authenticated)/*/actions.ts`）は、認可チェック、DB 書き込み、`revalidatePath` を含めてテストがありません。
- 領収書アップロード（`app/actions.ts` の `uploadReceiptAction`。service-role クライアントで Storage の `receipts` バケットに upsert する処理）。
- 認証のリダイレクト（`proxy.ts`。未ログインなら `/login` へ、ログイン済みで `/login` に来たら `/` へ）。
- `lib/rate-limit.ts`（ログインは IP ごとに 15 分で 5 回まで）、`lib/auth/context.ts`、`lib/roles/access.ts`、`lib/image.ts`、`lib/teams.ts`、`lib/profiles.ts`。
- マイグレーション内の RLS ポリシー 35 件（`grep -c "CREATE POLICY\|create policy" supabase/migrations/*.sql` の合計）。

---

## 実行結果

ローカル（WSL、Node `v24.21.0`）で実行しました。CI は Node 22 で動くため、バージョンが一致していない点に注意してください。

| コマンド | 結果 |
| --- | --- |
| `npm test` | **Test Files 7 passed (7) / Tests 161 passed (161)**、Duration 588ms |
| `npm run lint` | exit 0（警告・エラーの出力なし） |
| `npm run typecheck` | exit 0（出力なし） |
| `npx vitest run --coverage --coverage.include='lib/**' --coverage.exclude='lib/database.types.ts'`（レポートは scratchpad に出力し、リポジトリには残していない） | Statements **40.41%** (175/433)、Branches 34.69% (102/294)、Functions 43.75% (42/96)、Lines 40.58% (166/409) |
| 同じコマンドで `app/**`、`lib/**`、`utils/**` を対象にした場合 | All files: Statements **7.01%**。`app/**` 配下の `actions.ts`、`page.tsx`、`create-user.ts` などはすべて 0% |
| `npm run build` | **ローカルでは未実行**。時間がかかるうえ、CI の直近の実行で成功を確認できたため（下記） |
| `supabase db reset --local` / `supabase db lint` | **ローカルでは未実行**。Docker でローカル Supabase を起動する必要があるため。CI の `db` ジョブで成功を確認 |
| リモート Supabase / 本番への操作 | 指示に従い実行していません |

GitHub Actions の直近の実行は `gh run list --limit 12` と `gh run view 39732477152` で確認しました。

| Run | ワークフロー / 契機 | 結果 |
| --- | --- | --- |
| 39732477152 | CI / `develop` への push（PR #38 のマージ） | success（2m29s）。`app` ジョブの lint / typecheck / test / build、`db` ジョブの Start Supabase / reset / lint / types drift はすべて success |
| 39732477088 | Deploy Supabase / `develop` への push | success（24s）。staging にデプロイ |
| 39731745575、39728494551 | CI / `feature/dev-env-ci` の PR | success |

`Check generated types drift` ステップには `continue-on-error: true` が付いているため、ステップが success でも、実際に差分が無かったとは限りません。`gh run view --log` はログを取得できず（0 行）、差分の有無は**未確認**です。`docs/manual/dev-environment/ci-cd.md` には、差分があることが既知だと書かれています。

---

## CI ワークフローの現状

### `.github/workflows/ci.yml`（PR #38 / commit `834b91d` で追加）

- 実行契機: `develop` / `main` 向けの `pull_request` と、両ブランチへの `push`。同じ ref の古い実行は `concurrency` で取り消します。
- `app` ジョブ（ubuntu、Node 22、npm キャッシュ）: `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`。ビルドにはダミーの Supabase 環境変数（`http://127.0.0.1:54321` と `dummy-*-key`）を渡しています。
- `db` ジョブ: `supabase/setup-cli@v1`（2.120.0）を使い、`supabase start -x studio,imgproxy,mailpit,realtime,edge-runtime,logflare,vector,supavisor` で起動します。auth、storage、PostgREST、postgres-meta は残します。続けて `supabase db reset --local`（全マイグレーションと `seed.sql`）、`supabase db lint --fail-on error` を実行し、最後に型のドリフトを検査します（`continue-on-error: true`）。
- `app` と `db` は独立したジョブです。アプリを実際の DB につないで動かす検証はありません。

### `.github/workflows/deploy-db.yml`

- 実行契機: `develop` / `main` への push のうち `supabase/migrations/**`、`supabase/functions/**`、`supabase/config.toml` が変わったとき、または `workflow_dispatch`。
- `develop` は `staging`、`main` は `production` の Environment に対応します。`supabase link` → `db push --dry-run` → `db push --yes` → `functions deploy update-fiscal-year` の順に実行します。
- デプロイ後のスモークテスト（staging に対する疎通確認など）はありません。
- **`ci.yml` の成功を待たずに起動します**（`workflow_run` や `needs` が無い）。マイグレーションを含むコミットを push すると、CI の結果に関係なく staging へ適用されます。PR 段階では `db` が必須チェックなので、直接 push しない限りは実害がありません。

### ブランチ保護と Environment（`gh api` で確認）

| 項目 | 現状 | ドキュメントの想定（`docs/manual/dev-environment/staging-setup.md`） |
| --- | --- | --- |
| Ruleset `protect-develop-main`（active、対象は `develop` と `main`） | ブランチ削除の禁止、non-fast-forward の禁止、必須 status check `app` と `db`（`strict_required_status_checks_policy: false`） | 一致 |
| PR レビュー必須 | **無し**（Ruleset に `pull_request` ルールが無い。`main` の classic protection も `required_approving_review_count: 0`、checks は `null`） | 記載なし |
| `develop` の classic branch protection | 無し（404。Ruleset で代替） | — |
| Environment `Production` | `required_reviewers` あり。`deployment_branch_policy: null` | 「`main` のみ」に制限するとあるが、**未設定** |
| Environment `staging` | 保護ルールなし。`deployment_branch_policy: null` | 「`develop` のみ」に制限するとあるが、**未設定** |
| `Preview`、`Preview – musenken-finance-app`、`Production – musenken-finance-app` | Vercel の Git 連携が作成した Environment（ルールなし） | — |

Environment にブランチ制限が無いため、`workflow_dispatch` を任意のブランチで実行すると、staging のシークレットを使ってそのブランチの内容をデプロイできてしまいます。production は required reviewers の承認が必要なので、承認者が止めることはできます。

### Vercel

- リポジトリに `vercel.json` はありません。Vercel の Git 連携だけでデプロイしています（`README.md` の CI/CD 節）。
- Preview は staging Supabase、Production は production Supabase に接続します（`staging-setup.md`）。PR ごとの Preview URL はありますが、そこに対して自動テストを流す仕組みはありません。

### ローカル Supabase

- `supabase/config.toml`: Postgres 17、`[auth.email] enable_confirmations = false`、`site_url = "http://127.0.0.1:3000"`、seed は `./seed.sql`。
- `supabase/seed.sql`: 年度 2026、`Local Demo Team`、`Local Admin`（admin）と `会計`（accounting）のロール、ログインできない会計システムユーザー（`9701edd2-…`）を投入します。**ログインできるユーザーは seed に含まれていません**（最初の管理者は Studio で手動作成）。
- マイグレーションは 27 件で、最新は `20261008120000_ensure_receipts_bucket.sql`（`receipts` バケットを作成）。
- CI の `db` ジョブで起動と reset が成功しているので、同じ構成で E2E 用の DB と Auth と Storage を CI 上に用意できます。

---

## 不足しているもの

優先度の高い順に並べます。

1. **E2E テストが無い。** ログイン、経費申請（領収書アップロード）、承認、出納帳への反映といった主要フローは、どれも自動で検証されていません。
2. **Server Action と認可のテストが無い。** `app/**` のカバレッジは 0% です。権限判定関数（`lib/auth/permissions.ts`）の単体テストはありますが、Server Action がそれを正しく呼んでいるかは検証されていません。
3. **RLS ポリシー（35 件）のテストが無い。** 会計データを扱うアプリなので、他人の申請が見えない、一般部員が承認できない、といった保証は DB 層で確認するべきです。
4. **E2E に使えるテストユーザーとデータが無い。** seed にはログインできるユーザーがいません。ログインは学籍番号から `${studentNumber}@ed.tus.ac.jp` を導出する方式（`lib/account.ts` の `deriveEmail`）なので、その形式のメールで Auth ユーザーを作る必要があります。
5. **ログインのレート制限が E2E の妨げになる。** `app/login/actions.ts` は IP ごとに 15 分で 5 回までに制限しています（インメモリ）。CI では IP がすべて `unknown` などの同じ値になるため、テストごとに UI からログインすると 6 回目以降が失敗します。
6. **カバレッジを CI で計測していない。** 閾値も無いので、テストが減っても検知できません。
7. **型ドリフト検査が `continue-on-error`。** `lib/database.types.ts` がマイグレーションとずれていても CI は通ります。
8. **ガバナンスの穴。** PR レビュー必須になっていない（`main` も同様）、Environment のブランチ制限が未設定、`deploy-db.yml` が CI 成功を待たない。
9. **Edge Function（`update-fiscal-year`）の型検査とテストが無い。** `tsconfig.json` の対象外で、`deno check` も実行していません。
10. **補助的な不足。** フォーマッタの検査が無い。Node バージョンを固定していない（`.nvmrc` も `engines` も無く、ローカル v24 と CI v22 が食い違う）。`dependabot.yml` や `npm audit` が無い。`data-testid` が無い。

---

## 推奨する CI・E2E 整備計画（段階別、優先度付き）

### 段階 0（P0、半日程度）: 既存 CI の小さな補強

- `package.json` に `test:coverage`（`vitest run --coverage`）を追加し、CI の `app` ジョブで実行します。最初は閾値を現状値（`lib/**` で lines 40% 前後）にして、下がらないことだけを保証します。
- `.nvmrc`（`22`）を追加し、`actions/setup-node` の `node-version-file` で参照します。
- GitHub の設定: Environment `staging` を `develop` のみ、`production` を `main` のみにブランチ制限します（ドキュメントの想定どおり）。`main` の Ruleset には PR 必須（承認 1 件以上）を追加します。
- `lib/database.types.ts` を `npm run db:types` で再生成して型検査が通ることを確認し、ドリフト検査の `continue-on-error` を外します（`ci-cd.md` に書かれている手順）。

### 段階 1（P0、2〜4 日）: Playwright E2E をローカル Supabase 上で動かす

**ツール**: Playwright（`@playwright/test`）、Chromium のみ。Next.js 16 の App Router と Server Actions を、実ブラウザと実 Supabase の組み合わせで検証できます。モバイル用の UI（`components/mobile-bottom-nav.tsx` など）もあるので、後からモバイルビューポートの project を追加できます。

**CI での DB と Auth の用意**（新しいジョブ `e2e`）:

1. `supabase/setup-cli@v1`（2.120.0）で `supabase start` を実行します。除外するサービスは `db` ジョブと同じでよく、auth、storage、PostgREST、kong は残します。続けて `supabase db reset --local` を実行します。
2. `supabase status -o env` からローカルの URL、anon key、service-role key を取り出し、`$GITHUB_ENV` に書き込みます。ローカル用の値なので secrets は要りません。
3. **`NEXT_PUBLIC_*` はビルド時に埋め込まれる**ため、`app` ジョブのダミー値を流用せず、実際のローカルキーで `npm run build` してから `npm run start` します（Playwright の `webServer` から起動）。
4. テストユーザーは Playwright の global setup で作ります。service-role クライアントの `auth.admin.createUser({ email: "<7桁>@ed.tus.ac.jp", password, email_confirm: true })` を呼び、`profiles` と `user_roles` に行を追加します。`seed.sql` は staging にも流すので、ログインできるユーザーを `seed.sql` に入れてはいけません。
   - 最低限必要なロール: 一般部員 A（申請者）、一般部員 B（他人のデータが見えないことの確認用）、会計（`会計` ロール）、管理者（admin ロール）。
   - `components/approval-actions.tsx` は自分の申請を承認できない仕様（`isMyTransaction`）なので、申請者と承認者は必ず別のユーザーにします。
5. **レート制限への対策**: setup project で各ロールが UI から 1 回ずつログインし、`storageState` を保存して以降のテストで使い回します。ログイン失敗を確認するテストは 1 つの spec にまとめ、5 回の上限を超えないようにします。

**最初に書くシナリオ**（実在するルートと Server Action から選定）:

| 優先度 | シナリオ | 対象 |
| --- | --- | --- |
| P0 | 未ログインで `/` にアクセスすると `/login` へリダイレクトされる。正しい学籍番号とパスワードならホームへ、誤りならエラーメッセージ | `proxy.ts`、`app/login/page.tsx`、`app/login/actions.ts` |
| P0 | 一般部員が `/applications` で経費申請（領収書画像つき）を送信すると、一覧に pending で表示される | `components/transaction-form.tsx`、`uploadReceiptAction`、`createTransaction`（`app/actions.ts`） |
| P0 | 会計または管理者が申請を承認・却下すると（却下は理由つき）、ステータスが変わる。承認した取引は `/ledger` に反映される | `components/approval-actions.tsx`、`updateTransactionStatus` |
| P0 | 権限の境界: 一般部員には承認ボタンが表示されない。一般部員は部員管理（`/members/manage`）や部全体出納帳の作成・財布管理（`canCreateClubTransaction` / `canManageFinancialAccounts` が false の操作）ができない。部員 B から部員 A の申請がどこまで見えるかは、期待する仕様を先に確定してから検証する（この監査では未確認） | `lib/auth/permissions.ts`、RLS |
| P1 | 補助金の申請（`/subsidies`、`createSubsidyItem`）と管理側でのステータス更新（`/subsidies/manage`、`updateSubsidyStatus`） | `app/(authenticated)/subsidies/**` |
| P1 | 財布間の振替（`/ledger`、`createTransfer`）と予算の登録（`/budget`、`upsertBudget`） | `app/(authenticated)/ledger/actions.ts`、`app/(authenticated)/budget/actions.ts` |
| P2 | 部員の追加・退部（`/members/manage`、`addMember` / `retireMember`）、パスワード変更（`/settings`） | `app/(authenticated)/members/manage/actions.ts`、`app/(authenticated)/settings/actions.ts` |

`/admin/users` は現在常に `notFound()` を返すので（`app/(authenticated)/admin/users/page.tsx`）、対象から外します。

**セレクタ**: `data-testid` は 0 件なので、まずは `getByRole` と `getByLabel` で書きます。安定しない箇所にだけ `data-testid` を追加します。

**CI の設定**: 実行契機は `ci.yml` と同じにします。CI では `retries: 1`、`trace: "on-first-retry"` とし、失敗時は `playwright-report/` と `test-results/` を artifact として保存します（どちらも `.gitignore` に追加）。安定したら Ruleset の必須チェックに `e2e` を加えます。最初の 1〜2 週間は必須にせず、flaky なテストが無いか様子を見ます。

### 段階 2（P1、2〜3 日）: DB 層と Server Action の統合テスト

- **RLS テスト**: `supabase/tests/*.sql` に pgTAP のテストを置き、`db` ジョブに `supabase test db` を追加します。`transactions`、`subsidy_items`、`profiles`、`user_roles`、`storage.objects`（`receipts`）について、ロールごとに SELECT / INSERT / UPDATE ができるかどうかを確認します。E2E より速く、穴を網羅的に確認できます。
- **Server Action の統合テスト**: Vitest の別設定（例: `vitest.integration.config.mts`、`tests/integration/**`）でローカル Supabase に接続し、`createTransaction`、`updateTransactionStatus`、`createTransfer` の認可分岐と DB の結果を検証します。`next/headers` と `next/cache` はモックします。`e2e` ジョブと Supabase の起動を共有するか、別ジョブにするかは実行時間を見て決めます。
- `lib/rate-limit.ts` のように外部依存の無いモジュールは、通常のユニットテストに追加します。

### 段階 3（P2、随時）: デプロイ後の検証と保守

- `deploy-db.yml` の staging デプロイ後に、読み取りだけのスモークテスト（staging の Vercel Preview に対して `/login` が表示されるか）を追加します。production には書き込みを伴う E2E を流しません。
- `deploy-db.yml` を `workflow_run`（CI が成功したとき）で起動するようにするか、`ci.yml` の中で `needs: [app, db]` を付けたデプロイジョブにまとめます。
- Edge Function: `deno check supabase/functions/update-fiscal-year/index.ts` を CI に追加し、必要なら `deno test` も追加します。
- `.github/dependabot.yml`（npm と GitHub Actions）を追加し、カバレッジの閾値を少しずつ引き上げます。

### ゲーティングのルール（目標）

| ブランチ | 必須チェック | その他 |
| --- | --- | --- |
| `develop` | `app`、`db`、`e2e`（安定したら） | PR 必須（承認なしでも可） |
| `main` | `app`、`db`、`e2e` | PR 必須で承認 1 件以上、`strict_required_status_checks_policy: true`（ブランチが最新であることを要求）、Environment `production` は `main` のみ |

---

## 関連ドキュメント

- `docs/manual/dev-environment/ci-cd.md`: ワークフローとマイグレーションの流れ
- `docs/manual/dev-environment/local-setup.md`: ローカル Supabase と最初の管理者の作成
- `docs/manual/dev-environment/staging-setup.md`: staging、GitHub Environments、Vercel の設定
