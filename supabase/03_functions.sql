-- Consolidated final RPC and trigger-function definitions.

create or replace function public.handle_auth_user_profile()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, notification_preferences)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'name'), ''), nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), nullif(split_part(new.email, '@', 1), ''), 'Member'), new.email,
    jsonb_build_object('global', true, 'categories', jsonb_build_object('notices', true, 'mealReminders', true)))
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

create or replace function public.current_mess_id()
returns uuid language sql stable security definer set search_path = public
as $$ select mess_id from public.profiles where id = auth.uid() $$;

create or replace function public.current_mess_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_current_mess_manager()
returns boolean language sql stable security definer set search_path = public
as $$ select role = 'manager' from public.profiles where id = auth.uid() $$;

create or replace function public.has_mess_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path = public
as $$ select public.current_mess_role() = any(allowed_roles) $$;

create or replace function public.prevent_member_history_cascade_delete()
returns trigger language plpgsql set search_path = public
as $$
begin
  if exists (select 1 from public.meal_logs where member_id = old.id)
     or exists (select 1 from public.cycle_deposits where member_id = old.id) then
    raise exception 'Members with meal or deposit history must be archived, not deleted';
  end if;
  return old;
end;
$$;

create or replace function public.create_mess(mess_name text)
returns public.messes language plpgsql security definer set search_path = public
as $$
declare new_mess public.messes;
  existing_mess_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required to create a mess'; end if;
  select mess_id into existing_mess_id from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  if existing_mess_id is not null then raise exception 'Your account already belongs to a mess'; end if;
  if nullif(trim(mess_name), '') is null then raise exception 'Mess name is required'; end if;
  insert into public.messes (name, creator_id) values (trim(mess_name), auth.uid()) returning * into new_mess;
  update public.profiles set mess_id = new_mess.id, role = 'manager', updated_at = now() where id = auth.uid();
  return new_mess;
end;
$$;
-- Retired legacy data migration functions
drop function if exists public.has_legacy_data();
drop function if exists public.migrate_legacy_data(text);

create or replace function public.guard_member_profile_link()
returns trigger language plpgsql security definer set search_path = public
as $$
declare self_claim boolean;
begin
  if new.profile_id is distinct from old.profile_id then
    self_claim := new.profile_id = auth.uid() and old.profile_id is null and exists (select 1 from public.profiles where id = auth.uid() and mess_id is null);
    if not public.is_current_mess_manager() and not self_claim then raise exception 'Only a mess manager can link member profiles'; end if;
    if new.profile_id is not null and not exists (select 1 from public.profiles where id = new.profile_id and mess_id = old.mess_id) and not self_claim then raise exception 'Profile must belong to this mess'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.link_member_profile(member_id_input uuid, profile_id_input uuid)
returns public.members language plpgsql security definer set search_path = public
as $$
declare linked_member public.members;
begin
  if not public.is_current_mess_manager() then raise exception 'Only a mess manager can link member profiles'; end if;
  update public.members set profile_id = profile_id_input where id = member_id_input and mess_id = public.current_mess_id() returning * into linked_member;
  if not found then raise exception 'Member was not found in your mess'; end if;
  return linked_member;
end;
$$;

create or replace function public.set_mess_role(profile_id_input uuid, role_input text)
returns public.profiles language plpgsql security definer set search_path = public
as $$
declare updated_profile public.profiles;
begin
  if not public.is_current_mess_manager() then raise exception 'Only a manager can change roles'; end if;
  if role_input not in ('member', 'coordinator') then raise exception 'Role must be member or coordinator'; end if;
  update public.profiles set role = role_input, updated_at = now() where id = profile_id_input and mess_id = public.current_mess_id() returning * into updated_profile;
  if not found then raise exception 'Profile is not a member of this mess'; end if;
  return updated_profile;
end;
$$;

create or replace function public.update_mess_settings(mess_name text)
returns public.messes language plpgsql security definer set search_path = public
as $$
declare updated_mess public.messes;
begin
  if not public.is_current_mess_manager() then raise exception 'Only a manager can edit mess settings'; end if;
  if nullif(trim(mess_name), '') is null then raise exception 'Mess name is required'; end if;
  update public.messes set name = trim(mess_name), updated_at = now() where id = public.current_mess_id() returning * into updated_mess;
  return updated_mess;
end;
$$;

create or replace function public.delete_current_mess()
returns void language plpgsql security definer set search_path = public
as $$
declare target_mess_id uuid := public.current_mess_id();
begin
  if not public.is_current_mess_manager() then raise exception 'Only a manager can delete a mess'; end if;
  if target_mess_id is null then raise exception 'No active mess'; end if;
  delete from public.member_invites where mess_id = target_mess_id;
  delete from public.meal_off_requests where mess_id = target_mess_id;
  delete from public.notification_deliveries where mess_id = target_mess_id;
  delete from public.push_subscriptions where mess_id = target_mess_id;
  delete from public.notices where mess_id = target_mess_id;
  delete from public.share_links where mess_id = target_mess_id;
  delete from public.changelog_entries where mess_id = target_mess_id;
  delete from public.cycle_deposits where mess_id = target_mess_id;
  delete from public.meal_logs where mess_id = target_mess_id;
  delete from public.expenses where mess_id = target_mess_id;
  delete from public.cycles where mess_id = target_mess_id;
  delete from public.members where mess_id = target_mess_id;
  update public.profiles set mess_id = null, role = 'member', updated_at = now() where mess_id = target_mess_id;
  delete from public.messes where id = target_mess_id;
end;
$$;

create or replace function public.update_user_profile(name_input text, picture_url_input text default null)
returns public.profiles language plpgsql security definer set search_path = public
as $$
declare updated_profile public.profiles; trimmed_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  trimmed_name := nullif(trim(name_input), '');
  if trimmed_name is null then raise exception 'Name cannot be empty'; end if;
  update public.profiles set full_name = trimmed_name, picture_url = nullif(trim(picture_url_input), ''), updated_at = now() where id = auth.uid() returning * into updated_profile;
  if updated_profile.id is null then raise exception 'Profile not found'; end if;
  return updated_profile;
end;
$$;

-- The client updates notification preferences through the profiles table.
drop function if exists public.get_notification_preferences();
drop function if exists public.update_notification_preferences(time);

create or replace function public.member_invite_status(invite public.member_invites)
returns text language sql stable
as $$ select case when invite.revoked_at is not null then 'revoked' when invite.claimed_at is not null then 'used' when invite.expires_at <= now() then 'expired' else 'active' end $$;

