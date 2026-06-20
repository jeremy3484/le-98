-- =============================================================================
-- Jeu du 98 — Migration 0003 (Phase 2)
-- Salon de jeu : vocabulaire de statut 'waiting'/'playing' + RPC create_room /
-- join_room (SECURITY DEFINER) pour contourner le problème "poule & œuf" du RLS
-- (un joueur ne peut pas SELECT une room avant d'en être membre).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Alignement du vocabulaire de statut sur la Phase 2.
--    'lobby'       -> 'waiting'
--    'in_progress' -> 'playing'
-- -----------------------------------------------------------------------------
alter table public.game_rooms
  drop constraint if exists game_rooms_status_check;

-- Migration des valeurs existantes (idempotent).
update public.game_rooms set status = 'waiting' where status = 'lobby';
update public.game_rooms set status = 'playing' where status = 'in_progress';

alter table public.game_rooms
  alter column status set default 'waiting';

alter table public.game_rooms
  add constraint game_rooms_status_check
  check (status in ('waiting', 'playing', 'finished', 'aborted'));

-- -----------------------------------------------------------------------------
-- 2) Génération d'un code de room unique.
--    Alphabet sans caractères ambigus (0/O, 1/I/L) — 5 caractères.
-- -----------------------------------------------------------------------------
create or replace function public.generate_room_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  alphabet  constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code      text;
  i         int;
  attempts  int := 0;
begin
  loop
    code := '';
    for i in 1..5 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    -- Code disponible ?
    exit when not exists (select 1 from public.game_rooms gr where gr.code = code);

    attempts := attempts + 1;
    if attempts > 50 then
      raise exception 'Impossible de générer un code de room unique';
    end if;
  end loop;

  return code;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) create_room : crée une room (status='waiting'), l'appelant devient host,
--    et est inséré comme premier joueur (position 0).
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
-- 4) join_room : rejoint une room par son code.
--    - Recherche la room en bypassant le RLS (SECURITY DEFINER).
--    - Réactive le joueur s'il était déjà présent.
--    - Refuse si la partie n'est plus en attente ou si la room est pleine.
-- -----------------------------------------------------------------------------
create or replace function public.join_room(p_code text)
returns table (id uuid, code text, status text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_room       public.game_rooms%rowtype;
  v_max        int;
  v_count      int;
  v_next_pos   int;
  v_existing   public.game_players%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentification requise';
  end if;

  select * into v_room
  from public.game_rooms gr
  where upper(gr.code) = upper(trim(p_code))
  limit 1;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- Déjà membre ? On réactive et on renvoie la room.
  select * into v_existing
  from public.game_players gp
  where gp.room_id = v_room.id and gp.profile_id = v_uid
  limit 1;

  if found then
    if not v_existing.is_active then
      update public.game_players
      set is_active = true
      where game_players.id = v_existing.id;
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
-- 5) Permissions : exécutables par les utilisateurs authentifiés.
-- -----------------------------------------------------------------------------
revoke all on function public.generate_room_code() from public;
revoke all on function public.create_room(jsonb)   from public;
revoke all on function public.join_room(text)      from public;

grant execute on function public.create_room(jsonb) to authenticated;
grant execute on function public.join_room(text)    to authenticated;
