-- Automated triggers.
drop trigger if exists on_auth_user_profile_changed on auth.users;
create trigger on_auth_user_profile_changed
after insert or update of email, raw_user_meta_data on auth.users
for each row execute procedure public.handle_auth_user_profile();

drop trigger if exists enforce_member_profile_link on public.members;
create trigger enforce_member_profile_link
before update of profile_id on public.members
for each row execute procedure public.guard_member_profile_link();
drop trigger if exists prevent_member_history_cascade_delete on public.members;
create trigger prevent_member_history_cascade_delete
before delete on public.members
for each row execute function public.prevent_member_history_cascade_delete();

