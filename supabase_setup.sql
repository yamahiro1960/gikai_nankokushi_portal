-- Supabase Storage バケット設定
-- ⚠️ 以下は手動でSupabaseダッシュボード上で実施してください:
-- 
-- 1. Storage > Buckets で「gian」という名前でバケットを作成
-- 2. Buckets > gian > Policies で以下のポリシーを追加:
--    - "Public Access" (anonロール向け)
--      SELECT: (bucketName = 'gian'::text) = true
--
-- 3. バケット設定で "Make bucket public" を有効化
-- 
-- これにより、アップロードされたファイルが公開URLでアクセス可能になります。

create table if not exists public.profiles (
    user_id uuid primary key,
    email text not null unique,
    display_name text,
    role text not null default 'viewer' check (role in ('viewer','editor','admin')),
    created_at timestamptz not null default now()
);

create table if not exists public.meeting_settings (
    setting_key text primary key,
    setting_payload jsonb not null,
    updated_at timestamptz not null default now(),
    updated_by uuid
);

create table if not exists public.member_positions_master (
    position_name text primary key,
    sort_order int not null default 100,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.member_directory (
    member_id text primary key,
    full_name text not null,
    postal_code text,
    address text,
    phone text,
    mobile text,
    category text not null check (category in ('議員', '職員')),
    position_name text,
    email text,
    committee text check (committee in ('産業建設', '教育民生', '総務')),
    committee_role text check (committee_role in ('委員長', '副委員長', '委員')),
    is_giun boolean not null default false,
    is_editorial_committee boolean not null default false,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.meeting_settings enable row level security;
alter table public.member_positions_master enable row level security;
alter table public.member_directory enable row level security;

-- profiles ポリシー: 認証ユーザー向けのみ
drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_admin_only on public.profiles;

-- 認証ユーザー向けシンプルなポリシー（auth.uid()が not null の場合のみ）
create policy profiles_select_authenticated on public.profiles
for select using (auth.uid() is not null);

create policy profiles_insert_authenticated on public.profiles
for insert with check (auth.uid() is not null and auth.uid() = user_id);

create policy profiles_update_authenticated on public.profiles
for update using (auth.uid() is not null);

-- meeting_settings ポリシー（認証ユーザー向け）
drop policy if exists meeting_settings_select_authenticated on public.meeting_settings;
create policy meeting_settings_select_authenticated on public.meeting_settings
for select using (auth.uid() is not null);

drop policy if exists meeting_settings_upsert_editor_or_admin on public.meeting_settings;
create policy meeting_settings_upsert_editor_or_admin on public.meeting_settings
for insert with check (
    exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and p.role in ('editor', 'admin')
    )
);

drop policy if exists meeting_settings_update_editor_or_admin on public.meeting_settings;
create policy meeting_settings_update_editor_or_admin on public.meeting_settings
for update using (
    exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and p.role in ('editor', 'admin')
    )
);

-- ----------------------------------------------------------------------
-- 暫定: ログイン認証を稼働させるまでの無認証運用ポリシー
-- authPaused=true の間、anonロールで各テーブルを読み書き可能にする。
-- 本番で認証運用へ移行する際は、_anon_temp が付くポリシーを削除すること。
-- ----------------------------------------------------------------------
drop policy if exists meeting_settings_select_anon_temp on public.meeting_settings;
create policy meeting_settings_select_anon_temp on public.meeting_settings
for select to anon using (true);

drop policy if exists meeting_settings_insert_anon_temp on public.meeting_settings;
create policy meeting_settings_insert_anon_temp on public.meeting_settings
for insert to anon with check (true);

drop policy if exists meeting_settings_update_anon_temp on public.meeting_settings;
create policy meeting_settings_update_anon_temp on public.meeting_settings
for update to anon using (true);

-- member_positions_master ポリシー
drop policy if exists member_positions_master_select_anon_temp on public.member_positions_master;
create policy member_positions_master_select_anon_temp on public.member_positions_master
for select to anon using (true);

drop policy if exists member_positions_master_insert_anon_temp on public.member_positions_master;
create policy member_positions_master_insert_anon_temp on public.member_positions_master
for insert to anon with check (true);

drop policy if exists member_positions_master_update_anon_temp on public.member_positions_master;
create policy member_positions_master_update_anon_temp on public.member_positions_master
for update to anon using (true);

drop policy if exists member_positions_master_delete_anon_temp on public.member_positions_master;
create policy member_positions_master_delete_anon_temp on public.member_positions_master
for delete to anon using (true);

-- member_directory ポリシー
drop policy if exists member_directory_select_anon_temp on public.member_directory;
create policy member_directory_select_anon_temp on public.member_directory
for select to anon using (true);

drop policy if exists member_directory_insert_anon_temp on public.member_directory;
create policy member_directory_insert_anon_temp on public.member_directory
for insert to anon with check (true);

drop policy if exists member_directory_update_anon_temp on public.member_directory;
create policy member_directory_update_anon_temp on public.member_directory
for update to anon using (true);

drop policy if exists member_directory_delete_anon_temp on public.member_directory;
create policy member_directory_delete_anon_temp on public.member_directory
for delete to anon using (true);

insert into public.member_positions_master (position_name, sort_order)
values
    ('議長', 10),
    ('副議長', 20),
    ('事務局長', 30),
    ('副事務局長', 40),
    ('委員長', 50),
    ('副委員長', 60),
    ('委員', 70),
    ('その他', 999)
on conflict (position_name) do nothing;

-- 初回管理者を作る場合（auth.usersの対象ユーザーIDを指定）
-- update public.profiles set role = 'admin' where email = 'admin@example.com';
