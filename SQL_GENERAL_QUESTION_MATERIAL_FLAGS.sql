-- general_question_material に素材区分/質問区分フラグを追加
-- 実行後、general-question-create.html を再読み込みしてください

alter table public.general_question_material
add column if not exists material_flag boolean not null default true;

alter table public.general_question_material
add column if not exists question_flag boolean not null default false;

-- 既存データは素材扱いに統一
update public.general_question_material
set material_flag = true,
    question_flag = false
where material_flag is distinct from true
   or question_flag is distinct from false;

create index if not exists idx_general_question_material_material_flag
on public.general_question_material(material_flag);

create index if not exists idx_general_question_material_question_flag
on public.general_question_material(question_flag);

notify pgrst, 'reload schema';
