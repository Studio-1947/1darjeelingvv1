// Plain .js for the same reason as api.test.js — the repo has no @types/jest.
//
// The Content-Security-Policy in deploy/nginx/app.conf is enforced by the browser, in production,
// on a machine none of the test suites run on. Nothing else in this repo can catch a mistake in
// it, and its failure mode is quiet: a blocked resource leaves the page rendering, just missing
// a piece. Both bugs this file guards shipped to a live site and were found by reading the
// deployed HTML, not by anything failing.
//
//   1. index.html carried an inline <script>, which `script-src 'self'` blocks outright.
//   2. frame-src listed only Razorpay, so the OpenStreetMap iframe on every listing detail
//      page was blocked — the map silently went blank.
//
// app.conf declares TWO policies, one per static location, and they are deliberately different:
// the public SPA loads Razorpay and an OpenStreetMap iframe, the admin console loads neither and
// is locked down harder. Tests therefore have to say which policy they mean.
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const NGINX_CONF = path.join(REPO_ROOT, 'deploy', 'nginx', 'app.conf');
const SNIPPET_DIR = path.join(REPO_ROOT, 'deploy', 'nginx', 'snippets');
const INDEX_HTML = path.join(__dirname, '..', 'public', 'index.html');
const SRC_DIR = __dirname;

const CSP_HEADER = /add_header\s+Content-Security-Policy\s+"([^"]+)"/;
const SNIPPET_INCLUDE = /include\s+\/etc\/nginx\/snippets\/([\w.-]+);/g;

/** The body of a `location <prefix> { … }` block, up to its closing brace. */
function locationBlock(conf, locationPrefix) {
  const start = conf.indexOf(`location ${locationPrefix} {`);
  if (start === -1) throw new Error(`No "location ${locationPrefix} {" block in app.conf`);
  const rest = conf.slice(start);
  // Locations sit one level inside `server { … }`, so their closing brace is the first line
  // that is exactly four spaces and a brace. Brace-counting would be more general and is not
  // worth it against a file whose indentation is enforced by review.
  const end = rest.indexOf('\n    }');
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * The CSP that applies inside a given `location <prefix> {` block.
 *
 * Reading "the first CSP in the file" instead of this is what made the first version of these
 * tests fail against the admin policy — which has no frame-src at all, because it needs none.
 *
 * The policies now live in deploy/nginx/snippets/ and reach each location through an `include`,
 * because add_header does not inherit into a location that declares one of its own and all four
 * static locations therefore have to restate the whole header set. This follows the include
 * rather than reading app.conf alone — which is what these tests used to do, and why they
 * started throwing at import time the moment the snippets landed.
 */
function cspFor(locationPrefix) {
  const conf = fs.readFileSync(NGINX_CONF, 'utf8');
  const block = locationBlock(conf, locationPrefix);

  const sources = [block];
  for (const m of block.matchAll(SNIPPET_INCLUDE)) {
    sources.push(fs.readFileSync(path.join(SNIPPET_DIR, m[1]), 'utf8'));
  }

  for (const text of sources) {
    const match = text.match(CSP_HEADER);
    if (match) return match[1];
  }
  throw new Error(`No Content-Security-Policy reaches "location ${locationPrefix}"`);
}

/** The source values of one CSP directive, e.g. directiveSources(csp, 'frame-src'). */
function directiveSources(csp, name) {
  const directive = csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(name + ' '));
  return directive ? directive.slice(name.length).trim().split(/\s+/) : [];
}

/** Every non-test source file under src/, recursively. */
function sourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, acc);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) acc.push(full);
  }
  return acc;
}

const publicCsp = cspFor('/');
const adminCsp = cspFor('/admin/');

