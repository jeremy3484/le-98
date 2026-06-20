-- =============================================================================
-- Jeu du 98 — Migration 0002 : Auth (pseudo) + Storage (avatars)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Unicité du pseudo INSENSIBLE À LA CASSE
-- (complète la contrainte `unique` sensible à la casse de 0001)
-- -----------------------------------------------------------------------------
create unique index if not exists profiles_pseudo_lower_idx
  on public.profiles (lower(pseudo));

-- -----------------------------------------------------------------------------
-- RPC : disponibilité d'un pseudo (appelable AVANT authentification)
-- SECURITY DEFINER pour contourner la RLS sans exposer toute la table profiles.
-- -----------------------------------------------------------------------------
create or replace function public.is_pseudo_available(p_pseudo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where lower(pseudo) = lower(trim(p_pseudo))
  );
$$;

grant execute on function public.is_pseudo_available(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Storage : bucket public "avatars"
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Lecture publique des avatars (bucket public).
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Un utilisateur n'écrit que dans son propre dossier : avatars/<uid>/...
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
