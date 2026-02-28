create extension if not exists pgcrypto;

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_on date not null,
  type text not null check (type in ('sales', 'cost')),
  amount integer not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now()
);

alter table public.entries enable row level security;

create policy "Users can read own entries"
on public.entries
for select
using (auth.uid() = user_id);

create policy "Users can insert own entries"
on public.entries
for insert
with check (auth.uid() = user_id);

create policy "Users can update own entries"
on public.entries
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own entries"
on public.entries
for delete
using (auth.uid() = user_id);

create or replace function public.handle_new_entry_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists set_entry_user_id on public.entries;

create trigger set_entry_user_id
before insert on public.entries
for each row
execute function public.handle_new_entry_user_id();