describe('public SPA Content-Security-Policy', () => {
  it('blocks inline scripts, and index.html therefore has none', () => {
    // If script-src ever gains 'unsafe-inline' this assertion should be revisited deliberately,
    // not quietly deleted — it is most of what the policy buys.
    expect(directiveSources(publicCsp, 'script-src')).not.toContain("'unsafe-inline'");

    // Comments are stripped first: the explanatory comment above the shim's <script src=...> tag
    // mentions "<script>" in prose, and matching that would be a false positive.
    const html = fs.readFileSync(INDEX_HTML, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    // An inline script is a <script> with no src. It works perfectly under `yarn start` and is
    // blocked only in production, which is what made the original one easy to ship and miss.
    const inline = html.match(/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
    expect(inline).toEqual([]);
  });

  it('allows every external iframe the app actually renders', () => {
    const frameSrc = directiveSources(publicCsp, 'frame-src');
    const embedded = new Set();

    for (const file of sourceFiles(SRC_DIR)) {
      const code = fs.readFileSync(file, 'utf8');
      if (!/<iframe/i.test(code)) continue;
      // Hosts are read from the whole file rather than from the iframe tag, because the src is
      // normally assembled above as a template literal (see MapEmbed.tsx).
      for (const m of code.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
        embedded.add('https://' + m[1]);
      }
    }

    const blocked = [...embedded].filter((origin) => !frameSrc.includes(origin));
    expect(blocked).toEqual([]);
  });

  it('still allows listing images from wherever they were sourced', () => {
    // Listing photos come from Cloudinary, Pexels, Unsplash, TripAdvisor, MinIO and more,
    // depending on who created the listing. A narrow img-src would blank a photo whenever
    // someone used a new host — a worse failure than the one it would prevent.
    expect(directiveSources(publicCsp, 'img-src')).toContain('https:');
  });
});

describe('admin console Content-Security-Policy', () => {
  it('is stricter than the public one, and stays that way', () => {
    // The admin console loads no third-party script and talks to nothing but its own origin.
    // If that stops being true, this test should fail and force the question rather than
    // someone widening the policy to match whatever was just added.
    expect(directiveSources(adminCsp, 'script-src')).toEqual(["'self'"]);
    expect(directiveSources(adminCsp, 'connect-src')).toEqual(["'self'"]);
  });

  it('needs no frame-src, because it renders no iframes', () => {
    const adminSrc = path.join(REPO_ROOT, 'frontend-admin', 'src');
    const withIframes = sourceFiles(adminSrc).filter((f) => /<iframe/i.test(fs.readFileSync(f, 'utf8')));
    expect(withIframes).toEqual([]);
  });
});

describe('both policies', () => {
  it('keep the directives that make a policy worth having', () => {
    for (const csp of [publicCsp, adminCsp]) {
      expect(directiveSources(csp, 'object-src')).toContain("'none'");
      expect(directiveSources(csp, 'frame-ancestors')).toContain("'none'");
      expect(directiveSources(csp, 'base-uri')).toContain("'self'");
      expect(directiveSources(csp, 'form-action')).toContain("'self'");
    }
  });
});

describe('search indexing', () => {
  // The same image serves both stacks, so only the Host header distinguishes the real site from
  // staging. If this map ever stops naming the canonical domain, the production site starts
  // sending itself noindex — a failure with no visible symptom until traffic disappears weeks later.
  const conf = fs.readFileSync(NGINX_CONF, 'utf8');
  const mapBlock = conf.match(/map\s+\$host\s+\$robots_tag\s*\{([^}]+)\}/);

  it('has a $robots_tag map keyed on the request host', () => {
    expect(mapBlock).not.toBeNull();
  });

  it('exempts the canonical domain and noindexes everything else by default', () => {
    const body = mapBlock[1];
    // The canonical domain must map to an empty value — nginx omits an add_header whose value is
    // empty, so the real site sends no X-Robots-Tag at all rather than a weaker explicit "index".
    expect(body).toMatch(/1darjeeling\\?\.in\$?["\s]*""/);
    // Default-deny: a new staging host or a raw-IP request is non-indexable without anyone
    // remembering to add it here.
    expect(body).toMatch(/default\s+"noindex, nofollow"/);
  });

  it('applies the tag to every location that serves indexable content', () => {
    // HTML for both SPAs and their asset sub-locations reach it through the shared snippet;
    // the public image bucket declares its own because it proxies MinIO rather than serving
    // files. Listing photos are indexable by Google Images in their own right, so leaving that
    // location out would index them under staging.
    const common = fs.readFileSync(path.join(SNIPPET_DIR, 'headers-common.conf'), 'utf8');
    expect((common.match(/add_header\s+X-Robots-Tag\s+\$robots_tag\s+always;/g) || []).length).toBe(1);

    const includers = conf.match(/include\s+\/etc\/nginx\/snippets\/headers-common\.conf;/g) || [];
    expect(includers.length).toBe(4);

    expect(locationBlock(conf, '/one-darjeeling/')).toMatch(/add_header\s+X-Robots-Tag\s+\$robots_tag\s+always;/);
  });

  it('pairs the shared headers with a policy in every static location', () => {
    // The two snippets are what stop the four static locations drifting apart, so a location that
    // pulls in one and forgets the other is the failure mode they were split to prevent — an
    // asset location silently running with no CSP at all.
    const blocks = ['/static/', '/', '/admin/assets/', '/admin/'];
    for (const prefix of blocks) {
      const block = locationBlock(conf, prefix);
      expect(block).toMatch(/include\s+\/etc\/nginx\/snippets\/headers-common\.conf;/);
      expect(block).toMatch(/include\s+\/etc\/nginx\/snippets\/csp-(public|admin)\.conf;/);
    }
  });

  it('does not pair noindex with a Disallow robots.txt', () => {
    // Disallow stops the crawler fetching the page, so it never sees the noindex header and an
    // already-indexed URL stays indexed. Crawling has to stay allowed for noindex to be obeyed.
    const robots = fs.readFileSync(path.join(__dirname, '..', 'public', 'robots.txt'), 'utf8');
    expect(robots).not.toMatch(/^\s*Disallow:\s*\/\s*$/m);
  });
});
