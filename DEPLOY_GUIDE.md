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
