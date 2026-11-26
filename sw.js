/* 바이블 컴패니언 서비스 워커 — 앱 셸 + 콘텐츠 오프라인 캐시
   · index.html 과 데이터(data/*.js)·앱 코드는 network-first → 배포 즉시 반영, 오프라인일 때만 캐시
   · 이미지 아이콘만 cache-first + 백그라운드 갱신
   · CACHE_VERSION 은 배포 빌드(build.sh)가 파일 내용 해시로 자동 갱신한다. 손으로 고치지 않아도 된다.
   · 같은 오리진을 쓰는 다른 앱(영어·OX·레이더)의 캐시는 절대 건드리지 않는다(bible-companion- 접두만 정리). */
var CACHE_VERSION = 'v11.0-a69f732f';
var CACHE_PREFIX = 'bible-companion-';
var CACHE = CACHE_PREFIX + CACHE_VERSION;

var CORE = ['./', './index.html', './styles.css', './app.js', './manifest.json'];
var CONTENT = [
  './data/s1.js', './data/s2.js', './data/s3.js', './data/s4.js',
  './data/b1.js', './data/b2.js', './data/words.js', './data/w2.js', './data/w3.js', './data/w4.js',
  './data/c1.js', './data/c2.js', './data/c3.js', './data/c4.js',
  './data/c5.js', './data/c6.js', './data/c7.js', './data/c8.js',
  './data/c9.js', './data/c10.js', './data/c11.js', './data/c12.js',
  './data/books.js', './data/bookguide.js', './data/verses.js', './data/vmap.js', './data/daily.js'
];
var IMAGES = [
  './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './apple-touch-icon.png', './favicon-32.png'
];
var PRECACHE = CORE.concat(CONTENT, IMAGES);

/* 항상 네트워크를 먼저 확인하는 경로(HTML·JS·CSS·JSON)와 캐시 우선 경로(이미지)
   · 성경 권별 본문 data/bible/NN_*.json 도 이 규칙을 따른다: 열 때마다 네트워크 우선,
     실패하면(오프라인) 기기에 캐시된 권을 그대로 보여 준다. 새 배포는 즉시 반영된다.
   · 검색 색인 data/bible/search.json 은 첫 검색 때 한 번 받아 캐시된다. */
function isFreshFirst(url, req) {
  if (req.mode === 'navigate') return true;
  if (req.destination === 'image') return false;
  return /\.(html|js|css|json|webmanifest|txt)$/i.test(url.pathname) || url.pathname.endsWith('/');
}

/* 앱 셸 주소인가 — 이 응답만 './index.html' 키에 저장한다.
   예전에는 모든 내비게이션 응답을 셸 키에 덮어써서, qa.html 같은 점검 페이지를 한 번 열면
   앱 껍데기 캐시가 그 페이지로 오염됐다. */
function isShellUrl(url) {
  return url.pathname.endsWith('/') || /\/index\.html$/i.test(url.pathname);
}

function offlinePage(msg) {
  return new Response(
    '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>오프라인</title><body style="font-family:system-ui,sans-serif;background:#f6f2ea;color:#2c2721;' +
    'display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;text-align:center;padding:24px">' +
    '<div><div style="font-size:34px">📖</div>' +
    '<h1 style="font-size:17px;margin:10px 0 6px">지금은 연결되지 않습니다</h1>' +
    '<p style="font-size:13px;color:#7b6f61;line-height:1.7;margin:0">' + msg + '</p></div></body>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(PRECACHE.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () { });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        /* 이 앱의 이전 버전 캐시만 지운다 — 같은 오리진의 다른 앱 캐시는 보존 */
        if (k !== CACHE && k.indexOf(CACHE_PREFIX) === 0) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function putInCache(req, res) {
  if (!res || res.status !== 200 || (res.type !== 'basic' && res.type !== 'default')) return;
  var cp = res.clone();
  caches.open(CACHE).then(function (c) { c.put(req, cp); }).catch(function () { });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  /* HTML 내비게이션: 네트워크 우선, 실패하면 캐시된 셸(또는 마지막으로 연 페이지) */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
        .then(function (r) {
          if (isShellUrl(url)) putInCache(new Request('./index.html'), r);
          putInCache(req, r);
          return r;
        })
        .catch(function () {
          return caches.match(req).then(function (same) {
            if (same) return same;
            return caches.match('./index.html').then(function (shell) {
              return shell || caches.match('./').then(function (root) {
                return root || offlinePage('읽으셨던 본문은 오프라인에서도 열립니다. 연결을 확인한 뒤 다시 열어 주세요.');
              });
            });
          });
        })
        .catch(function () {
          return offlinePage('연결을 확인한 뒤 다시 열어 주세요.');
        })
    );
    return;
  }

  if (isFreshFirst(url, req)) {
    /* 데이터·앱 코드: 네트워크 우선(HTTP 캐시 재검증), 실패 시 캐시 */
    e.respondWith(
      fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
        .then(function (r) {
          putInCache(req, r);
          return r;
        })
        .catch(function () {
          return caches.match(req, { ignoreSearch: true }).then(function (hit) {
            return hit || offlinePage('이 내용은 아직 이 기기에 저장되어 있지 않습니다.');
          });
        })
    );
    return;
  }

  /* 이미지 등: 캐시 우선 + 백그라운드 갱신 */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (r) {
        putInCache(req, r);
        return r;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
