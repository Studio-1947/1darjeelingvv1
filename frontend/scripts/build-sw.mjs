// Builds dist/service-worker.js from src/service-worker.ts after `vite build`.
//
// The worker was written for CRA, which compiled it and filled in its file list. Vite does
// neither, so production served index.html at /service-worker.js, registration failed, and the
// site had no service worker at all. This step does what CRA used to: bundle the worker and
// replace `self.__WB_MANIFEST` with the files to precache, each with a revision so a deploy
// replaces exactly the files that changed.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

// The app shell: the HTML, every bundle, and the icons the splash and home-screen install use.
// Team portraits, the hero video and other large photos stay out; the browser caches them as
// usual when a page shows them.
const ROOT_FILES = new Set([
  'index.html',
  'manifest.json',
  'favicon-v2.svg',
  'favicon.ico',
  'logo192.png',
  'logo512.png',
  'apple-touch-icon.png',
  'error-shim.js',
  'loading.webp',
]);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const entries = walk(dist)
  .map((full) => ({ full, url: relative(dist, full).split(sep).join('/') }))
  .filter(({ url }) => ROOT_FILES.has(url) || /^assets\/.+\.(js|css|woff2?|svg|png|webp)$/.test(url))
  .map(({ full, url }) => {
    // Files in assets/ carry a content hash in their name, so the name is the revision.
    const hashed = url.startsWith('assets/');
    const revision = hashed ? null : createHash('md5').update(readFileSync(full)).digest('hex');
    return { url: '/' + url, revision };
  })
  .sort((a, b) => a.url.localeCompare(b.url));

if (!entries.some((e) => e.url === '/index.html')) {
  throw new Error('build-sw: dist/index.html is missing; run vite build first');
}

const manifest = JSON.stringify(entries);

await build({
  input: join(root, 'src/service-worker.ts'),
  platform: 'browser',
  // Workbox checks process.env.NODE_ENV to drop its development logging.
  transform: { define: { 'process.env.NODE_ENV': '"production"' } },
  plugins: [
    {
      name: 'inject-precache-manifest',
      transform(code, id) {
        if (!id.endsWith('service-worker.ts')) return null;
        if (!code.includes('self.__WB_MANIFEST')) throw new Error('build-sw: self.__WB_MANIFEST not found');
        return code.replace('self.__WB_MANIFEST', manifest);
      },
    },
  ],
  output: { file: join(dist, 'service-worker.js'), format: 'iife', minify: true },
});

const size = statSync(join(dist, 'service-worker.js')).size;
console.log(`build-sw: service-worker.js (${(size / 1024).toFixed(1)} kB), ${entries.length} files precached`);