create or replace function public.create_member_invite(target_member_id_input uuid default null)
returns public.member_invites language plpgsql security definer set search_path = public
as $$
declare created_invite public.member_invites; current_mess uuid := public.current_mess_id();
begin
  if not public.is_current_mess_manager() then raise exception 'Only a manager can create member invite links'; end if;
  if target_member_id_input is not null and not exists (select 1 from public.members where id = target_member_id_input and mess_id = current_mess and profile_id is null and deleted_at is null) then raise exception 'Choose an active offline member in your mess'; end if;
  insert into public.member_invites (mess_id, target_member_id, created_by_profile_id) values (current_mess, target_member_id_input, auth.uid()) returning * into created_invite;
  return created_invite;
end;
$$;

create or replace function public.list_member_invites()
returns table(id uuid, target_member_id uuid, target_member_name text, expires_at timestamptz, created_at timestamptz, claimed_at timestamptz, revoked_at timestamptz, status text)
language sql stable security definer set search_path = public
as $$ select i.id, i.target_member_id, m.name, i.expires_at, i.created_at, i.claimed_at, i.revoked_at, public.member_invite_status(i) from public.member_invites i left join public.members m on m.id = i.target_member_id where i.mess_id = public.current_mess_id() and public.is_current_mess_manager() order by i.created_at desc $$;

create or replace function public.revoke_member_invite(invite_id_input uuid)
returns public.member_invites language plpgsql security definer set search_path = public
as $$
declare revoked_invite public.member_invites;
begin
  if not public.is_current_mess_manager() then raise exception 'Only a manager can revoke member invite links'; end if;
  update public.member_invites set revoked_at = now() where id = invite_id_input and mess_id = public.current_mess_id() and revoked_at is null and claimed_at is null and expires_at > now() returning * into revoked_invite;
  if not found then raise exception 'This active invite link was not found'; end if;
  return revoked_invite;
end;
$$;

drop function if exists public.get_member_invite_preview(uuid);

create or replace function public.get_member_invite_preview(invite_token text)
returns table(mess_name text, target_member_name text, expires_at timestamptz, status text)
language plpgsql stable security definer set search_path = public
as $$
declare invite_id uuid;
begin
  begin
    invite_id := invite_token::uuid;
  exception when invalid_text_representation then
    return;
  end;

  return query
    select mess.name, member.name, i.expires_at, public.member_invite_status(i)
    from public.member_invites i
    join public.messes mess on mess.id = i.mess_id
    left join public.members member on member.id = i.target_member_id
    where i.id = invite_id;
end;
$$;

create or replace function public.accept_member_invite(invite_token uuid)
returns public.members language plpgsql security definer set search_path = public
as $$
declare invite_row public.member_invites; profile_row public.profiles; accepted_member public.members; next_sort_order integer;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select * into invite_row from public.member_invites where id = invite_token for update;
  if not found then raise exception 'This invite link was not found'; end if;
  if invite_row.revoked_at is not null then raise exception 'This invite link has been revoked'; end if;
  if invite_row.expires_at <= now() then raise exception 'This invite link has expired'; end if;
  if invite_row.claimed_at is not null then raise exception 'This invite link has already been used'; end if;
  select * into profile_row from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Your profile is not ready yet. Please try again.'; end if;
  if profile_row.mess_id is not null then raise exception 'Your account already belongs to a mess'; end if;
  if invite_row.target_member_id is not null then
    update public.members set profile_id = auth.uid(), user_id = auth.uid() where id = invite_row.target_member_id and mess_id = invite_row.mess_id and profile_id is null and deleted_at is null returning * into accepted_member;
    if not found then raise exception 'The offline member for this invite is no longer available'; end if;
  else
    select coalesce(max(sort_order), -1) + 1 into next_sort_order from public.members where mess_id = invite_row.mess_id;
    insert into public.members (name, avatar, user_id, mess_id, profile_id, sort_order) values (profile_row.full_name, upper(substr(profile_row.full_name, 1, 2)), auth.uid(), invite_row.mess_id, auth.uid(), next_sort_order) returning * into accepted_member;
  end if;
  update public.profiles set mess_id = invite_row.mess_id, role = 'member', updated_at = now() where id = auth.uid();
  update public.member_invites set claimed_by_profile_id = auth.uid(), claimed_at = now() where id = invite_row.id;
  return accepted_member;
end;
$$;

create or replace function public.start_new_cycle(
  cycle_name_input text,
  started_at_input timestamptz default now(),
  pending_cycle_id_input uuid default null,
  carry_forwards_input jsonb default '[]'::jsonb
)
returns public.cycles language plpgsql security definer set search_path = public
as $$
declare
  current_mess uuid := public.current_mess_id();
  new_cycle public.cycles;
  pending_cycle public.cycles;
  carry_item jsonb;
  carry_member_id uuid;
  carry_member_name text;
  carry_amount numeric;
  previous_balance numeric;
  deposit_id uuid;
  processed_members uuid[] := '{}'::uuid[];
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if current_mess is null or not public.has_mess_role(array['manager']) then
    raise exception 'Only a mess manager can start a cycle';
  end if;
  if nullif(trim(cycle_name_input), '') is null then raise exception 'Cycle name is required'; end if;
  if carry_forwards_input is null or jsonb_typeof(carry_forwards_input) <> 'array' then
    raise exception 'Carry-forwards must be an array';
  end if;

  -- Serialize cycle creation for this mess before checking the active cycle.
  perform 1 from public.messes where id = current_mess for update;
  if not found then raise exception 'Mess not found'; end if;
  select * into new_cycle from public.cycles
  where mess_id = current_mess and status = 'active'
  for update;
  if found then
    -- A retry after a lost response returns the cycle already committed by this operation.
    if lower(new_cycle.name) = lower(trim(cycle_name_input)) then return new_cycle; end if;
    raise exception 'Close the current active cycle before starting another one';
  end if;

  if pending_cycle_id_input is not null then
    select * into pending_cycle
    from public.cycles
    where id = pending_cycle_id_input and mess_id = current_mess and status = 'pending'
    for update;
    if not found then raise exception 'Pending cycle was not found in your mess'; end if;
  elsif jsonb_array_length(carry_forwards_input) > 0 then
    raise exception 'A pending cycle is required for carry-forwards';
  end if;

  insert into public.cycles (name, status, user_id, mess_id, started_at)
  values (trim(cycle_name_input), 'active', auth.uid(), current_mess, coalesce(started_at_input, now()))
  returning * into new_cycle;

  for carry_item in select value from jsonb_array_elements(carry_forwards_input)
  loop
    if jsonb_typeof(carry_item) is distinct from 'object'
      or jsonb_typeof(carry_item -> 'memberId') is distinct from 'string'
      or jsonb_typeof(carry_item -> 'amount') is distinct from 'number' then
      raise exception 'Each carry-forward must include a memberId and numeric amount';
    end if;

    begin
      carry_member_id := (carry_item ->> 'memberId')::uuid;
      carry_amount := round((carry_item ->> 'amount')::numeric, 2);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Carry-forward member or amount is invalid';
    end;

    if carry_amount <= 0 then raise exception 'Carry-forward amounts must be greater than zero'; end if;
    if carry_member_id = any(processed_members) then raise exception 'A member can only have one carry-forward'; end if;
    processed_members := array_append(processed_members, carry_member_id);

    select name into carry_member_name
    from public.members
    where id = carry_member_id and mess_id = current_mess;
    if not found then raise exception 'Carry-forward member was not found in your mess'; end if;

    select coalesce(sum(amount), 0) into previous_balance
    from public.cycle_deposits
    where mess_id = current_mess and cycle_id = pending_cycle.id and member_id = carry_member_id;
    insert into public.cycle_deposits (user_id, profile_id, mess_id, cycle_id, member_id, amount, note)
    values (auth.uid(), auth.uid(), current_mess, pending_cycle.id, carry_member_id, -carry_amount,
      'Carry-forward correction — balance moved to next cycle')
    returning id into deposit_id;

    insert into public.cycle_deposits (user_id, profile_id, mess_id, cycle_id, member_id, amount, note)
    values (auth.uid(), auth.uid(), current_mess, new_cycle.id, carry_member_id, carry_amount,
      'Carry-forward from ' || pending_cycle.name)
    returning id into deposit_id;
  end loop;

  return new_cycle;
