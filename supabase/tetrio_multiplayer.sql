-- TETR.IO Web multiplayer schema
-- Run this once in Supabase SQL Editor.
--
-- Before testing:
-- 1. In Authentication > Providers, enable Anonymous sign-ins.
-- 2. Do not put a service-role key in the browser. The app uses the public anon key.
--
-- This schema transports room and attack events. The browser still owns the
-- individual Tetris simulation, so it is not an anti-cheat server. RPCs still
-- reject malformed values and rate-limit room creation and attack spam.

create extension if not exists pgcrypto;

create table if not exists public.tetrio_rooms (
    id uuid primary key default gen_random_uuid(),
    room_code text not null unique check (room_code ~ '^[A-Z0-9]{6}$'),
    status text not null default 'lobby'
        check (status in ('lobby', 'countdown', 'playing', 'finished')),
    host_id uuid not null references auth.users(id) on delete restrict,
    winner_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '1 hour'),
    started_at timestamptz,
    finished_at timestamptz
);

create table if not exists public.tetrio_players (
    room_id uuid not null references public.tetrio_rooms(id) on delete cascade,
    player_id uuid not null references auth.users(id) on delete cascade,
    nickname text not null check (char_length(nickname) between 1 and 20),
    is_ready boolean not null default false,
    is_spectator boolean not null default false,
    is_alive boolean not null default true,
    joined_at timestamptz not null default now(),
    left_at timestamptz,
    last_attacked_by uuid references auth.users(id) on delete set null,
    last_attacked_at timestamptz,
    primary key (room_id, player_id)
);

