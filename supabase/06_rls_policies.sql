-- Final RLS posture. Direct push/delivery access remains service-role only.
do $$ declare table_name text; begin
  foreach table_name in array array['profiles','messes','members','expenses','meal_logs','cycles','cycle_deposits','changelog_entries','notices','share_links','push_subscriptions','notification_deliveries','member_invites'] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

drop policy if exists "users can read their own profile" on public.profiles;
create policy "users can read their own profile" on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "mess members can read profiles" on public.profiles;
create policy "mess members can read profiles" on public.profiles for select to authenticated using (mess_id = public.current_mess_id());
drop policy if exists "users can insert their own profile" on public.profiles;
create policy "users can insert their own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "members can read their mess" on public.messes;
create policy "members can read their mess" on public.messes for select to authenticated using (id = public.current_mess_id());

drop policy if exists own_members on public.members;
drop policy if exists mess_members on public.members;
drop policy if exists members_read on public.members;
drop policy if exists members_manage on public.members;
create policy members_read on public.members for select to authenticated using (mess_id = public.current_mess_id());
create policy members_manage on public.members for all to authenticated using (mess_id = public.current_mess_id() and public.has_mess_role(array['manager'])) with check (mess_id = public.current_mess_id() and public.has_mess_role(array['manager']));

drop policy if exists own_expenses on public.expenses;
drop policy if exists mess_expenses on public.expenses;
drop policy if exists expenses_read on public.expenses;
drop policy if exists expenses_operate on public.expenses;
create policy expenses_read on public.expenses for select to authenticated using (mess_id = public.current_mess_id());
create policy expenses_operate on public.expenses for all to authenticated using (mess_id = public.current_mess_id() and public.has_mess_role(array['manager','coordinator'])) with check (mess_id = public.current_mess_id() and public.has_mess_role(array['manager','coordinator']));

drop policy if exists own_meal_logs on public.meal_logs;
drop policy if exists mess_meal_logs on public.meal_logs;
drop policy if exists meal_logs_read on public.meal_logs;
drop policy if exists meal_logs_operate on public.meal_logs;
create policy meal_logs_read on public.meal_logs for select to authenticated using (mess_id = public.current_mess_id());
create policy meal_logs_operate on public.meal_logs for all to authenticated using (mess_id = public.current_mess_id() and public.has_mess_role(array['manager','coordinator'])) with check (mess_id = public.current_mess_id() and public.has_mess_role(array['manager','coordinator']));

drop policy if exists own_cycles on public.cycles;
drop policy if exists mess_cycles on public.cycles;
drop policy if exists cycles_read on public.cycles;
drop policy if exists cycles_manage on public.cycles;
create policy cycles_read on public.cycles for select to authenticated using (mess_id = public.current_mess_id());
create policy cycles_manage on public.cycles for all to authenticated using (mess_id = public.current_mess_id() and public.has_mess_role(array['manager'])) with check (mess_id = public.current_mess_id() and public.has_mess_role(array['manager']));

drop policy if exists own_cycle_deposits on public.cycle_deposits;
drop policy if exists mess_cycle_deposits on public.cycle_deposits;
drop policy if exists deposits_read on public.cycle_deposits;
drop policy if exists deposits_manage on public.cycle_deposits;
create policy deposits_read on public.cycle_deposits for select to authenticated using (mess_id = public.current_mess_id());
create policy deposits_manage on public.cycle_deposits for all to authenticated using (mess_id = public.current_mess_id() and public.has_mess_role(array['manager','coordinator'])) with check (mess_id = public.current_mess_id() and public.has_mess_role(array['manager','coordinator']));

drop policy if exists own_changelog_entries on public.changelog_entries;
drop policy if exists mess_changelog_entries on public.changelog_entries;
drop policy if exists changelog_read on public.changelog_entries;
drop policy if exists changelog_operate on public.changelog_entries;
create policy changelog_read on public.changelog_entries for select to authenticated using (mess_id = public.current_mess_id());
create policy changelog_operate on public.changelog_entries for insert to authenticated with check (mess_id = public.current_mess_id() and public.has_mess_role(array['manager','coordinator']));

drop policy if exists "owner can manage notices" on public.notices;
drop policy if exists mess_notices on public.notices;
drop policy if exists notices_read on public.notices;
drop policy if exists notices_manage on public.notices;
create policy notices_read on public.notices for select to authenticated using (mess_id = public.current_mess_id());
create policy notices_manage on public.notices for all to authenticated using (mess_id = public.current_mess_id() and public.has_mess_role(array['manager','coordinator'])) with check (mess_id = public.current_mess_id() and public.has_mess_role(array['manager','coordinator']));

drop policy if exists own_manage_share_links on public.share_links;
drop policy if exists mess_share_links on public.share_links;
drop policy if exists share_links_read on public.share_links;
drop policy if exists share_links_manage on public.share_links;
create policy share_links_read on public.share_links for select to authenticated using (mess_id = public.current_mess_id());
create policy share_links_manage on public.share_links for all to authenticated using (mess_id = public.current_mess_id() and public.has_mess_role(array['manager'])) with check (mess_id = public.current_mess_id());

revoke all on table public.member_invites from anon, authenticated;
