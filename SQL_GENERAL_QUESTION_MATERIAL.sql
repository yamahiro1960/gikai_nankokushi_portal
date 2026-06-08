-- 一般質問素材テーブル
create table if not exists public.general_question_material (
    id uuid primary key default gen_random_uuid(),
    account_id uuid not null,
    material_flag boolean not null default true,
    question_flag boolean not null default false,
    category text,
    title text not null,
    summary text,
    content text,
    file_links jsonb default '[]'::jsonb,
    images jsonb default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- インデックス追加（高速検索用）
create index if not exists idx_general_question_material_account_id on public.general_question_material(account_id);
create index if not exists idx_general_question_material_created_at on public.general_question_material(created_at desc);
create index if not exists idx_general_question_material_material_flag on public.general_question_material(material_flag);
create index if not exists idx_general_question_material_question_flag on public.general_question_material(question_flag);

-- RLS有効化
alter table public.general_question_material enable row level security;

-- RLSポリシー: 認証ユーザーが自分のデータをSELECT可能
drop policy if exists general_question_material_select_own on public.general_question_material;
create policy general_question_material_select_own on public.general_question_material
for select using (
    (auth.uid() is not null and auth.uid() = account_id)
);

-- RLSポリシー: 認証ユーザーが自分のデータをINSERT可能
drop policy if exists general_question_material_insert_authenticated on public.general_question_material;
create policy general_question_material_insert_authenticated on public.general_question_material
for insert with check (
    (auth.uid() is not null and auth.uid() = account_id)
);

-- RLSポリシー: 認証ユーザーが自分のデータをUPDATE可能
drop policy if exists general_question_material_update_own on public.general_question_material;
create policy general_question_material_update_own on public.general_question_material
for update using (
    (auth.uid() is not null and auth.uid() = account_id)
) with check (
    (auth.uid() is not null and auth.uid() = account_id)
);

-- RLSポリシー: 認証ユーザーが自分のデータをDELETE可能
drop policy if exists general_question_material_delete_own on public.general_question_material;
create policy general_question_material_delete_own on public.general_question_material
for delete using (
    (auth.uid() is not null and auth.uid() = account_id)
);
