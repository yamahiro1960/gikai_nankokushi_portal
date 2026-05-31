-- meeting_settings のRLS修正
-- 目的:
-- 1) profiles.role だけでなく member_directory の管理者でも書き込み可能にする
-- 2) 一般ユーザーは自分の user_gemini_* / user_general_question_draft_* のみ書き込み可能にする

begin;

drop policy if exists meeting_settings_upsert_editor_or_admin on public.meeting_settings;
create policy meeting_settings_upsert_editor_or_admin on public.meeting_settings
for insert with check (
    auth.uid() is not null
    and (
        exists (
            select 1
            from public.profiles p
            where p.user_id = auth.uid()
              and p.role in ('editor', 'admin')
        )
        or exists (
            select 1
            from public.member_directory m
            where lower(trim(m.email)) = lower(trim(coalesce(auth.jwt()->>'email', '')))
              and m.is_current = true
              and m.access_role = '管理者'
        )
        or exists (
            select 1
            from public.member_directory m
            where lower(trim(m.email)) = lower(trim(coalesce(auth.jwt()->>'email', '')))
              and m.is_current = true
              and (
                  setting_key = ('user_gemini_' || m.member_id)
                  or setting_key = ('user_general_question_draft_' || m.member_id)
              )
        )
    )
);

drop policy if exists meeting_settings_update_editor_or_admin on public.meeting_settings;
create policy meeting_settings_update_editor_or_admin on public.meeting_settings
for update using (
    auth.uid() is not null
    and (
        exists (
            select 1
            from public.profiles p
            where p.user_id = auth.uid()
              and p.role in ('editor', 'admin')
        )
        or exists (
            select 1
            from public.member_directory m
            where lower(trim(m.email)) = lower(trim(coalesce(auth.jwt()->>'email', '')))
              and m.is_current = true
              and m.access_role = '管理者'
        )
        or exists (
            select 1
            from public.member_directory m
            where lower(trim(m.email)) = lower(trim(coalesce(auth.jwt()->>'email', '')))
              and m.is_current = true
              and (
                  setting_key = ('user_gemini_' || m.member_id)
                  or setting_key = ('user_general_question_draft_' || m.member_id)
              )
        )
    )
)
with check (
    auth.uid() is not null
    and (
        exists (
            select 1
            from public.profiles p
            where p.user_id = auth.uid()
              and p.role in ('editor', 'admin')
        )
        or exists (
            select 1
            from public.member_directory m
            where lower(trim(m.email)) = lower(trim(coalesce(auth.jwt()->>'email', '')))
              and m.is_current = true
              and m.access_role = '管理者'
        )
        or exists (
            select 1
            from public.member_directory m
            where lower(trim(m.email)) = lower(trim(coalesce(auth.jwt()->>'email', '')))
              and m.is_current = true
              and (
                  setting_key = ('user_gemini_' || m.member_id)
                  or setting_key = ('user_general_question_draft_' || m.member_id)
              )
        )
    )
);

commit;
