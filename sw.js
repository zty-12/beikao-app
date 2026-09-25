/* 备考工作台 Service Worker
   策略: 导航(HTML)与图片等请求均为 network-first —— 有网永远拿最新版, 无网才回退缓存;
   缓存只在成功响应后被动写入, 不预缓存, 避免出现「改了不生效」的旧缓存问题。 */
const CACHE = "beikao-v1";

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
  if (url.origin !== location.origin) return;   // 跨域(如 Supabase ESM)不代理, 保持直连
  // KaTeX 等静态资源现已本地化(vendor/), 同源 GET 走 network-first + 被动缓存, 离线可用
  // 大体积整页原图不缓存 (raw_pages*), 其他同源资源 network-first + 被动缓存
  const isHugePageImg = /\/data\/raw_pages[^/]*\//.test(url.pathname);
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && !isHugePageImg) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: req.mode === "navigate" });
      if (hit) return hit;
      if (req.mode === "navigate") {
        const shell = await caches.match("./index.html");
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
