import { defineConfig } from "vite";
export default defineConfig({
  plugins: [
    {
      name: "offline-shell",
      generateBundle(_, bundle) {
        const paths = [
          "/",
          "/index.html",
          "/manifest.webmanifest",
          "/icon.svg",
          "/icon-192.png",
          "/icon-512.png",
          ...Object.keys(bundle)
            .filter((p) => !p.endsWith(".map"))
            .map((p) => "/" + p),
        ];
        const version = "broceliande-" + Object.keys(bundle).join("-");
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: `const CACHE=${JSON.stringify(version)};const PATHS=${JSON.stringify(paths)};self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(PATHS)))});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('broceliande-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.search||!PATHS.includes(u.pathname))return;e.respondWith(caches.open(CACHE).then(async c=>(await c.match(u.pathname,{ignoreVary:true}))||fetch(e.request)))});`,
        });
      },
    },
  ],
});
