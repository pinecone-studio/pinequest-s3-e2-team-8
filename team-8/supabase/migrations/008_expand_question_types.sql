alter table public.questions
  drop constraint if exists questions_type_check;

alter table public.questions
  add constraint questions_type_check
  check (
    type in (
      'multiple_choice',
      'multiple_response',
      'essay',
      'fill_blank',
      'matching'
    )
  );

alter table public.question_bank
  drop constraint if exists question_bank_type_check;

alter table public.question_bank
  add constraint question_bank_type_check
  check (
    type in (
      'multiple_choice',
      'multiple_response',
      'essay',
      'fill_blank',
      'matching'
    )
  );
