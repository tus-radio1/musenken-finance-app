# CI/CD

## ワークフロー

| ファイル | 実行契機 | 内容 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | `develop` / `main` 向け PR と push | `app` ジョブで lint、型検査、テスト、ビルドを実行し、`db` ジョブでローカル Supabase の reset、seed、lint を検証します。 |
| `.github/workflows/deploy-db.yml` | 対象ブランチへの push で Supabase 関連ファイルが変化した場合、または手動実行 | マイグレーションと `update-fiscal-year` Edge Function をデプロイします。 |

| ブランチ | Supabase 環境 |
| --- | --- |
| `develop` | staging |
| `main` | production |

## マイグレーションの流れ

1. `npx supabase migration new <name>` で新規マイグレーションを作成します。
2. `npm run db:reset` でローカルのマイグレーションと seed を検証します。
3. PR を作成し、CI の `app` と `db` を通します。
4. `develop` へマージすると staging に自動デプロイされます。
5. `develop` から `main` へ PR を作成し、レビュー後にマージします。
6. `main` へのマージ後、`production` Environment の required reviewers が承認すると production にデプロイされます。

Vercel のフロントエンド配信と Supabase の DB 配信はアトミックではありません。マイグレーションは expand/contract を守り、古いフロントエンドでも安全に動作する後方互換な変更にします。適用済みマイグレーションは編集せず、必ず新しいファイルを追加します。

`lib/database.types.ts` は現在リモートプロジェクトから生成された型で、ローカルのマイグレーションから生成した型と次の差分があります（2026-10-08 時点で確認）。

- `transactions.transaction_kind`: コミット済みの型では enum `transaction_kind`、マイグレーションでは `TEXT` + CHECK 制約
- `transactions.financial_account_id` の外部キー（`transactions_financial_account_id_fkey`）がコミット済みの型に無い
- RPC 引数の nullability、`ComputedFields`、`__InternalSupabase` など CLI バージョン由来の差分

そのため CI の型ドリフト検査は `continue-on-error: true`（情報表示のみ）にしています。本番スキーマとマイグレーションの間にずれが無いか確認したうえで `npm run db:types` で再生成し、型検査が通ることを確認してから CI の許容設定を外します。
