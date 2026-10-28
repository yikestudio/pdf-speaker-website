import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { locales, matchLocale } from '../src/locales.mjs';
import { siteCopy } from '../src/content/site.mjs';
import { legal } from '../src/content/legal.mjs';
import { build, validateConfig, escape } from '../scripts/build.mjs';

const root = resolve(import.meta.dirname, '..');
const out = join(root, '_site');
const config = JSON.parse(await readFile(join(root, 'site.config.json'), 'utf8'));
const app = JSON.parse(await readFile(join(root, 'src/content/app-copy.json'), 'utf8'));
const paths = ['index.html', '404.html', ...locales.flatMap(([code]) =>
  ['index', 'privacy', 'terms'].map(page => `${code}/${page}.html`))];
const pages = new Map(await Promise.all(paths.map(async path => [path, await readFile(join(out, path), 'utf8')])));
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'");

test('all 16 locales have complete, nonempty marketing and legal content', () => {
  assert.equal(locales.length, 16);
  const keys = Object.keys(siteCopy.en);
  for (const [code] of locales) {
    assert.deepEqual(Object.keys(siteCopy[code]), keys, code);
    for (const value of Object.values(siteCopy[code])) assert.ok(typeof value === 'string' && value.trim(), code);
    assert.equal(legal[code].privacy.length, 5, code);
    assert.equal(legal[code].terms.length, 6, code);
    for (const sections of Object.values(legal[code])) {
      for (const section of sections) assert.ok(section.length === 2 && section.every(text => text.trim().length > 0), code);
    }
    assert.equal(app[code].headlines.length, 6, code);
    if (code !== 'en') {
      assert.notEqual(siteCopy[code].introTitle, siteCopy.en.introTitle);
      assert.notEqual(legal[code].terms[0][1], legal.en.terms[0][1]);
    }
  }
});

test('language detection handles regional Chinese, Portuguese and English fallback', () => {
  for (const [code] of locales) assert.equal(matchLocale([code]), code);
  for (const [input, expected] of [
    ['zh-TW', 'zh-Hant'], ['zh-HK', 'zh-Hant'], ['zh-MO', 'zh-Hant'],
    ['zh-CN', 'zh-Hans'], ['zh-SG', 'zh-Hans'], ['pt-PT', 'pt-BR'],
    ['ar-SA', 'ar'], ['de-AT', 'de'], ['en-US', 'en'], ['zz', 'en']
  ]) assert.equal(matchLocale([input]), expected);
  assert.equal(matchLocale(['nl-NL', 'fr-FR']), 'fr');
});

test('configuration rejects fake store destinations and unsafe URLs', () => {
  validateConfig(config);
  validateConfig({ ...config, appStoreUrl: 'https://apps.apple.com/app/id123456789' });
  for (const url of ['javascript:alert(1)', 'https://example.com/app', 'http://apps.apple.com/app']) {
    assert.throws(() => validateConfig({ ...config, appStoreUrl: url }));
  }
  assert.throws(() => validateConfig({ ...config, siteUrl: 'https://example.com/#fragment' }));
  assert.throws(() => validateConfig({ ...config, supportEmail: 'not an email' }));
  assert.equal(escape('<a title="&">'), '&lt;a title=&quot;&amp;&quot;&gt;');
});

