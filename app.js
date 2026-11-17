/* 바이블 컴패니언 — 앱 로직 (vanilla, 단일 파일) */
(function () {
  'use strict';

  var BC = window.BC || {};
  var SIT = BC.situations || [];
  var BGS = BC.background || [];
  var WDS = BC.words || [];
  var CHS = BC.characters || [];
  var DAILY = BC.daily || [];
  var BOOKS = BC.books || [];
  var VRS = BC.verses || [];
  var byBook = {}, byVerse = {}, bookIdx = {};
  BOOKS.forEach(function (b, i) { byBook[b.id] = b; bookIdx[b.id] = i; });
  VRS.forEach(function (v) { byVerse[v.id] = v; });

  var byId = { sit: {}, bg: {}, word: {}, per: {} };
  SIT.forEach(function (x) { byId.sit[x.id] = x; });
  BGS.forEach(function (x) { byId.bg[x.id] = x; });
  WDS.forEach(function (x) { byId.word[x.id] = x; });
  CHS.forEach(function (x) { byId.per[x.id] = x; });

  var LS_KEY = 'bc.state.v1';
  var TH_KEY = 'bc.theme.v1';

  /* ---------- utils ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ''); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function uid() { return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function fmtDate(d) {
    d = d || new Date();
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + days[d.getDay()] + '요일';
  }
  function fmtShort(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 1900);
  }

  /* ---------- state ---------- */
  function loadState() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          return {
            bookmarks: Array.isArray(o.bookmarks) ? o.bookmarks : [],
            notes: Array.isArray(o.notes) ? o.notes : []
          };
        }
      }
    } catch (e) { /* silent */ }
    return { bookmarks: [], notes: [] };
  }
  var S = loadState();
  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* silent */ }
  }

  function isBm(ref) { return S.bookmarks.some(function (b) { return b.ref === ref; }); }
  function toggleBm(ref) {
    if (isBm(ref)) {
      S.bookmarks = S.bookmarks.filter(function (b) { return b.ref !== ref; });
      saveState();
      toast('북마크를 해제했어요');
      return false;
    }
    S.bookmarks.unshift({ ref: ref, at: new Date().toISOString() });
    saveState();
    toast('북마크에 담았어요');
    return true;
  }

  function refInfo(ref) {
    var p = String(ref).split(':');
    var type = p[0], id = p[1];
    if (type === 'verse') {
      var vv = byVerse[id];
      if (!vv) return null;
      return { type: type, id: id, item: vv, title: vv.ref, emoji: '📖', label: '구절', href: '#/verse/' + id };
    }
    var it = byId[type] && byId[type][id];
    if (!it) return null;
    var title = it.title || it.name || it.word || id;
    var emoji = it.emoji || (type === 'word' ? '🔤' : '•');
    var label = { sit: '상황', bg: '배경', word: '원어', per: '인물' }[type] || '';
    var href = '#/' + ({ sit: 'sit', bg: 'bg', word: 'word', per: 'per' }[type]) + '/' + id;
    return { type: type, id: id, item: it, title: title, emoji: emoji, label: label, href: href };
  }

  /* ---------- theme ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#131110' : '#f6f2ea');
    var btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = t === 'dark' ? '☀' : '☾';
  }
  (function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(TH_KEY); } catch (e) { }
    if (!saved) {
      saved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    applyTheme(saved);
  })();

  /* ---------- search index ---------- */
  var IDX = null;
  function flatText(v, out) {
    out = out || [];
    if (v == null) return out;
    if (typeof v === 'string' || typeof v === 'number') out.push(String(v));
    else if (Array.isArray(v)) v.forEach(function (x) { flatText(x, out); });
    else if (typeof v === 'object') Object.keys(v).forEach(function (k) { flatText(v[k], out); });
    return out;
  }
  function buildIdx() {
    if (IDX) return IDX;
    function mk(list, headFields) {
      return list.map(function (it) {
        var head = headFields.map(function (f) { return it[f] || ''; }).join(' ');
        return {
          it: it,
          head: norm(head + ' ' + (it.tags || []).join(' ') + ' ' + (it.keywords || []).join(' ')),
          body: norm(flatText(it, []).join(' '))
        };
      });
    }
    IDX = {
      sit: mk(SIT, ['title', 'sub']),
      bg: mk(BGS, ['title', 'era', 'summary']),
      word: mk(WDS, ['word', 'translit', 'gloss', 'lang']),
      per: mk(CHS, ['name', 'oneLine']),
      verse: VRS.map(function (v) {
        var bk = byBook[v.b] || {};
        var short = (bk.abbr || '') + v.ch + ':' + v.v;
        return {
          it: v,
          head: norm(v.ref + ' ' + (bk.name || '') + ' ' + (bk.abbr || '') + ' ' + short + ' ' +
            String(v.ch) + ':' + String(v.v) + ' ' + (bk.g || '') + ' ' + (v.tags || []).join(' ')),
          body: norm(flatText({ gist: v.gist, background: v.background, message: v.message, src: v.src }, []).join(' '))
        };
      })
    };
    return IDX;
  }
  function searchAll(qraw) {
    var q = norm(qraw);
    var out = [];
    if (!q) return out;
    var idx = buildIdx();
    var refLike = q.indexOf(':') >= 0;
    function run(key, type) {
      var hits = [];
      idx[key].forEach(function (row) {
        var sc = 0;
        if (row.head.indexOf(q) >= 0) sc = 9;
        else if (row.body.indexOf(q) >= 0) sc = 2;
        if (sc && type === 'verse' && refLike && sc === 9) sc = 12;
        if (sc) hits.push({ item: row.it, score: sc });
      });
      hits.sort(function (a, b) { return b.score - a.score; });
      if (hits.length) out.push({ type: type, hits: hits });
    }
    run('sit', 'sit'); run('verse', 'verse'); run('bg', 'bg'); run('per', 'per'); run('word', 'word');
    var ORDER = ['sit', 'verse', 'bg', 'per', 'word'];
    out.sort(function (a, b) {
      return (b.hits[0].score - a.hits[0].score) || (ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
    });
    return out;
  }

  /* ---------- route ---------- */
  function parseRoute() {
    var raw = (location.hash || '').replace(/^#\/?/, '');
    var qi = raw.indexOf('?');
    var qs = qi >= 0 ? raw.slice(qi + 1) : '';
    var path = qi >= 0 ? raw.slice(0, qi) : raw;
    var parts = path.split('/').filter(Boolean);
    var q = {};
    qs.split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      try { q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); }
      catch (e) { q[p[0]] = p[1] || ''; }
    });
    return { parts: parts, q: q };
  }

  /* ---------- shared partials ---------- */
  function srcLine(sources, refs) {
    var bits = [];
    if (refs && refs.length) bits.push('본문 ' + refs.join(' · '));
    if (sources && sources.length) bits.push(sources.join(' · '));
    if (!bits.length) return '';
    return '<div class="src"><b>참고 근거</b> ' + esc(bits.join('  |  ')) + '</div>';
  }
  function refChips(refs) {
    if (!refs || !refs.length) return '';
    return '<div class="refbox">' + refs.map(function (r) { return '<span>' + esc(r) + '</span>'; }).join('') + '</div>';
  }
  function sitChips(ids) {
    if (!ids || !ids.length) return '';
    return ids.filter(function (id) { return byId.sit[id]; }).map(function (id) {
      var s = byId.sit[id];
      return '<button class="rchip" data-go="#/sit/' + s.id + '">' + esc(s.emoji) + ' ' + esc(s.title) + '</button>';
    }).join('');
  }
  function charChips(ids) {
    if (!ids || !ids.length) return '';
    return ids.filter(function (id) { return byId.per[id]; }).map(function (id) {
      var c = byId.per[id];
      return '<button class="rchip" data-go="#/per/' + c.id + '">' + esc(c.emoji) + ' ' + esc(c.name) + '</button>';
    }).join('');
  }
  function wordChips(ids) {
    if (!ids || !ids.length) return '';
    return ids.filter(function (id) { return byId.word[id]; }).map(function (id) {
      var w = byId.word[id];
      return '<button class="rchip" data-go="#/word/' + w.id + '">' + esc(w.word) + ' ' + esc(w.gloss) + '</button>';
    }).join('');
  }
  function headBlock(opts) {
    return '' +
      '<div class="detail-head">' +
        '<button class="bk" data-go="' + opts.back + '" aria-label="뒤로">‹</button>' +
        '<div class="dh-txt">' +
          '<div class="dh-e">' + esc(opts.kicker || '') + '</div>' +
          '<h1>' + esc(opts.title) + '</h1>' +
          (opts.sub ? '<div class="dh-sub">' + esc(opts.sub) + '</div>' : '') +
        '</div>' +
        (opts.bmRef ? '<button class="bk" data-bm="' + opts.bmRef + '" aria-label="북마크">' + (isBm(opts.bmRef) ? '★' : '☆') + '</button>' : '') +
      '</div>';
  }

  /* ---------- home ---------- */
  function dailyForToday() {
    if (!DAILY.length) return null;
    var d = new Date();
    var start = new Date(d.getFullYear(), 0, 1);
    var day = Math.floor((d - start) / 86400000);
    return DAILY[day % DAILY.length];
  }

  function viewHome() {
    var dv = dailyForToday();
    var sits = SIT.map(function (s) {
      return '<button class="sit" data-go="#/sit/' + s.id + '">' +
        '<span class="e">' + esc(s.emoji) + '</span>' +
        '<span class="t">' + esc(s.title) + '</span>' +
        '<span class="s">' + esc(s.sub || '') + '</span>' +
        '</button>';
    }).join('');

    var tagSet = {};
    SIT.forEach(function (s) { (s.tags || []).forEach(function (t) { tagSet[t] = (tagSet[t] || 0) + 1; }); });
    var tags = Object.keys(tagSet).slice(0, 22).map(function (t) {
      return '<button class="tag" data-go="#/search?q=' + encodeURIComponent(t) + '">#' + esc(t) + '</button>';
    }).join('');

    return '' +
      '<section class="hero">' +
        '<p class="date">' + esc(fmtDate()) + '</p>' +
        '<h1>오늘, 어디쯤 계십니까</h1>' +
        '<p class="lead">지금의 상황을 고르시면 <b>공감 → 말씀 → 그 시대 배경 → 신학적 뜻 → 적용 질문</b> 순서로 이어서 읽어 드립니다.</p>' +
      '</section>' +
      '<div class="search" id="searchWrap">' +
        '<span class="ic">🔍</span>' +
        '<input id="q" type="search" inputmode="search" autocomplete="off" placeholder="마음의 상태를 적어 보세요" aria-label="말씀 검색">' +
        '<button class="clr" id="qClear" aria-label="지우기">✕</button>' +
      '</div>' +
      '<div id="results"></div>' +
      (dv ? '<section class="daily card" data-go="#/sit/' + (dv.sit || 'waiting') + '">' +
        '<div class="lbl">오늘의 한 구절</div>' +
        '<blockquote class="serif">“' + esc(dv.quote) + '”</blockquote>' +
        '<div class="ref">' + esc(dv.ref) + '</div>' +
        '<div class="line">' + esc(dv.line) + '</div>' +
      '</section>' : '') +
      '<h2 class="sec">상황으로 찾기</h2>' +
      '<div class="grid">' + sits + '</div>' +
      '<h2 class="sec">키워드</h2>' +
      '<div class="tags">' + tags + '</div>';
  }

  function resultHtml(qraw) {
    var groups = searchAll(qraw);
    if (!groups.length) {
      return '<div class="empty">‘' + esc(qraw) + '’에 맞는 말씀이 아직 없습니다.<br>다른 단어로 찾아보시거나, 아래 상황 카드를 눌러 보세요.</div>';
    }
    var total = groups.reduce(function (n, g) { return n + g.hits.length; }, 0);
    var html = '<h2 class="sec">검색 결과 ' + total + '개</h2><div class="list">';
    var label = { sit: '상황', bg: '배경', per: '인물', word: '원어', verse: '구절' };
    groups.forEach(function (g) {
      g.hits.slice(0, 8).forEach(function (h) {
        var it = h.item;
        var title = it.title || it.name || it.word || it.ref;
        var sub = it.summary || it.oneLine || it.sub || it.gloss || it.gist || '';
        var meta = label[g.type] + (it.era ? ' · ' + it.era : '') + (it.lang ? ' · ' + it.lang : '');
        var href = g.type === 'verse' ? '#/verse/' + it.id : '#/' + g.type + '/' + it.id;
        html += '<button class="item" data-go="' + href + '">' +
          '<span class="e">' + esc(it.emoji || (g.type === 'word' ? '🔤' : g.type === 'verse' ? '📜' : '•')) + '</span>' +
          '<span class="b"><span class="t">' + esc(title) + '</span>' +
          '<span class="s">' + esc(sub) + '</span>' +
          '<span class="m">' + esc(meta) + '</span></span></button>';
      });
    });
    return html + '</div>';
  }

  /* ---------- situation detail ---------- */
  function viewSit(s) {
    var verses = (s.verses || []).map(function (v) {
      var body = v.quote ? '“' + esc(v.quote) + '”' : esc(v.gist || '');
      return '<div class="v">' +
        '<div class="vref">' + esc(v.ref) + '</div>' +
        '<blockquote class="serif">' + body + '</blockquote>' +
        (v.quote && v.gist ? '<div class="gist">' + esc(v.gist) + '</div>' : '') +
        '</div>';
    }).join('');

    var bg = s.background || {};
    var th = s.theology || {};

    var html = headBlock({
      back: '#/home',
      kicker: '상황별 말씀',
      title: s.emoji + ' ' + s.title,
      sub: s.sub,
      bmRef: 'sit:' + s.id
    });

    html += '<div class="actrow">' +
      '<button class="btn" data-act="note" data-ref="sit:' + s.id + '">📝 묵상 노트</button>' +
      '<button class="btn" data-act="bm" data-bm="sit:' + s.id + '">' + (isBm('sit:' + s.id) ? '★ 북마크됨' : '☆ 북마크') + '</button>' +
      '</div>';

    html += '<div class="convo">' +
      '<article class="bubble reveal"><div class="who"><span class="dot"></span>함께 읽기</div><p>' + esc(s.empathy || '') + '</p></article>' +

      '<article class="bubble scr reveal"><div class="who"><span class="dot"></span>말씀</div>' + verses + '</article>' +

      '<article class="bubble reveal"><div class="who"><span class="dot"></span>그 시대의 배경</div>' +
        (bg.title ? '<p><b class="serif">' + esc(bg.title) + '</b></p>' : '') +
        '<p>' + esc(bg.body || '') + '</p>' +
        (bg.points && bg.points.length ? '<ul class="klist">' + bg.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '') +
        srcLine(bg.sources) +
      '</article>' +

      '<article class="bubble reveal"><div class="who"><span class="dot"></span>말씀의 참된 뜻</div>' +
        '<p>' + esc(th.body || '') + '</p>' +
        (th.points && th.points.length ? '<ul class="klist">' + th.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '') +
        srcLine(th.sources) +
      '</article>' +

      '<article class="bubble apply reveal"><div class="who"><span class="dot"></span>오늘의 적용 질문</div>' +
        '<ol>' + (s.apply || []).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ol>' +
        '<div class="src">질문은 정답을 정해 두지 않았습니다. 조용히 오래 머물러 보세요.</div>' +
      '</article>' +
    '</div>';

    html += '<div class="links">';
    if (s.characters && s.characters.length) {
      html += '<div class="lt">나와 비슷한 인물</div><div class="related">' + charChips(s.characters) + '</div>';
    }
    if (s.words && s.words.length) {
      html += '<div class="lt" style="margin-top:10px">원어로 더 깊이</div><div class="related">' + wordChips(s.words) + '</div>';
    }
    html += '</div>';
    return html;
  }

  /* ---------- background ---------- */
  var ERAS = ['전체', '고대 근동', '출애굽·광야', '왕정·성전', '포로·귀환', '1세기 유대', '그레코로만·로마'];
  var listState = { bg: { era: '전체', q: '' }, word: { lang: '전체', q: '' }, per: { tag: '전체', q: '' }, bible: { t: 'OT', q: '' } };

  function filterBg() {
    var st = listState.bg;
    var q = norm(st.q);
    return BGS.filter(function (b) {
      if (st.era !== '전체' && b.era !== st.era) return false;
      if (!q) return true;
      return norm([b.title, b.summary, b.body, (b.tags || []).join(' '), b.era].join(' ')).indexOf(q) >= 0;
    });
  }
  function bgListHtml() {
    var items = filterBg();
    if (!items.length) return '<div class="empty">해당하는 배경이 없습니다.</div>';
    return '<div class="list">' + items.map(function (b) {
      return '<button class="item" data-go="#/bg/' + b.id + '">' +
        '<span class="e">' + esc(b.emoji) + '</span>' +
        '<span class="b"><span class="t">' + esc(b.title) + '</span>' +
        '<span class="s">' + esc(b.summary) + '</span>' +
        '<span class="m">' + esc(b.era) + '</span></span></button>';
    }).join('') + '</div>';
  }
  function viewBgList() {
    var st = listState.bg;
    return '<section class="hero" style="padding-bottom:8px"><h1>시대·문화 배경</h1>' +
      '<p class="lead">본문이 쓰이고 읽히던 세계의 관습과 제도로 들어갑니다. 배경을 알면 본문의 무게가 달라집니다.</p></section>' +
      '<div class="search"><span class="ic">🔍</span><input id="lq" type="search" autocomplete="off" placeholder="배경 주제 검색 (예: 안식일, 환대, 세리)" value="' + esc(st.q) + '"></div>' +
      '<div class="chips">' + ERAS.map(function (e) {
        return '<button class="chip ' + (st.era === e ? 'on' : '') + '" data-f="bg:era:' + esc(e) + '">' + esc(e) + '</button>';
      }).join('') + '</div>' +
      '<div id="list">' + bgListHtml() + '</div>';
  }

  function viewBg(b) {
    var html = headBlock({ back: '#/bg', kicker: '배경 · ' + (b.era || ''), title: b.emoji + ' ' + b.title, bmRef: 'bg:' + b.id });
    html += '<p class="block">' + esc(b.body) + '</p>';
    if (b.points && b.points.length) {
      html += '<div class="sec-h">핵심 포인트</div><ul class="klist">' + b.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>';
    }
    if (b.refs && b.refs.length) {
      html += '<div class="sec-h">관련 본문</div>' + refChips(b.refs);
    }
    if (b.related && b.related.length) {
      html += '<div class="sec-h">이 배경으로 읽는 상황</div><div class="related">' + sitChips(b.related) + '</div>';
    }
    html += srcLine(b.sources);
    html += '<div class="actrow"><button class="btn" data-act="bm" data-bm="bg:' + b.id + '">' + (isBm('bg:' + b.id) ? '★ 북마크됨' : '☆ 북마크') + '</button>' +
      '<button class="btn" data-act="note" data-ref="bg:' + b.id + '">📝 노트</button></div>';
    return html;
  }

  /* ---------- words ---------- */
  function viewWordList() {
    var st = listState.word;
    var q = norm(st.q);
    var items = WDS.filter(function (w) {
      if (st.lang !== '전체' && w.lang !== st.lang) return false;
      if (!q) return true;
      return norm([w.word, w.translit, w.gloss, w.summary, w.body, w.lang].join(' ')).indexOf(q) >= 0;
    });
    var list = items.length ? '<div class="list">' + items.map(function (w) {
      return '<button class="item" data-go="#/word/' + w.id + '">' +
        '<span class="e" style="font-size:17px">' + esc(w.word) + '</span>' +
        '<span class="b"><span class="t">' + esc(w.translit) + ' · ' + esc(w.gloss) + '</span>' +
        '<span class="s">' + esc(w.summary) + '</span>' +
        '<span class="m">' + esc(w.lang) + '</span></span></button>';
    }).join('') + '</div>' : '<div class="empty">해당하는 원어가 없습니다.</div>';

    return '<section class="hero" style="padding-bottom:8px"><h1>원어 탐구</h1>' +
      '<p class="lead">번역으로는 다 담기지 않는 히브리어·헬라어 단어들의 결을 살펴봅니다.</p></section>' +
      '<div class="search"><span class="ic">🔍</span><input id="lq" type="search" autocomplete="off" placeholder="단어 검색 (예: 헤세드, 은혜)" value="' + esc(st.q) + '"></div>' +
      '<div class="chips">' + ['전체', '히브리어', '헬라어'].map(function (l) {
        return '<button class="chip ' + (st.lang === l ? 'on' : '') + '" data-f="word:lang:' + esc(l) + '">' + esc(l) + '</button>';
      }).join('') + '</div><div id="list">' + list + '</div>';
  }

  function viewWord(w) {
    var html = headBlock({ back: '#/word', kicker: '원어 · ' + (w.lang || ''), title: w.gloss, bmRef: 'word:' + w.id });
    html += '<div class="wordhead"><div class="w serif">' + esc(w.word) + '</div>' +
      '<div class="tl">' + esc(w.translit) + '</div>' +
      '<div class="gl">' + esc(w.gloss) + '</div></div>';
    html += '<p class="block">' + esc(w.body) + '</p>';
    if (w.caution) {
      html += '<div class="caution"><b>해석 주의</b>' + esc(w.caution) + '</div>';
    }
    if (w.refs && w.refs.length) html += '<div class="sec-h">주요 본문</div>' + refChips(w.refs);
    if (w.related && w.related.length) {
      html += '<div class="sec-h">이 단어로 읽는 상황</div><div class="related">' + sitChips(w.related) + '</div>';
    }
    html += srcLine(w.sources);
    html += '<div class="actrow"><button class="btn" data-act="bm" data-bm="word:' + w.id + '">' + (isBm('word:' + w.id) ? '★ 북마크됨' : '☆ 북마크') + '</button>' +
      '<button class="btn" data-act="note" data-ref="word:' + w.id + '">📝 노트</button></div>';
    return html;
  }

  /* ---------- bible (책·장·구절 탐색) ---------- */
  var TEST_LABEL = { OT: '구약', NT: '신약' };

  function verseItem(v) {
    var bk = byBook[v.b] || {};
    return '<button class="item" data-go="#/verse/' + v.id + '">' +
      '<span class="e">📜</span>' +
      '<span class="b"><span class="t">' + esc(v.ref) + '</span>' +
      '<span class="s">' + esc(v.gist) + '</span>' +
      '<span class="m">' + esc((bk.name || '') + (bk.g ? ' · ' + bk.g : '')) + '</span></span></button>';
  }
  function bookVerses(bookId, ch) {
    return VRS.filter(function (v) { return v.b === bookId && (!ch || v.ch === ch); })
      .sort(function (a, b) { return a.ch - b.ch || a.v - b.v; });
  }
  function viewBible() {
    var t = listState.bible.t;
    var books = BOOKS.filter(function (b) { return b.t === t; });
    var grid = books.map(function (b) {
      var has = VRS.some(function (v) { return v.b === b.id; });
      return '<button class="bkbtn' + (has ? ' has' : '') + '" data-go="#/bible/' + b.id + '">' +
        '<span class="ab">' + esc(b.abbr) + '</span>' +
        '<span class="nm">' + esc(b.name) + '</span>' +
        (has ? '<span class="dot"></span>' : '') + '</button>';
    }).join('');
    var featured = ['gen-1-1', 'psa-23-1', 'isa-53-5', 'jhn-3-16', 'rom-8-28', 'php-4-6']
      .filter(function (id) { return byVerse[id]; })
      .map(function (id) { return verseItem(byVerse[id]); }).join('');

    return '<section class="hero" style="padding-bottom:8px"><h1>성경 구절 탐색</h1>' +
      '<p class="lead">책 → 장 → 핵심 구절로 찾거나, 구절·키워드로 바로 검색하세요. 구절마다 <b>본문 요지 · 시대 배경 · 전체 맥락의 핵심 · 참고 근거</b>를 함께 읽습니다.</p></section>' +
      '<div class="search"><span class="ic">🔍</span><input id="vq" type="search" autocomplete="off" placeholder="구절·키워드 검색 (예: 시편 23:1, 은혜)" value="' + esc(listState.bible.q) + '"></div>' +
      '<div id="vresults">' + (listState.bible.q.trim() ? resultHtml(listState.bible.q) : '') + '</div>' +
      '<div class="chips">' + ['OT', 'NT'].map(function (x) {
        return '<button class="chip ' + (t === x ? 'on' : '') + '" data-f="bible:t:' + x + '">' + TEST_LABEL[x] +
          ' <span class="n">' + BOOKS.filter(function (b) { return b.t === x; }).length + '</span></button>';
      }).join('') + '</div>' +
      '<p class="chipinfo" style="margin:0 2px 10px">핵심 구절 ' + VRS.length + '곳 · 📜 표시가 있는 책은 구절이 정리된 책입니다</p>' +
      '<div class="bookgrid">' + grid + '</div>' +
      '<h2 class="sec">먼저 읽어 볼 구절</h2><div class="list">' + featured + '</div>';
  }

  function viewBook(b, chParam) {
    var ch = parseInt(chParam, 10) || 0;
    var all = bookVerses(b.id);
    var items = ch ? all.filter(function (v) { return v.ch === ch; }) : all;
    var chSet = {};
    all.forEach(function (v) { chSet[v.ch] = 1; });
    var chGrid = '';
    for (var i = 1; i <= b.ch; i++) {
      chGrid += '<button class="chbtn' + (ch === i ? ' on' : '') + (chSet[i] ? ' has' : '') + '" data-go="#/bible/' + b.id + (ch === i ? '' : '?ch=' + i) + '">' + i + '</button>';
    }
    var listHtml = items.length ? '<div class="list">' + items.map(verseItem).join('') + '</div>'
      : '<div class="empty">' + (ch ? '<b>' + ch + '장</b>에는 아직 정리한 핵심 구절이 없습니다.' : '이 책에는 아직 정리한 핵심 구절이 없습니다.') +
        (all.length ? '<br>핵심 구절이 있는 장: ' + Object.keys(chSet).sort(function (a, b2) { return a - b2; }).join(' · ') + '장' : '') + '</div>';

    var html = headBlock({ back: '#/bible', kicker: '성경 · ' + TEST_LABEL[b.t] + ' · ' + b.g, title: '📜 ' + b.name, sub: b.intro });
    html += '<div class="sec-h">장 선택</div><div class="chgrid">' + chGrid + '</div>';
    html += '<div class="sec-h">' + (ch ? ch + '장 핵심 구절 ' + items.length + '곳' : '핵심 구절 ' + all.length + '곳') + '</div>' + listHtml;
    if (ch) {
      html += '<div class="actrow" style="padding-top:12px"><button class="btn" data-go="#/bible/' + b.id + '">전체 구절 보기</button></div>';
    }
    html += '<div class="pager">' + (bookIdx[b.id] > 0 ? '<button class="btn" data-go="#/bible/' + BOOKS[bookIdx[b.id] - 1].id + '">‹ ' + esc(BOOKS[bookIdx[b.id] - 1].name) + '</button>' : '') +
      (bookIdx[b.id] < BOOKS.length - 1 ? '<button class="btn" data-go="#/bible/' + BOOKS[bookIdx[b.id] + 1].id + '">' + esc(BOOKS[bookIdx[b.id] + 1].name) + ' ›</button>' : '') + '</div>';
    return html;
  }

  function viewVerse(v) {
    var bk = byBook[v.b] || {};
    var same = bookVerses(v.b).filter(function (x) { return x.id !== v.id; });
    var html = headBlock({
      back: '#/bible/' + (bk.id || ''),
      kicker: '구절 · ' + (bk.name || '') + (bk.g ? ' · ' + bk.g : ''),
      title: v.ref,
      bmRef: 'verse:' + v.id
    });
    html += '<div class="sec-h">① 본문 요지</div>';
    if (v.quote) {
      html += '<div class="bubble scr"><blockquote class="serif">“' + esc(v.quote) + '”</blockquote>' +
        '<div class="gist">' + esc(v.ref) + ' · 개역개정 발췌</div></div>';
    }
    html += '<p class="block"' + (v.quote ? ' style="margin-top:10px"' : '') + '>' + esc(v.gist) + '</p>';
    html += '<div class="sec-h">② 그 시대의 문화·역사적 배경</div><p class="block">' + esc(v.background) + '</p>';
    html += '<div class="sec-h">③ 성경 전체 맥락의 핵심 본질</div><p class="block">' + esc(v.message) + '</p>';
    html += '<div class="sec-h">④ 참고 근거</div>' + srcLine(v.src);
    if (same.length) {
      html += '<div class="sec-h">' + esc(bk.name || '같은 책') + '의 다른 핵심 구절</div><div class="related">' +
        same.slice(0, 8).map(function (x) { return '<button class="rchip" data-go="#/verse/' + x.id + '">' + esc(x.ref) + '</button>'; }).join('') + '</div>';
    }
    html += '<div class="actrow"><button class="btn" data-act="bm" data-bm="verse:' + v.id + '">' + (isBm('verse:' + v.id) ? '★ 북마크됨' : '☆ 북마크') + '</button>' +
      '<button class="btn" data-act="note" data-ref="verse:' + v.id + '">📝 묵상 노트</button>' +
      '<button class="btn" data-go="#/bible/' + (bk.id || '') + '">장 전체 보기</button></div>';
    return html;
  }

  /* ---------- people ---------- */
  var ERA_ORDER = ['족장 시대', '출애굽·광야', '사사 시대', '왕정', '포로·귀환', '1세기'];
  function allPerTags() {
    var set = {};
    CHS.forEach(function (c) { (c.tags || []).forEach(function (t) { set[t] = 1; }); });
    return ['전체'].concat(Object.keys(set).slice(0, 14));
  }
  function perFiltered() {
    var st = listState.per;
    var q = norm(st.q);
    return CHS.filter(function (c) {
      if (st.tag !== '전체' && (c.tags || []).indexOf(st.tag) < 0) return false;
      if (!q) return true;
      return norm([c.name, c.oneLine, c.situation, c.era, (c.tags || []).join(' ')].join(' ')).indexOf(q) >= 0;
    }).sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
  }
  function perListHtml() {
    if (!CHS.length) {
      return '<div class="empty">인물 데이터를 불러오지 못했습니다.<br>연결이 잠시 끊겼을 수 있으니 <button class="btn" data-act="reload" style="margin-top:10px">새로 불러오기</button></div>';
    }
    var items = perFiltered();
    if (!items.length) {
      return '<div class="empty">조건에 맞는 인물이 없습니다.<br><button class="btn" data-act="perreset" style="margin-top:10px">필터 해제</button></div>';
    }
    var byEra = {};
    ERA_ORDER.forEach(function (e) { byEra[e] = []; });
    items.forEach(function (c) {
      var e = c.era && byEra[c.era] ? c.era : '기타';
      if (!byEra[e]) byEra[e] = [];
      byEra[e].push(c);
    });
    var html = '';
    Object.keys(byEra).forEach(function (e) {
      var list = byEra[e];
      if (!list.length) return;
      html += '<h2 class="sec">' + esc(e) + ' <span class="cnt">' + list.length + '명</span></h2><div class="list">' +
        list.map(function (c) {
          return '<button class="item" data-go="#/per/' + c.id + '">' +
            '<span class="e">' + esc(c.emoji) + '</span>' +
            '<span class="b"><span class="t">' + esc(c.name) + '</span>' +
            '<span class="s">' + esc(c.oneLine) + '</span>' +
            '<span class="m">' + esc(c.era || '') + (c.redemption ? ' · 구원사 해설' : '') + '</span></span></button>';
        }).join('') + '</div>';
    });
    return html;
  }
  function viewPerList() {
    var st = listState.per;
    var total = CHS.length;
    var filtered = perFiltered().length;
    return '<section class="hero" style="padding-bottom:8px"><h1>나와 닮은 인물</h1>' +
      '<p class="lead">성경의 인물들은 대부분 결론이 아니라 과정을 남겼습니다. 전체 <b>' + total + '명</b>을 시대 순으로 정리했습니다' +
      (filtered !== total ? ' (지금 조건: ' + filtered + '명)' : '') + '.</p></section>' +
      '<div class="search"><span class="ic">🔍</span><input id="lq" type="search" autocomplete="off" placeholder="인물·상황 검색 (예: 기다림, 베드로)" value="' + esc(st.q) + '"></div>' +
      '<div class="chips">' + allPerTags().map(function (t) {
        return '<button class="chip ' + (st.tag === t ? 'on' : '') + '" data-f="per:tag:' + esc(t) + '">' + esc(t) + '</button>';
      }).join('') + '</div>' +
      '<div id="list">' + perListHtml() + '</div>';
  }

  function viewPer(c) {
    var html = headBlock({ back: '#/per', kicker: '인물 · ' + (c.era || ''), title: c.emoji + ' ' + c.name, sub: c.oneLine, bmRef: 'per:' + c.id });
    html += '<div class="sec-h">① 어떤 상황·고민이었나</div><p class="block">' + esc(c.situation) + '</p>';
    html += '<div class="sec-h">② 그때의 시대 배경</div><p class="block">' + esc(c.background) + '</p>';
    html += '<div class="sec-h">③ 하나님이 어떻게 일하셨나</div><p class="block">' + esc(c.godsWork) + '</p>';
    if (c.timeline && c.timeline.length) {
      html += '<div class="sec-h">④ 고난과 순종의 타임라인</div><div class="tlbox">' +
        c.timeline.map(function (t) {
          return '<div class="tlitem"><div class="tlhead"><span class="tlstage">' + esc(t.stage || '') + '</span>' +
            '<span class="tltitle">' + esc(t.title || '') + '</span></div>' +
            '<p class="tltext">' + esc(t.text || '') + '</p></div>';
        }).join('') + '</div>';
    }
    if (c.redemption) {
      html += '<div class="sec-h">⑤ 구원사적 의미</div><p class="block">' + esc(c.redemption) + '</p>';
    }
    html += '<div class="sec-h">⑥ 핵심 본문</div><div class="list">' + (c.verses || []).map(function (v) {
      return '<div class="bubble scr"><div class="vref">' + esc(v.ref) + '</div><div class="gist" style="margin-top:0">' + esc(v.gist) + '</div></div>';
    }).join('') + '</div>';
    html += '<div class="sec-h">⑦ 내게 주는 질문</div><div class="bubble apply"><ol>' +
      (c.questions || []).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol></div>';
    if (c.situations && c.situations.length) {
      html += '<div class="sec-h">이 인물과 함께 읽는 상황</div><div class="related">' + sitChips(c.situations) + '</div>';
    }
    if (c.words && c.words.length) {
      html += '<div class="sec-h">연결된 원어</div><div class="related">' + wordChips(c.words) + '</div>';
    }
    html += srcLine(c.sources);
    html += '<div class="actrow"><button class="btn" data-act="bm" data-bm="per:' + c.id + '">' + (isBm('per:' + c.id) ? '★ 북마크됨' : '☆ 북마크') + '</button>' +
      '<button class="btn" data-act="note" data-ref="per:' + c.id + '">📝 노트</button></div>';
    return html;
  }

  /* ---------- notes ---------- */
  function viewNotes() {
    var bms = S.bookmarks.map(function (b) { return refInfo(b.ref); }).filter(Boolean);
    var notes = S.notes.slice().sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });

    var bh = bms.length ? '<div class="list">' + bms.map(function (r) {
      return '<button class="item" data-go="' + r.href + '">' +
        '<span class="e">' + esc(r.emoji) + '</span>' +
        '<span class="b"><span class="t">' + esc(r.title) + '</span>' +
        '<span class="m">' + esc(r.label) + '</span></span></button>';
    }).join('') + '</div>' : '<div class="empty">아직 담은 말씀이 없습니다.<br>말씀·배경·인물 화면에서 ☆ 버튼을 눌러 보세요.</div>';

    var nh = notes.length ? '<div class="list">' + notes.map(function (n) {
      var r = n.ref ? refInfo(n.ref) : null;
      return '<button class="note" data-go="#/edit/' + n.id + '">' +
        '<span class="nh"><span class="nt">' + esc(n.title || '제목 없음') + '</span><span class="nd">' + esc(fmtShort(n.updatedAt)) + '</span></span>' +
        '<span class="nb">' + esc(n.body || '') + '</span>' +
        (r ? '<span class="nr">↳ ' + esc(r.label) + ' · ' + esc(r.title) + '</span>' : '') +
        '</button>';
    }).join('') + '</div>' : '<div class="empty">아직 묵상 노트가 없습니다.<br>읽던 화면에서 ‘묵상 노트’를 눌러 시작해 보세요.</div>';

    return '<section class="hero" style="padding-bottom:8px"><h1>나의 묵상</h1>' +
      '<p class="lead">북마크와 노트는 이 기기(브라우저 저장소)에만 저장됩니다. JSON으로 백업할 수 있습니다.</p></section>' +
      '<div class="actrow" style="padding:0 0 6px"><button class="btn primary" data-act="newnote">✎ 새 묵상 노트</button></div>' +
      '<div class="actrow" style="padding:0 0 8px"><button class="btn" data-act="export">⬇ 백업 내보내기</button>' +
      '<button class="btn" data-act="import">⬆ 가져오기</button></div>' +
      '<input type="file" id="impFile" accept="application/json,.json" style="display:none">' +
      '<h2 class="sec">북마크 ' + bms.length + '</h2>' + bh +
      '<h2 class="sec">묵상 노트 ' + notes.length + '</h2>' + nh +
      '<p class="src" style="border:none;margin-top:18px">저장 위치: ' + esc(location.origin) + ' 의 브라우저 저장소 · 앱을 삭제하거나 브라우저 데이터를 지우면 함께 사라지니 가끔 백업해 두세요.</p>';
  }

  function viewEditor(noteId, refParam) {
    var note = noteId && noteId !== 'new' ? S.notes.filter(function (n) { return n.id === noteId; })[0] : null;
    var ref = note ? note.ref : (refParam || '');
    var r = ref ? refInfo(ref) : null;
    var defaultTitle = r ? r.title : '';
    var html = headBlock({
      back: note ? '#/notes' : (r ? r.href : '#/notes'),
      kicker: '묵상 노트',
      title: note ? '노트 수정' : '새 노트',
      sub: r ? (r.label + ' · ' + r.title) : '자유롭게 기록해 보세요'
    });
    html += '<div class="editor">' +
      '<label for="ntTitle">제목</label>' +
      '<input id="ntTitle" type="text" value="' + esc(note ? note.title : defaultTitle) + '" placeholder="예: 오늘 읽은 말씀">' +
      '<label for="ntBody">묵상</label>' +
      '<textarea id="ntBody" placeholder="마음에 남은 구절과 지금의 생각, 기도제목을 적어 보세요.">' + esc(note ? note.body : '') + '</textarea>' +
      '<div class="edrow">' +
        '<button class="btn primary" data-act="savenote" data-id="' + esc(note ? note.id : '') + '" data-ref="' + esc(ref) + '">저장</button>' +
        '<button class="btn" data-go="' + (note ? '#/notes' : (r ? r.href : '#/notes')) + '">취소</button>' +
        (note ? '<button class="btn" data-act="delnode" data-id="' + esc(note.id) + '">삭제</button>' : '') +
      '</div></div>';
    return html;
  }

  /* ---------- about ---------- */
  function viewAbout() {
    return '<section class="about">' +
      '<h1 style="font-size:20px;margin:10px 0 6px">해설 원칙과 출처</h1>' +
      '<p class="block">이 앱의 모든 해설은 정통 개신교·복음주의 주류에서 통용되는 해석만 담았습니다. 개인 블로그나 출처가 확인되지 않은 묵상 글은 사용하지 않았습니다.</p>' +
      '<h3>1. 본문이 기준</h3>' +
      '<p class="block">모든 해설은 성경 66권 본문의 문맥을 1차 기준으로 삼습니다. 장르(서사·율법·시가·예언·복음서·서신·계시록)에 따라 읽는 방식이 다르다는 원칙을 따릅니다.</p>' +
      '<h3>2. 참고한 학술 자료</h3>' +
      '<ul>' +
      '<li>IVP 성경배경주석(구약) — 존 H. 월턴·빅터 매튜스·마크 샤발라스</li>' +
      '<li>IVP 성경배경주석(신약) — 크레이그 S. 키너</li>' +
      '<li>고든 D. 피·더글러스 스튜어트, 『성경을 어떻게 읽을 것인가』(성서유니온)</li>' +
      '<li>NICOT·NICNT·BECNT·WBC 등 정통 주석 시리즈</li>' +
      '<li>NIV 적용주석, 존 칼빈 주석, 매튜 헨리 주석</li>' +
      '<li>F. F. 브루스의 신약 배경·사도행전 연구</li>' +
      '<li>BDB·HALOT(히브리어), BDAG·TDNT(헬라어) 어휘 사전</li>' +
      '<li>요세푸스 『유대고대사』·『유대전쟁사』, 미쉬나 등 1차 사료</li>' +
      '</ul>' +
      '<h3>3. 성경 구절 탐색</h3>' +
      '<p class="block">성경 탭은 구약 39권·신약 27권 전체를 책 → 장 → 핵심 구절 순서로 찾을 수 있게 구성했습니다. 지금은 40권·74개 핵심 구절을 정리해 두었고, 각 구절에 본문 요지(장절 참조와 1절 이내 발췌) · 시대·문화 배경 · 성경 전체 맥락의 핵심 · 참고 근거를 붙였습니다. 정리가 끝난 책과 장은 목록에서 📜와 색으로 표시됩니다.</p>' +
      '<h3>4. 해석이 갈리는 지점</h3>' +
      '<p class="block">출애굽 연대, 로마서 3:22의 ‘그리스도의 믿음’, 요한복음 21장의 아가페·필레오 등은 학계에서도 견해가 나뉩니다. 이런 지점은 단정하지 않고 ‘해석 주의’로 표시했습니다.</p>' +
      '<h3>5. 성경 본문 인용</h3>' +
      '<p class="block">대한성서공회 번역본(개역개정 등)의 저작권을 존중합니다. 장 전체를 복제하지 않고, 핵심 구절의 짧은 발췌와 요지, 그리고 정확한 장·절 참조로 구성했습니다. 인용한 짧은 구절은 개역개정 표현을 따랐습니다.</p>' +
      '<h3>6. 데이터와 개인정보</h3>' +
      '<p class="block">북마크와 노트는 서버로 보내지 않고 이 기기의 브라우저 저장소에만 저장됩니다. 앱은 로그인도, 광고도, 추적도 사용하지 않습니다.</p>' +
      '<p class="small" style="margin-top:18px">바이블 컴패니언 · 말씀·배경·인물 묵상 · 오프라인 사용 가능(PWA)</p>' +
      '</section>';
  }

  /* ---------- search view ---------- */
  function viewSearch(qraw) {
    return headBlock({ back: '#/home', kicker: '검색', title: '‘' + qraw + '’', sub: '상황·구절·배경·인물·원어를 함께 찾았습니다' }) +
      '<div style="margin-top:10px">' + resultHtml(qraw) + '</div>';
  }

  /* ---------- render ---------- */
  var revealTimers = [];
  function clearReveal() {
    revealTimers.forEach(function (t) { clearTimeout(t); });
    revealTimers = [];
  }
  function startReveal() {
    clearReveal();
    var els = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (!els.length) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { els.forEach(function (el) { el.classList.add('in'); }); return; }
    els.forEach(function (el, i) {
      revealTimers.push(setTimeout(function () { el.classList.add('in'); }, 110 + i * 190));
    });
    revealTimers.push(setTimeout(function () {
      els.forEach(function (el) { el.classList.add('in'); });
    }, 110 + els.length * 190 + 300));
  }

  function setNav(tab) {
    Array.prototype.forEach.call(document.querySelectorAll('#tabs .nb'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === tab);
    });
  }

  function render(opts) {
    opts = opts || {};
    var r = parseRoute();
    var p = r.parts;
    var view = document.getElementById('view');
    var y = window.scrollY;
    var html = '';
    var tab = 'home';
    var detail = false;

    if (!p.length || p[0] === 'home') {
      html = viewHome();
    } else if (p[0] === 'sit' && byId.sit[p[1]]) {
      html = viewSit(byId.sit[p[1]]); tab = 'home'; detail = true;
    } else if (p[0] === 'bg' && p[1] && byId.bg[p[1]]) {
      html = viewBg(byId.bg[p[1]]); tab = 'bg'; detail = true;
    } else if (p[0] === 'bg') {
      html = viewBgList(); tab = 'bg';
    } else if (p[0] === 'word' && p[1] && byId.word[p[1]]) {
      html = viewWord(byId.word[p[1]]); tab = 'word'; detail = true;
    } else if (p[0] === 'word') {
      html = viewWordList(); tab = 'word';
    } else if (p[0] === 'bible' && p[1] && byBook[p[1]]) {
      html = viewBook(byBook[p[1]], r.q.ch); tab = 'bible'; detail = true;
    } else if (p[0] === 'bible') {
      html = viewBible(); tab = 'bible';
    } else if (p[0] === 'verse' && byVerse[p[1]]) {
      html = viewVerse(byVerse[p[1]]); tab = 'bible'; detail = true;
    } else if (p[0] === 'per' && p[1] && byId.per[p[1]]) {
      html = viewPer(byId.per[p[1]]); tab = 'per'; detail = true;
    } else if (p[0] === 'per') {
      html = viewPerList(); tab = 'per';
    } else if (p[0] === 'notes') {
      html = viewNotes(); tab = 'notes';
    } else if (p[0] === 'edit') {
      html = viewEditor(p[1], r.q.ref); tab = 'notes';
    } else if (p[0] === 'search') {
      html = viewSearch(r.q.q || '');
    } else if (p[0] === 'about') {
      html = viewAbout();
    } else {
      html = viewHome();
    }

    view.innerHTML = html;
    setNav(tab);
    var top = document.getElementById('top');
    if (top) top.classList.toggle('scrolled', (opts.keepScroll ? y : 0) > 4);

    if (opts.keepScroll) {
      window.requestAnimationFrame(function () { window.scrollTo(0, y); });
    } else {
      window.scrollTo(0, 0);
    }
    if (detail) startReveal();
  }

  /* ---------- input handling ---------- */
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'q') {
      var wrap = t.closest('.search');
      if (wrap) wrap.classList.toggle('has', !!t.value);
      var box = document.getElementById('results');
      if (!box) return;
      var v = t.value.trim();
      box.innerHTML = v ? resultHtml(v) : '';
      return;
    }
    if (t.id === 'vq') {
      var vbox = document.getElementById('vresults');
      if (!vbox) return;
      listState.bible.q = t.value;
      var vv = t.value.trim();
      vbox.innerHTML = vv ? resultHtml(vv) : '';
      return;
    }
    if (t.id === 'lq') {
      var r = parseRoute();
      var key = r.parts[0];
      if (!listState[key]) return;
      listState[key].q = t.value;
      var box2 = document.getElementById('list');
      if (!box2) return;
      if (key === 'bg') box2.innerHTML = bgListHtml();
      else if (key === 'per') {
        box2.innerHTML = perListHtml();
      } else if (key === 'word') {
        var st2 = listState.word, q2 = norm(t.value);
        var items2 = WDS.filter(function (w) {
          if (st2.lang !== '전체' && w.lang !== st2.lang) return false;
          if (!q2) return true;
          return norm([w.word, w.translit, w.gloss, w.summary, w.body, w.lang].join(' ')).indexOf(q2) >= 0;
        });
        box2.innerHTML = items2.length ? '<div class="list">' + items2.map(function (w) {
          return '<button class="item" data-go="#/word/' + w.id + '">' +
            '<span class="e" style="font-size:17px">' + esc(w.word) + '</span>' +
            '<span class="b"><span class="t">' + esc(w.translit) + ' · ' + esc(w.gloss) + '</span>' +
            '<span class="s">' + esc(w.summary) + '</span>' +
            '<span class="m">' + esc(w.lang) + '</span></span></button>';
        }).join('') + '</div>' : '<div class="empty">해당하는 원어가 없습니다.</div>';
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'q') {
      var v = e.target.value.trim();
      if (v) location.hash = '#/search?q=' + encodeURIComponent(v);
    }
  });

  /* ---------- click handling ---------- */
  document.addEventListener('click', function (e) {
    var go = e.target.closest('[data-go]');
    if (go) {
      e.preventDefault();
      var to = go.getAttribute('data-go');
      if (location.hash === to) render(); else location.hash = to;
      return;
    }

    var bm = e.target.closest('[data-bm]');
    if (bm) {
      e.preventDefault();
      var ref = bm.getAttribute('data-bm');
      var on = toggleBm(ref);
      Array.prototype.forEach.call(document.querySelectorAll('[data-bm]'), function (el) {
        if (el.getAttribute('data-bm') !== ref) return;
        el.textContent = (el.classList.contains('btn') || el.classList.contains('act')) ? (on ? '★ 북마크됨' : '☆ 북마크') : (on ? '★' : '☆');
      });
      return;
    }

    var f = e.target.closest('[data-f]');
    if (f) {
      var parts = f.getAttribute('data-f').split(':');
      var key = parts[0], field = parts[1], val = parts.slice(2).join(':');
      if (listState[key]) {
        listState[key][field] = val;
        render({ keepScroll: true });
      }
      return;
    }

    var act = e.target.closest('[data-act]');
    if (!act) return;
    var a = act.getAttribute('data-act');

    if (a === 'note') {
      var rf = act.getAttribute('data-ref') || '';
      location.hash = '#/edit/new?ref=' + encodeURIComponent(rf);
      return;
    }
    if (a === 'newnote') { location.hash = '#/edit/new'; return; }
    if (a === 'perreset') { listState.per.tag = '전체'; listState.per.q = ''; render({ keepScroll: true }); return; }
    if (a === 'reload') { location.reload(); return; }
    if (a === 'savenote') {
      var id = act.getAttribute('data-id');
      var refv = act.getAttribute('data-ref') || '';
      var title = (document.getElementById('ntTitle') || {}).value || '';
      var body = (document.getElementById('ntBody') || {}).value || '';
      if (!title.trim() && !body.trim()) { toast('내용을 조금 적어 주세요'); return; }
      var now = new Date().toISOString();
      if (id) {
        S.notes = S.notes.map(function (n) {
          if (n.id !== id) return n;
          return { id: n.id, ref: n.ref, title: title.trim() || '제목 없음', body: body, createdAt: n.createdAt, updatedAt: now };
        });
      } else {
        S.notes.unshift({ id: uid(), ref: refv, title: title.trim() || '묵상 노트', body: body, createdAt: now, updatedAt: now });
      }
      saveState();
      toast('노트를 저장했어요');
      location.hash = '#/notes';
      return;
    }
    if (a === 'delnode') {
      var did = act.getAttribute('data-id');
      S.notes = S.notes.filter(function (n) { return n.id !== did; });
      saveState();
      toast('노트를 삭제했어요');
      location.hash = '#/notes';
      return;
    }
    if (a === 'export') {
      var payload = {
        app: 'bible-companion', version: 1, exportedAt: new Date().toISOString(),
        bookmarks: S.bookmarks, notes: S.notes
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      var d = new Date();
      var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      link.href = url;
      link.download = 'bible-companion-' + stamp + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2500);
      toast('백업 파일을 내려받았어요');
      return;
    }
    if (a === 'import') {
      var fi = document.getElementById('impFile');
      if (fi) fi.click();
      return;
    }
  });

  document.addEventListener('change', function (e) {
    if (!e.target || e.target.id !== 'impFile') return;
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var o = JSON.parse(String(reader.result));
        var nb = Array.isArray(o.bookmarks) ? o.bookmarks : [];
        var nn = Array.isArray(o.notes) ? o.notes : [];
        var haveB = {}; S.bookmarks.forEach(function (b) { haveB[b.ref] = 1; });
        nb.forEach(function (b) { if (b && b.ref && !haveB[b.ref]) { S.bookmarks.push(b); haveB[b.ref] = 1; } });
        var haveN = {}; S.notes.forEach(function (n) { haveN[n.id] = 1; });
        nn.forEach(function (n) {
          if (!n) return;
          if (!n.id) n.id = uid();
          if (!haveN[n.id]) { S.notes.push(n); haveN[n.id] = 1; }
        });
        saveState();
        toast('가져왔어요 · 노트 ' + nn.length + '개 확인');
        render({ keepScroll: true });
      } catch (err) {
        toast('파일을 읽을 수 없습니다 (JSON 확인)');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  /* ---------- theme button ---------- */
  var themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(TH_KEY, next); } catch (e) { }
    });
  }

  /* ---------- header shadow ---------- */
  window.addEventListener('scroll', function () {
    var top = document.getElementById('top');
    if (top) top.classList.toggle('scrolled', window.scrollY > 4);
  }, { passive: true });

  /* ---------- boot ---------- */
  window.addEventListener('hashchange', function () { render(); });
  if (!location.hash) location.hash = '#/home';
  render();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () { });
    });
  }
})();
