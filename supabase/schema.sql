-- Veiligheidsrondes: tabellen en toegangsregels.
-- Plak dit volledig in Supabase > SQL Editor en klik op Run.

create table if not exists public.toegang (
  email text primary key check (email = lower(email))
);

create table if not exists public.rondes (
  id uuid primary key default gen_random_uuid(),
  site text not null,
  datum date not null,
  aangemaakt timestamptz not null default now(),
  aangemaakt_door uuid default auth.uid()
);

create table if not exists public.observaties (
  id uuid primary key default gen_random_uuid(),
  ronde_id uuid not null references public.rondes(id) on delete cascade,
  site text not null,
  gebouw text default '',
  verdiep text default '',
  lokaal text default '',
  onderwerp text not null,
  omschrijving text default '',
  gemeld boolean not null default false,
  opgelost boolean not null default false,
  foto text,
  aangemaakt timestamptz not null default now(),
  aangemaakt_door uuid default auth.uid()
);
alter table public.observaties add column if not exists foto text;
-- De lijst met onderwerpen staat in de app (index.html), niet in de database.
alter table public.observaties drop constraint if exists observaties_onderwerp_check;
create index if not exists observaties_ronde_idx on public.observaties(ronde_id);

-- Enkel e-mailadressen in de tabel "toegang" mogen gegevens zien en wijzigen.
create or replace function public.heeft_toegang() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.toegang where email = lower(auth.jwt() ->> 'email'));
$$;

alter table public.toegang enable row level security;
alter table public.rondes enable row level security;
alter table public.observaties enable row level security;

drop policy if exists "rondes voor collega's" on public.rondes;
create policy "rondes voor collega's" on public.rondes
  for all to authenticated using (public.heeft_toegang()) with check (public.heeft_toegang());

drop policy if exists "observaties voor collega's" on public.observaties;
create policy "observaties voor collega's" on public.observaties
  for all to authenticated using (public.heeft_toegang()) with check (public.heeft_toegang());

-- Foto's: privé-bucket, enkel voor e-mailadressen in "toegang".
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false)
on conflict (id) do nothing;

drop policy if exists "fotos lezen" on storage.objects;
create policy "fotos lezen" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.heeft_toegang());
drop policy if exists "fotos toevoegen" on storage.objects;
create policy "fotos toevoegen" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.heeft_toegang());
drop policy if exists "fotos wijzigen" on storage.objects;
create policy "fotos wijzigen" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and public.heeft_toegang());
drop policy if exists "fotos verwijderen" on storage.objects;
create policy "fotos verwijderen" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.heeft_toegang());

-- Live bijwerken wanneer een collega iets wijzigt.
do $$ begin
  alter publication supabase_realtime add table public.rondes, public.observaties;
exception when duplicate_object then null; end $$;

-- Voeg hier de e-mailadressen van collega's toe (kleine letters):
-- insert into public.toegang (email) values ('naam@voorbeeld.be'), ('collega@voorbeeld.be');