end;
$$;

create or replace function public.post_notice(
  content_input text,
  expires_at_input timestamptz,
  title_input text default null
)
returns public.notices language plpgsql security definer set search_path = public
as $$
declare
  current_profile public.profiles;
  created_notice public.notices;
  effective_title text := coalesce(nullif(trim(title_input), ''), 'Notice');
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select * into current_profile from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  if nullif(trim(content_input), '') is null then raise exception 'Notice content is required'; end if;
  if expires_at_input is null or expires_at_input <= now() then raise exception 'Notice expiry must be in the future'; end if;

  if current_profile.mess_id is not null then
    if not public.has_mess_role(array['manager', 'coordinator']) then
      raise exception 'Only mess managers and coordinators can post notices';
    end if;
    perform 1 from public.messes where id = current_profile.mess_id for update;
    if not found then raise exception 'Mess not found'; end if;
    update public.notices set expires_at = now()
    where mess_id = current_profile.mess_id and expires_at > now();
  else
    update public.notices set expires_at = now()
    where mess_id is null and user_id = auth.uid() and expires_at > now();
  end if;

  insert into public.notices (user_id, profile_id, mess_id, title, content, expires_at)
  values (auth.uid(), auth.uid(), current_profile.mess_id, effective_title, trim(content_input), expires_at_input)
  returning * into created_notice;
  return created_notice;
end;
$$;

create or replace function public.mark_cycle_closed(cycle_id_input uuid)
returns public.cycles language plpgsql security definer set search_path = public
as $$
declare
  current_mess uuid := public.current_mess_id();
  closed_cycle public.cycles;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if current_mess is null or not public.has_mess_role(array['manager']) then
    raise exception 'Only a mess manager can finalize a cycle';
  end if;
  perform 1 from public.messes where id = current_mess for update;
  if not found then raise exception 'Mess not found'; end if;

  update public.cycles
  set status = 'closed', finalized_at = now()
  where id = cycle_id_input and mess_id = current_mess and status = 'pending'
  returning * into closed_cycle;
  if not found then raise exception 'Pending cycle was not found in your mess'; end if;

  delete from public.changelog_entries
  where cycle_id = cycle_id_input and mess_id = current_mess;
  return closed_cycle;
end;
$$;

create or replace function public.reorder_mess_members(member_ids_input uuid[])
returns void language plpgsql security definer set search_path = public
as $$
declare
  current_mess uuid := public.current_mess_id();
  active_member_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if current_mess is null or not public.has_mess_role(array['manager']) then
    raise exception 'Only a mess manager can reorder members';
  end if;
  perform 1 from public.messes where id = current_mess for update;
  if not found then raise exception 'Mess not found'; end if;

  select count(*) into active_member_count
  from public.members where mess_id = current_mess and deleted_at is null;
  if member_ids_input is null
     or cardinality(member_ids_input) <> active_member_count
     or cardinality(member_ids_input) <> (select count(distinct input.member_id) from unnest(member_ids_input) as input(member_id)) then
    raise exception 'Member order must contain every active member exactly once';
  end if;
  if exists (
    select 1
    from unnest(member_ids_input) as input(member_id)
    left join public.members m on m.id = input.member_id and m.mess_id = current_mess and m.deleted_at is null
    where m.id is null
  ) then
    raise exception 'Member order contains a member outside your mess';
  end if;

  update public.members m
  set sort_order = ordered.ordinality - 1
  from unnest(member_ids_input) with ordinality as ordered(member_id, ordinality)
  where m.id = ordered.member_id and m.mess_id = current_mess and m.deleted_at is null;
end;
$$;

-- The old code-based join path was retired by the latest migration.
drop function if exists public.join_mess(text);

