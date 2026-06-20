-- =============================================================================
-- Jeu du 98 — Migration initiale (Phase 0)
-- Tables, contraintes, Row Level Security (RLS) et Realtime.
-- =============================================================================

-- Extensions ------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions; -- gen_random_uuid()

-- =============================================================================
-- TABLES
-- =============================================================================

-- profiles --------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  pseudo      text not null unique,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- game_rooms ------------------------------------------------------------------
create table if not exists public.game_rooms (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  host_id            uuid not null references public.profiles (id) on delete cascade,
  status             text not null default 'lobby'
                       check (status in ('lobby', 'in_progress', 'finished', 'aborted')),
  current_total      int  not null default 0,
  direction          text not null default 'cw'
                       check (direction in ('cw', 'ccw')),
  current_player_id  uuid, -- FK ajoutée après création de game_players (réf. circulaire)
  settings           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- game_players ----------------------------------------------------------------
create table if not exists public.game_players (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.game_rooms (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  hand        jsonb not null default '[]'::jsonb,
  position    int  not null default 0,
  is_active   bool not null default true,
  joined_at   timestamptz not null default now(),
  unique (room_id, profile_id)
);

-- FK circulaire : game_rooms.current_player_id -> game_players.id
alter table public.game_rooms
  add constraint game_rooms_current_player_id_fkey
  foreign key (current_player_id) references public.game_players (id) on delete set null;

-- game_deck (1 ligne par room, room_id = PK) ----------------------------------
create table if not exists public.game_deck (
  room_id          uuid primary key references public.game_rooms (id) on delete cascade,
  remaining_cards  jsonb not null default '[]'::jsonb,
  discard_pile     jsonb not null default '[]'::jsonb
);

-- card_rules ------------------------------------------------------------------
create table if not exists public.card_rules (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.game_rooms (id) on delete cascade,
  card_value     text not null,
  label          text not null,
  action_type    text not null,
  action_params  jsonb not null default '{}'::jsonb
);

-- joker_configs ---------------------------------------------------------------
create table if not exists public.joker_configs (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.game_rooms (id) on delete cascade,
  power_type   text not null,
  description  text
);

-- game_events (journal append-only) -------------------------------------------
create table if not exists public.game_events (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.game_rooms (id) on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- sip_assignments (gorgées attribuées) ----------------------------------------
create table if not exists public.sip_assignments (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.game_rooms (id) on delete cascade,
  from_player_id  uuid references public.game_players (id) on delete set null,
  to_player_id    uuid references public.game_players (id) on delete set null,
  amount          int  not null default 1 check (amount > 0),
  reason          text,
  created_at      timestamptz not null default now()
);

-- Index utiles ----------------------------------------------------------------
create index if not exists idx_game_players_room      on public.game_players (room_id);
create index if not exists idx_game_players_profile   on public.game_players (profile_id);
create index if not exists idx_card_rules_room        on public.card_rules (room_id);
create index if not exists idx_joker_configs_room     on public.joker_configs (room_id);
create index if not exists idx_game_events_room       on public.game_events (room_id, created_at);
create index if not exists idx_sip_assignments_room   on public.sip_assignments (room_id);

-- =============================================================================
-- FONCTIONS HELPER (SECURITY DEFINER pour éviter la récursion RLS)
-- =============================================================================

-- L'utilisateur courant est-il membre actif de la room ?
create or replace function public.is_room_member(_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.game_players gp
    where gp.room_id = _room_id
      and gp.profile_id = auth.uid()
      and gp.is_active
  );
$$;

-- L'utilisateur courant est-il l'hôte de la room ?
create or replace function public.is_room_host(_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.game_rooms gr
    where gr.id = _room_id
      and gr.host_id = auth.uid()
  );
$$;

-- Création automatique d'un profil à l'inscription -----------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, pseudo, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'pseudo',
      split_part(new.email, '@', 1) || '_' || substr(new.id::text, 1, 4)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- ROW LEVEL SECURITY
-- Principe : un joueur ne lit/écrit que les rooms dont il est membre.
-- (La clé service_role utilisée côté serveur bypasse ces policies.)
-- =============================================================================

alter table public.profiles        enable row level security;
alter table public.game_rooms      enable row level security;
alter table public.game_players    enable row level security;
alter table public.game_deck       enable row level security;
alter table public.card_rules      enable row level security;
alter table public.joker_configs   enable row level security;
alter table public.game_events     enable row level security;
alter table public.sip_assignments enable row level security;

-- profiles --------------------------------------------------------------------
-- Lecture des profils par tout utilisateur authentifié (afficher les pseudos).
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_insert_self"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- game_rooms ------------------------------------------------------------------
create policy "game_rooms_select_member_or_host"
  on public.game_rooms for select
  to authenticated
  using (host_id = auth.uid() or public.is_room_member(id));

create policy "game_rooms_insert_host_self"
  on public.game_rooms for insert
  to authenticated
  with check (host_id = auth.uid());

create policy "game_rooms_update_member_or_host"
  on public.game_rooms for update
  to authenticated
  using (host_id = auth.uid() or public.is_room_member(id))
  with check (host_id = auth.uid() or public.is_room_member(id));

create policy "game_rooms_delete_host"
  on public.game_rooms for delete
  to authenticated
  using (host_id = auth.uid());

-- game_players ----------------------------------------------------------------
create policy "game_players_select_member"
  on public.game_players for select
  to authenticated
  using (public.is_room_member(room_id) or public.is_room_host(room_id));

create policy "game_players_insert_self"
  on public.game_players for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "game_players_update_self_or_host"
  on public.game_players for update
  to authenticated
  using (profile_id = auth.uid() or public.is_room_host(room_id))
  with check (profile_id = auth.uid() or public.is_room_host(room_id));

create policy "game_players_delete_self_or_host"
  on public.game_players for delete
  to authenticated
  using (profile_id = auth.uid() or public.is_room_host(room_id));

-- game_deck -------------------------------------------------------------------
create policy "game_deck_select_member"
  on public.game_deck for select
  to authenticated
  using (public.is_room_member(room_id));

create policy "game_deck_write_member"
  on public.game_deck for all
  to authenticated
  using (public.is_room_member(room_id))
  with check (public.is_room_member(room_id));

-- card_rules ------------------------------------------------------------------
create policy "card_rules_select_member"
  on public.card_rules for select
  to authenticated
  using (public.is_room_member(room_id) or public.is_room_host(room_id));

create policy "card_rules_write_host"
  on public.card_rules for all
  to authenticated
  using (public.is_room_host(room_id))
  with check (public.is_room_host(room_id));

-- joker_configs ---------------------------------------------------------------
create policy "joker_configs_select_member"
  on public.joker_configs for select
  to authenticated
  using (public.is_room_member(room_id) or public.is_room_host(room_id));

create policy "joker_configs_write_host"
  on public.joker_configs for all
  to authenticated
  using (public.is_room_host(room_id))
  with check (public.is_room_host(room_id));

-- game_events (append-only : lecture + insertion par les membres) --------------
create policy "game_events_select_member"
  on public.game_events for select
  to authenticated
  using (public.is_room_member(room_id) or public.is_room_host(room_id));

create policy "game_events_insert_member"
  on public.game_events for insert
  to authenticated
  with check (public.is_room_member(room_id) or public.is_room_host(room_id));

-- sip_assignments -------------------------------------------------------------
create policy "sip_assignments_select_member"
  on public.sip_assignments for select
  to authenticated
  using (public.is_room_member(room_id) or public.is_room_host(room_id));

create policy "sip_assignments_insert_member"
  on public.sip_assignments for insert
  to authenticated
  with check (public.is_room_member(room_id) or public.is_room_host(room_id));

-- =============================================================================
-- REALTIME
-- Active la publication Realtime sur les tables temps réel + REPLICA IDENTITY
-- FULL pour recevoir les anciennes valeurs sur UPDATE/DELETE.
-- =============================================================================

alter table public.game_rooms   replica identity full;
alter table public.game_players replica identity full;
alter table public.game_events  replica identity full;

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array['game_rooms', 'game_players', 'game_events']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end$$;
