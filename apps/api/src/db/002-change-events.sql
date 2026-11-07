-- Novidades do sync: o que mudou na faculdade entre uma sincronização e a anterior (migração 2).
create table change_events (
  id          integer primary key autoincrement,
  user_id     integer not null references users(id) on delete cascade,
  subject_id  integer not null references subjects(id) on delete cascade,
  sync_run_id integer references sync_runs(id) on delete set null,
  kind        text    not null check (kind in (
                'subject_new','assignment_new','assignment_due_changed','grade_posted','grade_changed',
                'assignment_status_changed','lesson_new','lessons_added','lesson_rescheduled','lesson_room_changed')),
  title       text    not null,
  old_value   text,
  new_value   text,
  created_at  text    not null,
  seen_at     text                                  -- null = ainda não vista
);
create index change_events_user_idx   on change_events (user_id, id desc);
create index change_events_unseen_idx on change_events (user_id) where seen_at is null;
