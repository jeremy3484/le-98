-- =============================================================================
-- Jeu du 98 — Migration 0004 (correctif)
-- Corrige l'erreur Postgres "column reference \"code\" is ambiguous" survenant
-- à la création / au rejoint d'une room.
--
-- Cause : dans les versions déployées de generate_room_code / create_room /
-- join_room, une variable PL/pgSQL nommée `code` (ou une colonne OUT `code`)
-- entre en collision avec la colonne `game_rooms.code` dans une requête.
--
-- Correctif : on renomme toutes les variables locales en `v_*` et on qualifie
-- systématiquement les colonnes de table (alias `gr` / `gp`). Les colonnes de
-- sortie (id, code, status) sont conservées : le client lit room.id / room.code
-- / room.status, on n'y touche donc pas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Génération d'un code de room unique (variable locale -> v_code).
-- -----------------------------------------------------------------------------
create or replace function public.generate_room_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code     text;
  v_i        int;
  v_attempts int := 0;
begin
  loop
    v_code := '';
    for v_i in 1..5 loop
      v_code := v_code
        || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    -- Code disponible ? (colonne qualifiée, variable distincte)
    exit when not exists (
      select 1 from public.game_rooms gr where gr.code = v_code
    );

    v_attempts := v_attempts + 1;
    if v_attempts > 50 then
      raise exception 'Impossible de générer un code de room unique';
    end if;
  end loop;

  return v_code;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) create_room : crée une room (status='waiting'), l'appelant devient host.
-- -----------------------------------------------------------------------------
create or replace function public.create_room(p_settings jsonb default '{}'::jsonb)
returns table (id uuid, code text, status text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_room_id uuid;
  v_code    text;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  v_code := public.generate_room_code();

  insert into public.game_rooms (code, host_id, status, settings)
  values (v_code, v_uid, 'waiting', coalesce(p_settings, '{}'::jsonb))
  returning game_rooms.id into v_room_id;

  -- L'hôte est le premier joueur (position 0).
  insert into public.game_players (room_id, profile_id, position, is_active)
  values (v_room_id, v_uid, 0, true);

  return query
    select v_room_id, v_code, 'waiting'::text;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) join_room : rejoint une room par son code (colonnes toujours qualifiées).
-- -----------------------------------------------------------------------------
create or replace function public.join_room(p_code text)
returns table (id uuid, code text, status text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_room     public.game_rooms%rowtype;
  v_max      int;
  v_count    int;
  v_next_pos int;
  v_existing public.game_players%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  select gr.* into v_room
  from public.game_rooms gr
  where upper(gr.code) = upper(trim(p_code))
  limit 1;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- Déjà membre ? On réactive et on renvoie la room.
  select gp.* into v_existing
  from public.game_players gp
  where gp.room_id = v_room.id and gp.profile_id = v_uid
  limit 1;

  if found then
    if not v_existing.is_active then
      update public.game_players gp
      set is_active = true
      where gp.id = v_existing.id;
    end if;
    return query select v_room.id, v_room.code, v_room.status;
    return;
  end if;

  -- Nouveau joueur : la partie doit être en attente.
  if v_room.status <> 'waiting' then
    raise exception 'ROOM_NOT_JOINABLE';
  end if;

  v_max := coalesce((v_room.settings ->> 'max_players')::int, 10);

  select count(*) into v_count
  from public.game_players gp
  where gp.room_id = v_room.id and gp.is_active;

  if v_count >= v_max then
    raise exception 'ROOM_FULL';
  end if;

  -- Position suivante (max + 1).
  select coalesce(max(gp.position), -1) + 1 into v_next_pos
  from public.game_players gp
  where gp.room_id = v_room.id;

  insert into public.game_players (room_id, profile_id, position, is_active)
  values (v_room.id, v_uid, v_next_pos, true);

  return query select v_room.id, v_room.code, v_room.status;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Permissions (idempotent).
-- -----------------------------------------------------------------------------
revoke all on function public.generate_room_code() from public;
revoke all on function public.create_room(jsonb)   from public;
revoke all on function public.join_room(text)      from public;

grant execute on function public.create_room(jsonb) to authenticated;
grant execute on function public.join_room(text)    to authenticated;