create table if not exists public.tetrio_events (
    id bigint generated always as identity primary key,
    room_id uuid not null references public.tetrio_rooms(id) on delete cascade,
    sender_id uuid not null references auth.users(id) on delete cascade,
    target_id uuid references auth.users(id) on delete set null,
    event_type text not null check (event_type in ('attack', 'forfeit', 'winner')),
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists tetrio_players_room_active_idx
    on public.tetrio_players (room_id, left_at, is_spectator);
create index if not exists tetrio_events_room_created_idx
    on public.tetrio_events (room_id, created_at);

alter table public.tetrio_rooms enable row level security;
alter table public.tetrio_players enable row level security;
alter table public.tetrio_events enable row level security;

create or replace function public.is_tetrio_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
    select exists (
        select 1
        from public.tetrio_players
        where room_id = p_room_id
          and player_id = (select auth.uid())
          and left_at is null
    );
$$;

drop policy if exists "room members can read rooms" on public.tetrio_rooms;
create policy "room members can read rooms"
    on public.tetrio_rooms for select
    to authenticated
    using (
        public.is_tetrio_member(tetrio_rooms.id)
    );

drop policy if exists "room members can read players" on public.tetrio_players;
create policy "room members can read players"
    on public.tetrio_players for select
    to authenticated
    using (
        public.is_tetrio_member(tetrio_players.room_id)
    );

drop policy if exists "room members can read events" on public.tetrio_events;
create policy "room members can read events"
    on public.tetrio_events for select
    to authenticated
    using (
        public.is_tetrio_member(tetrio_events.room_id)
    );

-- Only the RPCs below may mutate room state. This keeps direct browser writes
-- behind membership, room-capacity, and event-shape checks.
revoke insert, update, delete on public.tetrio_rooms from anon, authenticated;
revoke insert, update, delete on public.tetrio_players from anon, authenticated;
revoke insert, update, delete on public.tetrio_events from anon, authenticated;

create or replace function public.create_tetrio_room(p_nickname text)
returns table (room_id uuid, room_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player uuid := auth.uid();
    v_room_id uuid;
    v_code text;
    v_nickname text := btrim(p_nickname);
begin
    if v_player is null then
        raise exception 'Anonymous sign-in is required';
    end if;
    if char_length(v_nickname) not between 1 and 20 then
        raise exception 'Nickname must be between 1 and 20 characters';
    end if;
    if exists (
        select 1
        from public.tetrio_rooms
        where host_id = v_player
          and created_at > now() - interval '1 minute'
    ) then
        raise exception 'Please wait before creating another room';
    end if;
    if (
        select count(*)
        from public.tetrio_rooms
        where host_id = v_player
          and status <> 'finished'
          and expires_at > now()
    ) >= 3 then
        raise exception 'You already have the maximum number of active rooms';
    end if;

    loop
        v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
        begin
            insert into public.tetrio_rooms (room_code, host_id)
            values (v_code, v_player)
            returning id into v_room_id;
            exit;
        exception
            when unique_violation then
                null;
        end;
    end loop;

    insert into public.tetrio_players (room_id, player_id, nickname)
    values (v_room_id, v_player, v_nickname);

    return query select v_room_id, v_code;
end;
$$;

create or replace function public.join_tetrio_room(p_room_code text, p_nickname text)
returns table (room_id uuid, room_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player uuid := auth.uid();
    v_room public.tetrio_rooms%rowtype;
    v_nickname text := btrim(p_nickname);
    v_count integer;
begin
    if v_player is null then
        raise exception 'Anonymous sign-in is required';
    end if;
    if char_length(v_nickname) not between 1 and 20 then
        raise exception 'Nickname must be between 1 and 20 characters';
    end if;

    select *
    into v_room
    from public.tetrio_rooms
    where room_code = upper(btrim(p_room_code))
      and status = 'lobby'
      and expires_at > now()
    for update;

    if not found then
        raise exception 'Room not found or already started';
    end if;

    select count(*)
    into v_count
    from public.tetrio_players
    where tetrio_players.room_id = v_room.id
      and left_at is null
      and not is_spectator;

    if v_count >= 4
       and not exists (
           select 1
           from public.tetrio_players
           where tetrio_players.room_id = v_room.id
             and player_id = v_player
       ) then
        raise exception 'Room is full';
    end if;

    insert into public.tetrio_players (room_id, player_id, nickname)
    values (v_room.id, v_player, v_nickname)
    on conflict (room_id, player_id) do update
        set nickname = excluded.nickname,
            left_at = null,
            is_spectator = false,
            is_alive = true;

    return query select v_room.id, v_room.room_code;
end;
$$;

create or replace function public.join_tetrio_as_spectator(p_room_code text, p_nickname text)
returns table (room_id uuid, room_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player uuid := auth.uid();
    v_room public.tetrio_rooms%rowtype;
    v_nickname text := btrim(p_nickname);
begin
    if v_player is null then
        raise exception 'Anonymous sign-in is required';
    end if;
    if char_length(v_nickname) not between 1 and 20 then
        raise exception 'Nickname must be between 1 and 20 characters';
    end if;

    select *
    into v_room
    from public.tetrio_rooms
    where room_code = upper(btrim(p_room_code))
      and status in ('lobby', 'countdown', 'playing')
      and expires_at > now()
    for update;

    if not found then
        raise exception 'Room not found or finished';
    end if;

    insert into public.tetrio_players (
        room_id, player_id, nickname, is_spectator, is_alive
    )
    values (v_room.id, v_player, v_nickname, true, false)
    on conflict (room_id, player_id) do update
        set nickname = excluded.nickname,
            left_at = null,
            is_spectator = true;

    return query select v_room.id, v_room.room_code;
end;
$$;

create or replace function public.set_tetrio_ready(p_room_id uuid, p_ready boolean)
returns public.tetrio_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
    v_room public.tetrio_rooms%rowtype;
    v_players integer;
    v_ready integer;
begin
    select *
    into v_room
    from public.tetrio_rooms
    where id = p_room_id
    for update;

    if not found or v_room.status <> 'lobby' then
        raise exception 'Room is not accepting ready state';
    end if;

    update public.tetrio_players
    set is_ready = p_ready
    where room_id = p_room_id
      and player_id = auth.uid()
      and not is_spectator
      and left_at is null;

    if not found then
        raise exception 'You are not an active player in this room';
    end if;

    select count(*), count(*) filter (where is_ready)
    into v_players, v_ready
    from public.tetrio_players
    where room_id = p_room_id
      and not is_spectator
      and left_at is null;

    if v_players >= 2 and v_players = v_ready then
        update public.tetrio_rooms
        set status = 'countdown'
        where id = p_room_id;
    end if;

    select * into v_room from public.tetrio_rooms where id = p_room_id;
    return v_room;
end;
$$;

create or replace function public.start_tetrio_match(p_room_id uuid)
returns public.tetrio_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
    v_room public.tetrio_rooms%rowtype;
    v_players integer;
    v_ready integer;
begin
    select *
    into v_room
    from public.tetrio_rooms
    where id = p_room_id
    for update;

    if not found or v_room.status <> 'countdown' then
        raise exception 'Room is not ready to start';
    end if;
    if not exists (
        select 1 from public.tetrio_players
        where room_id = p_room_id
          and player_id = auth.uid()
          and not is_spectator
          and left_at is null
    ) then
        raise exception 'You are not in this room';
    end if;

    select count(*), count(*) filter (where is_ready)
    into v_players, v_ready
    from public.tetrio_players
    where room_id = p_room_id
      and not is_spectator
      and left_at is null;

    if v_players < 2 or v_players <> v_ready then
        raise exception 'At least two active players must be ready';
    end if;

    update public.tetrio_rooms
    set status = 'playing', started_at = coalesce(started_at, now())
    where id = p_room_id
    returning * into v_room;

    return v_room;
end;
$$;

create or replace function public.submit_tetrio_attack(
    p_room_id uuid,
    p_rows integer,
    p_clear_type text,
    p_combo integer default -1,
    p_back_to_back boolean default false,
    p_all_clear boolean default false
)
returns public.tetrio_events
language plpgsql
security definer
set search_path = public
as $$
declare
    v_sender uuid := auth.uid();
    v_target uuid;
    v_last_attacker uuid;
    v_last_attacked_at timestamptz;
    v_event public.tetrio_events%rowtype;
begin
    if v_sender is null then
        raise exception 'Anonymous sign-in is required';
    end if;
    if p_rows is null or p_rows not between 0 and 20 then
        raise exception 'Attack rows must be between 0 and 20';
    end if;
    if p_clear_type is null or p_clear_type not in (
        'single', 'double', 'triple', 'quad',
        'tspin_single', 'tspin_double', 'tspin_triple',
        'tspin_mini_single', 'tspin_mini_double', 'none'
    ) then
        raise exception 'Unknown clear type';
    end if;
    if p_combo is null or p_combo not between -1 and 100 then
        raise exception 'Invalid combo value';
    end if;
    if p_all_clear and p_rows <> 10 then
        raise exception 'An all clear must send exactly 10 rows';
    end if;
    if (
        select count(*)
        from public.tetrio_events
        where sender_id = v_sender
          and event_type = 'attack'
          and created_at > now() - interval '10 seconds'
    ) >= 30 then
        raise exception 'Attack rate limit exceeded';
    end if;

    if not exists (
        select 1
        from public.tetrio_rooms r
        join public.tetrio_players p on p.room_id = r.id
        where r.id = p_room_id
          and r.status = 'playing'
          and p.player_id = v_sender
          and not p.is_spectator
          and p.left_at is null
          and p.is_alive
    ) then
        raise exception 'You are not an active player in this match';
    end if;

    select last_attacked_by, last_attacked_at
    into v_last_attacker, v_last_attacked_at
    from public.tetrio_players
    where room_id = p_room_id and player_id = v_sender;

    if v_last_attacker is not null
       and v_last_attacked_at > now() - interval '2 seconds'
       and exists (
           select 1 from public.tetrio_players
           where room_id = p_room_id
             and player_id = v_last_attacker
             and not is_spectator
             and left_at is null
             and is_alive
       ) then
        v_target := v_last_attacker;
    else
        select player_id
        into v_target
        from public.tetrio_players
        where room_id = p_room_id
          and player_id <> v_sender
          and not is_spectator
          and left_at is null
          and is_alive
        order by random()
        limit 1;
    end if;

    if v_target is null then
        raise exception 'No living opponent remains';
    end if;

    insert into public.tetrio_events (
        room_id, sender_id, target_id, event_type, payload
    )
    values (
        p_room_id,
        v_sender,
        v_target,
        'attack',
        jsonb_build_object(
            'rows', p_rows,
            'clearType', p_clear_type,
            'combo', p_combo,
            'backToBack', p_back_to_back,
            'allClear', p_all_clear
        )
    )
    returning * into v_event;

    update public.tetrio_players
    set last_attacked_by = v_sender,
        last_attacked_at = now()
    where room_id = p_room_id and player_id = v_target;

    return v_event;
end;
$$;

create or replace function public.forfeit_tetrio_player(p_room_id uuid)
returns public.tetrio_events
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player uuid := auth.uid();
    v_event public.tetrio_events%rowtype;
begin
    update public.tetrio_players
    set left_at = coalesce(left_at, now()),
        is_alive = false,
        is_ready = false
    where room_id = p_room_id
      and player_id = v_player
      and left_at is null;

    if not found then
        raise exception 'You are not an active player in this room';
    end if;

    insert into public.tetrio_events (room_id, sender_id, event_type, payload)
    values (
        p_room_id,
        v_player,
        'forfeit',
        jsonb_build_object('playerId', v_player)
    )
    returning * into v_event;

    return v_event;
end;
$$;

create or replace function public.mark_tetrio_winner(p_room_id uuid, p_winner_id uuid)
returns public.tetrio_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
    v_room public.tetrio_rooms%rowtype;
begin
    if not exists (
        select 1 from public.tetrio_players
        where room_id = p_room_id
          and player_id = auth.uid()
          and not is_spectator
          and left_at is null
    ) then
        raise exception 'You are not in this room';
    end if;
    if not exists (
        select 1 from public.tetrio_players
        where room_id = p_room_id
          and player_id = p_winner_id
          and not is_spectator
          and left_at is null
    ) then
        raise exception 'Winner is not an active player';
    end if;

    update public.tetrio_rooms
    set status = 'finished',
        winner_id = p_winner_id,
        finished_at = coalesce(finished_at, now())
    where id = p_room_id
      and status in ('countdown', 'playing')
    returning * into v_room;

    if not found then
        raise exception 'Match is already finished';
    end if;

    insert into public.tetrio_events (room_id, sender_id, target_id, event_type, payload)
    values (
        p_room_id,
        auth.uid(),
        p_winner_id,
        'winner',
        jsonb_build_object('winnerId', p_winner_id)
    );

    return v_room;
end;
$$;

grant usage on schema public to authenticated;
grant select on public.tetrio_rooms, public.tetrio_players, public.tetrio_events to authenticated;
grant usage, select on all sequences in schema public to authenticated;

grant execute on function public.is_tetrio_member(uuid) to authenticated;
grant execute on function public.create_tetrio_room(text) to authenticated;
grant execute on function public.join_tetrio_room(text, text) to authenticated;
grant execute on function public.join_tetrio_as_spectator(text, text) to authenticated;
grant execute on function public.set_tetrio_ready(uuid, boolean) to authenticated;
grant execute on function public.start_tetrio_match(uuid) to authenticated;
grant execute on function public.submit_tetrio_attack(uuid, integer, text, integer, boolean, boolean) to authenticated;
grant execute on function public.forfeit_tetrio_player(uuid) to authenticated;
grant execute on function public.mark_tetrio_winner(uuid, uuid) to authenticated;
revoke execute on function public.is_tetrio_member(uuid) from anon;
revoke execute on function public.create_tetrio_room(text) from anon;
revoke execute on function public.join_tetrio_room(text, text) from anon;
revoke execute on function public.join_tetrio_as_spectator(text, text) from anon;
revoke execute on function public.set_tetrio_ready(uuid, boolean) from anon;
revoke execute on function public.start_tetrio_match(uuid) from anon;
revoke execute on function public.submit_tetrio_attack(uuid, integer, text, integer, boolean, boolean) from anon;
revoke execute on function public.forfeit_tetrio_player(uuid) from anon;
revoke execute on function public.mark_tetrio_winner(uuid, uuid) from anon;

alter table public.tetrio_rooms replica identity full;
alter table public.tetrio_players replica identity full;
alter table public.tetrio_events replica identity full;

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'tetrio_rooms'
    ) then
        alter publication supabase_realtime add table public.tetrio_rooms;
    end if;
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'tetrio_players'
    ) then
        alter publication supabase_realtime add table public.tetrio_players;
    end if;
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'tetrio_events'
    ) then
        alter publication supabase_realtime add table public.tetrio_events;
    end if;
end;
$$;
