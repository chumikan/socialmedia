# OpenTwitter — Next.js + Go + PostgreSQL

既存のNext.js画面を利用するSNSです。認証・投稿・フォロー・時系列フィード・返信・いいね・リポスト・ブックマーク・プロフィール・検索・通知・DM・BANをGo APIで処理し、画像/動画はS3互換ストレージへ保存します。

- `frontend/`: Next.js Pages Router / TypeScript / Tailwind
- `backend/`: 単一Go API、PostgreSQLマイグレーション、テスト、管理・インポートCLI
- `docs/`: [移行計画](docs/migration-plan.md)、[API契約](docs/api-contract.md)、[オフライン移行手順](docs/firebase-import.md)
- `docs/legacy/firebase/`: 旧Functions・ルールの参照用アーカイブ。実行・ビルド対象外です。

## ローカル起動

Docker Desktop / Docker Composeを起動してください。リポジトリ直下で:

```sh
cp .env.example .env
# .env の POSTGRES_PASSWORD / S3_SECRET_KEY を各々ランダムな値に変更
# 例: openssl rand -hex 24

docker compose up --build -d
```

http://localhost:3000 を開き、メールと12文字以上のパスワードで登録します。メール配信サービスはローカル登録に不要です。他のアカウントをフォローするとホームに投稿が表示されます。

PostgreSQLはlocalhost:5433、APIはlocalhost:8081、S3はlocalhost:9000。既存サービスとの競合時はPOSTGRES_PORT / API_PORTを.envで変更できます。S3はSeaweedFSの単一ノードで、SNSのアプリケーションデータはPostgreSQLに保存します。S3_BUCKET=socialmediaを起動時に作成します。全ポートはループバックに限定しています。

```sh
docker compose logs -f backend frontend
docker compose down  # DBとメディアのボリュームは保持
```

マイグレーションはAPI起動時にバージョン順で実行され、トランザクションとアドバイザリロックで保護されます。`.env`やエクスポートデータはコミットしないでください。既存のルート`.env.development` / `.env.production`は新サービスでは使用しません。

## 開発・検証

Go 1.25以上、Node.js 22、npm 10を使用します。npmを単一のパッケージマネージャーとしています。

```sh
docker compose up -d postgres s3 backend
cd frontend
npm ci
npm run dev
# 別端末
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm test
```

Next.jsは`/api/v1/*`を`API_INTERNAL_URL`（ホスト開発時はhttp://localhost:8081）へプロキシします。ブラウザは同一オリジンCookieを利用します。Docker版frontendと開発サーバーを同時に3000番で起動しないでください。

```sh
cd backend
go test ./...                     # 単体テスト。DB未設定なら統合テストはskip
TEST_DATABASE_URL='postgres://...' go test -race ./... -count=1
# 統合テストは一時スキーマを作成・削除します。専用ローカルDBを指定。
go run ./cmd/contracts > ../frontend/src/lib/api/contracts.ts
```

Playwrightは起動済みのアプリに接続し、テスト専用アカウント・投稿を作成します。E2E_BASE_URLで接続先を変更できます。本番には実行しないでください。

## 管理者・任意設定

登録したアカウントを管理者にするには、DATABASE_URLを設定した管理端末で:

```sh
cd backend
go run ./cmd/user -email your-local-account@example.com -admin
```

ユーザー名で管理者権限は付与されません。管理者がプロフィールを開くとBAN/解除ボタンが表示され、理由と実行者が記録されます。BANで既存セッションも失効します。

GoogleログインはGOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRETを設定し、Google側に`http://localhost:3000/api/v1/auth/google/callback`を登録してください。SMTP_ADDR / SMTP_FROM / SMTP_TOを設定すると投稿作成イベントを信頼済みSMTPリレーへ送信します。未設定のイベントはoutboxに保持されます。Apple/電話ログインは旧実装でも未実装です。

本番利用ではHTTPS、COOKIE_SECURE=true、正しいAPP_ORIGIN、専用S3認証情報、DB/S3バックアップ、入口のレート制限を設定してください。Composeはローカル検証用です。Google/SMTP実サービスとの疎通は個別設定後に検証してください。移行状況と制限事項は[移行計画](docs/migration-plan.md)を参照。
