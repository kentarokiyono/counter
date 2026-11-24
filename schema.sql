-- =====================================================================
-- Toloc OS — Supabase Schema
-- Supabase の SQL Editor で全体を実行する（何度実行しても安全）。
-- =====================================================================

create extension if not exists "pgcrypto";

-- updated_at 自動更新
create or replace function set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------
-- メンバー（email 登録済みの人だけログインできる）
-- ---------------------------------------------------------------------
create table if not exists members (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    email text,
    role text not null default 'member' check (role in ('member', 'admin')),
    avatar_url text,
    created_at timestamptz not null default now()
);
create unique index if not exists idx_members_email on members (lower(email));

-- 参加申請（管理者の許可制）
create table if not exists member_requests (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    name text not null,
    note text,
    requested_by text,          -- 他のメンバーが代わりに申請した場合の名前（本人の申請なら null）
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    decided_by text,
    decided_at timestamptz,
    created_at timestamptz not null default now()
);
create index if not exists idx_member_requests_status on member_requests (status, created_at);

-- ---------------------------------------------------------------------
-- タスク
-- ---------------------------------------------------------------------
create table if not exists tasks (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text,
    status text not null default 'todo'
        check (status in ('todo', 'in_progress', 'review', 'done')),
    assignee_name text,
    -- 分類（backend/domains.py・frontend/lib/types.ts と一致させる）
    domain text check (
        domain is null or domain in ('planning', 'pr', 'liaison', 'fieldwork', 'survey', 'admin')
    ),
    due_date date,
    checklist jsonb not null default '[]',   -- [{"item": "...", "done": false}]
    repeat text check (repeat is null or repeat in ('daily', 'weekly', 'monthly')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text
);
drop trigger if exists trg_tasks_updated_at on tasks;
create trigger trg_tasks_updated_at before update on tasks
    for each row execute function set_updated_at();

create table if not exists task_comments (
    id uuid primary key default gen_random_uuid(),
    task_id uuid not null references tasks (id) on delete cascade,
    author text not null,
    body text not null,
    created_at timestamptz not null default now()
);
create index if not exists idx_task_comments_task on task_comments (task_id, created_at);

-- ---------------------------------------------------------------------
-- イベント
-- ---------------------------------------------------------------------
create table if not exists events (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text,
    location text,
    start_time timestamptz not null,
    end_time timestamptz,
    status text not null default 'planned'
        check (status in ('planned', 'confirmed', 'in_progress', 'completed', 'cancelled')),
    assignees text[] not null default '{}',
    checklist jsonb not null default '[]',   -- 持ち物 [{"item": "...", "done": false}]
    attendance jsonb not null default '{}',  -- 出欠 {"名前": "yes" | "no" | "maybe"}
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text
);
drop trigger if exists trg_events_updated_at on events;
create trigger trg_events_updated_at before update on events
    for each row execute function set_updated_at();

create table if not exists checklist_templates (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    items text[] not null default '{}',
    created_by text,
    created_at timestamptz not null default now()
);
insert into checklist_templates (name, items) values
    ('ブース出展', array['展示パネル', 'パンフレット', 'シールアンケート台紙', 'シール', 'テーブルクロス', '延長コード', '名札', '養生テープ']),
    ('現地フィールドワーク', array['学生証', '名札', '腕章', '記録用カメラ', 'メモ帳', 'モバイルバッテリー', '飲料水', '雨具']),
    ('ツアー引率', array['参加者名簿', '行程表', '緊急連絡先一覧', '救急箱', '旗', 'マイク', '保険証券の写し'])
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- 活動ログ（現地活動・出展ごとの作業時間とメモ）
-- ---------------------------------------------------------------------
create table if not exists test_runs (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    run_date date,
    location text,
    status text not null default 'active' check (status in ('active', 'done')),
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text
);
create table if not exists test_run_work (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references test_runs (id) on delete cascade,
    team text not null check (team in ('prep', 'onsite', 'teardown', 'travel')),
    task text not null,
    started_at timestamptz not null,
    ended_at timestamptz,
    created_by text,
    created_at timestamptz not null default now()
);
create index if not exists idx_test_run_work_run on test_run_work (run_id, started_at);
create table if not exists test_run_logs (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references test_runs (id) on delete cascade,
    category text not null,
    title text not null,
    details text,
    actor text,
    created_at timestamptz not null default now()
);
create index if not exists idx_test_run_logs_run on test_run_logs (run_id, created_at desc);

-- ---------------------------------------------------------------------
-- シール集計（色 × 都道府県）
-- ---------------------------------------------------------------------
create table if not exists sticker_surveys (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    survey_date date,
    location text,
    event_id uuid references events (id) on delete set null,
    -- 使う色と意味 [{"key": "red", "label": "赤"}]。key は red/blue/yellow/green/orange/purple/pink/gray
    colors jsonb not null default '[{"key":"red","label":"赤"},{"key":"blue","label":"青"},{"key":"yellow","label":"黄"},{"key":"green","label":"緑"}]',
    status text not null default 'active' check (status in ('active', 'done')),
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text
);
create table if not exists sticker_counts (
    id uuid primary key default gen_random_uuid(),
    survey_id uuid not null references sticker_surveys (id) on delete cascade,
    pref text not null,
    color text not null,
    count integer not null default 0 check (count >= 0),
    updated_at timestamptz not null default now(),
    unique (survey_id, pref, color)
);
-- 押した記録（「元に戻す」で本人の直前の1回を取り消すため）
create table if not exists sticker_taps (
    id bigint generated always as identity primary key,
    survey_id uuid not null references sticker_surveys (id) on delete cascade,
    pref text not null,
    color text not null,
    actor text not null,
    undone boolean not null default false,
    created_at timestamptz not null default now()
);
create index if not exists idx_sticker_taps_actor on sticker_taps (survey_id, actor, id desc) where not undone;

-- 1回分を数える（同時に押しても数がずれないよう、DB の中で加算する）
create or replace function sticker_tap(p_survey uuid, p_pref text, p_color text, p_actor text)
returns setof sticker_counts
language plpgsql
as $$
declare
    r sticker_counts%rowtype;
begin
    insert into sticker_taps (survey_id, pref, color, actor) values (p_survey, p_pref, p_color, p_actor);
    insert into sticker_counts (survey_id, pref, color, count)
    values (p_survey, p_pref, p_color, 1)
    on conflict (survey_id, pref, color)
    do update set count = sticker_counts.count + 1, updated_at = now()
    returning * into r;
    return next r;
end;
$$;

-- 本人が最後に押した1回を取り消す（無ければ何も返さない）
create or replace function sticker_undo(p_survey uuid, p_actor text)
returns setof sticker_counts
language plpgsql
as $$
declare
    t sticker_taps%rowtype;
    r sticker_counts%rowtype;
begin
    select * into t from sticker_taps
    where survey_id = p_survey and actor = p_actor and not undone
    order by id desc
    limit 1
    for update skip locked;
    if not found then
        return;
    end if;
    update sticker_taps set undone = true where id = t.id;
    update sticker_counts set count = greatest(0, count - 1), updated_at = now()
    where survey_id = p_survey and pref = t.pref and color = t.color
    returning * into r;
    if found then
        return next r;
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 在席・最近の動き・通知
-- ---------------------------------------------------------------------
create table if not exists work_sessions (
    id uuid primary key default gen_random_uuid(),
    member_name text not null,
    started_at timestamptz not null default now(),
    last_ping_at timestamptz not null default now()
);
create index if not exists idx_work_sessions_member_ping on work_sessions (member_name, last_ping_at desc);

create table if not exists activity_log (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    actor text not null,
    kind text not null,      -- task / event / test_run / sticker / member
    action text not null,
    summary text not null,
    target_id text,
    meta jsonb not null default '{}'
);
create index if not exists idx_activity_log_created on activity_log (created_at desc);

create table if not exists push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    member_name text not null,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    created_at timestamptz not null default now()
);
create index if not exists idx_push_subscriptions_member on push_subscriptions (member_name);

-- ---------------------------------------------------------------------
-- RLS: 全テーブルで有効化し、ポリシーは作らない。
-- → 公開キー（anon / publishable）からは読み書き不可。backend の service_role キーは RLS を無視する。
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'members', 'member_requests', 'tasks', 'task_comments', 'events', 'checklist_templates',
    'test_runs', 'test_run_work', 'test_run_logs', 'sticker_surveys', 'sticker_counts', 'sticker_taps',
    'work_sessions', 'activity_log', 'push_subscriptions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 権限: backend（service_role）にだけ与える。フロントは認証にしか Supabase を使わない。
-- ---------------------------------------------------------------------
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
revoke execute on function sticker_tap(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function sticker_undo(uuid, text) from public, anon, authenticated;
