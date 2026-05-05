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

-- 操作監査ログ
create table if not exists public.audit_log (
    id bigserial primary key,
    actor_email text,
    target_email text,
    action_type text not null,
    before_value text,
    after_value text,
    note text,
    created_at timestamptz not null default now()
);

-- audit_log ポリシー（認証ユーザーが insert/select 可能）
alter table public.audit_log enable row level security;

drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin on public.audit_log
for select using (auth.uid() is not null);

drop policy if exists audit_log_insert_authenticated on public.audit_log;
create policy audit_log_insert_authenticated on public.audit_log
for insert with check (auth.uid() is not null);

-- anon（一時運用）からも insert 可能にする

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
    is_current boolean not null default true,
    postal_code text,
    address text,
    phone text,
    mobile text,
    category text not null check (category in ('議員', '職員')),
    position_name text,
    access_role text not null default '使用者' check (access_role in ('管理者', '使用者')),
    email text,
    committee text check (committee in ('産業建設', '教育民生', '総務')),
    committee_role text check (committee_role in ('委員長', '副委員長', '委員')),
    is_giun boolean not null default false,
    is_editorial_committee boolean not null default false,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.member_directory add column if not exists is_current boolean not null default true;
alter table public.member_directory add column if not exists access_role text not null default '使用者';

alter table public.profiles enable row level security;
alter table public.meeting_settings enable row level security;
alter table public.member_positions_master enable row level security;
alter table public.member_directory enable row level security;

-- profiles ポリシー: 認証ユーザー向けのみ
drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_admin_only on public.profiles;

-- 認証ユーザー向けシンプルなポリシー（auth.uid()が not null の場合のみ）
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
for select using (auth.uid() is not null);

drop policy if exists profiles_insert_authenticated on public.profiles;
create policy profiles_insert_authenticated on public.profiles
for insert with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists profiles_update_authenticated on public.profiles;
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
-- member_positions_master ポリシー（認証ユーザー全員が読み取り可、管理者のみ書き込み）
drop policy if exists member_positions_master_select_authenticated on public.member_positions_master;
create policy member_positions_master_select_authenticated on public.member_positions_master
for select using (auth.uid() is not null);

drop policy if exists member_positions_master_insert_admin on public.member_positions_master;
create policy member_positions_master_insert_admin on public.member_positions_master
for insert with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
);

drop policy if exists member_positions_master_update_admin on public.member_positions_master;
create policy member_positions_master_update_admin on public.member_positions_master
for update using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
);

drop policy if exists member_positions_master_delete_admin on public.member_positions_master;
create policy member_positions_master_delete_admin on public.member_positions_master
for delete using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
);

-- member_directory ポリシー（認証ユーザー全員が読み取り可、管理者のみ書き込み）
drop policy if exists member_directory_select_authenticated on public.member_directory;
create policy member_directory_select_authenticated on public.member_directory
for select using (auth.uid() is not null);

drop policy if exists member_directory_insert_admin on public.member_directory;
create policy member_directory_insert_admin on public.member_directory
for insert with check (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
);

drop policy if exists member_directory_update_admin on public.member_directory;
create policy member_directory_update_admin on public.member_directory
for update using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
);

drop policy if exists member_directory_delete_admin on public.member_directory;
create policy member_directory_delete_admin on public.member_directory
for delete using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
);

-- ----------------------------------------------------------------------
-- member_directory -> profiles 同期
-- 目的:
-- 1) member_directory の氏名・区分(議員/職員)を profiles へ反映
-- 2) メール表記揺れ（大文字・前後空白）を吸収
--
-- 注意:
-- profiles.user_id は auth.users と連動するため、
-- member_directory から新規 profiles 行は作成せず「既存 profiles のみ更新」する。
-- ----------------------------------------------------------------------

-- メール正規化（小文字・trim）
update public.member_directory
set email = lower(trim(email))
where email is not null and email <> lower(trim(email));

update public.profiles
set email = lower(trim(email))
where email is not null and email <> lower(trim(email));

-- 大文字小文字を無視した一意制約
create unique index if not exists profiles_email_lower_uniq
on public.profiles ((lower(email)));

create unique index if not exists member_directory_email_lower_uniq
on public.member_directory ((lower(email)))
where email is not null;

-- 権限を profiles.role にマップ
create or replace function public.map_member_access_role_to_profile_role(access_role_value text)
returns text
language sql
immutable
as $$
    select case
        when access_role_value = '管理者' then 'admin'
        else 'viewer'
    end;
$$;

create sequence if not exists public.member_directory_seq start 1;

