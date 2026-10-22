# ローカル開発環境のセットアップ

## 前提条件

- Node.js 22
- Docker Desktop。WSL で開発する場合は Docker Desktop の **Settings > Resources > WSL Integration** で使用するディストリビューションを有効にします。
- リポジトリを WSL ファイルシステム上に配置します。

## 起動

```bash
npm ci
npm run db:start
npm run db:status
```

`npm run db:status` の表示値を `.env.local` に設定します。値はローカル起動ごとに確認し、実際のキーをコミットしません。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key-from-supabase-status>
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key-from-supabase-status>
```

`NEXT_PUBLIC_ACCOUNTING_SYSTEM_USER_ID` と `ACCOUNTING_SYSTEM_USER_ID` は通常不要です。必要な場合だけ、ローカルの会計ユーザー UUID を設定します。

次の URL もローカル専用です。

- Studio: <http://127.0.0.1:54323>
- Mailpit: <http://127.0.0.1:54324>
- API: <http://127.0.0.1:54321>

続けて `npm run dev` を実行します。

## seed で作成されるデータ

`supabase/seed.sql` はローカル用のダミーデータだけを投入します（`npm run db:reset` 時に適用。`supabase db push` では適用されません）。

- 年度 2026（2026-04-01〜2027-03-31、`is_current = true`）
- 会計グループ `Local Demo Team`
- グローバルロール `Local Admin`（`type = 'admin'`）と `会計`（`type = 'accounting'`）
- 会計システムユーザー（UUID `9701edd2-bd9d-4d57-9dd6-7235686103bf`、名前 `会計`、メール `accounting-system@example.invalid`）。パスワードを持たないためログインできません。`system_config.accounting_user_id` とアプリのフォールバック値に一致させるためのものです。

`金庫`・`銀行口座`・`部全体` はマイグレーション側で作成されます。

## 最初の管理者

ログイン用の管理者ユーザーは seed に含めていません。Studio（<http://127.0.0.1:54323>）の **Authentication > Users > Add user** で任意のメールアドレスとパスワードを指定してユーザーを作成し（**Auto Confirm User** を有効化）、表示された UUID を使って SQL Editor で次を実行します。

```sql
-- <auth-user-uuid> を作成した Auth ユーザーの UUID に置き換える。
INSERT INTO public.profiles (id, name)
VALUES ('<auth-user-uuid>', 'Local Admin')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.user_roles (user_id, role_id)
SELECT '<auth-user-uuid>', id
FROM public.roles
WHERE type = 'admin' AND accounting_group_id IS NULL
ON CONFLICT (user_id, role_id) DO NOTHING;
```

`profiles` に `role` 列はありません。管理者権限は `roles.type = 'admin'` のロールを `user_roles` で紐付けることで付与されます（`is_admin()` が参照）。2 人目以降の部員は、管理者でログインしてアプリの部員追加機能から作成できます。

ローカルのメール（パスワードリセット等）は Mailpit（<http://127.0.0.1:54324>）で確認できます。

## 日常的な操作

```bash
# マイグレーションとダミーデータを作り直す
npm run db:reset

# ローカルスキーマから型を生成する
npm run db:types

# Edge Function をローカルで実行する
npm run functions:serve

# 新しいマイグレーションを作成する
npx supabase migration new <name>

# 停止する
npm run db:stop
```

`db:reset` の seed はローカル/ステージング用のダミーデータです。本番データや実在ユーザーを追加しません。

## トラブルシューティング

- `supabase link` を実行したことがある環境では、`supabase/.temp/*-version` にリモートのサービスバージョンが記録され、`npm run db:start` がそのイメージを取得しようとします。存在しないタグ（例: `storage-version` の `fix-optimized-search-function`）で失敗する場合は、該当する `supabase/.temp/*-version` ファイルを削除してから再実行します（`supabase/.temp/` は Git 管理外です）。
- `npm run db:types` 実行時に「Generated TypeScript is unformatted」と表示されますが、型としては有効です。差分レビューを読みやすくしたい場合は任意のフォーマッタで整形します。