-- ── remove_mess_member ─────────────────────────────────────────────────────────
-- Called by the manager when removing a member from the roster.
-- Soft-deletes the member row AND clears the linked profile's mess_id/role
-- so RLS immediately revokes access.
create or replace function public.remove_mess_member(member_id_input uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  current_mess uuid := public.current_mess_id();
  target_profile_id uuid;
  has_history boolean;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if current_mess is null or not public.has_mess_role(array['manager']) then
    raise exception 'Only a mess manager can remove members';
  end if;

  -- Look up the member and lock the row.
  select m.profile_id into target_profile_id
  from public.members m
  where m.id = member_id_input and m.mess_id = current_mess and m.deleted_at is null
  for update;
  if not found then raise exception 'Member was not found in your mess'; end if;

  -- A manager cannot remove themselves through this RPC.
  if target_profile_id = auth.uid() then
    raise exception 'You cannot remove yourself. Use "Leave Mess" or "Transfer Manager" instead.';
  end if;

  -- Check for meal or deposit history.
  has_history := exists (select 1 from public.meal_logs where member_id = member_id_input)
              or exists (select 1 from public.cycle_deposits where member_id = member_id_input);

  -- Soft-delete the member roster row.
  update public.members
  set deleted_at = now(),
      delete_expires_at = case when has_history then null else now() + interval '10 seconds' end
  where id = member_id_input and mess_id = current_mess and deleted_at is null;

  -- Clear the linked profile's mess association so RLS cuts off access.
  if target_profile_id is not null then
    update public.profiles
    set mess_id = null, role = 'member', updated_at = now()
    where id = target_profile_id and mess_id = current_mess;
  end if;
end;
$$;

-- ── leave_mess ─────────────────────────────────────────────────────────────────
-- Allows a non-manager member to voluntarily leave the mess.
-- Soft-deletes their member row and clears their profile's mess_id.
create or replace function public.leave_mess()
returns void language plpgsql security definer set search_path = public
as $$
declare
  current_mess uuid;
  caller_role text;
  member_row public.members;
  has_history boolean;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;

  select mess_id, role into current_mess, caller_role
  from public.profiles where id = auth.uid() for update;
  if current_mess is null then raise exception 'You are not in a mess'; end if;
  if caller_role = 'manager' then
    raise exception 'Managers must transfer management before leaving. Use "Transfer Manager" first.';
  end if;

  -- Soft-delete the member roster row linked to this profile.
  select * into member_row
  from public.members
  where profile_id = auth.uid() and mess_id = current_mess and deleted_at is null
  for update;

  if found then
    has_history := exists (select 1 from public.meal_logs where member_id = member_row.id)
                or exists (select 1 from public.cycle_deposits where member_id = member_row.id);

    update public.members
    set deleted_at = now(),
        delete_expires_at = case when has_history then null else now() + interval '10 seconds' end
    where id = member_row.id;
  end if;

  -- Clear profile association.
  update public.profiles
  set mess_id = null, role = 'member', updated_at = now()
  where id = auth.uid();
end;
$$;

-- ── transfer_manager ───────────────────────────────────────────────────────────
-- Transfers the manager role to another linked profile in the same mess.
-- The caller is demoted to a regular member and their profile stays in the mess.
create or replace function public.transfer_manager(new_manager_profile_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  current_mess uuid := public.current_mess_id();
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if current_mess is null or not public.has_mess_role(array['manager']) then
    raise exception 'Only the current manager can transfer management';
  end if;
  if new_manager_profile_id = auth.uid() then
    raise exception 'You are already the manager';
  end if;

  -- Verify the target profile belongs to this mess and has a linked member row.
  if not exists (
    select 1 from public.profiles p
    join public.members m on m.profile_id = p.id and m.mess_id = current_mess and m.deleted_at is null
    where p.id = new_manager_profile_id and p.mess_id = current_mess
  ) then
    raise exception 'The target profile is not a linked member of this mess';
  end if;

  -- Promote the new manager.
  update public.profiles
  set role = 'manager', updated_at = now()
  where id = new_manager_profile_id and mess_id = current_mess;

  -- Update mess creator_id to the new manager.
  update public.messes
  set creator_id = new_manager_profile_id, updated_at = now()
  where id = current_mess;

  -- Demote the current manager to a regular member.
  update public.profiles
  set role = 'member', updated_at = now()
  where id = auth.uid();
end;
$$;

-- ── delete_user_account ────────────────────────────────────────────────────────
-- Permanently deletes the authenticated user's account from auth.users.
-- 1. If caller is manager of a mess that has other members/profiles:
--    raises an exception instructing them to transfer management or delete the mess first.
-- 2. If caller is manager and the only person in the mess:
--    completely removes the mess and all associated records.
-- 3. If caller is a non-manager member in a mess:
--    soft-deletes their roster row (with 10-second grace if no history) and unlinks profile.
-- 4. Removes user's push subscriptions and deletes the row from auth.users,
--    which cascades to public.profiles. Historical logs have user_id set to null.
create or replace function public.delete_user_account()
returns void language plpgsql security definer set search_path = public, auth
as $$
declare
  caller_uid uuid := auth.uid();
  caller_mess_id uuid;
  caller_role text;
  other_members_count integer;
  member_row public.members;
  has_history boolean;
begin
  if caller_uid is null then
    raise exception 'Authentication is required';
  end if;

  -- Read caller's mess association and role
  select mess_id, role into caller_mess_id, caller_role
  from public.profiles
  where id = caller_uid;

  if caller_mess_id is not null then
    if caller_role = 'manager' then
      -- Count other profiles or active member rows in this mess
      select count(*) into other_members_count
      from (
        select id from public.profiles
        where mess_id = caller_mess_id and id <> caller_uid
        union
        select id from public.members
        where mess_id = caller_mess_id and deleted_at is null and (profile_id is null or profile_id <> caller_uid)
      ) sub;

      if other_members_count > 0 then
        raise exception 'You are the manager of an active mess with other members. Please transfer management or delete the mess before deleting your account.';
      else
        -- Sole member: wipe the mess cleanly
        delete from public.member_invites where mess_id = caller_mess_id;
        delete from public.meal_off_requests where mess_id = caller_mess_id;
        delete from public.notification_deliveries where mess_id = caller_mess_id;
        delete from public.push_subscriptions where mess_id = caller_mess_id;
        delete from public.notices where mess_id = caller_mess_id;
        delete from public.share_links where mess_id = caller_mess_id;
        delete from public.changelog_entries where mess_id = caller_mess_id;
        delete from public.cycle_deposits where mess_id = caller_mess_id;
        delete from public.meal_logs where mess_id = caller_mess_id;
        delete from public.expenses where mess_id = caller_mess_id;
        delete from public.cycles where mess_id = caller_mess_id;
        delete from public.members where mess_id = caller_mess_id;
        update public.profiles set mess_id = null, role = 'member', updated_at = now() where mess_id = caller_mess_id;
        delete from public.messes where id = caller_mess_id;
      end if;
    else
      -- Regular member: soft-delete their member row if linked
      select * into member_row
      from public.members
      where profile_id = caller_uid and mess_id = caller_mess_id and deleted_at is null
      for update;

      if found then
        has_history := exists (select 1 from public.meal_logs where member_id = member_row.id)
                    or exists (select 1 from public.cycle_deposits where member_id = member_row.id);

        update public.members
        set deleted_at = now(),
            delete_expires_at = case when has_history then null else now() + interval '10 seconds' end,
            profile_id = null
        where id = member_row.id;
      end if;
    end if;
  end if;

  -- Delete push subscriptions for this user
  delete from public.push_subscriptions where user_id = caller_uid;

  -- Delete from auth.users (cascades to public.profiles)
  delete from auth.users where id = caller_uid;
end;
$$;

-- ── Audit Log Triggers ────────────────────────────────────────────────────────
-- Record audit rows atomically from mutations inside the database.
-- Uses auth.uid() directly to prevent client forgery of profile_id/user_id.

create or replace function public.audit_expenses()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_mess_id uuid;
  v_cycle_id uuid;
  v_action text;
  v_title text;
  v_changes jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    v_actor := coalesce(NEW.profile_id, NEW.user_id, OLD.profile_id, OLD.user_id);
  end if;

  v_mess_id := coalesce(NEW.mess_id, OLD.mess_id);
  v_cycle_id := coalesce(NEW.cycle_id, OLD.cycle_id);

  if TG_OP = 'INSERT' then
    if NEW.deleted_at is not null then return NEW; end if;
    v_action := 'create';
    v_title := 'Added ' || NEW.type || ' expense';
    v_changes := jsonb_build_array(
      jsonb_build_object('field', 'description', 'label', 'Description', 'value', NEW.description),
      jsonb_build_object('field', 'amount', 'label', 'Amount', 'value', NEW.amount),
      jsonb_build_object('field', 'type', 'label', 'Type', 'value', NEW.type),
      jsonb_build_object('field', 'paid_by', 'label', 'Paid By', 'value', NEW.paid_by),
      jsonb_build_object('field', 'date', 'label', 'Date', 'value', NEW.date::text)
    );
  elsif TG_OP = 'UPDATE' then
    if OLD.deleted_at is null and NEW.deleted_at is not null then
      v_action := 'delete';
      v_title := 'Deleted ' || OLD.type || ' expense';
      v_changes := jsonb_build_array(
        jsonb_build_object('field', 'description', 'label', 'Description', 'value', OLD.description),
        jsonb_build_object('field', 'amount', 'label', 'Amount', 'value', OLD.amount),
        jsonb_build_object('field', 'type', 'label', 'Type', 'value', OLD.type),
        jsonb_build_object('field', 'paid_by', 'label', 'Paid By', 'value', OLD.paid_by),
        jsonb_build_object('field', 'date', 'label', 'Date', 'value', OLD.date::text)
      );
    elsif OLD.deleted_at is not null and NEW.deleted_at is null then
      v_action := 'create';
      v_title := 'Restored ' || NEW.type || ' expense';
      v_changes := jsonb_build_array(
        jsonb_build_object('field', 'description', 'label', 'Description', 'value', NEW.description),
        jsonb_build_object('field', 'amount', 'label', 'Amount', 'value', NEW.amount),
        jsonb_build_object('field', 'type', 'label', 'Type', 'value', NEW.type),
        jsonb_build_object('field', 'paid_by', 'label', 'Paid By', 'value', NEW.paid_by),
        jsonb_build_object('field', 'date', 'label', 'Date', 'value', NEW.date::text)
      );
    else
      if OLD.description <> NEW.description then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'description', 'label', 'Description', 'from', OLD.description, 'to', NEW.description));
      end if;
      if OLD.amount <> NEW.amount then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'amount', 'label', 'Amount', 'from', OLD.amount, 'to', NEW.amount));
      end if;
      if OLD.type <> NEW.type then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'type', 'label', 'Type', 'from', OLD.type, 'to', NEW.type));
      end if;
      if OLD.paid_by <> NEW.paid_by then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'paid_by', 'label', 'Paid By', 'from', OLD.paid_by, 'to', NEW.paid_by));
      end if;
      if OLD.date <> NEW.date then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'date', 'label', 'Date', 'from', OLD.date::text, 'to', NEW.date::text));
      end if;

      if jsonb_array_length(v_changes) = 0 then
        return NEW;
      end if;

      v_action := 'update';
      v_title := 'Updated ' || NEW.type || ' expense';
    end if;
  elsif TG_OP = 'DELETE' then
    v_action := 'delete';
    v_title := 'Deleted ' || OLD.type || ' expense';
    v_changes := jsonb_build_array(
      jsonb_build_object('field', 'description', 'label', 'Description', 'value', OLD.description),
      jsonb_build_object('field', 'amount', 'label', 'Amount', 'value', OLD.amount),
      jsonb_build_object('field', 'type', 'label', 'Type', 'value', OLD.type),
      jsonb_build_object('field', 'paid_by', 'label', 'Paid By', 'value', OLD.paid_by),
      jsonb_build_object('field', 'date', 'label', 'Date', 'value', OLD.date::text)
    );
  end if;

  if v_mess_id is not null and v_cycle_id is not null then
    insert into public.changelog_entries (
      user_id, profile_id, mess_id, cycle_id, entity_type, entity_id, action, title, changes, created_at
    ) values (
      v_actor, v_actor, v_mess_id, v_cycle_id, 'expense', coalesce(NEW.id, OLD.id), v_action, v_title, v_changes, now()
    );
  end if;

  return coalesce(NEW, OLD);