create or replace function public.normalize_member_position(category_value text, position_value text)
returns text
language sql
immutable
as $$
    select case
        when category_value = '議員' and position_value in ('議長', '副議長', '未') then position_value
        when category_value = '職員' and position_value in ('局長', '副局長', '未') then position_value
        when category_value in ('議員', '職員') then '未'
        else coalesce(position_value, '未')
    end;
$$;

create or replace function public.apply_member_directory_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    admin_count integer;
begin
    if new.member_id is null or btrim(new.member_id) = '' then
        new.member_id := 'M' || lpad(nextval('public.member_directory_seq')::text, 4, '0');
    end if;

    if new.email is not null then
        new.email := nullif(lower(trim(new.email)), '');
    end if;

    new.full_name := btrim(new.full_name);
    new.access_role := coalesce(nullif(new.access_role, ''), '使用者');
    new.category := coalesce(nullif(new.category, ''), '議員');
    new.position_name := public.normalize_member_position(new.category, coalesce(nullif(new.position_name, ''), '未'));
    new.updated_at := now();

    if new.access_role = '管理者' then
        select count(*)
          into admin_count
          from public.member_directory
         where access_role = '管理者'
           and member_id <> coalesce(new.member_id, '');

        if admin_count >= 4 then
            raise exception '管理者は4人までしか登録できません。';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_apply_member_directory_rules on public.member_directory;
create trigger trg_apply_member_directory_rules
before insert or update on public.member_directory
for each row
execute function public.apply_member_directory_rules();

-- member_directory 変更時に profiles を更新
create or replace function public.sync_member_directory_to_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    normalized_email text;
begin
    normalized_email := nullif(lower(trim(new.email)), '');

    if normalized_email is null then
        return new;
    end if;

    update public.profiles
    set
        email = normalized_email,
        display_name = coalesce(nullif(new.full_name, ''), display_name),
        role = public.map_member_access_role_to_profile_role(new.access_role)
    where lower(email) = normalized_email;

    return new;
end;
$$;

drop trigger if exists trg_sync_member_directory_to_profiles on public.member_directory;
create trigger trg_sync_member_directory_to_profiles
after insert or update of email, full_name, category
on public.member_directory
for each row
execute function public.sync_member_directory_to_profiles();

-- 初回バックフィル（既存データを一括同期）
update public.profiles p
set
    display_name = coalesce(nullif(m.full_name, ''), p.display_name),
    role = public.map_member_access_role_to_profile_role(m.access_role)
from public.member_directory m
where m.email is not null
  and lower(trim(m.email)) = lower(trim(p.email));

insert into public.member_positions_master (position_name, sort_order)
values
    ('未', 0),
    ('議長', 10),
    ('副議長', 20),
    ('局長', 30),
    ('副局長', 40),
    ('委員長', 50),
    ('副委員長', 60),
    ('委員', 70),
    ('その他', 999)
on conflict (position_name) do nothing;

-- 初回管理者を作る場合（auth.usersの対象ユーザーIDを指定）
-- update public.profiles set role = 'admin' where email = 'admin@example.com';

-- ----------------------------------------------------------------------
-- document_notes テーブル（議案メモ：個人専用）
-- 議案PDFを閲覧中に書いたメモを1資料1レコードで保存する。
-- member_id でフィルタリングして本人のみ参照する運用（自己責任フィルタ）。
-- ----------------------------------------------------------------------
create table if not exists public.document_notes (
    id bigserial primary key,
    member_id text not null,
    session_id text not null,
    document_name text not null,
    note_text text not null default '',
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    unique (member_id, session_id, document_name)
);

alter table public.document_notes enable row level security;

-- document_notes ポリシー（本人のデータのみ操作可）
drop policy if exists document_notes_select_own on public.document_notes;
create policy document_notes_select_own on public.document_notes
for select using (member_id = public.current_member_id());

drop policy if exists document_notes_insert_own on public.document_notes;
create policy document_notes_insert_own on public.document_notes
for insert with check (auth.uid() is not null and member_id = public.current_member_id());

drop policy if exists document_notes_update_own on public.document_notes;
create policy document_notes_update_own on public.document_notes
for update using (member_id = public.current_member_id());

drop policy if exists document_notes_delete_own on public.document_notes;
create policy document_notes_delete_own on public.document_notes
for delete using (member_id = public.current_member_id());

-- ----------------------------------------------------------------------
-- document_ink_notes テーブル（議案手書きメモ：個人専用）
-- PDFビューア上に重ねて描いた線データを資料単位で保存する。
-- member_id でフィルタリングして本人のみ参照する運用（自己責任フィルタ）。
-- ----------------------------------------------------------------------
create table if not exists public.document_ink_notes (
    id bigserial primary key,
    member_id text not null,
    session_id text not null,
    document_name text not null,
    ink_payload jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    unique (member_id, session_id, document_name)
);

