// 서버 호출. config.js 가 비어 있으면 브라우저 안에서 도는 데모 서버(Mock)를 사용합니다.
// Mock 은 supabase/schema.sql 의 함수들과 같은 규칙으로 동작해야 합니다.

const Mock = (() => {
  const KEY = 'manito-demo-db';
  const ADMIN_PW = 'admin';
  const THEMES = ['cream', 'blossom', 'sky', 'mint', 'lavender'];

  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const now = () => new Date().toISOString();

  function fresh() {
    const t = new Date();
    return {
      settings: { title: '말씀 마니또 1기', status: 'recruiting', capacity: 10,
                  start_date: iso(addDays(t, 7)), reveal_date: iso(addDays(t, 21)) },
      members: [], matches: [], cards: [],
    };
  }
  let db = fresh();
  try { const s = localStorage.getItem(KEY); if (s) db = JSON.parse(s); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };

  const fail = (msg) => { throw new Error(msg); };
  const member = (token) => db.members.find((m) => m.token === token) || fail('로그인이 필요해요');
  const byId = (id) => db.members.find((m) => m.id === id);
  const admin = (pw) => { if (pw !== ADMIN_PW) fail('관리자 비밀번호가 틀렸어요'); };
  const receiverOf = (id) => (db.matches.find((x) => x.giver_id === id) || {}).receiver_id;
  const giverOf = (id) => (db.matches.find((x) => x.receiver_id === id) || {}).giver_id;
  const contactCheck = (t) => {
    if (/01[016789][-. ]?\d{3,4}[-. ]?\d{4}/.test(t) || /@[a-z0-9._]{2,}/i.test(t) || /open\.kakao/i.test(t))
      fail('연락처나 아이디는 보낼 수 없어요. 공개일까지 비밀을 지켜주세요');
  };
  const desc = (a, b) => (a.created_at < b.created_at ? 1 : -1);
  const publicInfo = () => ({ ...db.settings, count: db.members.length });

  const H = {
    public_info: () => publicInfo(),

    register({ p_nickname, p_insta, p_intro, p_prayer, p_pin }) {
      const s = db.settings;
      if (s.status !== 'recruiting') fail('모집이 마감되었어요');
      if (db.members.length >= s.capacity) fail('정원이 모두 찼어요');
      const nick = (p_nickname || '').trim();
      const insta = (p_insta || '').trim().replace(/^[@ ]+|[@ ]+$/g, '');
      if (nick.length < 1 || nick.length > 12) fail('닉네임은 1~12자로 입력해 주세요');
      if (insta.length < 1 || insta.length > 30) fail('인스타 아이디를 입력해 주세요');
      if (!/^\d{4}$/.test(p_pin || '')) fail('PIN은 숫자 4자리예요');
      if ((p_intro || '').length > 60 || (p_prayer || '').length > 300) fail('글자 수가 너무 많아요');
      if (db.members.some((m) => m.nickname.toLowerCase() === nick.toLowerCase())) fail('이미 사용 중인 닉네임이에요');
      const m = { id: uid(), nickname: nick, insta, intro: (p_intro || '').trim(), prayer: (p_prayer || '').trim(),
                  pin: p_pin, token: uid(), created_at: now() };
      db.members.push(m);
      return m.token;
    },

    login({ p_nickname, p_pin }) {
      const m = db.members.find((x) => x.nickname.toLowerCase() === (p_nickname || '').trim().toLowerCase());
      if (!m || m.pin !== p_pin) return { error: '닉네임 또는 PIN이 맞지 않아요' };
      return { token: m.token };
    },

    me({ p_token }) {
      const m = member(p_token);
      const s = db.settings;
      const r = ['active', 'revealed'].includes(s.status) ? byId(receiverOf(m.id)) : null;
      return {
        me: { id: m.id, nickname: m.nickname, intro: m.intro, prayer: m.prayer },
        settings: publicInfo(),
        manito: r ? { nickname: r.nickname, intro: r.intro, prayer: r.prayer } : null,
        received: db.cards.filter((c) => c.to_id === m.id && !c.hidden).length,
        sent: db.cards.filter((c) => c.from_id === m.id).length,
      };
    },

    send_card({ p_token, p_verse_ref, p_verse_text, p_message, p_theme }) {
      const m = member(p_token);
      if (db.settings.status !== 'active') fail('지금은 카드를 보낼 수 없어요');
      const to = receiverOf(m.id) || fail('아직 마니또가 정해지지 않았어요');
      const ref = (p_verse_ref || '').trim(), text = (p_verse_text || '').trim(), msg = (p_message || '').trim();
      if (ref.length > 40 || text.length > 500 || msg.length > 500) fail('글자 수가 너무 많아요');
      if (!text && !msg) fail('말씀이나 메시지를 입력해 주세요');
      contactCheck(ref + ' ' + text + ' ' + msg);
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      if (db.cards.filter((c) => c.from_id === m.id && c.created_at > dayAgo).length >= 10) fail('하루에 10장까지 보낼 수 있어요');
      const c = { id: uid(), from_id: m.id, to_id: to, verse_ref: ref, verse_text: text, message: msg,
                  theme: THEMES.includes(p_theme) ? p_theme : 'cream', hidden: false, created_at: now() };
      db.cards.push(c);
      return c.id;
    },

    inbox({ p_token }) {
      const m = member(p_token);
      const revealed = db.settings.status === 'revealed';
      return db.cards.filter((c) => c.to_id === m.id && !c.hidden).sort(desc).map((c) => ({
        id: c.id, verse_ref: c.verse_ref, verse_text: c.verse_text, message: c.message, theme: c.theme,
        created_at: c.created_at,
        from: !revealed ? null : c.from_id ? (byId(c.from_id) || {}).nickname : '운영자 (천사 카드)',
      }));
    },

    sent({ p_token }) {
      const m = member(p_token);
      return db.cards.filter((c) => c.from_id === m.id).sort(desc).map((c) => ({
        id: c.id, verse_ref: c.verse_ref, verse_text: c.verse_text, message: c.message, theme: c.theme,
        created_at: c.created_at, to: (byId(c.to_id) || {}).nickname, hidden: c.hidden,
      }));
    },

    reveal({ p_token }) {
      const m = member(p_token);
      if (db.settings.status !== 'revealed') fail('아직 공개 전이에요');
      const ring = [];
      let cur = m.id;
      for (let i = 0; i < 200 && cur; i++) {
        const x = byId(cur);
        ring.push({ nickname: x.nickname, sent: db.cards.filter((c) => c.from_id === cur && !c.hidden).length });
        cur = receiverOf(cur);
        if (cur === m.id) break;
      }
      return {
        my_angel: (byId(giverOf(m.id)) || {}).nickname || null,
        my_manito: (byId(receiverOf(m.id)) || {}).nickname || null,
        total_cards: db.cards.filter((c) => !c.hidden).length,
        ring,
      };
    },

    admin_check({ p_pw }) { admin(p_pw); return true; },

    admin_overview({ p_pw }) {
      admin(p_pw);
      const { title, status, capacity, start_date, reveal_date } = db.settings;
      return {
        settings: { title, status, capacity, start_date, reveal_date },
        members: db.members.map((m) => {
          const mine = db.cards.filter((c) => c.from_id === m.id);
          return {
            id: m.id, nickname: m.nickname, insta: m.insta, intro: m.intro, prayer: m.prayer,
            created_at: m.created_at, locked: false,
            manito: (byId(receiverOf(m.id)) || {}).nickname || null,
            sent: mine.length,
            received: db.cards.filter((c) => c.to_id === m.id && !c.hidden).length,
            last_sent: mine.length ? mine.map((c) => c.created_at).sort().pop() : null,
          };
        }),
        cards: [...db.cards].sort(desc).map((c) => ({
          id: c.id, from: c.from_id ? (byId(c.from_id) || {}).nickname : '천사(운영자)',
          to: (byId(c.to_id) || {}).nickname, verse_ref: c.verse_ref, verse_text: c.verse_text,
          message: c.message, theme: c.theme, hidden: c.hidden, created_at: c.created_at,
        })),
      };
    },

    admin_update_settings({ p_pw, p_title, p_capacity, p_start, p_reveal }) {
      admin(p_pw);
      if (p_capacity < 3 || p_capacity > 100) fail('정원은 3~100명으로 설정해 주세요');
      Object.assign(db.settings, { title: (p_title || '').trim(), capacity: p_capacity,
                                   start_date: p_start, reveal_date: p_reveal });
    },

    admin_set_status({ p_pw, p_status }) {
      admin(p_pw);
      const cur = db.settings.status;
      const ok = (p_status === 'recruiting' && cur === 'closed') || (p_status === 'closed' && cur === 'recruiting') ||
                 (p_status === 'active' && (cur === 'closed' || cur === 'revealed')) ||
                 (p_status === 'revealed' && cur === 'active');
      if (!ok) fail('이 단계로는 바로 바꿀 수 없어요');
      if (p_status === 'recruiting') db.matches = [];
      if (p_status === 'active' && cur === 'closed') {
        const n = db.members.length;
        if (n < 3 || db.matches.length !== n) fail('먼저 매칭을 해주세요');
      }
      db.settings.status = p_status;
    },

    admin_match({ p_pw }) {
      admin(p_pw);
      if (db.settings.status !== 'closed') fail('모집 마감 상태에서만 매칭할 수 있어요');
      const ids = db.members.map((m) => m.id);
      if (ids.length < 3) fail('3명 이상이어야 매칭할 수 있어요');
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      db.matches = ids.map((id, i) => ({ giver_id: id, receiver_id: ids[(i + 1) % ids.length] }));
    },

    admin_angel_card({ p_pw, p_to, p_verse_ref, p_verse_text, p_message, p_theme }) {
      admin(p_pw);
      if (!byId(p_to)) fail('받는 사람을 찾을 수 없어요');
      if (!(p_verse_text || '').trim() && !(p_message || '').trim()) fail('말씀이나 메시지를 입력해 주세요');
      const c = { id: uid(), from_id: null, to_id: p_to, verse_ref: (p_verse_ref || '').trim(),
                  verse_text: (p_verse_text || '').trim(), message: (p_message || '').trim(),
                  theme: THEMES.includes(p_theme) ? p_theme : 'cream', hidden: false, created_at: now() };
      db.cards.push(c);
      return c.id;
    },

    admin_hide_card({ p_pw, p_card, p_hidden }) {
      admin(p_pw);
      const c = db.cards.find((x) => x.id === p_card);
      if (c) c.hidden = p_hidden;
    },

    admin_remove_member({ p_pw, p_member }) {
      admin(p_pw);
      const g = giverOf(p_member), r = receiverOf(p_member);
      db.matches = db.matches.filter((x) => x.giver_id !== p_member && x.receiver_id !== p_member);
      if (g && r && g !== r) db.matches.push({ giver_id: g, receiver_id: r });
      db.members = db.members.filter((m) => m.id !== p_member);
      db.cards = db.cards.filter((c) => c.from_id !== p_member && c.to_id !== p_member);
      return { giver: (byId(g) || {}).nickname || null, new_manito: (byId(r) || {}).nickname || null };
    },

    admin_reset_pin({ p_pw, p_member, p_pin }) {
      admin(p_pw);
      if (!/^\d{4}$/.test(p_pin || '')) fail('PIN은 숫자 4자리예요');
      const m = byId(p_member);
      if (m) m.pin = p_pin;
    },

    admin_reset_season({ p_pw, p_confirm }) {
      admin(p_pw);
      if (p_confirm !== '초기화') fail('"초기화"라고 입력해 주세요');
      db.cards = []; db.matches = []; db.members = [];
      db.settings.status = 'recruiting';
    },

    admin_change_password() { fail('데모 모드에서는 비밀번호를 바꿀 수 없어요 (데모 비밀번호: admin)'); },

    // 데모 전용: 가상 참여자 채우기
    admin_demo_seed({ p_pw }) {
      admin(p_pw);
      if (db.settings.status !== 'recruiting') fail('모집 중일 때만 채울 수 있어요');
      const names = [['은혜', '찬양 좋아하는 직장인이에요'], ['소망', '대학원생, 커피 없이는 못 살아요'],
                     ['기쁨', '주일학교 교사 3년차'], ['평강', '새벽기도 도전 중!'], ['다윗', '기타 치는 청년'],
                     ['룻', '이직 준비 중이에요'], ['요셉', '군대 다녀온 복학생'], ['한나', '육아하는 엄마예요'],
                     ['사무엘', '찬양팀 드럼']];
      const prayers = ['이번 학기 건강하게 마칠 수 있도록', '가족의 구원을 위해', '새 직장에 잘 적응하도록',
                       '말씀 묵상을 꾸준히 할 수 있도록', '마음의 평안을 위해'];
      for (const [nick, intro] of names) {
        if (db.members.length >= db.settings.capacity - 1) break;
        if (db.members.some((m) => m.nickname === nick)) continue;
        db.members.push({ id: uid(), nickname: nick, insta: 'demo_' + nick, intro,
                          prayer: prayers[db.members.length % prayers.length], pin: '0000', token: uid(), created_at: now() });
      }
    },
  };

  async function call(fn, args) {
    const h = H[fn] || fail('알 수 없는 요청: ' + fn);
    await new Promise((r) => setTimeout(r, 120));
    const result = h(args || {});
    save();
    return result === undefined ? null : JSON.parse(JSON.stringify(result));
  }
  return { call };
})();

const API = (() => {
  const cfg = window.MANITO_CONFIG || {};
  const isDemo = !cfg.supabaseUrl || !cfg.supabaseAnonKey;
  let client = null;

  async function call(fn, args) {
    if (isDemo) return Mock.call(fn, args);
    if (!client) client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const { data, error } = await client.rpc(fn, args || {});
    if (error) {
      if (/uuid/i.test(error.message)) throw new Error('로그인이 필요해요');
      throw new Error(error.message || '서버 오류가 났어요');
    }
    return data;
  }
  return { call, isDemo };
})();