end;
$$;

create or replace function public.audit_cycle_deposits()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_mess_id uuid;
  v_cycle_id uuid;
  v_member_name text;
  v_prev_balance numeric;
  v_action text;
  v_title text;
  v_changes jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    v_actor := coalesce(NEW.profile_id, NEW.user_id, OLD.profile_id, OLD.user_id);
  end if;

  v_mess_id := coalesce(NEW.mess_id, OLD.mess_id);
  v_cycle_id := coalesce(NEW.cycle_id, OLD.cycle_id);

  select name into v_member_name
  from public.members
  where id = coalesce(NEW.member_id, OLD.member_id);

  if TG_OP = 'INSERT' then
    select coalesce(sum(amount), 0) into v_prev_balance
    from public.cycle_deposits
    where cycle_id = NEW.cycle_id and member_id = NEW.member_id and id <> NEW.id;

    v_action := 'create';
    v_title := 'Added deposit for ' || coalesce(v_member_name, 'member');
    v_changes := jsonb_build_array(
      jsonb_build_object('field', 'member', 'label', 'Member', 'value', coalesce(v_member_name, 'member')),
      jsonb_build_object('field', 'deposit_balance', 'label', 'Deposit Balance', 'from', v_prev_balance, 'to', v_prev_balance + NEW.amount),
      jsonb_build_object('field', 'transaction_amount', 'label', 'Transaction', 'value', NEW.amount)
    );
    if NEW.note is not null and trim(NEW.note) <> '' then
      v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'note', 'label', 'Note', 'value', NEW.note));
    end if;
  elsif TG_OP = 'UPDATE' then
    if OLD.amount = NEW.amount and OLD.note is not distinct from NEW.note then
      return NEW;
    end if;

    select coalesce(sum(amount), 0) into v_prev_balance
    from public.cycle_deposits
    where cycle_id = NEW.cycle_id and member_id = NEW.member_id and id <> NEW.id;

    v_action := 'update';
    v_title := 'Updated deposit for ' || coalesce(v_member_name, 'member');
    v_changes := jsonb_build_array(
      jsonb_build_object('field', 'member', 'label', 'Member', 'value', coalesce(v_member_name, 'member')),
      jsonb_build_object('field', 'deposit_balance', 'label', 'Deposit Balance', 'from', v_prev_balance + OLD.amount, 'to', v_prev_balance + NEW.amount),
      jsonb_build_object('field', 'transaction_amount', 'label', 'Transaction', 'value', NEW.amount)
    );
    if NEW.note is not null and trim(NEW.note) <> '' then
      v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'note', 'label', 'Note', 'value', NEW.note));
    end if;
  elsif TG_OP = 'DELETE' then
    select coalesce(sum(amount), 0) into v_prev_balance
    from public.cycle_deposits
    where cycle_id = OLD.cycle_id and member_id = OLD.member_id and id <> OLD.id;

    v_action := 'delete';
    v_title := 'Removed deposit for ' || coalesce(v_member_name, 'member');
    v_changes := jsonb_build_array(
      jsonb_build_object('field', 'member', 'label', 'Member', 'value', coalesce(v_member_name, 'member')),
      jsonb_build_object('field', 'deposit_balance', 'label', 'Deposit Balance', 'from', v_prev_balance + OLD.amount, 'to', v_prev_balance),
      jsonb_build_object('field', 'transaction_amount', 'label', 'Transaction', 'value', OLD.amount)
    );
    if OLD.note is not null and trim(OLD.note) <> '' then
      v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'note', 'label', 'Note', 'value', OLD.note));
    end if;
  end if;

  if v_mess_id is not null and v_cycle_id is not null then
    insert into public.changelog_entries (
      user_id, profile_id, mess_id, cycle_id, entity_type, entity_id, action, title, changes, created_at
    ) values (
      v_actor, v_actor, v_mess_id, v_cycle_id, 'deposit', coalesce(NEW.id, OLD.id), v_action, v_title, v_changes, now()
    );
  end if;

  return coalesce(NEW, OLD);
