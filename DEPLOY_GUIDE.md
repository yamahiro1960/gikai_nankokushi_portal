# 南国市議会DXポータル テスト公開・本番移行手順

## 1. テスト版の公開構成
- 配信先: GitHub Pages
- 認証・権限: Supabase Auth / Supabase Database
- 利用者ログイン: Google またはメールアドレス
- 設定保存: Supabase の meeting_settings テーブル

## 2. GitHub Pages での公開手順
1. GitHub で新しいリポジトリを作成する
2. Portal site フォルダ配下のファイルをリポジトリ直下へ配置する
3. main ブランチへ push する
4. GitHub の Settings > Pages を開く
5. Source を Deploy from a branch にする
6. Branch を main、Folder を /(root) にする
7. 公開 URL を控える

## 3. Supabase の初期設定
1. Supabase でテスト用プロジェクトを作成する
2. SQL Editor で supabase_setup.sql を実行する
3. Project URL と anon key を auth-config.js に設定する
4. Authentication > URL Configuration に GitHub Pages の URL を設定する
5. Redirect URLs に login.html の URL を追加する

例:
- Site URL: https://<github-user>.github.io/<repository-name>/
- Redirect URL: https://<github-user>.github.io/<repository-name>/login.html

## 4. Google ログインの設定
1. Google Cloud で OAuth 同意画面を作成する
2. OAuth Client ID を Web application で作成する
3. Authorized redirect URI に Supabase の案内する callback URL を登録する
4. Supabase Authentication > Providers > Google を有効化する
5. Client ID と Client Secret を Supabase に設定する
6. login.html の Google ログインを使って動作確認する

## 5. 権限付与の流れ
1. 利用者は login.html から Google またはメールでログインする
2. 初回ログイン時に profiles テーブルへ viewer 権限で登録される
3. 管理者は user-management.html から editor / admin を付与する

## 6. 本番移行手順
1. 本番用 Supabase プロジェクトを別に作成する
2. supabase_setup.sql を本番側にも実行する
3. auth-config.js を本番用の URL / anon key に差し替える
4. Redirect URLs に本番 URL を追加する
5. 本番用ユーザーを登録し、必要な権限を付与する
6. GitHub Pages から正式な公開先へ同じファイル群を配置する

## 7. 注意点
- service_role key は HTML や JavaScript に書かない
- GitHub Pages は静的配信のみで、独自サーバー処理は動かない
- テスト用と本番用の Supabase は分ける
- ブラウザ localStorage のみを正データにしない

## 8. 政務活動費入力（Next.js）の本番公開手順

`seimukatudouhi-app` は Next.js アプリのため、GitHub Pages では動作しません。
Vercel / Render / Cloud Run などの Node.js 実行環境へデプロイしてください。

### 推奨: Vercel での公開手順
1. Vercel で新規プロジェクトを作成する
2. リポジトリ `yamahiro1960/gikai_nankokushi_portal` を連携する
3. `Root Directory` を `seimukatudouhi-app` に設定する
4. Environment Variables に以下を登録する
	- `NEXT_PUBLIC_SUPABASE_URL`
	- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. デプロイ実行後、公開URL（例: `https://xxxxx.vercel.app`）を控える

### ポータル側リンク設定
1. ルートの `auth-config.js` を開く
2. `seimukatudouhiAppBaseUrl` に公開URLを設定する
	- 例: `seimukatudouhiAppBaseUrl: "https://xxxxx.vercel.app"`
3. これにより `index.html` の「政務活動費入力」タイルが
	`https://xxxxx.vercel.app/activities/new` を開くようになる

### 補足
- `seimukatudouhiAppBaseUrl` が未設定の場合、入力タイルは `seimukatudouhi.html` にフォールバックします。
- 本番公開後は `localhost:3000` を使う必要はありません。

## 9. プロフィール通知メール（Resend）設定

`member-directory-settings.html` は、保存時/手動送信時に `auth-config.js` の `profileNotifyWebhookUrl` へPOSTします。
このURLに Supabase Edge Function を設定すると、Resend経由で自動送信できます。

### 9-1. Edge Function をデプロイ
1. Supabase CLI をインストールする
2. このリポジトリ直下で実行する

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy profile-notify-mail
```

補足:
- ポータル側はログインセッショントークンを付けてWebhookを呼ぶため、FunctionのJWT検証は有効のままで運用できます。

### 9-2. Resend環境変数を設定

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
supabase secrets set RESEND_FROM_EMAIL="南国市議会DXポータル <no-reply@your-domain.example>"
```

### 9-3. フロント側Webhook URL設定
`auth-config.js` の `profileNotifyWebhookUrl` に以下を設定します。

```js
profileNotifyWebhookUrl: "https://<project-ref>.functions.supabase.co/profile-notify-mail"
```

### 9-4. 動作確認
1. 議員・職員登録画面でメンバーを新規保存する
2. 対象メールアドレスへ「登録/変更」とログインURLが届くことを確認する

### 9-5. 送信される主な項目
- 宛先メールアドレス
- ログインURL
- 登録または変更のメッセージ

