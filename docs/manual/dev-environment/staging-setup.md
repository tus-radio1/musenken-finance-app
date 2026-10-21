# Staging の初期設定

## Supabase プロジェクト

1. production と同じ Supabase Organization に staging プロジェクトを作成します。
2. Region は **Southeast Asia (Singapore)** を選択します。
3. 初回はローカルから `supabase link` と `supabase db push` を実行するか、`develop` への最初の対象変更でデプロイワークフローに任せます。
4. staging にだけ初期ダミーデータが必要な場合は、staging に link した状態で手動で `supabase db push --include-seed` を実行できます（seed にはログイン不可の会計システムユーザーが含まれます）。本番では絶対に実行しません。
5. `receipts` バケットはマイグレーション `20261008120000_ensure_receipts_bucket.sql` で作成されるため、Dashboard での手動作成は不要です。

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