end;
$$;

create or replace function public.audit_meal_logs()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_mess_id uuid;
  v_cycle_id uuid;
  v_member_name text;
  v_action text;
  v_title text;
  v_changes jsonb;
  v_batch_key text;
begin
  if v_actor is null then
    v_actor := coalesce(NEW.profile_id, NEW.user_id, OLD.profile_id, OLD.user_id);
  end if;

  v_mess_id := coalesce(NEW.mess_id, OLD.mess_id);
  v_cycle_id := coalesce(NEW.cycle_id, OLD.cycle_id);

  select name into v_member_name
  from public.members
  where id = coalesce(NEW.member_id, OLD.member_id);

  if TG_OP = 'INSERT' then
    if NEW.count = 0 then return NEW; end if;
    v_action := 'create';
    v_title := 'Updated meal logs';
    v_changes := jsonb_build_array(
      jsonb_build_object('field', 'date', 'label', 'Date', 'value', NEW.date::text),
      jsonb_build_object('field', 'member:' || NEW.member_id::text, 'label', coalesce(v_member_name, 'Member'), 'from', 0, 'to', NEW.count)
    );
  elsif TG_OP = 'UPDATE' then
    if OLD.count = NEW.count then return NEW; end if;
    v_action := case when NEW.count = 0 then 'delete' when OLD.count = 0 then 'create' else 'update' end;
    v_title := 'Updated meal logs';
    v_changes := jsonb_build_array(
      jsonb_build_object('field', 'date', 'label', 'Date', 'value', NEW.date::text),
      jsonb_build_object('field', 'member:' || NEW.member_id::text, 'label', coalesce(v_member_name, 'Member'), 'from', OLD.count, 'to', NEW.count)
    );
  elsif TG_OP = 'DELETE' then
    if OLD.count = 0 then return OLD; end if;
    v_action := 'delete';
    v_title := 'Updated meal logs';
    v_changes := jsonb_build_array(
      jsonb_build_object('field', 'date', 'label', 'Date', 'value', OLD.date::text),
      jsonb_build_object('field', 'member:' || OLD.member_id::text, 'label', coalesce(v_member_name, 'Member'), 'from', OLD.count, 'to', 0)
    );
  end if;

  if v_mess_id is not null and v_cycle_id is not null then
    v_batch_key := format('meal_log:%s:%s:%s', txid_current(), v_cycle_id, coalesce(NEW.date, OLD.date));
    insert into public.changelog_entries as current_entry (
      user_id, profile_id, mess_id, cycle_id, entity_type, entity_id, action, title, changes, created_at, batch_key
    ) values (
      v_actor, v_actor, v_mess_id, v_cycle_id, 'meal_log', coalesce(NEW.id, OLD.id), v_action, v_title, v_changes, now(), v_batch_key
    )
    on conflict (batch_key) where batch_key is not null do update
    set action = case
          when current_entry.action = excluded.action then current_entry.action
          else 'update'
        end,
        title = 'Updated meal logs',
        changes = current_entry.changes || (
          select coalesce(jsonb_agg(item.change), '[]'::jsonb)
          from jsonb_array_elements(excluded.changes) as item(change)
          where item.change ->> 'field' <> 'date'
        );
  end if;

  return coalesce(NEW, OLD);
end;
$$;