alter table public.document_ink_notes enable row level security;

-- document_ink_notes ポリシー（本人のデータのみ操作可）
drop policy if exists document_ink_notes_select_own on public.document_ink_notes;
create policy document_ink_notes_select_own on public.document_ink_notes
for select using (member_id = public.current_member_id());

drop policy if exists document_ink_notes_insert_own on public.document_ink_notes;
create policy document_ink_notes_insert_own on public.document_ink_notes
for insert with check (auth.uid() is not null and member_id = public.current_member_id());

drop policy if exists document_ink_notes_update_own on public.document_ink_notes;
create policy document_ink_notes_update_own on public.document_ink_notes
for update using (member_id = public.current_member_id());

drop policy if exists document_ink_notes_delete_own on public.document_ink_notes;
create policy document_ink_notes_delete_own on public.document_ink_notes
for delete using (member_id = public.current_member_id());

-- ----------------------------------------------------------------------
-- general_question_tracker テーブル（一般質問の要望・答弁追跡）
-- 一般質問で出た要望と答弁を案件として登録し、後続の実施状況を追跡する。
-- ----------------------------------------------------------------------
create table if not exists public.general_question_tracker (
    id bigserial primary key,
    session_id text not null,
    question_date date,
    member_name text not null,
    committee text,
    category text,
    department text,
    request_summary text not null,
    answer_summary text not null default '',
    action_summary text not null default '',
    status text not null default '未着手' check (status in ('未着手', '調査中', '進行中', '一部実施', '実施済み', '要再確認')),
    evaluation text not null default '要確認' check (evaluation in ('要確認', '概ね良好', '一部不足', '未実施', '再質問候補')),
    priority text not null default '中' check (priority in ('高', '中', '低')),
    progress_percent int not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
    follow_up_due date,
    hearing_url text,
    source_excerpt text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists general_question_tracker_session_idx
on public.general_question_tracker (session_id);

create index if not exists general_question_tracker_status_idx
on public.general_question_tracker (status);

create index if not exists general_question_tracker_member_idx
on public.general_question_tracker (member_name);

alter table public.general_question_tracker enable row level security;

-- general_question_tracker ポリシー（認証ユーザー全員が読み書き可）
drop policy if exists general_question_tracker_select_authenticated on public.general_question_tracker;
create policy general_question_tracker_select_authenticated on public.general_question_tracker
for select using (auth.uid() is not null);

drop policy if exists general_question_tracker_insert_authenticated on public.general_question_tracker;
create policy general_question_tracker_insert_authenticated on public.general_question_tracker
for insert with check (auth.uid() is not null);

drop policy if exists general_question_tracker_update_authenticated on public.general_question_tracker;
create policy general_question_tracker_update_authenticated on public.general_question_tracker
for update using (auth.uid() is not null);

drop policy if exists general_question_tracker_delete_authenticated on public.general_question_tracker;
create policy general_question_tracker_delete_authenticated on public.general_question_tracker
for delete using (auth.uid() is not null);

-- ----------------------------------------------------------------------
-- general_question_updates テーブル（一般質問の追跡更新履歴）
-- 進捗確認・所見・再質問候補などを時系列で残す。
-- ----------------------------------------------------------------------
create table if not exists public.general_question_updates (
    id bigserial primary key,
    tracker_id bigint not null references public.general_question_tracker(id) on delete cascade,
    update_date date not null default current_date,
    status text not null default '進行中' check (status in ('未着手', '調査中', '進行中', '一部実施', '実施済み', '要再確認')),
    evaluation text not null default '要確認' check (evaluation in ('要確認', '概ね良好', '一部不足', '未実施', '再質問候補')),
    progress_percent int not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
    update_note text not null,
    evidence_url text,
    created_at timestamptz not null default now()
);

create index if not exists general_question_updates_tracker_idx
on public.general_question_updates (tracker_id, update_date desc);

alter table public.general_question_updates enable row level security;

-- general_question_updates ポリシー（認証ユーザー全員が読み書き可）
drop policy if exists general_question_updates_select_authenticated on public.general_question_updates;
create policy general_question_updates_select_authenticated on public.general_question_updates
for select using (auth.uid() is not null);

drop policy if exists general_question_updates_insert_authenticated on public.general_question_updates;
create policy general_question_updates_insert_authenticated on public.general_question_updates
for insert with check (auth.uid() is not null);

drop policy if exists general_question_updates_update_authenticated on public.general_question_updates;
create policy general_question_updates_update_authenticated on public.general_question_updates
for update using (auth.uid() is not null);

drop policy if exists general_question_updates_delete_authenticated on public.general_question_updates;
create policy general_question_updates_delete_authenticated on public.general_question_updates
for delete using (auth.uid() is not null);
