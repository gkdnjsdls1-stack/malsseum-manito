(() => {
  // ------------------------------------------------------------------
  // 공통 도우미
  // ------------------------------------------------------------------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CFG = window.MANITO_CONFIG || {};
  const THEMES = [['cream', '#FFF7E8'], ['blossom', '#FDEBEA'], ['sky', '#E9F2FA'], ['mint', '#E7F4EC'], ['lavender', '#F0EBF9']];
  const THEME_KEYS = THEMES.map((t) => t[0]);
  const STATUS = { recruiting: '모집 중', closed: '모집 마감', active: '진행 중', revealed: '공개 완료' };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} },
  };
  const sess = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} },
  };
  const token = () => store.get('manito-token');
  const go = (path) => { location.hash = '#/' + path; };
  const siteUrl = () => location.href.split('#')[0];

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  function modal(html) {
    const m = $('#modal');
    m.innerHTML = `<div class="modal-box">${html}</div>`;
    m.hidden = false;
    m.onclick = (e) => { if (e.target === m) closeModal(); };
  }
  function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }

  function confirmBox(msg, okLabel = '확인', danger = false) {
    return new Promise((resolve) => {
      modal(`<div class="stack"><p>${msg}</p>
        <div class="row"><button class="btn ghost block" data-v="0">취소</button>
        <button class="btn ${danger ? 'danger' : ''} block" data-v="1">${esc(okLabel)}</button></div></div>`);
      $$('#modal [data-v]').forEach((b) => (b.onclick = () => { closeModal(); resolve(b.dataset.v === '1'); }));
    });
  }

  function promptBox(msg, { placeholder = '', numeric = false } = {}) {
    return new Promise((resolve) => {
      modal(`<form class="stack" id="pf"><p>${msg}</p>
        <input type="text" id="pf-v" placeholder="${esc(placeholder)}" ${numeric ? 'inputmode="numeric" maxlength="4"' : ''} autocomplete="off">
        <div class="row"><button type="button" class="btn ghost block" id="pf-c">취소</button>
        <button class="btn block">확인</button></div></form>`);
      $('#pf-v').focus();
      $('#pf-c').onclick = () => { closeModal(); resolve(null); };
      $('#pf').onsubmit = (e) => { e.preventDefault(); const v = $('#pf-v').value; closeModal(); resolve(v); };
    });
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('복사했어요'); }
    catch (e) { modal(`<div class="stack"><p class="small muted">아래 내용을 길게 눌러 복사하세요</p>
      <textarea readonly style="min-height:140px">${esc(text)}</textarea>
      <button class="btn block" onclick="document.getElementById('modal').hidden=true">닫기</button></div>`); }
  }

  // 날짜
  const parseDate = (s) => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s) => { const d = parseDate(s); return d ? `${d.getMonth() + 1}월 ${d.getDate()}일` : '미정'; };
  const dday = (s) => { const d = parseDate(s); if (!d) return null; const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((d - t) / 86400000); };
  const ddayLabel = (s) => { const n = dday(s); return n == null ? '' : n > 0 ? `D-${n}` : n === 0 ? 'D-DAY' : `D+${-n}`; };
  const fmtTime = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const hoursSince = (iso) => (Date.now() - new Date(iso).getTime()) / 3600000;

  const hasContact = (t) => [/01[016789][-. ]?\d{3,4}[-. ]?\d{4}/, /@[a-z0-9._]{2,}/i, /open\.kakao/i].some((r) => r.test(t));

  const topbar = (title, back = 'home', right = '') => `
    <div class="topbar">
      ${back != null ? `<a class="icon-btn" href="#/${back}" aria-label="뒤로">←</a>` : ''}
      <div class="title">${esc(title)}</div>${right}
    </div>`;

  const footer = () => `<div class="footer">말씀 마니또${CFG.contactInsta
    ? ` · 문의 <a href="https://instagram.com/${esc(CFG.contactInsta)}" target="_blank" rel="noopener">@${esc(CFG.contactInsta)}</a>` : ''}</div>`;

  function counter(input, el, max) {
    const upd = () => { el.textContent = `${input.value.length} / ${max}`; };
    input.addEventListener('input', upd);
    upd();
  }

  // ------------------------------------------------------------------
  // 말씀 카드 & 스토리 이미지
  // ------------------------------------------------------------------
  function cardHTML(c, foot = '') {
    const theme = THEME_KEYS.includes(c.theme) ? c.theme : 'cream';
    const empty = !c.verse_text && !c.message;
    return `<div class="card theme-${theme}">
      ${c.verse_text ? `<div class="c-verse">${esc(c.verse_text)}</div>` : ''}
      ${c.verse_ref ? `<div class="c-ref">${esc(c.verse_ref)}</div>` : ''}
      ${c.message ? `<div class="c-msg">${esc(c.message)}</div>` : ''}
      ${empty ? '<div class="c-empty">말씀을 고르거나 메시지를 적어보세요</div>' : ''}
      ${foot ? `<div class="c-foot">${foot}</div>` : ''}
    </div>`;
  }

  async function saveStory(inner, filename) {
    if (!window.htmlToImage) { toast('이미지 기능을 불러오지 못했어요'); return; }
    const stage = document.createElement('div');
    stage.className = 'story-stage';
    stage.innerHTML = `<div class="story">${inner}</div>`;
    document.body.appendChild(stage);
    modal('<div class="loading" style="padding:40px 0">이미지 만드는 중…</div>');
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const node = stage.firstElementChild;
      let url;
      try { url = await window.htmlToImage.toPng(node, { pixelRatio: 3 }); }
      catch (e) { url = await window.htmlToImage.toPng(node, { pixelRatio: 3, skipFonts: true }); }
      showImage(url, filename);
    } catch (e) {
      closeModal();
      toast('이미지를 만들지 못했어요');
    } finally {
      stage.remove();
    }
  }

  function showImage(url, filename) {
    modal(`<div class="stack">
      <img src="${url}" alt="저장할 스토리 이미지">
      <p class="small muted center">이미지를 길게 눌러 저장하거나, 아래 버튼을 눌러주세요</p>
      <div class="row"><button class="btn ghost block" id="m-close">닫기</button>
      <button class="btn block" id="m-save">저장 / 공유</button></div></div>`);
    $('#m-close').onclick = closeModal;
    $('#m-save').onclick = async () => {
      try {
        const blob = await (await fetch(url)).blob();
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
    };
  }

  // ------------------------------------------------------------------
  // 페이지: 모집 (첫 화면)
  // ------------------------------------------------------------------
  async function Landing(app) {
    const info = await API.call('public_info');
    const full = info.count >= info.capacity;
    const pct = Math.min(100, Math.round((info.count / info.capacity) * 100));
    const days = info.start_date && info.reveal_date
      ? Math.round((parseDate(info.reveal_date) - parseDate(info.start_date)) / 86400000) : null;

    let cta;
    if (token()) {
      cta = `<a class="btn block" href="#/home">내 마니또 보러 가기 💌</a>`;
    } else if (info.status === 'recruiting' && !full) {
      cta = `<a class="btn block" href="#/join">신청하기</a>
             <div class="center"><a class="link-btn" href="#/login">이미 신청했어요 · 로그인</a></div>`;
    } else {
      cta = `<div class="panel flat center stack">
               <b>${info.status === 'recruiting' ? '정원이 모두 찼어요' : '이번 기수 모집이 마감되었어요'}</b>
               <p class="small muted">다음 기수 소식은 인스타그램에서 알려드릴게요</p></div>
             <a class="btn ghost block" href="#/login">참여자 로그인</a>`;
    }

    app.innerHTML = `<div class="stack-lg">
      <div class="hero">
        <div class="emoji">💌</div>
        <h1>${esc(info.title)}</h1>
        <p class="lead">${days ? `${days}일 동안, ` : ''}말씀으로 누군가의<br>비밀 친구가 되어주세요</p>
      </div>

      <p class="verse-quote">"서로 사랑하라 내가 너희를 사랑한 것같이"<br><span class="small">요한복음 13:34</span></p>

      <div class="panel stack">
        <div class="row"><span class="pill">${STATUS[info.status]}</span><span class="spacer"></span>
          <span class="small muted">${fmtDate(info.start_date)} ~ ${fmtDate(info.reveal_date)}</span></div>
        <div class="row"><b>참여 인원</b><span class="spacer"></span><b>${info.count} / ${info.capacity}명</b></div>
        <div class="progress"><div style="width:${pct}%"></div></div>
      </div>

      <div class="stack">${cta}</div>

      <div class="panel flat">
        <h3>이렇게 진행돼요</h3>
        <ol class="steps" style="margin-top:8px">
          <li><b>신청하고 기도제목 나누기</b><span class="small muted">닉네임과 기도제목을 적어주세요</span></li>
          <li><b>비밀리에 마니또 배정</b><span class="small muted">모집이 끝나면 인스타 DM으로 알려드려요</span></li>
          <li><b>익명으로 말씀 카드 보내기</b><span class="small muted">마니또를 위해 기도하며 말씀을 전해요</span></li>
          <li><b>마지막 날 서로 공개</b><span class="small muted">누가 나의 마니또였는지 함께 확인해요</span></li>
        </ol>
      </div>

      <div class="panel flat stack">
        <h3>약속해 주세요</h3>
        <p class="small">🙏 매일 마니또의 기도제목으로 기도해 주세요</p>
        <p class="small">💌 하루 한 장 이상 말씀 카드를 보내주세요</p>
        <p class="small">🤫 공개일까지 연락처·인스타 아이디는 비밀이에요</p>
        <p class="small">🕊 끝까지 함께해 주세요. 중간에 빠지면 누군가는 카드를 못 받아요</p>
      </div>
      ${footer()}
    </div>`;
  }

  // ------------------------------------------------------------------
  // 페이지: 신청
  // ------------------------------------------------------------------
  async function Join(app) {
    const info = await API.call('public_info');
    if (info.status !== 'recruiting' || info.count >= info.capacity) {
      app.innerHTML = `${topbar('신청하기', '')}<div class="empty stack"><p>지금은 신청할 수 없어요</p><a class="btn ghost" href="#/">처음으로</a></div>`;
      return;
    }
    app.innerHTML = `${topbar('신청하기', '')}
      <form id="f" class="stack" autocomplete="off">
        <p class="muted small">남은 자리 ${info.capacity - info.count}개 · ${fmtDate(info.start_date)} 시작</p>
        <label class="field"><span><b>닉네임</b> · 마니또에게 보여지는 이름 (12자)</span>
          <input type="text" id="nick" maxlength="12" required></label>
        <label class="field"><span><b>인스타 아이디</b> · 운영자 연락용, 다른 참여자에게는 안 보여요</span>
          <input type="text" id="insta" maxlength="31" placeholder="@" required autocapitalize="off"></label>
        <label class="field"><span><b>한 줄 소개</b> · 마니또가 나를 알 수 있게</span>
          <input type="text" id="intro" maxlength="60" placeholder="예) 찬양 좋아하는 직장인이에요"></label>
        <label class="field"><span><b>기도제목</b> · 나의 마니또만 볼 수 있어요</span>
          <textarea id="prayer" maxlength="300" placeholder="요즘 마음에 품고 있는 기도제목을 나눠주세요"></textarea>
          <div class="counter" id="prayer-c"></div></label>
        <div class="row">
          <label class="field" style="flex:1"><span><b>PIN 4자리</b></span>
            <input type="password" id="pin" inputmode="numeric" maxlength="4" class="pin-input" required></label>
          <label class="field" style="flex:1"><span><b>PIN 확인</b></span>
            <input type="password" id="pin2" inputmode="numeric" maxlength="4" class="pin-input" required></label>
        </div>
        <p class="small muted">PIN은 다시 로그인할 때 필요해요. 꼭 기억해 주세요!</p>
        <div class="panel flat stack">
          <label class="check"><input type="checkbox" id="agree1">
            <span>개인정보(닉네임, 인스타 아이디, 소개, 기도제목) 수집·이용에 동의해요. 이번 기수가 끝나면 삭제돼요.</span></label>
          <label class="check"><input type="checkbox" id="agree2">
            <span>공개일까지 성실히 참여하고, 마니또를 위해 기도할게요.</span></label>
        </div>
        <p class="error-text" id="err"></p>
        <button class="btn block" id="submit">신청 완료하기</button>
      </form>`;

    counter($('#prayer'), $('#prayer-c'), 300);
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      const err = $('#err');
      const pin = $('#pin').value;
      if (!/^\d{4}$/.test(pin)) return (err.textContent = 'PIN은 숫자 4자리로 정해주세요');
      if (pin !== $('#pin2').value) return (err.textContent = 'PIN이 서로 달라요');
      if (!$('#agree1').checked || !$('#agree2').checked) return (err.textContent = '두 가지 모두 체크해 주세요');
      err.textContent = '';
      $('#submit').disabled = true;
      try {
        const t = await API.call('register', {
          p_nickname: $('#nick').value, p_insta: $('#insta').value, p_intro: $('#intro').value,
          p_prayer: $('#prayer').value, p_pin: pin,
        });
        store.set('manito-token', t);
        toast('신청 완료! 함께해 주셔서 고마워요 🙌');
        go('home');
      } catch (ex) {
        err.textContent = ex.message;
        $('#submit').disabled = false;
      }
    };
  }

  // ------------------------------------------------------------------
  // 페이지: 로그인
  // ------------------------------------------------------------------
  async function Login(app) {
    app.innerHTML = `${topbar('로그인', '')}
      <form id="f" class="stack">
        <p class="muted">신청할 때 정한 닉네임과 PIN을 입력해 주세요</p>
        <label class="field"><span>닉네임</span><input type="text" id="nick" maxlength="12" required></label>
        <label class="field"><span>PIN 4자리</span>
          <input type="password" id="pin" inputmode="numeric" maxlength="4" class="pin-input" required></label>
        <p class="error-text" id="err"></p>
        <button class="btn block" id="submit">로그인</button>
        <p class="small muted center">PIN을 잊었다면 운영자에게 인스타 DM을 보내주세요</p>
      </form>`;
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      $('#submit').disabled = true;
      try {
        const r = await API.call('login', { p_nickname: $('#nick').value, p_pin: $('#pin').value });
        if (r.error) throw new Error(r.error);
        store.set('manito-token', r.token);
        go('home');
      } catch (ex) {
        $('#err').textContent = ex.message;
        $('#submit').disabled = false;
      }
    };
  }

  async function loadMe() {
    if (!token()) { go('login'); return null; }
    try {
      return await API.call('me', { p_token: token() });
    } catch (e) {
      if (/로그인/.test(e.message)) { store.set('manito-token', null); toast('다시 로그인해 주세요'); go('login'); return null; }
      throw e;
    }
  }

  // ------------------------------------------------------------------
  // 페이지: 홈
  // ------------------------------------------------------------------
  async function Home(app) {
    const d = await loadMe();
    if (!d) return;
    const s = d.settings;
    const logout = `<button class="icon-btn" id="logout" aria-label="로그아웃" title="로그아웃">⎋</button>`;
    let body;

    if (s.status === 'recruiting' || s.status === 'closed') {
      body = `
        <div class="panel center stack">
          <div style="font-size:44px">🙌</div>
          <h2>${esc(d.me.nickname)}님, 신청 완료!</h2>
          <p class="muted">모집이 끝나면 마니또를 정해서<br>인스타 DM으로 알려드릴게요</p>
          <p class="small"><span class="pill">${fmtDate(s.start_date)} 시작</span></p>
        </div>
        <div class="panel flat stack">
          <div class="row"><b>현재 참여 인원</b><span class="spacer"></span><b>${s.count} / ${s.capacity}명</b></div>
          <div class="progress"><div style="width:${Math.min(100, (s.count / s.capacity) * 100)}%"></div></div>
        </div>
        <div class="panel flat stack">
          <h3>내가 나눈 기도제목</h3>
          <p class="small muted">나의 마니또만 볼 수 있어요</p>
          <div class="prayer-box">${esc(d.me.prayer) || '<span class="muted">적지 않았어요</span>'}</div>
        </div>`;
    } else if (s.status === 'active') {
      const m = d.manito;
      body = `
        <div class="row"><span class="pill">진행 중</span><span class="spacer"></span>
          <span class="dday">공개까지 <b>${ddayLabel(s.reveal_date)}</b></span></div>
        <div class="panel manito-box" id="mbox">
          <p class="small muted">나의 마니또</p>
          <div class="manito-name blurred" id="mname">${esc(m ? m.nickname : '-')}</div>
          <button class="link-btn" id="mtoggle">👀 눌러서 보기</button>
          ${m && m.intro ? `<p class="muted small" style="margin-top:8px">${esc(m.intro)}</p>` : ''}
          <div class="prayer-box"><b class="small">🙏 기도제목</b><br>${m && m.prayer ? esc(m.prayer) : '<span class="muted">기도제목을 적지 않았어요. 마니또를 위해 자유롭게 기도해 주세요</span>'}</div>
        </div>
        ${d.sent === 0 ? `<div class="panel flat center small">아직 보낸 카드가 없어요. 첫 말씀을 보내볼까요? 💌</div>` : ''}
        <a class="btn block" href="#/send">💌 말씀 카드 보내기</a>
        <div class="stat-row">
          <a class="stat" href="#/cards?tab=in"><b>${d.received}</b><span>받은 카드</span></a>
          <a class="stat" href="#/cards?tab=out"><b>${d.sent}</b><span>보낸 카드</span></a>
        </div>
        <p class="small muted center">오늘도 마니또의 기도제목으로 기도해 주세요 🙏</p>`;
    } else {
      body = `
        <div class="panel center stack">
          <div style="font-size:44px">🎉</div>
          <h2>마니또가 공개되었어요!</h2>
          <p class="muted">그동안 나에게 말씀을 보내준 사람은 누구였을까요?</p>
          <a class="btn block" href="#/reveal">공개 확인하기</a>
        </div>
        <div class="stat-row">
          <a class="stat" href="#/cards?tab=in"><b>${d.received}</b><span>받은 카드</span></a>
          <a class="stat" href="#/cards?tab=out"><b>${d.sent}</b><span>보낸 카드</span></a>
        </div>`;
    }

    app.innerHTML = `${topbar(`${d.me.nickname}님`, null, logout)}<div class="stack">${body}</div>${footer()}`;

    const toggle = $('#mtoggle');
    if (toggle) {
      const flip = () => {
        const hidden = $('#mname').classList.toggle('blurred');
        toggle.textContent = hidden ? '👀 눌러서 보기' : '🙈 가리기';
      };
      toggle.onclick = flip;
      $('#mname').onclick = flip;
    }
    $('#logout').onclick = async () => {
      if (await confirmBox('로그아웃할까요?<br><span class="small muted">다시 들어올 땐 닉네임과 PIN이 필요해요</span>', '로그아웃')) {
        store.set('manito-token', null);
        go('');
      }
    };
  }

  // ------------------------------------------------------------------
  // 말씀 작성 폼 (참여자 카드 보내기 + 운영자 천사 카드에서 함께 사용)
  // ------------------------------------------------------------------
  function verseComposer(root, onChange) {
    const topics = Object.keys(window.VERSES || {});
    const st = { tab: 'pick', topic: topics[0], ref: '', text: '', msg: '', theme: 'cream' };

    root.innerHTML = `
      <div class="stack">
        <h3>1. 말씀 고르기</h3>
        <div class="tabs" id="vc-tabs"><button type="button" data-t="pick" class="on">추천 말씀</button><button type="button" data-t="write">직접 쓰기</button></div>
        <div id="vc-pick" class="stack">
          <div class="row"><div class="chips" id="vc-topics" style="flex:1">${topics.map((t, i) =>
            `<button type="button" data-topic="${esc(t)}" class="${i === 0 ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>
            <button type="button" class="btn soft sm" id="vc-random" title="랜덤 말씀">🎲</button></div>
          <div class="verse-list" id="vc-list"></div>
        </div>
        <div id="vc-write" class="stack" hidden>
          <label class="field"><span>성경 구절</span><input type="text" id="vc-ref" maxlength="40" placeholder="예) 시편 23:1"></label>
          <label class="field"><span>말씀 본문</span><textarea id="vc-text" maxlength="500" placeholder="말씀 본문을 적어주세요"></textarea></label>
        </div>
      </div>
      <div class="stack" style="margin-top:26px">
        <h3>2. 마음 전하기</h3>
        <label class="field"><textarea id="vc-msg" maxlength="500" placeholder="마니또에게 전하고 싶은 말을 적어주세요 (연락처·아이디는 적을 수 없어요)"></textarea>
          <div class="counter" id="vc-msg-c"></div></label>
      </div>
      <div class="stack" style="margin-top:26px">
        <h3>3. 카드 색</h3>
        <div class="swatches" id="vc-sw">${THEMES.map(([k, c], i) =>
          `<button type="button" data-th="${k}" style="background:${c}" class="${i === 0 ? 'on' : ''}" aria-label="${k}"></button>`).join('')}</div>
      </div>
      <div class="stack" style="margin-top:26px">
        <h3>미리보기</h3>
        <div id="vc-preview"></div>
      </div>`;

    const refEl = $('#vc-ref', root), textEl = $('#vc-text', root), msgEl = $('#vc-msg', root);
    counter(msgEl, $('#vc-msg-c', root), 500);

    const preview = () => {
      $('#vc-preview', root).innerHTML = cardHTML({ verse_ref: st.ref, verse_text: st.text, message: st.msg, theme: st.theme },
        '<span>from. 나의 마니또</span><span>💌</span>');
      onChange && onChange(st);
    };
    const list = () => {
      $('#vc-list', root).innerHTML = (window.VERSES[st.topic] || []).map(([ref, txt], i) =>
        `<button type="button" class="verse-item ${st.ref === ref && st.text === txt ? 'on' : ''}" data-i="${i}">
          <div class="ref">${esc(ref)}</div><div class="txt">${esc(txt)}</div></button>`).join('');
      $$('#vc-list .verse-item', root).forEach((b) => (b.onclick = () => {
        const [ref, txt] = window.VERSES[st.topic][+b.dataset.i];
        pick(ref, txt);
      }));
    };
    const pick = (ref, txt) => {
      st.ref = ref; st.text = txt; refEl.value = ref; textEl.value = txt;
      list(); preview();
    };

    $$('#vc-tabs button', root).forEach((b) => (b.onclick = () => {
      st.tab = b.dataset.t;
      $$('#vc-tabs button', root).forEach((x) => x.classList.toggle('on', x === b));
      $('#vc-pick', root).hidden = st.tab !== 'pick';
      $('#vc-write', root).hidden = st.tab !== 'write';
    }));
    $$('#vc-topics button', root).forEach((b) => (b.onclick = () => {
      st.topic = b.dataset.topic;
      $$('#vc-topics button', root).forEach((x) => x.classList.toggle('on', x === b));
      list();
    }));
    $('#vc-random', root).onclick = () => {
      const all = topics.flatMap((t) => window.VERSES[t].map((v) => [t, v]));
      const [t, [ref, txt]] = all[Math.floor(Math.random() * all.length)];
      st.topic = t;
      $$('#vc-topics button', root).forEach((x) => x.classList.toggle('on', x.dataset.topic === t));
      pick(ref, txt);
    };
    refEl.oninput = () => { st.ref = refEl.value; list(); preview(); };
    textEl.oninput = () => { st.text = textEl.value; list(); preview(); };
    msgEl.oninput = () => { st.msg = msgEl.value; preview(); };
    $$('#vc-sw button', root).forEach((b) => (b.onclick = () => {
      st.theme = b.dataset.th;
      $$('#vc-sw button', root).forEach((x) => x.classList.toggle('on', x === b));
      preview();
    }));

    list(); preview();
    return st;
  }

  // ------------------------------------------------------------------
  // 페이지: 말씀 보내기
  // ------------------------------------------------------------------
  async function Send(app) {
    const d = await loadMe();
    if (!d) return;
    if (d.settings.status !== 'active' || !d.manito) {
      app.innerHTML = `${topbar('말씀 보내기')}<div class="empty stack"><p>지금은 카드를 보낼 수 없어요</p><a class="btn ghost" href="#/home">홈으로</a></div>`;
      return;
    }
    app.innerHTML = `${topbar('말씀 보내기')}
      <p class="muted" style="margin-bottom:18px">to. <b style="color:var(--ink)">${esc(d.manito.nickname)}</b>님에게 익명으로 전달돼요</p>
      <div id="composer"></div>
      <p class="error-text" id="err" style="margin-top:14px"></p>
      <button class="btn block" id="send" style="margin-top:6px">💌 보내기</button>`;

    const st = verseComposer($('#composer'), () => { $('#err').textContent = ''; });
    $('#send').onclick = async () => {
      const all = `${st.ref} ${st.text} ${st.msg}`;
      if (!st.text.trim() && !st.msg.trim()) return ($('#err').textContent = '말씀을 고르거나 메시지를 적어주세요');
      if (hasContact(all)) return ($('#err').textContent = '연락처나 아이디는 보낼 수 없어요. 공개일까지 비밀을 지켜주세요');
      if (!(await confirmBox('이 카드를 보낼까요?<br><span class="small muted">보낸 카드는 수정하거나 취소할 수 없어요</span>', '보내기'))) return;
      $('#send').disabled = true;
      try {
        await API.call('send_card', { p_token: token(), p_verse_ref: st.ref, p_verse_text: st.text, p_message: st.msg, p_theme: st.theme });
        toast('마니또에게 말씀을 보냈어요 💌');
        go('cards?tab=out');
      } catch (ex) {
        $('#err').textContent = ex.message;
        $('#send').disabled = false;
      }
    };
  }

  // ------------------------------------------------------------------
  // 페이지: 카드함
  // ------------------------------------------------------------------
  async function Cards(app, params) {
    const d = await loadMe();
    if (!d) return;
    const tab = params.get('tab') === 'out' ? 'out' : 'in';
    const list = await API.call(tab === 'in' ? 'inbox' : 'sent', { p_token: token() });
    const title = d.settings.title;

    let body;
    if (!list.length) {
      body = `<div class="empty">${tab === 'in'
        ? (d.settings.status === 'active' ? '아직 받은 카드가 없어요.<br>곧 마니또의 말씀이 도착할 거예요 💌' : '받은 카드가 없어요')
        : '아직 보낸 카드가 없어요'}</div>
        ${tab === 'out' && d.settings.status === 'active' ? '<a class="btn block" href="#/send">첫 말씀 보내기</a>' : ''}`;
    } else if (tab === 'in') {
      body = list.map((c, i) => `<div>
        ${cardHTML(c, `<span>from. ${c.from ? esc(c.from) : '나의 마니또'}</span><span>${fmtTime(c.created_at)}</span>`)}
        <div class="card-actions"><button class="btn ghost sm" data-story="${i}">📷 스토리 이미지</button></div></div>`).join('');
    } else {
      body = list.map((c) => `<div>
        ${cardHTML(c, `<span>to. ${esc(c.to)}${c.hidden ? ' · <span class="pill gray">운영자가 숨김</span>' : ''}</span><span>${fmtTime(c.created_at)}</span>`)}</div>`).join('');
    }

    app.innerHTML = `${topbar('카드함')}
      <div class="stack">
        <div class="tabs"><button data-tab="in" class="${tab === 'in' ? 'on' : ''}">받은 카드 ${d.received}</button>
          <button data-tab="out" class="${tab === 'out' ? 'on' : ''}">보낸 카드 ${d.sent}</button></div>
        ${body}
      </div>`;

    $$('[data-tab]').forEach((b) => (b.onclick = () => go('cards?tab=' + b.dataset.tab)));
    $$('[data-story]').forEach((b) => (b.onclick = () => {
      const c = list[+b.dataset.story];
      saveStory(`<div class="s-top">💌 나의 마니또가 보내준 말씀</div>
        ${cardHTML(c, `<span>from. ${c.from ? esc(c.from) : '나의 마니또'}</span><span>${fmtDate(c.created_at)}</span>`)}
        <div class="s-bottom">${esc(title)}</div>`, 'malsseum-manito-card.png');
    }));
  }

  // ------------------------------------------------------------------
  // 페이지: 공개
  // ------------------------------------------------------------------
  function ringSVG(ring) {
    const n = ring.length, size = 340, cx = size / 2, cy = size / 2, R = n > 8 ? 130 : 115, r = n > 10 ? 24 : 28;
    const pts = ring.map((_, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
    });
    const arrows = pts.map(([x1, y1], i) => {
      const [x2, y2] = pts[(i + 1) % n];
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      return `<line x1="${x1 + ux * (r + 3)}" y1="${y1 + uy * (r + 3)}" x2="${x2 - ux * (r + 7)}" y2="${y2 - uy * (r + 7)}"
        stroke="#C27A63" stroke-width="1.6" marker-end="url(#ah)"/>`;
    }).join('');
    const nodes = ring.map((p, i) => {
      const [x, y] = pts[i];
      const name = p.nickname.length > 4 ? p.nickname.slice(0, 4) + '…' : p.nickname;
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="${i === 0 ? '#C27A63' : '#F6E4DC'}"/>
        <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-family="Gowun Dodum, sans-serif"
          fill="${i === 0 ? '#fff' : '#3B322C'}">${esc(name)}</text>`;
    }).join('');
    return `<svg class="ring-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="마니또 연결 고리">
      <defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="#C27A63"/></marker></defs>${arrows}${nodes}</svg>`;
  }

  async function Reveal(app) {
    const d = await loadMe();
    if (!d) return;
    if (d.settings.status !== 'revealed') {
      app.innerHTML = `${topbar('공개')}<div class="empty stack"><p>🤫 아직 공개 전이에요<br>공개일: ${fmtDate(d.settings.reveal_date)}</p>
        <a class="btn ghost" href="#/home">홈으로</a></div>`;
      return;
    }
    const r = await API.call('reveal', { p_token: token() });
    const angel = r.my_angel || '운영자';
    const ring = r.ring || [];

    app.innerHTML = `${topbar('마니또 공개')}
      <div class="stack-lg">
        <div class="center stack"><span class="pill">🎉 ${esc(d.settings.title)} 공개</span>
          <h2>그동안 나에게<br>말씀을 보내준 마니또는?</h2></div>
        <div class="flip" id="flip"><div class="flip-inner">
          <div class="flip-face flip-front"><div style="font-size:48px">💌</div><div class="q" style="margin-top:10px">눌러서 확인하기</div></div>
          <div class="flip-face flip-back"><p class="muted">나의 비밀 친구는</p><div class="name">${esc(angel)}</div><p class="muted">님이었어요!</p></div>
        </div></div>
        <div id="after" hidden class="stack-lg">
          <div class="panel center stack">
            <p class="muted small">그리고 내가 섬긴 마니또는</p>
            <h2>${esc(r.my_manito || '-')}님</h2>
            <p class="small muted">${d.sent}장의 말씀을 보냈어요</p>
          </div>
          <div class="panel stack">
            <h3>우리의 마니또 고리</h3>
            ${ring.length > 1 ? ringSVG(ring) : ''}
            <p class="center">총 <b>${r.total_cards}장</b>의 말씀이 오갔어요 🙏</p>
            <details><summary class="small muted">누가 누구에게 보냈는지 보기</summary>
              <div class="stack small" style="margin-top:8px">${ring.map((p, i) =>
                `<div class="row"><span>${esc(p.nickname)} → ${esc(ring[(i + 1) % ring.length].nickname)}</span><span class="spacer"></span>
                 <span class="muted">${p.sent}장</span></div>`).join('')}</div></details>
          </div>
          <button class="btn block" id="story">📷 스토리 이미지로 저장</button>
          <a class="btn ghost block" href="#/cards?tab=in">받은 카드 다시 보기</a>
        </div>
      </div>`;

    $('#flip').onclick = () => {
      if ($('#flip').classList.contains('on')) return;
      $('#flip').classList.add('on');
      setTimeout(() => { $('#after').hidden = false; }, 700);
    };
    $('#story').onclick = () => saveStory(`
      <div class="s-top">${esc(d.settings.title)}</div>
      <div class="card theme-blossom center" style="padding:40px 22px">
        <p class="muted">그동안 나를 위해 기도하며<br>말씀을 보내준 마니또는</p>
        <div class="big">${esc(angel)}</div>
        <p class="muted">님이었어요 💌</p>
      </div>
      <div class="s-bottom">말씀 마니또 · 서로 사랑하라 (요 13:34)</div>`, 'malsseum-manito-reveal.png');
  }

  // ------------------------------------------------------------------
  // 페이지: 운영자
  // ------------------------------------------------------------------
  async function Admin(app) {
    const pw = sess.get('manito-admin');
    if (!pw) {
      app.innerHTML = `${topbar('운영자 로그인', '')}
        <form id="f" class="stack">
          ${API.isDemo ? '<p class="small muted">데모 비밀번호: <b>admin</b></p>' : ''}
          <label class="field"><span>관리자 비밀번호</span><input type="password" id="pw" required></label>
          <p class="error-text" id="err"></p>
          <button class="btn block">들어가기</button>
        </form>`;
      $('#f').onsubmit = async (e) => {
        e.preventDefault();
        try {
          await API.call('admin_check', { p_pw: $('#pw').value });
          sess.set('manito-admin', $('#pw').value);
          Admin(app);
        } catch (ex) { $('#err').textContent = ex.message; }
      };
      return;
    }

    let o;
    try { o = await API.call('admin_overview', { p_pw: pw }); }
    catch (e) { sess.set('manito-admin', null); throw e; }

    const s = o.settings;
    const members = o.members;
    const order = ['recruiting', 'closed', 'active', 'revealed'];
    const idx = order.indexOf(s.status);
    const matched = members.length > 0 && members.every((m) => m.manito);
    const url = siteUrl();

    const act = async (fn, args, msg) => {
      // 성공하면 { data }, 실패하면 null
      try { const data = await API.call(fn, { p_pw: pw, ...args }); if (msg) toast(msg); Admin(app); return { data }; }
      catch (ex) { toast(ex.message); return null; }
    };

    // 지금 할 일
    let todo;
    if (s.status === 'recruiting') {
      todo = `<p>신청자 <b>${members.length} / ${s.capacity}명</b>. 모집을 마감하면 매칭할 수 있어요.</p>
        <div class="row wrap"><button class="btn" data-do="close">모집 마감하기</button>
        <button class="btn ghost" data-copy="recruit">모집 글 복사</button>
        ${API.isDemo ? '<button class="btn soft" data-do="seed">가상 참여자 채우기</button>' : ''}</div>`;
    } else if (s.status === 'closed') {
      todo = matched
        ? `<p>매칭이 끝났어요. 결과를 확인하고 진행을 시작하세요. 시작하면 참여자들이 마니또를 볼 수 있어요.</p>
           <div class="stack small">${members.map((m) => `<div>${esc(m.nickname)} → <b>${esc(m.manito)}</b></div>`).join('')}</div>
           <div class="row wrap"><button class="btn" data-do="start">진행 시작하기</button>
           <button class="btn ghost" data-do="match">다시 매칭</button></div>`
        : `<p>${members.length}명을 무작위로 한 바퀴(A→B→C→…→A) 이어서 매칭해요.</p>
           <div class="row wrap"><button class="btn" data-do="match" ${members.length < 3 ? 'disabled' : ''}>🎲 매칭하기</button>
           <button class="btn ghost" data-do="reopen">모집 다시 열기</button></div>`;
    } else if (s.status === 'active') {
      todo = `<p>진행 중 · 공개일 ${fmtDate(s.reveal_date)} (${ddayLabel(s.reveal_date)})</p>
        <p class="small muted">⚠️ 표시는 카드를 한 장도 안 보냈거나 2일 넘게 안 보낸 사람이에요. DM으로 챙겨주세요.</p>
        <div class="row wrap"><button class="btn ghost" data-copy="start">시작 안내 DM 복사</button>
        <button class="btn ghost" data-copy="remind">리마인드 DM 복사</button>
        <button class="btn" data-do="reveal">🎉 공개하기</button></div>`;
    } else {
      todo = `<p>공개 완료! 참여자들에게 공개 소식을 전해주세요.</p>
        <div class="row wrap"><button class="btn ghost" data-copy="reveal">공개 안내 DM 복사</button>
        <button class="btn ghost" data-do="unreveal">공개 취소 (진행 중으로)</button></div>`;
    }

    const alertOf = (m) => s.status === 'active' && (m.sent === 0 || (m.last_sent && hoursSince(m.last_sent) > 48));

    app.innerHTML = `${topbar('운영자 페이지', '', '<button class="icon-btn" id="out" title="나가기">⎋</button>')}
      <div class="stack-lg">
        <div class="admin-steps">${order.map((k, i) =>
          `<div class="${i === idx ? 'on' : i < idx ? 'done' : ''}">${STATUS[k]}</div>`).join('')}</div>

        <div class="panel stack"><h3>지금 할 일</h3>${todo}</div>

        <div class="panel stack">
          <h3>참여자 ${members.length}명</h3>
          ${members.length ? `<div>${members.map((m) => `
            <div class="member ${alertOf(m) ? 'alert' : ''}">
              <div class="row"><b class="name">${esc(m.nickname)}</b>
                <a class="small" href="https://instagram.com/${esc(m.insta)}" target="_blank" rel="noopener">@${esc(m.insta)}</a>
                ${m.locked ? '<span class="pill warn">잠김</span>' : ''}<span class="spacer"></span>
                <button class="btn ghost sm" data-pin="${esc(m.id)}">PIN</button>
                <button class="btn danger sm" data-rm="${esc(m.id)}" data-name="${esc(m.nickname)}">내보내기</button></div>
              <div class="meta">${m.manito ? `마니또 → ${esc(m.manito)} · ` : ''}보냄 ${m.sent} · 받음 ${m.received}
                ${m.last_sent ? ` · 마지막 ${fmtTime(m.last_sent)}` : ''}</div>
              ${m.intro ? `<div class="meta">${esc(m.intro)}</div>` : ''}
              ${m.prayer ? `<details class="small"><summary class="muted">기도제목</summary><div class="prayer-box" style="margin-top:6px">${esc(m.prayer)}</div></details>` : ''}
            </div>`).join('')}</div>` : '<p class="muted small">아직 신청자가 없어요</p>'}
        </div>

        ${s.status === 'active' ? `
        <div class="panel stack">
          <h3>👼 천사 카드</h3>
          <p class="small muted">마니또가 카드를 안 보내서 서운한 사람에게 운영자가 대신 보내요. 받는 사람에게는 "나의 마니또"가 보낸 것처럼 보이고, 공개 때 천사 카드였다고 표시돼요.</p>
          <label class="field"><span>받는 사람</span><select id="angel-to">${[...members].sort((a, b) => a.received - b.received).map((m) =>
            `<option value="${esc(m.id)}">${esc(m.nickname)} (받은 카드 ${m.received}장)</option>`).join('')}</select></label>
          <div id="angel-composer"></div>
          <button class="btn block" id="angel-send">천사 카드 보내기</button>
        </div>` : ''}

        <div class="panel stack">
          <h3>모든 카드 ${o.cards.length}장</h3>
          <p class="small muted">부적절한 카드는 숨길 수 있어요 (받는 사람에게서 사라짐)</p>
          ${o.cards.length ? `<details><summary class="small">펼쳐보기</summary><div class="stack" style="margin-top:10px">${o.cards.map((c) => `
            <div class="mini-card ${c.hidden ? 'hidden-card' : ''}">
              <div class="row"><span class="who">${esc(c.from)} → ${esc(c.to)} · ${fmtTime(c.created_at)}</span><span class="spacer"></span>
                <button class="btn ghost sm" data-hide="${esc(c.id)}" data-h="${c.hidden ? '0' : '1'}">${c.hidden ? '보이기' : '숨기기'}</button></div>
              ${c.verse_ref ? `<div><b>${esc(c.verse_ref)}</b></div>` : ''}
              ${c.verse_text ? `<div>${esc(c.verse_text)}</div>` : ''}
              ${c.message ? `<div style="margin-top:4px">💬 ${esc(c.message)}</div>` : ''}
            </div>`).join('')}</div></details>` : ''}
        </div>

        <div class="panel stack">
          <h3>설정</h3>
          <label class="field"><span>기수 이름</span><input type="text" id="s-title" value="${esc(s.title)}"></label>
          <label class="field"><span>정원</span><input type="number" id="s-cap" min="3" max="100" value="${s.capacity}"></label>
          <div class="row">
            <label class="field" style="flex:1"><span>시작일</span><input type="date" id="s-start" value="${esc(s.start_date || '')}"></label>
            <label class="field" style="flex:1"><span>공개일</span><input type="date" id="s-reveal" value="${esc(s.reveal_date || '')}"></label>
          </div>
          <button class="btn ghost block" id="s-save">설정 저장</button>
          ${API.isDemo ? '' : '<button class="link-btn" id="s-pw">관리자 비밀번호 바꾸기</button>'}
        </div>

        <div class="panel flat stack">
          <h3>다음 기수 준비</h3>
          <p class="small muted">참여자·매칭·카드를 모두 지우고 모집 중 상태로 돌아가요. 되돌릴 수 없어요.</p>
          <button class="btn danger block" id="reset">시즌 초기화</button>
        </div>
        <p class="small muted center">참여 링크: ${esc(url)}</p>
      </div>`;

    // 단계 버튼
    const doMap = {
      close: () => act('admin_set_status', { p_status: 'closed' }, '모집을 마감했어요'),
      reopen: () => act('admin_set_status', { p_status: 'recruiting' }, '모집을 다시 열었어요'),
      seed: () => act('admin_demo_seed', {}, '가상 참여자를 채웠어요'),
      match: async () => { if (await confirmBox('무작위로 매칭할까요?', '매칭하기')) act('admin_match', {}, '매칭했어요 🎲'); },
      start: async () => {
        if (await confirmBox('진행을 시작할까요?<br><span class="small muted">참여자들이 자기 마니또를 볼 수 있게 돼요. 시작 후에는 다시 매칭할 수 없어요.</span>', '시작하기'))
          act('admin_set_status', { p_status: 'active' }, '시작했어요! 시작 안내 DM을 보내주세요');
      },
      reveal: async () => {
        if (await confirmBox('지금 공개할까요?<br><span class="small muted">모든 참여자에게 마니또가 공개돼요.</span>', '공개하기'))
          act('admin_set_status', { p_status: 'revealed' }, '공개했어요 🎉');
      },
      unreveal: async () => { if (await confirmBox('공개를 취소하고 진행 중으로 돌릴까요?', '돌리기')) act('admin_set_status', { p_status: 'active' }); },
    };
    $$('[data-do]').forEach((b) => (b.onclick = () => doMap[b.dataset.do]()));

    const dm = {
      recruit: `💌 [${s.title}] 참여자 모집\n\n${fmtDate(s.start_date)}부터 ${fmtDate(s.reveal_date)}까지, 말씀으로 누군가의 비밀 친구가 되어주세요.\n\n· 신청하면 마니또가 비밀리에 정해져요\n· 매일 마니또를 위해 기도하고 익명으로 말씀 카드를 보내요\n· 마지막 날 서로 공개!\n\n선착순 ${s.capacity}명 🙏\n신청: ${url}`,
      start: `💌 [${s.title}] 마니또가 정해졌어요!\n\n아래 링크에서 닉네임과 PIN으로 로그인해 나의 마니또와 기도제목을 확인해 주세요.\n오늘부터 마니또를 위해 기도하고 말씀 카드를 보내주세요 🙏\n\n공개일: ${fmtDate(s.reveal_date)}\n${url}`,
      remind: `💌 [${s.title}] 오늘 마니또에게 말씀을 보내셨나요?\n당신의 말씀을 기다리는 사람이 있어요 🙏\n${url}`,
      reveal: `🎉 [${s.title}] 마니또가 공개되었어요!\n그동안 나에게 말씀을 보내준 사람이 누구였는지 확인해 보세요 💌\n함께해 주셔서 정말 고마워요.\n${url}`,
    };
    $$('[data-copy]').forEach((b) => (b.onclick = () => copyText(dm[b.dataset.copy])));

    $$('[data-pin]').forEach((b) => (b.onclick = async () => {
      const p = await promptBox('새 PIN 4자리를 정해주세요', { numeric: true, placeholder: '0000' });
      if (p != null) act('admin_reset_pin', { p_member: b.dataset.pin, p_pin: p }, `PIN을 ${p}(으)로 바꿨어요. DM으로 알려주세요`);
    }));
    $$('[data-rm]').forEach((b) => (b.onclick = async () => {
      if (!(await confirmBox(`<b>${esc(b.dataset.name)}</b>님을 내보낼까요?<br><span class="small muted">이 사람이 보내고 받은 카드도 함께 지워져요. 매칭된 상태라면 고리를 자동으로 이어 붙여요.</span>`, '내보내기', true))) return;
      const res = await act('admin_remove_member', { p_member: b.dataset.rm });
      const r = res && res.data;
      if (r && r.giver && r.new_manito) {
        modal(`<div class="stack"><p><b>${esc(r.giver)}</b>님의 마니또가 <b>${esc(r.new_manito)}</b>님으로 바뀌었어요.</p>
          <p class="small muted">${esc(r.giver)}님에게 DM으로 알려주세요.</p>
          <button class="btn block" onclick="document.getElementById('modal').hidden=true">확인</button></div>`);
      } else if (res) toast('내보냈어요');
    }));
    $$('[data-hide]').forEach((b) => (b.onclick = () =>
      act('admin_hide_card', { p_card: b.dataset.hide, p_hidden: b.dataset.h === '1' })));

    if ($('#angel-composer')) {
      const st = verseComposer($('#angel-composer'));
      $('#angel-send').onclick = async () => {
        if (!st.text.trim() && !st.msg.trim()) return toast('말씀을 고르거나 메시지를 적어주세요');
        if (await confirmBox('천사 카드를 보낼까요?', '보내기'))
          act('admin_angel_card', { p_to: $('#angel-to').value, p_verse_ref: st.ref, p_verse_text: st.text, p_message: st.msg, p_theme: st.theme }, '천사 카드를 보냈어요 👼');
      };
    }

    $('#s-save').onclick = () => act('admin_update_settings', {
      p_title: $('#s-title').value, p_capacity: parseInt($('#s-cap').value, 10) || 10,
      p_start: $('#s-start').value || null, p_reveal: $('#s-reveal').value || null,
    }, '저장했어요');
    if ($('#s-pw')) $('#s-pw').onclick = async () => {
      const p = await promptBox('새 관리자 비밀번호 (8자 이상)');
      if (p == null) return;
      if (await act('admin_change_password', { p_new: p }, '비밀번호를 바꿨어요')) sess.set('manito-admin', p);
    };
    $('#reset').onclick = async () => {
      const v = await promptBox('정말 초기화하려면 <b>초기화</b>라고 입력하세요');
      if (v != null) act('admin_reset_season', { p_confirm: v }, '초기화했어요');
    };
    $('#out').onclick = () => { sess.set('manito-admin', null); go(''); };
  }

  // ------------------------------------------------------------------
  // 라우터
  // ------------------------------------------------------------------
  const ROUTES = { '': Landing, join: Join, login: Login, home: Home, send: Send, cards: Cards, reveal: Reveal, admin: Admin };

  async function render() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, q] = h.split('?');
    const page = ROUTES[path] || Landing;
    const app = $('#app');
    closeModal();
    app.innerHTML = '<div class="loading">불러오는 중…</div>';
    try {
      await page(app, new URLSearchParams(q || ''));
    } catch (e) {
      app.innerHTML = `<div class="empty stack"><p>😢 ${esc(e.message)}</p><a class="btn ghost" href="#/">처음으로</a></div>`;
    }
    window.scrollTo(0, 0);
  }

  if (API.isDemo) $('#demo-banner').hidden = false;
  window.addEventListener('hashchange', render);
  render();
})();
