-- Idempotent data backfill retained from the migrations for existing projects.
insert into public.profiles (id, full_name, email)
select id, coalesce(nullif(trim(raw_user_meta_data ->> 'full_name'), ''), nullif(trim(raw_user_meta_data ->> 'name'), ''), nullif(trim(raw_user_meta_data ->> 'display_name'), ''), nullif(split_part(email, '@', 1), ''), 'Member'), email
from auth.users where email is not null
on conflict (id) do update set full_name = excluded.full_name, email = excluded.email, updated_at = now();

update public.members set profile_id = user_id where profile_id is null and user_id is not null;
update public.cycles set profile_id = user_id where profile_id is null and user_id is not null;
update public.expenses set profile_id = user_id where profile_id is null and user_id is not null;
update public.meal_logs set profile_id = user_id where profile_id is null and user_id is not null;
update public.cycle_deposits set profile_id = user_id where profile_id is null and user_id is not null;
update public.changelog_entries set profile_id = user_id where profile_id is null and user_id is not null;
update public.notices set profile_id = user_id where profile_id is null and user_id is not null;
update public.share_links set profile_id = user_id where profile_id is null and user_id is not null;
update public.push_subscriptions set profile_id = user_id where profile_id is null and user_id is not null;
update public.notification_deliveries set profile_id = user_id where profile_id is null and user_id is not null;
update public.push_subscriptions as subscriptions
set mess_id = links.mess_id
from public.share_links as links
where subscriptions.audience = 'shared'
  and subscriptions.mess_id is null
  and subscriptions.share_token = links.token
  and links.mess_id is not null;

do $$
declare u record; c record; active_id uuid; season text; base_name text; candidate text; suffix integer;
begin
  for u in select user_id from public.cycles where user_id is not null union select user_id from public.members where user_id is not null loop
    select id into active_id from public.cycles where user_id = u.user_id and status = 'active' limit 1;
    if active_id is null then
      season := case when extract(month from now()) between 3 and 5 then 'Spring' when extract(month from now()) between 6 and 8 then 'Summer' when extract(month from now()) between 9 and 11 then 'Fall' else 'Winter' end;
      base_name := 'Meal_' || season || '-' || to_char(now(), 'YY'); candidate := base_name; suffix := 0;
      while exists (select 1 from public.cycles where user_id = u.user_id and lower(name) = lower(candidate)) loop suffix := suffix + 1; candidate := base_name || '_' || suffix; end loop;
      insert into public.cycles(user_id, name, status) values (u.user_id, candidate, 'active') returning id into active_id;
    end if;
    update public.expenses set cycle_id = active_id where user_id = u.user_id and cycle_id is null;
    update public.meal_logs set cycle_id = active_id where user_id = u.user_id and cycle_id is null;
    for c in select id, started_at from public.cycles where user_id = u.user_id and nullif(trim(name), '') is null order by started_at, created_at, id loop
      season := case when extract(month from c.started_at) between 3 and 5 then 'Spring' when extract(month from c.started_at) between 6 and 8 then 'Summer' when extract(month from c.started_at) between 9 and 11 then 'Fall' else 'Winter' end;
      base_name := 'Meal_' || season || '-' || to_char(c.started_at, 'YY'); candidate := base_name; suffix := 0;
      while exists (select 1 from public.cycles where user_id = u.user_id and id <> c.id and lower(name) = lower(candidate)) loop suffix := suffix + 1; candidate := base_name || '_' || suffix; end loop;
      update public.cycles set name = candidate where id = c.id;
    end loop;
  end loop;
end $$;