test('50 static HTML documents have language, metadata, one h1 and unique IDs', () => {
  assert.equal(pages.size, 50);
  for (const [path, html] of pages) {
    const code = path.includes('/') ? path.split('/')[0] : 'en';
    assert.ok(html.includes(`<html lang="${code}" dir="${code === 'ar' ? 'rtl' : 'ltr'}">`), path);
    assert.equal((html.match(/<h1>/g) ?? []).length, 1, path);
    assert.match(html, /<meta name="description" content="[^"]+">/, path);
    assert.equal((html.match(/hreflang="/g) ?? []).length, 33, path);
    assert.match(html, /href="#main"/, path);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, path);
    assert.ok(!/undefined|\[object Object\]|TODO|Lorem ipsum/.test(html), path);
    assert.ok(!/https:\/\/(?:fonts\.googleapis|www\.googletagmanager|www\.google-analytics)/.test(html), path);
  }
});

test('local links, anchors and assets resolve under a GitHub project subpath', async () => {
  const origin = 'https://test.invalid/pdf-speaker/';
  for (const [path, html] of pages) {
    const basePath = html.match(/<base href="([^"]+)"/)?.[1];
    const documentURL = basePath ? new URL(basePath, origin).href : origin + path;
    const expectedPrefix = basePath ?? '/pdf-speaker/';
    for (const match of html.matchAll(/<(?:a|link|script|img)\b[^>]*?\s(?:href|src)="([^"]+)"/g)) {
      const href = decode(match[1]);
      if (/^(https?:|mailto:)/.test(href)) continue;
      const target = new URL(href, documentURL);
      assert.ok(target.pathname.startsWith(expectedPrefix), `${path}: ${href}`);
      const relative = href.startsWith('#') ? path :
        decodeURIComponent(target.pathname.slice(expectedPrefix.length)) || 'index.html';
      assert.ok((await stat(join(out, relative))).isFile(), `${path}: ${href}`);
      if (target.hash) {
        const destination = pages.get(relative);
        assert.ok(destination?.includes(`id="${target.hash.slice(1)}"`), `${path}: missing ${href}`);
      }
    }
    for (const [, attributes] of html.matchAll(/<img\s([^>]+)>/g)) {
      assert.match(attributes, /\balt="/, path);
      assert.match(attributes, /\bwidth="\d+"/, path);
      assert.match(attributes, /\bheight="\d+"/, path);
    }
  }
});

test('pending download is explicit, localized, and not an active purchase link', () => {
  for (const [code] of locales) {
    const html = pages.get(`${code}/index.html`);
    if (!config.appStoreUrl) {
      assert.ok(html.includes(escape(siteCopy[code].pending)), code);
      assert.ok(html.includes(escape(siteCopy[code].pendingBody)), code);
      assert.ok(!html.includes('href="https://apps.apple.com'), code);
    }
    assert.ok(html.includes('US$1.99'), code);
    assert.ok(html.includes('US$11.99'), code);
    assert.ok(html.includes('US$22.90'), code);
    assert.ok(html.includes(escape(siteCopy[code].priceNote)), code);
  }
});

test('Prosodia clearly separates the free allowance from renewing Pro plans', () => {
  assert.equal(config.name, 'Prosodia');
  assert.equal(config.monthlyPriceUSD, '1.99');
  assert.equal(config.yearlyPriceUSD, '11.99');
  assert.equal(config.lifetimePriceUSD, '22.90');
  for (const [code] of locales) {
    const html = pages.get(`${code}/index.html`);
    for (const field of ['freeDetails', 'proBenefits', 'monthly', 'yearly', 'lifetime', 'lifetimeTerms',
      'lifetimeSubscriptionWarning', 'subscriptionTerms', 'subscriptionNetwork']) {
      assert.ok(html.includes(escape(app[code][field])), `${code}: ${field}`);
    }
    assert.ok(html.includes('Prosodia Pro'), code);
    assert.ok(html.includes(escape(siteCopy[code].freeDownload)), code);
    assert.ok(html.includes(escape(siteCopy[code].freeAllowance)), code);
  }
  for (const [path, html] of pages) {
    assert.ok(!/PDF Speaker|US\$(?:14\.99|2\.00|15\.00)|No subscription|One-time purchase/.test(html), path);
  }
  for (const price of ['0.00', '-2.00', '2', 'NaN', undefined]) {
    assert.throws(() => validateConfig({ ...config, monthlyPriceUSD: price }));
    assert.throws(() => validateConfig({ ...config, yearlyPriceUSD: price }));
    assert.throws(() => validateConfig({ ...config, lifetimePriceUSD: price }));
  }
});

test('language switch retains the current legal page, with no English fallback', () => {
  for (const [code] of locales) {
    for (const kind of ['privacy', 'terms']) {
      const html = pages.get(`${code}/${kind}.html`);
      for (const [destination] of locales) {
        assert.ok(html.includes(`href="../${destination}/${kind}.html"`), `${code}/${kind}`);
      }
      for (const [heading, body] of legal[code][kind]) {
        assert.ok(html.includes(escape(heading)), code);
        assert.ok(html.includes(escape(body)), code);
      }
    }
  }
});

test('all 320 screenshots are real imported assets and stay within site budget', async () => {
  const assets = JSON.parse(await readFile(join(out, 'assets/provenance.json'), 'utf8'));
  assert.equal(assets.length, 320);
  let total = 0;
  for (const asset of assets) {
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    assert.equal(asset.documentLocale, asset.locale, asset.output);
    assert.ok(asset.documentTitle && asset.chapterTitle && asset.attachment.startsWith(`Website-${asset.locale}-`));
    assert.match(asset.documentSHA256, /^[a-f0-9]{64}$/);
    const data = await readFile(join(out, 'assets', asset.output));
    assert.equal(createHash('sha256').update(data).digest('hex'), asset.webpSHA256, asset.output);
    if (asset.locale !== 'en') assert.notEqual(asset.documentTitle, 'A Book by the Window');
    const size = (await stat(join(out, 'assets', asset.output))).size;
    assert.ok(size > 1000 && size < 500_000, `${asset.output}: ${size}`);
    total += size;
  }
  for (const name of ['library', 'mac', 'mac-listening', 'ipad-library', 'ipad', 'ipad-listening',
    'iphone-library', 'iphone-document', 'iphone', 'iphone-voices', 'ipad-voices', 'mac-voices',
    'duo-library', 'duo-document', 'duo-listening', 'duo-voices',
    'iphone-region', 'duo-region', 'ipad-region', 'mac-region']) {
    const images = assets.filter(asset => asset.output.endsWith(`/${name}.webp`));
    assert.equal(new Set(images.map(asset => asset.sha256)).size, 16, `${name}: distinct localized captures`);
  }
  assert.ok(total < 40_000_000, `${total} bytes`);
});

test('all 16 social cards are localized, opaque and linked from page metadata', async () => {
  const cards = JSON.parse(await readFile(join(out, 'assets/social-provenance.json'), 'utf8'));
  assert.equal(cards.length, 16);
  assert.equal(new Set(cards.map(card => card.sha256)).size, 16);
  for (const [code] of locales) {
    const card = cards.find(item => item.locale === code);
    assert.ok(card, code);
    const data = await readFile(join(out, 'assets', card.output));
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(data.readUInt32BE(16), 1200);
    assert.equal(data.readUInt32BE(20), 630);
    assert.equal(data[24], 8);
    assert.equal(data[25], 2);
    assert.equal(createHash('sha256').update(data).digest('hex'), card.sha256);
    assert.equal(Object.keys(card.sources).length, 2);
    for (const name of ['index', 'privacy', 'terms']) {
      const html = pages.get(`${code}/${name}.html`);
      assert.match(html, new RegExp(`<meta property="og:image" content="[^"]*/assets/${code}/social\\.png">`));
      assert.match(html, new RegExp(`<meta name="twitter:image" content="[^"]*/assets/${code}/social\\.png">`));
      assert.ok(html.includes('property="og:image:width" content="1200"'));
      assert.ok(html.includes('property="og:image:height" content="630"'));
    }
    assert.equal(app[code].voiceTitle, app[code].headlines[3]);
    assert.equal(app[code].voiceBody, app[code].captions[3]);
  }
});

test('all four devices present five scenes including voice selection and reading-area editing', () => {
  const files = {
    mac: ['library', 'mac', 'mac-listening', 'mac-voices', 'mac-region'],
    ipad: ['ipad-library', 'ipad', 'ipad-listening', 'ipad-voices', 'ipad-region'],
    iphone: ['iphone-library', 'iphone-document', 'iphone', 'iphone-voices', 'iphone-region'],
    duo: ['duo-library', 'duo-document', 'duo-listening', 'duo-voices', 'duo-region']
  };
  for (const [code] of locales) {
    const html = pages.get(`${code}/index.html`);
    for (const [platform, images] of Object.entries(files)) {
      const panel = html.match(new RegExp(`<section class="device-panel ${platform}"[\\s\\S]*?</section>`))?.[0];
      assert.ok(panel, `${code}/${platform}`);
      assert.equal([...panel.matchAll(/<img /g)].length, 5);
      assert.deepEqual([...panel.matchAll(/data-view="([^"]+)"/g)].map(match => match[1]),
        ['library', 'document', 'listening', 'voices', 'region']);
      for (const file of images) {
        assert.ok(panel.includes(`href="../assets/${code}/${file}.webp"`));
        assert.ok(panel.includes(`src="../assets/${code}/${file}.webp"`));
      }
      assert.equal([...panel.matchAll(/target="_blank" rel="noopener"/g)].length, 5);
    }
  }
});

test('every locale explains selectable reading areas with a real localized editor screenshot', () => {
  for (const [code] of locales) {
    const html = pages.get(`${code}/index.html`);
    const section = html.match(/<section class="section wrap region-feature"[\s\S]*?<\/section>/)?.[0];
    assert.ok(section, code);
    assert.ok(section.includes(escape(app[code].headlines[5])), code);
    assert.ok(section.includes(escape(app[code].captions[5])), code);
    assert.ok(section.includes(`assets/${code}/duo-region.webp`), code);
    assert.ok(!html.includes('04-navigation'), code);
  }
});

test('text palette passes WCAG AA for normal text in light and dark themes', () => {
  function luminance(hex) {
    const components = hex.match(/[a-f\d]{2}/gi).map(value => {
      const s = parseInt(value, 16) / 255;
      return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
    });
    return components[0] * .2126 + components[1] * .7152 + components[2] * .0722;
  }
  for (const [fg, bg] of [
    ['18243b', 'f7f8fc'], ['56627a', 'f7f8fc'], ['4058d5', 'ffffff'],
    ['ffffff', '4058d5'], ['f1f4fc', '111827'], ['b2bed3', '182236'],
    ['aabaff', '182236'], ['111827', 'aabaff'], ['c1c9dc', '18243b']
  ]) {
    const values = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
    assert.ok((values[0] + .05) / (values[1] + .05) >= 4.5, `${fg} / ${bg}`);
  }
});

test('browser enhancement is progressive, with no storage or tracking', async () => {
  const js = await readFile(join(out, 'assets/site.js'), 'utf8');
  assert.ok(!/localStorage|sessionStorage|document\.cookie|\bfetch\(/.test(js));
  assert.match(js, /ArrowRight/);
  assert.match(js, /aria-selected/);
  assert.match(js, /Escape/);
  for (const [code] of locales) {
    const html = pages.get(`${code}/index.html`);
    assert.equal((html.match(/data-panel/g) ?? []).length, 4);
    assert.ok(!/data-panel[^>]*hidden/.test(html));
    assert.ok(html.includes('<details>'));
  }
});

test('production build wires store links, canonical URLs, sitemap and nested 404 base', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'pdf-speaker-site-test-'));
  try {
    const siteUrl = 'https://pages.example/pdf-speaker/';
    const appStoreUrl = 'https://apps.apple.com/app/id123456789';
    await build({ siteUrl, appStoreUrl }, temporary);
    for (const [code] of locales) {
      const home = await readFile(join(temporary, code, 'index.html'), 'utf8');
      assert.ok(home.includes(`href="${appStoreUrl}"`), code);
      assert.ok(!home.includes('class="pending-label"'), code);
      const privacy = await readFile(join(temporary, code, 'privacy.html'), 'utf8');
      assert.ok(privacy.includes(`rel="canonical" href="${siteUrl}${code}/privacy.html"`), code);
      assert.ok(privacy.includes(`hreflang="x-default" href="${siteUrl}en/privacy.html"`), code);
    }
    const notFound = await readFile(join(temporary, '404.html'), 'utf8');
    assert.ok(notFound.includes('<base href="/pdf-speaker/">'));
    const sitemap = await readFile(join(temporary, 'sitemap.xml'), 'utf8');
    assert.equal((sitemap.match(/<loc>/g) ?? []).length, 48);
    assert.ok(sitemap.includes(`${siteUrl}ar/terms.html`));
    const robots = await readFile(join(temporary, 'robots.txt'), 'utf8');
    assert.ok(robots.includes(`${siteUrl}sitemap.xml`));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