create or replace function public.audit_members()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_mess_id uuid;
  v_cycle_id uuid;
  v_action text;
  v_title text;
  v_changes jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    v_actor := coalesce(NEW.profile_id, NEW.user_id, OLD.profile_id, OLD.user_id);
  end if;

  v_mess_id := coalesce(NEW.mess_id, OLD.mess_id);

  select id into v_cycle_id
  from public.cycles
  where mess_id = v_mess_id and status = 'active'
  order by started_at desc limit 1;

  if v_cycle_id is null then
    select id into v_cycle_id
    from public.cycles
    where mess_id = v_mess_id
    order by started_at desc limit 1;
  end if;

  if TG_OP = 'INSERT' then
    if NEW.deleted_at is not null then return NEW; end if;
    v_action := 'create';
    v_title := 'Added member ' || NEW.name;
    v_changes := jsonb_build_array(jsonb_build_object('field', 'name', 'label', 'Name', 'value', NEW.name));
  elsif TG_OP = 'UPDATE' then
    if OLD.deleted_at is null and NEW.deleted_at is not null then
      v_action := 'delete';
      v_title := 'Archived member ' || OLD.name;
      v_changes := jsonb_build_array(jsonb_build_object('field', 'name', 'label', 'Name', 'value', OLD.name));
    elsif OLD.deleted_at is not null and NEW.deleted_at is null then
      v_action := 'create';
      v_title := 'Restored member ' || NEW.name;
      v_changes := jsonb_build_array(jsonb_build_object('field', 'name', 'label', 'Name', 'value', NEW.name));
    else
      if OLD.name <> NEW.name then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'name', 'label', 'Name', 'from', OLD.name, 'to', NEW.name));
      end if;
      if OLD.avatar is distinct from NEW.avatar then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'avatar', 'label', 'Avatar', 'from', OLD.avatar, 'to', NEW.avatar));
      end if;

      if jsonb_array_length(v_changes) = 0 then
        return NEW;
      end if;

      v_action := 'update';
      v_title := 'Updated member ' || NEW.name;
    end if;
  elsif TG_OP = 'DELETE' then
    v_action := 'delete';
    v_title := 'Deleted member ' || OLD.name;
    v_changes := jsonb_build_array(jsonb_build_object('field', 'name', 'label', 'Name', 'value', OLD.name));
  end if;

  if v_mess_id is not null then
    insert into public.changelog_entries (
      user_id, profile_id, mess_id, cycle_id, entity_type, entity_id, action, title, changes, created_at
    ) values (
      v_actor, v_actor, v_mess_id, v_cycle_id, 'member', coalesce(NEW.id, OLD.id), v_action, v_title, v_changes, now()
    );
  end if;

  return coalesce(NEW, OLD);
end;
$$;

revoke all on function public.create_mess(text), public.set_mess_role(uuid, text), public.update_mess_settings(text), public.delete_current_mess(), public.update_user_profile(text, text) from public;
grant execute on function public.create_mess(text), public.set_mess_role(uuid, text), public.update_mess_settings(text), public.delete_current_mess(), public.update_user_profile(text, text) to authenticated;
revoke all on function public.link_member_profile(uuid, uuid), public.create_member_invite(uuid), public.list_member_invites(), public.revoke_member_invite(uuid), public.accept_member_invite(uuid) from public;
grant execute on function public.link_member_profile(uuid, uuid), public.create_member_invite(uuid), public.list_member_invites(), public.revoke_member_invite(uuid), public.accept_member_invite(uuid) to authenticated;
revoke all on function public.get_member_invite_preview(text) from public;
grant execute on function public.get_member_invite_preview(text) to anon, authenticated;
revoke all on function public.start_new_cycle(text, timestamptz, uuid, jsonb), public.post_notice(text, timestamptz, text), public.mark_cycle_closed(uuid) from public;
grant execute on function public.start_new_cycle(text, timestamptz, uuid, jsonb), public.post_notice(text, timestamptz, text), public.mark_cycle_closed(uuid) to authenticated;
revoke all on function public.reorder_mess_members(uuid[]) from public;
grant execute on function public.reorder_mess_members(uuid[]) to authenticated;
revoke all on function public.remove_mess_member(uuid), public.leave_mess(), public.transfer_manager(uuid), public.delete_user_account() from public;
grant execute on function public.remove_mess_member(uuid), public.leave_mess(), public.transfer_manager(uuid), public.delete_user_account() to authenticated;

-- Freeze balances for pending cycles created before settlement snapshots existed.
with eligible_cycles as (
  select c.id, c.members_snapshot
  from public.cycles c
  where c.status in ('pending', 'closed')
    and c.settlement_snapshot is null
    and jsonb_typeof(c.members_snapshot) = 'array'
), roster as (
  select c.id as cycle_id, (entry.value ->> 'id')::uuid as member_id, entry.ordinality
  from eligible_cycles c
  cross join lateral jsonb_array_elements(c.members_snapshot) with ordinality as entry(value, ordinality)
  where jsonb_typeof(entry.value -> 'id') = 'string'
), totals as (
  select c.id as cycle_id,
    (select coalesce(sum(d.amount), 0) from public.cycle_deposits d join roster r on r.cycle_id = c.id and r.member_id = d.member_id where d.cycle_id = c.id) as deposits,
    (select coalesce(sum(e.amount), 0) from public.expenses e where e.cycle_id = c.id and e.deleted_at is null and e.type = 'meal') as meal_expenses,
    (select coalesce(sum(e.amount), 0) from public.expenses e where e.cycle_id = c.id and e.deleted_at is null and e.type = 'utility') as utility_expenses,
    (select coalesce(sum(l.count), 0) from public.meal_logs l join roster r on r.cycle_id = c.id and r.member_id = l.member_id where l.cycle_id = c.id) as meals,
    (select count(*) from roster r where r.cycle_id = c.id) as member_count
  from eligible_cycles c
), member_inputs as (
  select r.cycle_id, r.member_id, r.ordinality,
    t.deposits, t.meal_expenses, t.utility_expenses, t.meals, t.member_count,
    coalesce((select sum(d.amount) from public.cycle_deposits d where d.cycle_id = r.cycle_id and d.member_id = r.member_id), 0) as deposited,
    coalesce((select sum(l.count) from public.meal_logs l where l.cycle_id = r.cycle_id and l.member_id = r.member_id), 0) as meals_eaten
  from roster r
  join totals t on t.cycle_id = r.cycle_id
), raw_balances as (
  select *,
    deposited
      - case when meals > 0 then meals_eaten * meal_expenses / meals else 0 end
      - case when member_count > 0 then utility_expenses / member_count else 0 end as raw_balance
  from member_inputs
), cleaned as (
  select *,
    case
      when abs(floor((raw_balance + 0.000000000000001) * 10000 + 0.5) / 10000) < 0.000001 then 0::numeric
      else floor((raw_balance + 0.000000000000001) * 10000 + 0.5) / 10000
    end as balance
  from raw_balances
), floored as (
  select *, floor(balance) as base_balance, balance - floor(balance) as remainder
  from cleaned
), ranked as (
  select *,
    row_number() over (partition by cycle_id order by remainder desc, member_id) as remainder_rank,
    sum(base_balance) over (partition by cycle_id) as sum_floor,
    count(*) over (partition by cycle_id) as allocation_count,
    floor((deposits - meal_expenses - utility_expenses) + 0.5) as target_balance
  from floored
), allocated as (
  select *,
    base_balance + case
      when remainder_rank <= greatest(0, least(allocation_count, target_balance - sum_floor)) then 1
      else 0
    end as final_balance
  from ranked
), snapshots as (
  select cycle_id,
    jsonb_agg(jsonb_build_object(
      'memberId', member_id,
      'balance', final_balance,
      'deposited', deposited
    ) order by ordinality) as settlement_snapshot
  from allocated
  group by cycle_id
)
update public.cycles c
set settlement_snapshot = s.settlement_snapshot
from snapshots s
where c.id = s.cycle_id and c.settlement_snapshot is null;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.search_changelog_entries(
  cycle_ids_input uuid[],
  entity_type_input text,
  action_input text,
  search_input text,
  offset_input integer,
  limit_input integer
)
returns table (
  id uuid,
  cycle_id uuid,
  user_id uuid,
  profile_id uuid,
  entity_type text,
  entity_id uuid,
  action text,
  title text,
  changes jsonb,
  created_at timestamptz,
  actor_profile_id uuid,
  actor_full_name text,
  actor_picture_url text,
  actor_role text
)
language sql stable security invoker set search_path = public
as $$
  select entry.id,
    entry.cycle_id,
    entry.user_id,
    entry.profile_id,
    entry.entity_type,
    entry.entity_id,
    entry.action,
    entry.title,
    entry.changes,
    entry.created_at,
    actor.id as actor_profile_id,
    actor.full_name as actor_full_name,
    actor.picture_url as actor_picture_url,
    actor.role::text as actor_role
  from public.changelog_entries entry
  left join public.profiles actor on actor.id = coalesce(entry.profile_id, entry.user_id)
  where entry.mess_id = (select public.current_mess_id())
    and entry.cycle_id = any(cycle_ids_input)
    and (entity_type_input = 'all' or entry.entity_type = entity_type_input)
    and (
      action_input = 'all'
      or entry.action = action_input
    )
    and (
      nullif(trim(search_input), '') is null
      or position(
        lower(trim(search_input)) in lower(concat_ws(' ', entry.title, entry.changes::text, actor.full_name))
      ) > 0
    )
  order by entry.created_at desc
  offset greatest(coalesce(offset_input, 0), 0)
  limit least(greatest(coalesce(limit_input, 50), 1), 100);
