-- ==================================================================
-- Survey Catalog Table（Google Forms 連携用索引）
-- ==================================================================
-- ポータル側で Google Form と Spreadsheet を索引管理するテーブル
-- 作成・編集・削除は所有者（owner_email）のみが可能

create table if not exists public.survey_catalog (
    id bigserial primary key,
    title text not null,
    description text not null default '',
    status text not null default '準備中' check (status in ('準備中', '公開中', '締切', '保管')),
    google_form_public_url text not null,
    google_form_edit_url text,
    google_form_id text not null unique,
    google_sheet_url text not null,
    google_sheet_id text not null,
    owner_name text not null,
    owner_email text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- インデックス作成
create index if not exists survey_catalog_created_at_idx
on public.survey_catalog (created_at desc);

create index if not exists survey_catalog_owner_email_idx
on public.survey_catalog (owner_email);

create index if not exists survey_catalog_status_idx
on public.survey_catalog (status);

-- Row Level Security 有効化
alter table public.survey_catalog enable row level security;

-- SELECT ポリシー：全ユーザーが閲覧可能
drop policy if exists survey_catalog_select_all on public.survey_catalog;
create policy survey_catalog_select_all on public.survey_catalog
for select to authenticated using (true);

drop policy if exists survey_catalog_select_anon on public.survey_catalog;
create policy survey_catalog_select_anon on public.survey_catalog
for select to anon using (false);

-- INSERT ポリシー：認証ユーザーが挿入可能（今は一時的に全員許可）
drop policy if exists survey_catalog_insert_auth on public.survey_catalog;
create policy survey_catalog_insert_auth on public.survey_catalog
for insert to authenticated with check (owner_email = coalesce(auth.jwt() ->> 'email', ''));

-- INSERT ポリシー：非認証ユーザーは挿入不可
drop policy if exists survey_catalog_insert_anon on public.survey_catalog;
create policy survey_catalog_insert_anon on public.survey_catalog
for insert to anon with check (false);

-- UPDATE ポリシー：所有者（owner_email）のみ更新可能
drop policy if exists survey_catalog_update_owner on public.survey_catalog;
create policy survey_catalog_update_owner on public.survey_catalog
for update to authenticated
using (owner_email = coalesce(auth.jwt() ->> 'email', ''))
with check (owner_email = coalesce(auth.jwt() ->> 'email', ''));

-- DELETE ポリシー：所有者のみ削除可能
drop policy if exists survey_catalog_delete_owner on public.survey_catalog;
create policy survey_catalog_delete_owner on public.survey_catalog
for delete to authenticated
using (owner_email = coalesce(auth.jwt() ->> 'email', ''));
