const SHELL = "rk-beta2-v2";
const DATEIEN = ["./", "./index.html", "./app.js", "./manifest.json", "./icon.svg"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => Promise.allSettled(DATEIEN.map(u => c.add(new Request(u, { cache:"reload" })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const namen = await caches.keys();
    await Promise.all(namen.filter(n => n !== SHELL).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;

  let u;
  try{ u = new URL(req.url) }catch(_){ return }

  if(u.origin !== location.origin){
    e.respondWith(fetch(req).catch(() => Response.error()));
    return;
  }

  if(req.mode === "navigate" || u.pathname.slice(-11) === "/index.html"){
    e.respondWith((async () => {
      try{
        const r = await fetch(req, { cache:"reload" });
        const c = await caches.open(SHELL);
        c.put("./index.html", r.clone());
        return r;
      }catch(_){
        const c = await caches.open(SHELL);
        const t = await c.match("./index.html") || await c.match("./");
        return t || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    const t = await c.match(req);
    if(t) return t;
    try{ return await fetch(req) }catch(_){ return Response.error() }
  })());
});