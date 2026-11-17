/* 바이블 컴패니언 서비스 워커 — 앱 셸 + 콘텐츠 오프라인 캐시
   · index.html 과 데이터(data/*.js)·앱 코드는 network-first → 배포 즉시 반영, 오프라인일 때만 캐시
   · 이미지 아이콘만 cache-first + 백그라운드 갱신
   · CACHE_VERSION 은 배포 빌드(build.sh)가 파일 내용 해시로 자동 갱신한다. 손으로 고치지 않아도 된다. */
var CACHE_VERSION = 'v-70f20290';
var CACHE_PREFIX = 'bible-companion-';
var CACHE = CACHE_PREFIX + CACHE_VERSION;

var CORE = ['./', './index.html', './styles.css', './app.js', './manifest.json'];
var CONTENT = [
  './data/s1.js', './data/s2.js', './data/s3.js', './data/s4.js',
  './data/b1.js', './data/b2.js', './data/words.js',
  './data/c1.js', './data/c2.js', './data/c3.js',
  './data/books.js', './data/verses.js', './data/daily.js'
];
var IMAGES = [
  './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './apple-touch-icon.png', './favicon-32.png'
];
var PRECACHE = CORE.concat(CONTENT, IMAGES);

/* 항상 네트워크를 먼저 확인하는 경로(HTML·JS·CSS·JSON)와 캐시 우선 경로(이미지) */
function isFreshFirst(url, req) {
  if (req.mode === 'navigate') return true;
  if (req.destination === 'image') return false;
  return /\.(html|js|css|json|webmanifest|txt)$/i.test(url.pathname) || url.pathname.endsWith('/');
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
        if (k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE) return caches.delete(k);
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

  /* HTML 내비게이션: 네트워크 우선, 실패하면 캐시된 셸 */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
        .then(function (r) {
          putInCache(new Request('./index.html'), r);
          putInCache(req, r);
          return r;
        })
        .catch(function () {
          return caches.match('./index.html').then(function (hit) {
            return hit || caches.match('./');
          });
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
            return hit || Response.error();
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
