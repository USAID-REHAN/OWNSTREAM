-- Ownstream user database (Supabase). Run once in the Supabase SQL editor.

-- Profile row for every signed up user (module F1)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  telegram_chat_id bigint unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles select own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles update own" on public.profiles
  for update using (auth.uid() = id);

-- Create the profile automatically on sign up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Newer Supabase projects do not grant table access automatically, so grant only what is used:
-- the server (service_role) reads, updates and deletes profiles; a signed-in user may read and update their own row (RLS above).
grant select, insert, update, delete on public.profiles to service_role;
grant select, update on public.profiles to authenticated;

-- Creates the profile for any user that signed up before this file was run. Safe to run again.
insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;
