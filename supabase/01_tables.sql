-- MealTrack consolidated schema: tables and all final columns.
-- Run files in numeric order on a fresh Supabase project.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'member' check (role in ('member', 'coordinator', 'manager')),
  mess_id uuid,
  picture_url text,
  reminder_time time not null default '22:00',
  notification_preferences jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists notification_preferences jsonb;

-- mess_id is constrained below because messes.creator_id points back to profiles.
create table if not exists public.messes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  creator_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Final migration state removed the obsolete code-based onboarding column.
alter table public.messes drop column if exists invite_code;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_mess_id_fkey' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_mess_id_fkey
      foreign key (mess_id) references public.messes(id) on delete set null;
  end if;
end $$;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar text,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete set null,
  mess_id uuid references public.messes(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  delete_expires_at timestamptz,
  sort_order integer default 0
);

create table if not exists public.cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  status text not null check (status in ('active', 'pending', 'closed')),
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  finalized_at timestamptz,
  members_snapshot jsonb,
  created_at timestamptz not null default now(),
  mess_id uuid references public.messes(id) on delete set null,
  deleted_at timestamptz,
  delete_expires_at timestamptz
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  amount decimal(10, 2) not null,
  description text not null,
  type text not null check (type in ('meal', 'fixed')),
  paid_by text not null,
  date date default current_date,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete set null,
  cycle_id uuid references public.cycles(id) on delete cascade,
  mess_id uuid references public.messes(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  delete_expires_at timestamptz
);

create table if not exists public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  date date not null,
  count decimal(4, 2) not null default 0,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete set null,
  cycle_id uuid references public.cycles(id) on delete cascade,
  mess_id uuid references public.messes(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  constraint meal_logs_member_id_date_cycle_key unique (member_id, date, cycle_id)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'meal_logs_count_nonnegative_check' and conrelid = 'public.meal_logs'::regclass) then
    alter table public.meal_logs add constraint meal_logs_count_nonnegative_check check (count >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_amount_nonzero_check' and conrelid = 'public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_amount_nonzero_check check (amount <> 0);
  end if;
end $$;

-- Requests describe future meal absences only. They never alter the actual
-- meal_logs ledger, so an already-recorded lunch remains intact when a member
-- requests dinner off later that day.
create table if not exists public.meal_off_requests (
  id uuid primary key default gen_random_uuid(),
  mess_id uuid not null references public.messes(id) on delete cascade,
  cycle_id uuid not null references public.cycles(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  requested_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  meal_period text not null default 'all_day' check (meal_period in ('all_day', 'lunch', 'dinner')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  note text,
  reviewed_by_profile_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_off_requests_date_range_check check (end_date >= start_date),
  constraint meal_off_requests_review_check check (
    (status in ('approved', 'declined') and reviewed_by_profile_id is not null and reviewed_at is not null)
    or status not in ('approved', 'declined')
  )
);

create table if not exists public.cycle_deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  cycle_id uuid not null references public.cycles(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  amount numeric not null,
  note text,
  created_at timestamptz not null default now(),
  mess_id uuid references public.messes(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null
);

create table if not exists public.changelog_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  cycle_id uuid not null references public.cycles(id) on delete cascade,
  entity_type text not null check (entity_type in ('member', 'expense', 'meal_log', 'deposit')),
  entity_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete')),
  title text not null,
  changes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  mess_id uuid references public.messes(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null
);

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  content text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  mess_id uuid references public.messes(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null
);

create table if not exists public.share_links (
  user_id uuid references auth.users(id) on delete set null,
  token text not null unique,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  mess_id uuid references public.messes(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  audience text not null check (audience in ('main', 'shared')),
  share_token text,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  mess_id uuid references public.messes(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('meal_log_reminder', 'notice_posted', 'deposit_recorded', 'settlement_pending', 'meal_off_request_submitted', 'meal_off_request_decided')),
  dedupe_key text not null,
  sent_at timestamptz not null default now(),
  mess_id uuid references public.messes(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null
);

create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  mess_id uuid not null references public.messes(id) on delete cascade,
  target_member_id uuid references public.members(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  claimed_by_profile_id uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint member_invites_claim_consistency check ((claimed_at is null and claimed_by_profile_id is null) or (claimed_at is not null and claimed_by_profile_id is not null))
);
