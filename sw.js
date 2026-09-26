/* 备考工作台 Service Worker
   策略(性能双轨版): 同源 GET 资源(HTML 壳 / data/*.data.js / vendor / icons / manifest) 全部走
   「缓存优先 + 后台静默更新」(stale-while-revalidate)。
   - 平时刷新: 立即命中缓存, 秒开;
   - 后台拉新版写入缓存, 下次打开自动生效 —— 同时兼顾「改了要生效」与「刷新要快」。
   版本号由 scripts/build_app.py 注入(beikao-<git-sha>), 每次部署自动失效旧缓存、拉取新资源。 */
const CACHE = "beikao-1790397377";

self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 跨域(Supabase 等)直连, 不代理
  // 整页原图(raw_pages*)体积过大, 不进缓存, 始终走网络
  const isHugePageImg = /\/data\/raw_pages[^/]*\//.test(url.pathname);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const update = fetch(req).then(fresh => {
      if (fresh && fresh.ok && !isHugePageImg) cache.put(req, fresh.clone()).catch(() => {});
      return fresh;
    }).catch(() => null);
    // 有缓存: 立即返回(秒开), 后台静默刷新缓存, 不阻塞
    if (cached) {
      update.catch(() => {});
      return cached;
    }
    // 无缓存(首次/新部署): 等网络结果
    const fresh = await update;
    if (fresh) return fresh;
    // 无缓存且网络失败: 导航请求回退到已缓存的壳
    if (req.mode === "navigate") {
      const shell = await cache.match("./index.html");
      if (shell) return shell;
    }
    throw new TypeError("offline & no cache: " + url.pathname);
  })());
});
