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

-- Audit log triggers for tamper-proof and atomic changelog recording
drop trigger if exists audit_expenses_trigger on public.expenses;
create trigger audit_expenses_trigger
after insert or update or delete on public.expenses
for each row execute function public.audit_expenses();

drop trigger if exists audit_cycle_deposits_trigger on public.cycle_deposits;
create trigger audit_cycle_deposits_trigger
after insert or update or delete on public.cycle_deposits
for each row execute function public.audit_cycle_deposits();

drop trigger if exists audit_meal_logs_trigger on public.meal_logs;
create trigger audit_meal_logs_trigger
after insert or update or delete on public.meal_logs
for each row execute function public.audit_meal_logs();

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

drop trigger if exists meal_logs_set_updated_at on public.meal_logs;
create trigger meal_logs_set_updated_at
before update on public.meal_logs
for each row execute function public.set_updated_at();

drop trigger if exists audit_members_trigger on public.members;
create trigger audit_members_trigger
after insert or update or delete on public.members
for each row execute function public.audit_members();

