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

alter table public.profiles enable row level security;
alter table public.meeting_settings enable row level security;

create policy profiles_select_own_or_admin on public.profiles
for select using (
    auth.uid() = user_id
    or exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and p.role = 'admin'
    )
);

create policy profiles_insert_own on public.profiles
for insert with check (auth.uid() = user_id);

create policy profiles_update_admin_only on public.profiles
for update using (
    exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and p.role = 'admin'
    )
);

create policy meeting_settings_select_authenticated on public.meeting_settings
for select using (auth.uid() is not null);

create policy meeting_settings_upsert_editor_or_admin on public.meeting_settings
for insert with check (
    exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and p.role in ('editor', 'admin')
    )
);

create policy meeting_settings_update_editor_or_admin on public.meeting_settings
for update using (
    exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and p.role in ('editor', 'admin')
    )
);

insert into public.meeting_settings (setting_key, setting_payload)
values (
    'current',
    jsonb_build_object(
        '定例会名', '令和8（2026）年第1回定例会',
        '開始日', '2026-03-23',
        '終了日', '2026-03-29',
        '会場', '南国市議会議場',
        '議案数', '12',
        '報告数', '3',
        '議発数', '1',
        'ステータス', '進行中'
    )
)
on conflict (setting_key) do nothing;

-- 初回管理者を作る場合（auth.usersの対象ユーザーIDを指定）
-- update public.profiles set role = 'admin' where email = 'admin@example.com';
