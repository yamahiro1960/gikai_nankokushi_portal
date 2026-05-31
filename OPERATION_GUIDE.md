# 南国市議会DXポータル 運用ガイド

> 作成日: 2026年4月3日  
> 対象: 管理者・議会事務局担当者

---

## 目次
1. [システム全体像](#1-システム全体像)
2. [認証の仕組み（Google OAuth）](#2-認証の仕組みgoogle-oauth)
3. [本番公開での運用ルール](#3-本番公開での運用ルール)
4. [ユーザー登録・管理手順](#4-ユーザー登録管理手順)
5. [権限の種類と操作範囲](#5-権限の種類と操作範囲)
6. [初回ログイン時の注意事項](#6-初回ログイン時の注意事項)
7. [代替ログイン方法（緊急時）](#7-代替ログイン方法緊急時)
8. [Google Cloud Console の管理](#8-google-cloud-console-の管理)
9. [定期メンテナンス・チェックリスト](#9-定期メンテナンスチェックリスト)
10. [トラブルシューティング](#10-トラブルシューティング)

---

## 1. システム全体像

### 構成要素

| 要素 | 内容 |
|------|------|
| ホスティング | GitHub Pages（静的Webサイト） |
| データベース | Supabase（PostgreSQL） |
| 認証 | Supabase Auth + Google OAuth |
| リポジトリ | nankokushigikai/gikai_nankokushi_portal |
| 公開URL | https://nankokushigikai.github.io/gikai_nankokushi_portal/ |

### ファイル構成（主要）

```
index.html          ← トップ画面（ログイン後の入口）
login.html          ← ログイン画面
auth.js             ← 認証ロジック
auth-config.js      ← 認証設定（URL・Client IDなど）
supabase_setup.sql  ← DBテーブル定義（初期セットアップ用）
```

---

## 2. 認証の仕組み（Google OAuth）

### 採用方式

**Supabase Auth の Google OAuth** を採用しています。  
Google で認証したあと、Supabase のセッションを使ってアプリにログインします。

### ログインの流れ

```
①「Googleでログイン」ボタンをクリック
        ↓
② Supabase 経由で Google の認証画面へ移動
        ↓
③ Google で認証
        ↓
④ Supabase セッションを取得
        ↓
⑤ member_directory テーブルで利用者照合
        ↓
⑥ 一致 → index.html へ遷移
   不一致 → 利用者未登録エラー
```

### セッション情報（localStorage に保存）

```javascript
{
        email:            // ログインしたメールアドレス
        userId:           // 利用者ID
        memberId:         // member_directory の member_id
        displayName:      // 表示名
        accessRole:       // 権限（管理者 / 使用者）
        loginTime:        // ログイン時刻
}
```

### Client ID

```
995727635041-4btvd387rc69h0agjq4ld4ko9jlmpuki.apps.googleusercontent.com
```

> この値は `auth-config.js` に設定されています。変更する場合は Google Cloud Console で新しい Client ID を発行し、`auth-config.js` の `googleClientId` を更新してください。

---

## 3. 本番公開での運用ルール

### 現在の状態

Google Cloud Console の OAuth 同意画面は **本番公開** で運用します。  
- テストユーザーの個別登録は使いません
- ログイン可否は member_directory 登録の有無で管理します
- Google ログインに必要なスコープは `openid` `email` `profile` のみです

### ログインできる条件

Google アカウントで認証できても、次の条件を満たさないとポータルには入れません。  
**member_directory に現職利用者として登録されている Gmail のみログインできます。**

### 利用者を追加するときの手順

1. [Google Cloud Console](https://console.cloud.google.com) にアクセス  
   （ログインアカウント: yamamoto.yasuhiro.japan@gmail.com）
2. OAuth 同意画面の公開ステータスが「本番環境」になっていることを確認
3. **Supabase の member_directory に議員情報を登録**（次章参照）

この状態で、登録済みの Gmail がログイン可能になります。

---

## 4. ユーザー登録・管理手順

### Supabase の member_directory テーブル

利用者情報はすべてこのテーブルで管理します。

| カラム名 | 内容 | 例 |
|---------|------|-----|
| member_id | 議員ID（6桁） | 202306 |
| name | 氏名 | 山本康博 |
| gmail | GmailアドレスS（ログイン照合に使用） | yamamoto.yasuhiro.japan@gmail.com |
| faction | 会派名 | 南国会 |
| is_current | 現職フラグ（true/false） | true |
| access_role | 権限 | 管理者 または 一般 |

### 議員・職員を新規登録する方法

**方法①: user-management.html から登録（推奨）**
1. ポータルにログイン（管理者アカウントで）
2. 左メニュー「ユーザー管理」を開く
3. 「新規登録」から氏名・Gmail・役職を入力して保存

**方法②: Supabase Table Editor から直接登録**
1. [Supabase ダッシュボード](https://supabase.com/dashboard) にアクセス
2. Table Editor → member_directory
3. 「Insert row」で必要なカラムを入力して保存

### access_role（権限）の設定

権限を変更する場合は Supabase の Table Editor か SQL Editor で変更します。

```sql
-- 管理者に変更する例
UPDATE member_directory
SET access_role = '管理者'
WHERE member_id = '202306';
```

> PowerShell から REST API で日本語を送信する場合は文字化けが発生する場合があります。  
> その際は Supabase ダッシュボードから直接編集してください。

---

## 5. 権限の種類と操作範囲

| 権限 | 閲覧 | 議事録編集 | ユーザー管理 | システム設定 |
|------|------|-----------|------------|------------|
| 一般 | ○ | ○ | × | × |
| 管理者 | ○ | ○ | ○ | ○ |

- **現在の管理者**: 山本康博（member_id: 202306）
- システム設定・ユーザー管理は `access_role = '管理者'` のアカウントのみアクセス可能

---

## 6. 初回ログイン時の注意事項

### 「Googleがこのアプリを確認していません」警告について

本番公開後は、通常この警告は表示されません。

```
【画面表示】
このアプリはGoogleで確認されていません
このアプリはまだGoogleによる審査が完了していません。
（続行する場合は「詳細」をクリックしてください）
```

この警告が出る場合は、OAuth 同意画面がまだテスト中のままか、公開設定が正しく反映されていません。

管理者が Google Cloud Console で公開ステータスを確認し、必要なら再度本番公開を実施してください。

### 2回目以降のログイン

2回目以降は Google アカウントを選択するだけでログインが完了します（同意画面・警告は表示されません）。

---

## 7. 代替ログイン方法（緊急時）

代替ログインは廃止しています。

Google アカウントが使えない場合は、OAuth 設定か Google アカウント側の問題を解消してください。
認証をバイパスする運用は行いません。

---

## 8. Google Cloud Console の管理

### 現在の管理アカウント

- **オーナー**: yamamoto.yasuhiro.japan@gmail.com（山本康博 個人Gmail）
- **プロジェクト名**: 南国市議会DXポータル（または作成時の名称）

### 主な設定箇所

| 設定 | 場所 | 内容 |
|------|------|------|
| 公開ステータス | 「Google Auth Platform」→「対象」 | OAuth 同意画面が本番公開か確認 |
| OAuth Client ID | 「認証情報」→「OAuth 2.0 クライアントID」 | Client IDの確認・再発行 |
| OAuth 同意画面 | 「Google Auth Platform」→「対象」 | アプリ名、サポートメール、公開状態の確認 |

### 事務局向けの簡潔な変更手順

#### 1. 本番公開状態を確認する

1. Google Cloud Console にログイン
2. 対象プロジェクトを選択
3. 「Google Auth Platform」→「対象」を開く
4. 公開ステータスが「本番環境」になっていることを確認する
5. 「テスト中」の場合は本番公開へ切り替える

この設定がテスト中のままだと、一般利用者は 403 でブロックされます。

#### 2. Googleログインの設定内容を確認する

1. 「APIとサービス」→「認証情報」を開く
2. 「OAuth 2.0 クライアント ID」を開く
3. Client ID、承認済みのJavaScript生成元、設定内容を確認する

Googleログインが急に使えなくなった場合は、まずこの画面を確認します。

#### 3. 管理アカウントを変更する

1. 「IAMと管理」→「IAM」を開く
2. 新しい管理者アカウントを追加する
3. 役割を「オーナー」にする
4. 引き継ぎ完了後、不要になった旧アカウントを削除する

> カレンダー機能は停止済みのため、Google Calendar API の設定は現在不要です。

### 管理者向けの詳細な変更手順

#### A. 本番公開状態を確認・変更する詳細手順

1. Google Cloud Console にログインする
2. 画面上部のプロジェクト選択で対象プロジェクトを選ぶ
3. 左上メニューから「Google Auth Platform」を開く
4. 「対象」をクリックする
5. 公開ステータス欄を確認する
6. 「テスト中」の場合は「本番環境で公開」をクリックする
7. 確認画面で内容を確認し、確定する
8. 表示が「本番環境」になっていることを確認する

#### B. OAuth Client ID を確認・変更する詳細手順

1. Google Cloud Console にログインする
2. 対象プロジェクトを選ぶ
3. 「APIとサービス」→「認証情報」を開く
4. 「OAuth 2.0 クライアント ID」の一覧から対象のクライアントを選ぶ
5. 次の内容を確認する
        - 名前
        - 承認済みの JavaScript 生成元
        - 必要に応じて承認済みのリダイレクト URI
6. 必要な変更を行い、「保存」をクリックする
7. Client ID を再発行または差し替えた場合は、[auth-config.js](auth-config.js) の `googleClientId` も必ず更新する

#### C. オーナーアカウントを引き継ぐ詳細手順

1. Google Cloud Console にログインする
2. 対象プロジェクトを選ぶ
3. 「IAMと管理」→「IAM」を開く
4. 「アクセスを許可」または「プリンシパルを追加」をクリックする
5. 新しい管理者用メールアドレスを入力する
6. 役割を「オーナー」に設定する
7. 保存する
8. 新しい管理者アカウントでログインできることを確認する
9. 問題がなければ旧アカウントの権限を「削除」または「権限を下げる」で整理する

#### D. 変更後に必ず行う確認

1. OAuth 同意画面を本番公開に変更した場合
        一般利用者の Gmail で Google ログインできるか確認する
2. Client ID を変更した場合
        [auth-config.js](auth-config.js) の設定更新後、実際にログイン画面で動作確認する
3. オーナーを変更した場合
        新しい管理者アカウントだけで設定変更が可能か確認する

### 将来の対応（推奨）

現在はオーナーが個人Gmailですが、本番運用に向けて以下を推奨します。

1. 議会事務局専用の Google Workspace アカウントを作成
2. Google Cloud Console の IAM で専用アカウントをオーナーに昇格
3. 個人Gmailのアクセス権を削除

> IAM の変更は「Google Auth Platform」→「設定」→「IAMと管理」から行えます。

---

## 9. 定期メンテナンス・チェックリスト

### 議会改選時（2〜3年ごと）

- [ ] 落選・引退した議員の `is_current` を `false` に変更
- [ ] 新議員の `member_directory` 登録
- [ ] 権限の見直し（新しい管理者設定など）

### 年度ごと（毎年4月）

- [ ] 事務局職員の異動に伴うアカウント更新
- [ ] OAuth 同意画面が本番公開のまま維持されているか確認
- [ ] `access_role` の見直し

### 随時

- [ ] 新しい議員・職員が着任したら `member_directory` に登録
- [ ] OAuth Client ID を変更した場合は [auth-config.js](auth-config.js) も更新

---

## 10. トラブルシューティング

### 「アクセスがブロックされました」が表示される

**原因**: Google Cloud Console の OAuth 同意画面がテスト中のまま  
**対処**: Google Cloud Console → 「対象」 → 公開ステータスを本番環境に変更

### 「このアカウントは登録されていません」が表示される

**原因**: member_directory にそのGmailアドレスが登録されていない  
**対処**: user-management.html または Supabase Table Editor で議員情報を登録

### Googleログインボタンが表示されない

**原因**: Supabase SDK または auth-config.js の読み込み失敗、ネットワーク問題  
**対処**: ページをリロードし、ブラウザコンソールで読込エラーを確認する

### ログイン後に挨拶が表示されない・氏名がおかしい

**原因**: member_directory の `name` と `gmail` の対応が間違っている  
**対処**: Supabase Table Editor で当該レコードの `gmail` カラムを確認・修正

### 管理者なのにシステム設定に入れない

**原因**: `access_role` が `管理者` になっていない  
**対処**:
```sql
UPDATE member_directory
SET access_role = '管理者'
WHERE gmail = '該当のGmailアドレス';
```
Supabase SQL Editor で実行してください。

---

## 付録A: 議長・事務局向け説明文

議員・職員への案内用テンプレートです。

---

### 南国市議会DXポータル ログイン方法のご案内

**ログインに必要なもの**
- お持ちのGmailアカウント（ポータルに登録済みのもの）

**手順**
1. ポータルのURL（https://nankokushigikai.github.io/gikai_nankokushi_portal/）にアクセス
2. 「Googleでログイン」ボタンをクリック
3. お持ちのGmailアカウントを選択
4. **初回のみ**: 「このアプリはGoogleで確認されていません」と表示される場合は  
   → 「詳細」→「続行」をクリックしてください（2回目以降は表示されません）
5. トップ画面が開けばログイン完了です

**ご不明点は事務局までお問い合わせください**

---

## 付録B: 实務チェックリスト（新規利用者追加時）

```
新規利用者: ___________________
Gmailアドレス: ___________________
追加日: ___________________
担当者: ___________________

□ Google Cloud Console の OAuth 同意画面が本番公開であることを確認済み
□ Supabase の member_directory に登録済み
  □ member_id: ___________
  □ name: ___________
  □ gmail: ___________
  □ faction: ___________
  □ is_current: true
  □ access_role: 一般 / 管理者（どちらかに○）
□ 本人にログイン方法を案内済み
□ 動作確認済み（本人がログインできたことを確認）
```
