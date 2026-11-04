import { defineConfig } from "vite";

// The default remains suitable for a dedicated domain; Pages supplies the project path.
const base = process.env.VITE_BASE_PATH || "/";
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) {
  throw new Error("VITE_BASE_PATH doit être un chemin absolu terminé par /.");
}
export default defineConfig({
  base,
  plugins: [
    {
      name: "offline-shell",
      generateBundle(_, bundle) {
        const paths = [
          base,
          ...[
            "index.html",
            "manifest.webmanifest",
            "icon.svg",
            "icon-192.png",
            "icon-512.png",
          ].map((p) => base + p),
          ...Object.keys(bundle)
            .filter((p) => !p.endsWith(".map"))
            .map((p) => base + p),
        ];
        // Each deployment path owns its caches; another app on the same origin is untouched.
        const prefix = "broceliande:" + base + ":";
        const version = prefix + Object.keys(bundle).join("-");
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: `const CACHE=${JSON.stringify(version)};const PREFIX=${JSON.stringify(prefix)};const PATHS=${JSON.stringify(paths)};self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(PATHS)))});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.search||!PATHS.includes(u.pathname))return;e.respondWith(caches.open(CACHE).then(async c=>(await c.match(u.pathname,{ignoreVary:true}))||fetch(e.request)))});`,
        });
      },
    },
  ],
});
