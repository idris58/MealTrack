-- Consolidated final RPC and trigger-function definitions.

create or replace function public.handle_auth_user_profile()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, notification_preferences)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'name'), ''), nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), nullif(split_part(new.email, '@', 1), ''), 'Member'), new.email,
    jsonb_build_object('global', true, 'categories', jsonb_build_object('notices', true, 'mealReminders', true)))
  on conflict (id) do update set full_name = excluded.full_name, email = excluded.email, updated_at = now();
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
begin
  if auth.uid() is null then raise exception 'Authentication is required to create a mess'; end if;
  if nullif(trim(mess_name), '') is null then raise exception 'Mess name is required'; end if;
  insert into public.messes (name, creator_id) values (trim(mess_name), auth.uid()) returning * into new_mess;
  update public.profiles set mess_id = new_mess.id, role = 'manager', updated_at = now() where id = auth.uid();
  return new_mess;
end;
$$;

create or replace function public.has_legacy_data()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.members where user_id = auth.uid() and mess_id is null)
      or exists (select 1 from public.cycles where user_id = auth.uid() and mess_id is null)
      or exists (select 1 from public.expenses where user_id = auth.uid() and mess_id is null)
      or exists (select 1 from public.meal_logs where user_id = auth.uid() and mess_id is null)
      or exists (select 1 from public.cycle_deposits where user_id = auth.uid() and mess_id is null)
      or exists (select 1 from public.changelog_entries where user_id = auth.uid() and mess_id is null)
      or exists (select 1 from public.notices where user_id = auth.uid() and mess_id is null)
      or exists (select 1 from public.share_links where user_id = auth.uid() and mess_id is null)
$$;

create or replace function public.migrate_legacy_data(mess_name text)
returns public.messes language plpgsql security definer set search_path = public
as $$
declare created_mess public.messes;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if not public.has_legacy_data() then raise exception 'No legacy data is available to migrate'; end if;
  select * into created_mess from public.create_mess(mess_name);
  update public.members set mess_id = created_mess.id, profile_id = null where user_id = auth.uid() and mess_id is null;
  update public.cycles set mess_id = created_mess.id, profile_id = auth.uid() where user_id = auth.uid() and mess_id is null;
  update public.expenses set mess_id = created_mess.id, profile_id = auth.uid() where user_id = auth.uid() and mess_id is null;
  update public.meal_logs set mess_id = created_mess.id, profile_id = auth.uid() where user_id = auth.uid() and mess_id is null;
  update public.cycle_deposits set mess_id = created_mess.id, profile_id = auth.uid() where user_id = auth.uid() and mess_id is null;
  update public.changelog_entries set mess_id = created_mess.id, profile_id = auth.uid() where user_id = auth.uid() and mess_id is null;
  update public.notices set mess_id = created_mess.id, profile_id = auth.uid() where user_id = auth.uid() and mess_id is null;
  update public.share_links set mess_id = created_mess.id, profile_id = auth.uid() where user_id = auth.uid() and mess_id is null;
  update public.push_subscriptions set mess_id = created_mess.id, profile_id = auth.uid() where user_id = auth.uid() and mess_id is null;
  update public.notification_deliveries set mess_id = created_mess.id, profile_id = auth.uid() where user_id = auth.uid() and mess_id is null;
  return created_mess;
end;
$$;

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

create or replace function public.get_notification_preferences()
returns table (reminder_time time)
language sql stable security definer set search_path = public
as $$
  select p.reminder_time from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.update_notification_preferences(reminder_time_input time)
returns table (reminder_time time)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  update public.profiles
    set reminder_time = coalesce(reminder_time_input, '22:00'::time), updated_at = now()
    where id = auth.uid();
  if not found then raise exception 'Profile was not found'; end if;
  return query select p.reminder_time from public.profiles p where p.id = auth.uid();
end;
$$;

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

-- The old code-based join path was retired by the latest migration.
drop function if exists public.join_mess(text);

revoke all on function public.create_mess(text), public.set_mess_role(uuid, text), public.update_mess_settings(text), public.delete_current_mess(), public.update_user_profile(text, text) from public;
grant execute on function public.create_mess(text), public.set_mess_role(uuid, text), public.update_mess_settings(text), public.delete_current_mess(), public.update_user_profile(text, text) to authenticated;
revoke all on function public.migrate_legacy_data(text), public.link_member_profile(uuid, uuid), public.create_member_invite(uuid), public.list_member_invites(), public.revoke_member_invite(uuid), public.accept_member_invite(uuid) from public;
grant execute on function public.migrate_legacy_data(text), public.link_member_profile(uuid, uuid), public.create_member_invite(uuid), public.list_member_invites(), public.revoke_member_invite(uuid), public.accept_member_invite(uuid) to authenticated;
revoke all on function public.get_member_invite_preview(text) from public;
grant execute on function public.get_member_invite_preview(text) to anon, authenticated;
grant execute on function public.get_notification_preferences() to authenticated;
grant execute on function public.update_notification_preferences(time) to authenticated;