$$;

revoke all on function public.search_changelog_entries(uuid[], text, text, text, integer, integer) from public;
grant execute on function public.search_changelog_entries(uuid[], text, text, text, integer, integer) to authenticated;

create or replace function public.save_meal_logs(
  cycle_id_input uuid,
  date_input date,
  entries_input jsonb,
  expected_input jsonb
)
returns setof public.meal_logs
language plpgsql security invoker set search_path = public
as $$
declare
  v_entry jsonb;
  v_expected jsonb;
  v_current public.meal_logs%rowtype;
  v_member_id uuid;
  v_count numeric;
  v_expected_count numeric;
  v_expected_updated_at timestamptz;
  v_expected_exists boolean;
  v_current_exists boolean;
  v_mess_id uuid := public.current_mess_id();
begin
  if auth.uid() is null or v_mess_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if cycle_id_input is null or date_input is null or entries_input is null or expected_input is null
    or jsonb_typeof(entries_input) <> 'array'
    or jsonb_typeof(expected_input) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid meal log save payload';
  end if;

  if not exists (
    select 1 from public.cycles
    where id = cycle_id_input and mess_id = v_mess_id
  ) then
    raise exception using errcode = '42501', message = 'Cycle is not in the current mess';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(entries_input) as item(value)
    where nullif(value ->> 'memberId', '') is null
      or nullif(value ->> 'count', '') is null
      or (value ->> 'count')::numeric < 0
  ) or (
    select count(*) <> count(distinct value ->> 'memberId')
    from jsonb_array_elements(entries_input) as item(value)
  ) then
    raise exception using errcode = '22023', message = 'Invalid or duplicate meal log entries';
  end if;

  for v_entry in
    select value from jsonb_array_elements(entries_input) as item(value)
    order by value ->> 'memberId'
  loop
    v_member_id := (v_entry ->> 'memberId')::uuid;
    v_count := (v_entry ->> 'count')::numeric;

    if not exists (
      select 1 from public.members
      where id = v_member_id and mess_id = v_mess_id
    ) then
      raise exception using errcode = '42501', message = 'Member is not in the current mess';
    end if;

    select value into v_expected
    from jsonb_array_elements(expected_input) as item(value)
    where value ->> 'memberId' = v_member_id::text;
    if not found then
      raise exception using errcode = '22023', message = 'Missing expected meal log version';
    end if;
    v_expected_exists := coalesce((v_expected ->> 'exists')::boolean, false);
    v_expected_count := coalesce((v_expected ->> 'count')::numeric, 0);
    v_expected_updated_at := nullif(v_expected ->> 'updatedAt', '')::timestamptz;

    select * into v_current
    from public.meal_logs
    where cycle_id = cycle_id_input
      and date = date_input
      and member_id = v_member_id
    for update;
    v_current_exists := found;

    if v_expected_exists <> v_current_exists
      or (v_expected_exists and (
        v_current.count <> v_expected_count
        or (v_expected_updated_at is not null and v_current.updated_at <> v_expected_updated_at)
      )) then
      raise exception using errcode = 'P0001', message = 'MEAL_LOG_CONFLICT: This meal log changed on another device. Reload it before saving again.';
    end if;

    if v_current_exists then
      if v_current.count <> v_count then
        update public.meal_logs set count = v_count where id = v_current.id;
      end if;
    elsif v_count > 0 then
      insert into public.meal_logs (member_id, cycle_id, date, count, mess_id, user_id)
      values (v_member_id, cycle_id_input, date_input, v_count, v_mess_id, auth.uid());
    end if;
  end loop;

  return query
  select ml.* from public.meal_logs ml
  where ml.cycle_id = cycle_id_input
    and ml.date = date_input
    and ml.member_id in (
      select (value ->> 'memberId')::uuid
      from jsonb_array_elements(entries_input) as item(value)
    )
  order by ml.member_id;
end;
$$;

revoke all on function public.save_meal_logs(uuid, date, jsonb, jsonb) from public;
grant execute on function public.save_meal_logs(uuid, date, jsonb, jsonb) to authenticated;

