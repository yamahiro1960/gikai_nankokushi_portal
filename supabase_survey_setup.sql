-- ----------------------------------------------------------------------
-- survey_forms / survey_responses テーブル（アンケート配布・回答収集）
-- ----------------------------------------------------------------------
create table if not exists public.survey_forms (
    id bigserial primary key,
    survey_key text not null unique,
    title text not null,
    description text not null default '',
    question_text text not null,
    share_message text not null default '',
    thanks_message text not null default '回答ありがとうございます。',
    is_active boolean not null default true,
    creator_member_id text,
    creator_email text,
    creator_name text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists survey_forms_created_at_idx
on public.survey_forms (created_at desc);

create index if not exists survey_forms_creator_email_idx
on public.survey_forms (creator_email);

alter table public.survey_forms enable row level security;

drop policy if exists survey_forms_select_anon_temp on public.survey_forms;
create policy survey_forms_select_anon_temp on public.survey_forms
for select to anon using (true);

drop policy if exists survey_forms_insert_anon_temp on public.survey_forms;
create policy survey_forms_insert_anon_temp on public.survey_forms
for insert to anon with check (true);

drop policy if exists survey_forms_update_anon_temp on public.survey_forms;
create policy survey_forms_update_anon_temp on public.survey_forms
for update to anon using (true);

drop policy if exists survey_forms_delete_anon_temp on public.survey_forms;
create policy survey_forms_delete_anon_temp on public.survey_forms
for delete to anon using (true);

create table if not exists public.survey_responses (
    id bigserial primary key,
    survey_id bigint not null references public.survey_forms(id) on delete cascade,
    respondent_name text,
    response_text text not null,
    submitted_at timestamptz not null default now()
);

create index if not exists survey_responses_survey_id_idx
on public.survey_responses (survey_id, submitted_at desc);

alter table public.survey_responses enable row level security;

drop policy if exists survey_responses_select_anon_temp on public.survey_responses;
create policy survey_responses_select_anon_temp on public.survey_responses
for select to anon using (true);

drop policy if exists survey_responses_insert_anon_temp on public.survey_responses;
create policy survey_responses_insert_anon_temp on public.survey_responses
for insert to anon with check (true);

drop policy if exists survey_responses_update_anon_temp on public.survey_responses;
create policy survey_responses_update_anon_temp on public.survey_responses
for update to anon using (true);

drop policy if exists survey_responses_delete_anon_temp on public.survey_responses;
create policy survey_responses_delete_anon_temp on public.survey_responses
for delete to anon using (true);