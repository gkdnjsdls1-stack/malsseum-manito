-- =====================================================================
--  말씀 마니또 DB 스키마
--  Supabase > SQL Editor 에 전체를 붙여넣고 Run 하세요.
--
--  ⚠️ 실행 전에 맨 아래 "관리자 비밀번호" 부분을 꼭 바꾸세요.
--
--  구조: 테이블은 직접 읽고 쓸 수 없게 막아두고(RLS),
--        모든 동작은 아래 함수(RPC)로만 합니다.
--        그래서 공개일 전에는 "누가 보냈는지"가 절대 밖으로 나가지 않아요.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 테이블
-- ---------------------------------------------------------------------
create table if not exists settings (
  id            int primary key default 1 check (id = 1),
  title         text not null default '말씀 마니또 1기',
  status        text not null default 'recruiting'
                check (status in ('recruiting', 'closed', 'active', 'revealed')),
  capacity      int  not null default 10,
  start_date    date,
  reveal_date   date,
  admin_pw_hash text not null
);

create table if not exists members (
  id           uuid primary key default gen_random_uuid(),
  nickname     text not null unique,
  insta        text not null,
  intro        text not null default '',
  prayer       text not null default '',
  pin_hash     text not null,
  token        uuid not null unique default gen_random_uuid(),
  fail_count   int  not null default 0,
  locked_until timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists matches (
  giver_id    uuid primary key references members(id) on delete cascade,
  receiver_id uuid not null unique references members(id) on delete cascade
);

create table if not exists cards (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid references members(id) on delete cascade,  -- null = 운영자가 보낸 천사 카드
  to_id       uuid not null references members(id) on delete cascade,
  verse_ref   text not null default '',
  verse_text  text not null default '',
  message     text not null default '',
  theme       text not null default 'cream',
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table settings enable row level security;
alter table members  enable row level security;
alter table matches  enable row level security;
alter table cards    enable row level security;
revoke all on settings, members, matches, cards from anon, authenticated;

-- ---------------------------------------------------------------------
-- 내부 도우미 함수 (외부 호출 불가)
-- ---------------------------------------------------------------------
create or replace function _member(p_token uuid) returns members
language plpgsql security definer set search_path = public, extensions as $$
declare m members;
begin
  select * into m from members where token = p_token;
  if not found then raise exception '로그인이 필요해요'; end if;
  return m;
end $$;

create or replace function _admin(p_pw text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from settings where id = 1 and admin_pw_hash = crypt(p_pw, admin_pw_hash)) then
    perform pg_sleep(1);
    raise exception '관리자 비밀번호가 틀렸어요';
  end if;
end $$;

create or replace function _contact_check(t text) returns void
language plpgsql as $$
begin
  if t ~* '01[016789][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}'
     or t ~* '@[a-z0-9._]{2,}'
     or t ~* 'open\.kakao' then
    raise exception '연락처나 아이디는 보낼 수 없어요. 공개일까지 비밀을 지켜주세요';
  end if;
end $$;

create or replace function _theme(t text) returns text
language sql immutable as $$
  select case when t in ('cream', 'blossom', 'sky', 'mint', 'lavender') then t else 'cream' end;
$$;

-- ---------------------------------------------------------------------
-- 누구나
-- ---------------------------------------------------------------------
create or replace function public_info() returns json
language sql security definer set search_path = public, extensions as $$
  select json_build_object(
    'title', s.title, 'status', s.status, 'capacity', s.capacity,
    'start_date', s.start_date, 'reveal_date', s.reveal_date,
    'count', (select count(*) from members))
  from settings s where s.id = 1;
$$;

create or replace function register(p_nickname text, p_insta text, p_intro text, p_prayer text, p_pin text)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare s settings; v_token uuid;
begin
  perform pg_advisory_xact_lock(4242);
  select * into s from settings where id = 1;
  if s.status <> 'recruiting' then raise exception '모집이 마감되었어요'; end if;
  if (select count(*) from members) >= s.capacity then raise exception '정원이 모두 찼어요'; end if;

  p_nickname := btrim(coalesce(p_nickname, ''));
  p_insta    := btrim(coalesce(p_insta, ''), ' @');
  if char_length(p_nickname) not between 1 and 12 then raise exception '닉네임은 1~12자로 입력해 주세요'; end if;
  if char_length(p_insta) not between 1 and 30 then raise exception '인스타 아이디를 입력해 주세요'; end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then raise exception 'PIN은 숫자 4자리예요'; end if;
  if char_length(coalesce(p_intro, '')) > 60 or char_length(coalesce(p_prayer, '')) > 300 then
    raise exception '글자 수가 너무 많아요';
  end if;
  if exists (select 1 from members where lower(nickname) = lower(p_nickname)) then
    raise exception '이미 사용 중인 닉네임이에요';
  end if;

  insert into members (nickname, insta, intro, prayer, pin_hash)
  values (p_nickname, p_insta, btrim(coalesce(p_intro, '')), btrim(coalesce(p_prayer, '')), crypt(p_pin, gen_salt('bf')))
  returning token into v_token;
  return v_token::text;
end $$;

-- PIN을 5번 틀리면 30분 잠금
create or replace function login(p_nickname text, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare m members;
begin
  select * into m from members where lower(nickname) = lower(btrim(coalesce(p_nickname, '')));
  if not found then return json_build_object('error', '닉네임 또는 PIN이 맞지 않아요'); end if;
  if m.locked_until is not null and m.locked_until > now() then
    return json_build_object('error', 'PIN을 여러 번 틀려서 30분간 잠겼어요. 급하면 운영자에게 DM 주세요');
  end if;
  if m.pin_hash = crypt(coalesce(p_pin, ''), m.pin_hash) then
    update members set fail_count = 0, locked_until = null where id = m.id;
    return json_build_object('token', m.token);
  end if;
  update members
     set fail_count   = case when fail_count + 1 >= 5 then 0 else fail_count + 1 end,
         locked_until = case when fail_count + 1 >= 5 then now() + interval '30 minutes' else null end
   where id = m.id;
  return json_build_object('error', '닉네임 또는 PIN이 맞지 않아요');
end $$;

-- ---------------------------------------------------------------------
-- 참여자 (토큰 필요)
-- ---------------------------------------------------------------------
create or replace function me(p_token uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare m members; s settings; r members;
begin
  m := _member(p_token);
  select * into s from settings where id = 1;
  if s.status in ('active', 'revealed') then
    select mm.* into r from matches x join members mm on mm.id = x.receiver_id where x.giver_id = m.id;
  end if;
  return json_build_object(
    'me', json_build_object('id', m.id, 'nickname', m.nickname, 'intro', m.intro, 'prayer', m.prayer),
    'settings', public_info(),
    'manito', case when r.id is null then null
                   else json_build_object('nickname', r.nickname, 'intro', r.intro, 'prayer', r.prayer) end,
    'received', (select count(*) from cards where to_id = m.id and not hidden),
    'sent', (select count(*) from cards where from_id = m.id));
end $$;

create or replace function send_card(p_token uuid, p_verse_ref text, p_verse_text text, p_message text, p_theme text)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare m members; v_to uuid; v_id uuid;
begin
  m := _member(p_token);
  if (select status from settings where id = 1) <> 'active' then raise exception '지금은 카드를 보낼 수 없어요'; end if;
  select receiver_id into v_to from matches where giver_id = m.id;
  if v_to is null then raise exception '아직 마니또가 정해지지 않았어요'; end if;

  p_verse_ref := btrim(coalesce(p_verse_ref, ''));
  p_verse_text := btrim(coalesce(p_verse_text, ''));
  p_message := btrim(coalesce(p_message, ''));
  if char_length(p_verse_ref) > 40 or char_length(p_verse_text) > 500 or char_length(p_message) > 500 then
    raise exception '글자 수가 너무 많아요';
  end if;
  if p_verse_text = '' and p_message = '' then raise exception '말씀이나 메시지를 입력해 주세요'; end if;
  perform _contact_check(p_verse_ref || ' ' || p_verse_text || ' ' || p_message);
  if (select count(*) from cards where from_id = m.id and created_at > now() - interval '1 day') >= 10 then
    raise exception '하루에 10장까지 보낼 수 있어요';
  end if;

  insert into cards (from_id, to_id, verse_ref, verse_text, message, theme)
  values (m.id, v_to, p_verse_ref, p_verse_text, p_message, _theme(p_theme))
  returning id into v_id;
  return v_id;
end $$;

-- 받은 카드: 공개 전에는 보낸 사람이 절대 포함되지 않음
create or replace function inbox(p_token uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare m members; v_revealed boolean;
begin
  m := _member(p_token);
  v_revealed := (select status from settings where id = 1) = 'revealed';
  return coalesce((
    select json_agg(json_build_object(
      'id', c.id, 'verse_ref', c.verse_ref, 'verse_text', c.verse_text, 'message', c.message,
      'theme', c.theme, 'created_at', c.created_at,
      'from', case when not v_revealed then null
                   when c.from_id is null then '운영자 (천사 카드)'
                   else f.nickname end
    ) order by c.created_at desc)
    from cards c left join members f on f.id = c.from_id
    where c.to_id = m.id and not c.hidden), '[]'::json);
end $$;

create or replace function sent(p_token uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare m members;
begin
  m := _member(p_token);
  return coalesce((
    select json_agg(json_build_object(
      'id', c.id, 'verse_ref', c.verse_ref, 'verse_text', c.verse_text, 'message', c.message,
      'theme', c.theme, 'created_at', c.created_at, 'to', t.nickname, 'hidden', c.hidden
    ) order by c.created_at desc)
    from cards c join members t on t.id = c.to_id
    where c.from_id = m.id), '[]'::json);
end $$;

create or replace function reveal(p_token uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare m members;
begin
  m := _member(p_token);
  if (select status from settings where id = 1) <> 'revealed' then raise exception '아직 공개 전이에요'; end if;
  return json_build_object(
    'my_angel', (select g.nickname from matches x join members g on g.id = x.giver_id where x.receiver_id = m.id),
    'my_manito', (select r.nickname from matches x join members r on r.id = x.receiver_id where x.giver_id = m.id),
    'total_cards', (select count(*) from cards where not hidden),
    'ring', (
      with recursive ring(id, nickname, depth) as (
        select m.id, m.nickname, 0
        union all
        select r.id, r.nickname, ring.depth + 1
        from ring
        join matches x on x.giver_id = ring.id
        join members r on r.id = x.receiver_id
        where r.id <> m.id and ring.depth < 200
      )
      select json_agg(json_build_object(
        'nickname', ring.nickname,
        'sent', (select count(*) from cards c where c.from_id = ring.id and not c.hidden)
      ) order by ring.depth) from ring));
end $$;

-- ---------------------------------------------------------------------
-- 운영자 (관리자 비밀번호 필요)
-- ---------------------------------------------------------------------
create or replace function admin_check(p_pw text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_pw);
  return true;
end $$;

create or replace function admin_overview(p_pw text) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_pw);
  return json_build_object(
    'settings', (select json_build_object('title', title, 'status', status, 'capacity', capacity,
                   'start_date', start_date, 'reveal_date', reveal_date) from settings where id = 1),
    'members', coalesce((
      select json_agg(json_build_object(
        'id', m.id, 'nickname', m.nickname, 'insta', m.insta, 'intro', m.intro, 'prayer', m.prayer,
        'created_at', m.created_at,
        'locked', coalesce(m.locked_until > now(), false),
        'manito', (select r.nickname from matches x join members r on r.id = x.receiver_id where x.giver_id = m.id),
        'sent', (select count(*) from cards c where c.from_id = m.id),
        'received', (select count(*) from cards c where c.to_id = m.id and not c.hidden),
        'last_sent', (select max(c.created_at) from cards c where c.from_id = m.id)
      ) order by m.created_at) from members m), '[]'::json),
    'cards', coalesce((
      select json_agg(json_build_object(
        'id', c.id, 'from', coalesce(f.nickname, '천사(운영자)'), 'to', t.nickname,
        'verse_ref', c.verse_ref, 'verse_text', c.verse_text, 'message', c.message,
        'theme', c.theme, 'hidden', c.hidden, 'created_at', c.created_at
      ) order by c.created_at desc)
      from cards c left join members f on f.id = c.from_id join members t on t.id = c.to_id), '[]'::json));
end $$;

create or replace function admin_update_settings(p_pw text, p_title text, p_capacity int, p_start date, p_reveal date)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_pw);
  if p_capacity < 3 or p_capacity > 100 then raise exception '정원은 3~100명으로 설정해 주세요'; end if;
  update settings set title = btrim(p_title), capacity = p_capacity, start_date = p_start, reveal_date = p_reveal
   where id = 1;
end $$;

-- 단계: recruiting(모집 중) → closed(모집 마감) → active(진행 중) → revealed(공개)
create or replace function admin_set_status(p_pw text, p_status text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare cur text; n int;
begin
  perform _admin(p_pw);
  select status into cur from settings where id = 1;
  if p_status = 'recruiting' and cur = 'closed' then
    delete from matches where true;
  elsif p_status = 'closed' and cur = 'recruiting' then
    null;
  elsif p_status = 'active' and cur = 'closed' then
    select count(*) into n from members;
    if n < 3 or (select count(*) from matches) <> n then raise exception '먼저 매칭을 해주세요'; end if;
  elsif p_status = 'active' and cur = 'revealed' then
    null;
  elsif p_status = 'revealed' and cur = 'active' then
    null;
  else
    raise exception '이 단계로는 바로 바꿀 수 없어요';
  end if;
  update settings set status = p_status where id = 1;
end $$;

-- 모든 사람을 무작위 한 바퀴(A→B→C→…→A)로 연결
create or replace function admin_match(p_pw text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare ids uuid[]; n int;
begin
  perform _admin(p_pw);
  if (select status from settings where id = 1) <> 'closed' then
    raise exception '모집 마감 상태에서만 매칭할 수 있어요';
  end if;
  select array_agg(id order by random()) into ids from members;
  n := coalesce(array_length(ids, 1), 0);
  if n < 3 then raise exception '3명 이상이어야 매칭할 수 있어요'; end if;
  delete from matches where true;
  for i in 1..n loop
    insert into matches (giver_id, receiver_id) values (ids[i], ids[(i % n) + 1]);
  end loop;
end $$;

-- 노쇼 대응: 운영자가 대신 보내는 카드
create or replace function admin_angel_card(p_pw text, p_to uuid, p_verse_ref text, p_verse_text text, p_message text, p_theme text)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  perform _admin(p_pw);
  if not exists (select 1 from members where id = p_to) then raise exception '받는 사람을 찾을 수 없어요'; end if;
  if btrim(coalesce(p_verse_text, '')) = '' and btrim(coalesce(p_message, '')) = '' then
    raise exception '말씀이나 메시지를 입력해 주세요';
  end if;
  insert into cards (from_id, to_id, verse_ref, verse_text, message, theme)
  values (null, p_to, btrim(coalesce(p_verse_ref, '')), btrim(coalesce(p_verse_text, '')),
          btrim(coalesce(p_message, '')), _theme(p_theme))
  returning id into v_id;
  return v_id;
end $$;

create or replace function admin_hide_card(p_pw text, p_card uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_pw);
  update cards set hidden = p_hidden where id = p_card;
end $$;

-- 참여자 내보내기. 매칭된 상태라면 고리를 자동으로 이어 붙임 (G→X→R 이면 G→R)
create or replace function admin_remove_member(p_pw text, p_member uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare g uuid; r uuid;
begin
  perform _admin(p_pw);
  select giver_id into g from matches where receiver_id = p_member;
  select receiver_id into r from matches where giver_id = p_member;
  delete from matches where giver_id = p_member or receiver_id = p_member;
  if g is not null and r is not null and g <> r then
    insert into matches (giver_id, receiver_id) values (g, r);
  end if;
  delete from members where id = p_member;
  return json_build_object(
    'giver', (select nickname from members where id = g),
    'new_manito', (select nickname from members where id = r));
end $$;

create or replace function admin_reset_pin(p_pw text, p_member uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_pw);
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then raise exception 'PIN은 숫자 4자리예요'; end if;
  update members set pin_hash = crypt(p_pin, gen_salt('bf')), fail_count = 0, locked_until = null
   where id = p_member;
end $$;

-- 다음 기수를 위해 전부 지우기
create or replace function admin_reset_season(p_pw text, p_confirm text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_pw);
  if p_confirm <> '초기화' then raise exception '"초기화"라고 입력해 주세요'; end if;
  delete from cards where true;
  delete from matches where true;
  delete from members where true;
  update settings set status = 'recruiting' where id = 1;
end $$;

-- 관리자 비밀번호 변경
create or replace function admin_change_password(p_pw text, p_new text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_pw);
  if char_length(coalesce(p_new, '')) < 8 then raise exception '8자 이상으로 정해 주세요'; end if;
  update settings set admin_pw_hash = crypt(p_new, gen_salt('bf')) where id = 1;
end $$;

-- ---------------------------------------------------------------------
-- 권한: 내부 도우미는 외부에서 호출 불가
-- ---------------------------------------------------------------------
revoke execute on function _member(uuid)       from public, anon, authenticated;
revoke execute on function _admin(text)        from public, anon, authenticated;
revoke execute on function _contact_check(text) from public, anon, authenticated;
revoke execute on function _theme(text)        from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 초기 설정  ⚠️ 관리자 비밀번호를 바꾸세요 (8자 이상)
-- ---------------------------------------------------------------------
insert into settings (id, title, start_date, reveal_date, admin_pw_hash)
values (1, '말씀 마니또 1기', current_date + 7, current_date + 21,
        extensions.crypt('여기에-관리자-비밀번호', extensions.gen_salt('bf')))
on conflict (id) do nothing;
