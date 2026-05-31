-- メールでお知らせ: 専用テーブル作成 + RLS + 既存データ移行

begin;

create extension if not exists pgcrypto;

create table if not exists public.mail_notices (
    id uuid primary key default gen_random_uuid(),
    subject text not null,
    greeting text,
    purpose text,
    notice_datetime_text text,
    link_url text,
    sender_info text,
    target_type text not null default 'all' check (target_type in ('all', 'specific')),
    requires_response boolean not null default false,
    response_deadline_text text,
    attachments jsonb not null default '[]'::jsonb,
    status text not null default 'saved' check (status in ('saved', 'sent')),
    sent_at timestamptz,
    created_by_user_id uuid,
    created_by_email text,
    created_by_name text,
    updated_by_user_id uuid,
    updated_by_email text,
    updated_by_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.mail_notice_recipients (
    id bigserial primary key,
    notice_id uuid not null references public.mail_notices(id) on delete cascade,
    recipient_member_id text,
    recipient_email text,
    recipient_name text,
    created_at timestamptz not null default now()
);

create table if not exists public.mail_notice_templates (
    id uuid primary key default gen_random_uuid(),
    template_type text not null check (template_type in ('greeting', 'sender')),
    template_name text not null,
    template_body text not null,
    created_by_user_id uuid,
    created_by_email text,
    created_by_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists mail_notices_status_updated_idx
on public.mail_notices (status, updated_at desc);

create index if not exists mail_notice_recipients_notice_idx
on public.mail_notice_recipients (notice_id);

create index if not exists mail_notice_recipients_email_idx
on public.mail_notice_recipients (recipient_email);

create index if not exists mail_notice_templates_type_updated_idx
on public.mail_notice_templates (template_type, updated_at desc);

alter table public.mail_notices enable row level security;
alter table public.mail_notice_recipients enable row level security;
alter table public.mail_notice_templates enable row level security;

-- 管理者判定関数（未作成の場合のみ）
create or replace function public.is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select
        auth.uid() is not null
        and (
            exists (
                select 1
                from public.profiles p
                where p.user_id = auth.uid()
                  and p.role = 'admin'
            )
            or exists (
                select 1
                from public.member_directory m
                where lower(trim(m.email)) = lower(trim(coalesce(auth.jwt()->>'email', '')))
                  and m.is_current = true
                  and m.access_role = '管理者'
            )
        );
$$;

revoke all on function public.is_portal_admin() from public;
grant execute on function public.is_portal_admin() to authenticated;
grant execute on function public.is_portal_admin() to service_role;

-- mail_notices ポリシー

drop policy if exists mail_notices_select_admin on public.mail_notices;
create policy mail_notices_select_admin on public.mail_notices
for select using (public.is_portal_admin());

drop policy if exists mail_notices_insert_admin on public.mail_notices;
create policy mail_notices_insert_admin on public.mail_notices
for insert with check (public.is_portal_admin());

drop policy if exists mail_notices_update_admin on public.mail_notices;
create policy mail_notices_update_admin on public.mail_notices
for update using (public.is_portal_admin())
with check (public.is_portal_admin());

drop policy if exists mail_notices_delete_admin on public.mail_notices;
create policy mail_notices_delete_admin on public.mail_notices
for delete using (public.is_portal_admin());

-- recipients ポリシー

drop policy if exists mail_notice_recipients_select_admin on public.mail_notice_recipients;
create policy mail_notice_recipients_select_admin on public.mail_notice_recipients
for select using (public.is_portal_admin());

drop policy if exists mail_notice_recipients_insert_admin on public.mail_notice_recipients;
create policy mail_notice_recipients_insert_admin on public.mail_notice_recipients
for insert with check (public.is_portal_admin());

drop policy if exists mail_notice_recipients_update_admin on public.mail_notice_recipients;
create policy mail_notice_recipients_update_admin on public.mail_notice_recipients
for update using (public.is_portal_admin())
with check (public.is_portal_admin());

drop policy if exists mail_notice_recipients_delete_admin on public.mail_notice_recipients;
create policy mail_notice_recipients_delete_admin on public.mail_notice_recipients
for delete using (public.is_portal_admin());

-- templates ポリシー

drop policy if exists mail_notice_templates_select_admin on public.mail_notice_templates;
create policy mail_notice_templates_select_admin on public.mail_notice_templates
for select using (public.is_portal_admin());

drop policy if exists mail_notice_templates_insert_admin on public.mail_notice_templates;
create policy mail_notice_templates_insert_admin on public.mail_notice_templates
for insert with check (public.is_portal_admin());

drop policy if exists mail_notice_templates_update_admin on public.mail_notice_templates;
create policy mail_notice_templates_update_admin on public.mail_notice_templates
for update using (public.is_portal_admin())
with check (public.is_portal_admin());

drop policy if exists mail_notice_templates_delete_admin on public.mail_notice_templates;
create policy mail_notice_templates_delete_admin on public.mail_notice_templates
for delete using (public.is_portal_admin());

-- updated_at 自動更新トリガー
create or replace function public.set_mail_notice_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_mail_notices_updated_at on public.mail_notices;
create trigger trg_mail_notices_updated_at
before update on public.mail_notices
for each row execute function public.set_mail_notice_updated_at();

drop trigger if exists trg_mail_notice_templates_updated_at on public.mail_notice_templates;
create trigger trg_mail_notice_templates_updated_at
before update on public.mail_notice_templates
for each row execute function public.set_mail_notice_updated_at();

-- 既存の meeting_settings から移行
-- records
insert into public.mail_notices (
    id,
    subject,
    greeting,
    purpose,
    notice_datetime_text,
    link_url,
    sender_info,
    target_type,
    requires_response,
    response_deadline_text,
    attachments,
    status,
    sent_at,
    created_by_name,
    updated_by_name,
    created_at,
    updated_at
)
select
    case
        when coalesce(rec->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (rec->>'id')::uuid
        else gen_random_uuid()
    end as id,
    coalesce(rec->>'subject', '(件名未設定)') as subject,
    rec->>'greeting' as greeting,
    rec->>'purpose' as purpose,
    rec->>'noticeDateTime' as notice_datetime_text,
    rec->>'linkUrl' as link_url,
    rec->>'senderInfo' as sender_info,
    case when rec->>'targetType' = 'specific' then 'specific' else 'all' end as target_type,
    coalesce((rec->>'requiresResponse')::boolean, false) as requires_response,
    rec->>'responseDeadline' as response_deadline_text,
    coalesce(rec->'attachments', '[]'::jsonb) as attachments,
    case when rec->>'status' = 'sent' then 'sent' else 'saved' end as status,
    case when coalesce(rec->>'sentAt', '') <> '' then (rec->>'sentAt')::timestamptz else null end as sent_at,
    nullif(rec->>'updatedBy', '') as created_by_name,
    nullif(rec->>'updatedBy', '') as updated_by_name,
    case when coalesce(rec->>'createdAt', '') <> '' then (rec->>'createdAt')::timestamptz else now() end as created_at,
    case when coalesce(rec->>'updatedAt', '') <> '' then (rec->>'updatedAt')::timestamptz else now() end as updated_at
from public.meeting_settings ms
cross join lateral jsonb_array_elements(coalesce(ms.setting_payload->'records', '[]'::jsonb)) rec
where ms.setting_key = 'mail_notice_records_v1'
on conflict (id) do nothing;

-- specific recipients
insert into public.mail_notice_recipients (
    notice_id,
    recipient_member_id,
    recipient_email,
    recipient_name
)
select
    (rec->>'id')::uuid as notice_id,
    member_id_text as recipient_member_id,
    m.email as recipient_email,
    m.full_name as recipient_name
from public.meeting_settings ms
cross join lateral jsonb_array_elements(coalesce(ms.setting_payload->'records', '[]'::jsonb)) rec
cross join lateral jsonb_array_elements_text(coalesce(rec->'specificMemberIds', '[]'::jsonb)) member_ids(member_id_text)
left join public.member_directory m
    on m.member_id = member_ids.member_id_text
where ms.setting_key = 'mail_notice_records_v1'
  and rec->>'targetType' = 'specific'
  and coalesce(rec->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
on conflict do nothing;

-- greeting templates
insert into public.mail_notice_templates (
    template_type,
    template_name,
    template_body,
    created_by_name
)
select
    'greeting' as template_type,
    coalesce(t->>'name', 'サンプル') as template_name,
    coalesce(t->>'body', '') as template_body,
    'migration' as created_by_name
from public.meeting_settings ms
cross join lateral jsonb_array_elements(coalesce(ms.setting_payload->'samples', '[]'::jsonb)) t
where ms.setting_key = 'mail_notice_greeting_samples_v1'
  and coalesce(t->>'body', '') <> ''
  and not exists (
      select 1
      from public.mail_notice_templates mt
      where mt.template_type = 'greeting'
        and mt.template_name = coalesce(t->>'name', 'サンプル')
        and mt.template_body = coalesce(t->>'body', '')
  );

-- sender templates
insert into public.mail_notice_templates (
    template_type,
    template_name,
    template_body,
    created_by_name
)
select
    'sender' as template_type,
    coalesce(t->>'name', 'サンプル') as template_name,
    coalesce(t->>'body', '') as template_body,
    'migration' as created_by_name
from public.meeting_settings ms
cross join lateral jsonb_array_elements(coalesce(ms.setting_payload->'samples', '[]'::jsonb)) t
where ms.setting_key = 'mail_notice_sender_samples_v1'
  and coalesce(t->>'body', '') <> ''
  and not exists (
      select 1
      from public.mail_notice_templates mt
      where mt.template_type = 'sender'
        and mt.template_name = coalesce(t->>'name', 'サンプル')
        and mt.template_body = coalesce(t->>'body', '')
  );

commit;
