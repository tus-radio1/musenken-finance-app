# Staging の初期設定

## Supabase プロジェクト

1. production と同じ Supabase Organization に staging プロジェクトを作成します。
2. Region は **Southeast Asia (Singapore)** を選択します。
3. マイグレーションは、`develop` への merge 時にデプロイワークフローが適用します。
4. `receipts` バケットはマイグレーション `20261008120000_ensure_receipts_bucket.sql` で作成されるため、Dashboard での手動作成は不要です。

## staging の初期データ（初回のみ・必須）

デプロイワークフローの `supabase db push` は `seed.sql` を適用しません。seed には、アプリが `transactions.created_by` / `approved_by` に書き込む会計システムユーザー（`9701edd2-bd9d-4d57-9dd6-7235686103bf`、ログイン不可）が含まれます。これが無いと staging で取引の登録が外部キー違反で失敗するため、マイグレーション適用後に一度だけ seed を流します。

```bash
npx supabase link --project-ref gygyuqivcvwgvyuekqvy      # staging
cat supabase/.temp/project-ref                             # gygyuqivcvwgvyuekqvy であることを必ず確認
npx supabase db push --include-seed
npx supabase link --project-ref csphhemmhzayyhlasirc      # production の link に戻す
```

**production（`csphhemmhzayyhlasirc`）に link した状態では絶対に実行しません。** seed は冪等なので、staging で再実行しても重複は作られません。

続けて staging の Dashboard（Authentication > Users）で最初の管理者ユーザーを作成し、`local-setup.md` と同じ手順で admin ロールを付与します。

## GitHub Environments

GitHub に `staging` と `production` Environment を作成し、それぞれに次の secrets を設定します。

- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_ACCESS_TOKEN`（Supabase Dashboard の Account Tokens で作成する personal access token）

production には required reviewers を設定し、deployment branch restriction を `main` のみにします。staging の deployment branch restriction は `develop` のみにします。

`develop` と `main` は branch protection を有効にし、必須 status check として `app` と `db` を指定します。

## Vercel と Auth

Vercel では次を設定します。

| Vercel 環境 | 接続先 |
| --- | --- |
| Production | production Supabase |
| Preview | staging Supabase |

各環境へ `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` を設定します。値は GitHub の secrets と共有・コミットせず、Vercel 側で個別に管理します。

- 同じ変数名で Production 用と Preview 用を別々に作成します（All Environments にしません）。
- Development にはチェックを入れません。`vercel env pull` で `.env.local` が本番の値に上書きされるのを防ぐためです。
- `SUPABASE_SERVICE_ROLE_KEY` は RLS を無視できるため、必ず Sensitive にします。
- `NEXT_PUBLIC_ACCOUNTING_SYSTEM_USER_ID` / `ACCOUNTING_SYSTEM_USER_ID` は Preview に設定しません（staging の会計ユーザーは seed の `9701edd2-…` を使います）。
- 環境変数の変更は既存のデプロイに反映されないため、変更後に Redeploy します。

staging Supabase の Auth 設定で Vercel preview 用の Site URL と Redirect URLs を登録します。チーム名に合わせて `https://*-<team>.vercel.app/**` のようなワイルドカードを使用します。

## 年度更新 cron の Vault secrets

staging の SQL Editor で（production は既に登録済みのはずなので存在を確認するだけにします）、年度更新 Edge Function 用の Vault secrets を登録します。名前はマイグレーションの `project_url` と `service_role_key` に一致させます。

```sql
SELECT vault.create_secret('<project-url>', 'project_url');
SELECT vault.create_secret('<service-role-key>', 'service_role_key');
```

値は secrets manager から取得し、SQL 履歴やリポジトリに残さないよう注意します。

## Free plan の注意

Free plan では active project は最大 2 件です。staging はおよそ 7 日間アクセスがないと自動停止するため、Dashboard から再開します。production の個人情報を staging へコピーしません。
