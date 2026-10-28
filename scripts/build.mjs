import { mkdir, readFile, writeFile, cp, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { locales } from '../src/locales.mjs';
import { siteCopy } from '../src/content/site.mjs';
import { legal } from '../src/content/legal.mjs';
import { showcase } from '../src/content/showcase.mjs';

export const root = resolve(import.meta.dirname, '..');
export const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

export function validateConfig(config) {
  if (!config.name || !config.publisher || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.supportEmail)) {
    throw new Error('Provide the product, publisher and a valid support email in site.config.json.');
  }
  if (config.appStoreUrl !== null) {
    const url = new URL(config.appStoreUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'apps.apple.com' || url.username || url.password) {
      throw new Error('appStoreUrl must be null or an HTTPS apps.apple.com URL.');
    }
  }
  if (config.siteUrl !== null) {
    const url = new URL(config.siteUrl);
    if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password) {
      throw new Error('siteUrl must be null or an HTTPS deployment URL including the repository path.');
    }
  }
  if (![config.monthlyPriceUSD, config.yearlyPriceUSD, config.lifetimePriceUSD].every(price =>
    typeof price === 'string' && /^\d+\.\d{2}$/.test(price) && Number(price) > 0) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(config.updated)) {
    throw new Error('Invalid price or policy revision date.');
  }
}

const icons = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  wave: '<path d="M3 10v4m4-8v12m5-16v20m5-16v12m4-8v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  lines: '<path d="M4 5h16M4 10h12M4 15h16M4 20h9"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
  scan: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 9h10M7 13h10M7 17h6"/>',
  book: '<path d="M4 3h13a3 3 0 0 1 3 3v15H6a3 3 0 0 1-3-3V6a3 3 0 0 1 1-3Zm0 14h16M7 3v14"/>'
};
const icon = (name, className = '') => `<svg class="icon ${className}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

export async function build(overrides = {}, outputDirectory = join(root, '_site')) {
  const config = { ...JSON.parse(await readFile(join(root, 'site.config.json'), 'utf8')), ...overrides };
  if (process.env.SITE_URL) config.siteUrl = process.env.SITE_URL;
  validateConfig(config);
  const app = JSON.parse(await readFile(join(root, 'src/content/app-copy.json'), 'utf8'));
  const screenshots = new Map(JSON.parse(await readFile(join(root, 'public/assets/provenance.json'), 'utf8'))
    .map(item => [item.output, item]));
  const audio = JSON.parse(await readFile(join(root, 'public/assets/audio/manifest.json'), 'utf8'));
  if (audio.schema !== 2 || audio.voiceCount !== 39 || audio.languages.length !== 33 ||
      audio.samples.length !== 67 || audio.demos.length !== 16 ||
      audio.unrecorded.length !== 1 || audio.unrecorded[0].language !== 'he-IL' ||
      audio.unrecorded[0].reason !== 'system-voice-license') throw new Error('Incomplete app audio manifest.');
  const recordedLanguages = new Set(audio.samples.filter(clip => clip.language !== 'mixed').map(clip => clip.language));
  if (recordedLanguages.size !== 32 || recordedLanguages.has('he-IL') ||
      audio.languages.some(language => language.code !== 'he-IL' && !recordedLanguages.has(language.code))) {
    throw new Error('Expected 32 recorded languages and a Hebrew licensing notice.');
  }
  const out = resolve(outputDirectory);
  const base = config.siteUrl ? `${config.siteUrl.replace(/\/+$/, '')}/` : null;
  const urlFor = path => base ? new URL(path, base).href : null;
  const year = config.updated.slice(0, 4);
  await mkdir(out, { recursive: true });
  await cp(join(root, 'public'), out, { recursive: true });
  await copyFile(join(root, 'src/locales.mjs'), join(out, 'assets/locales.js'));
  await writeFile(join(out, '.nojekyll'), '');

  function render(locale, page, atRoot = false) {
    const t = siteCopy[locale], a = app[locale], s = showcase[locale];
    const prefix = atRoot ? '' : '../';
    const local = atRoot ? `${locale}/` : '';
    const home = `${local}index.html`;
    const asset = file => `${prefix}assets/${file}`;
    const title = page === 'index' ? `${config.name} — ${a.hero}` :
      `${page === '404' ? t.notFound : a[page]} — ${config.name}`;
    const canonicalPath = page === '404' ? '404.html' : `${locale}/${page}.html`;
    const description = page === 'index' ? `${s.offlineTitle} ${s.heroBody}` : t.legalIntro;
    const link = (href, label, className = '') => `<a${className ? ` class="${className}"` : ''} href="${escape(href)}">${label}</a>`;
    const cta = (className = 'button primary') => link(config.appStoreUrl ?? `${home}#download`,
      `${escape(t.download)}${icon('arrow')}`, className);
    const image = (file, alt, className, eager = false) => {
      const capture = screenshots.get(`${locale}/${file}.webp`);
      if (!capture || !(capture.width > 0) || !(capture.height > 0)) {
        throw new Error(`Missing screenshot dimensions: ${locale}/${file}`);
      }
      return `<img class="${className}" src="${asset(`${locale}/${file}.webp`)}" width="${capture.width}" height="${capture.height}" alt="${escape(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
    };
    const langLinks = locales.map(([code, name]) => link(
      `${prefix}${code}/${page === '404' ? 'index' : page}.html`,
      `<span lang="${code}" dir="auto">${escape(name)}</span>${code === locale ? '<span aria-hidden="true">✓</span>' : ''}`,
      code === locale ? 'current-language' : ''
    ).replace('<a', `<a hreflang="${code}"${code === locale ? ' aria-current="true"' : ''}`)).join('');
    const header = `<a class="skip-link" href="#main">${escape(t.skip)}</a>
      <header class="site-header"><div class="header-inner">
        <a class="brand" href="${home}" aria-label="${escape(config.name)} — ${escape(t.home)}">
          <img src="${asset('app-icon.webp')}" width="36" height="36" alt=""><span>${escape(config.name)}</span>
        </a>
        <nav class="main-nav" aria-label="${escape(t.home)}">
          ${link(`${home}#features`, escape(t.features))}
          ${link(`${home}#experience`, escape(t.experience))}
          ${link(`${home}#faq`, escape(t.faq))}
        </nav>
        <div class="header-actions"><details class="language-menu">
          <summary>${icon('globe')}<span>${escape(t.language)}</span></summary>
          <nav class="language-options" aria-label="${escape(t.language)}">${langLinks}</nav>
        </details>${cta('button small')}</div>
      </div></header>`;
    const footer = `<footer class="site-footer"><div class="footer-top">
      <a class="brand" href="${home}"><img src="${asset('app-icon.webp')}" width="32" height="32" alt="">${escape(config.name)}</a>
      <nav aria-label="${escape(t.contents)}">
        ${link(`${local}privacy.html`, escape(a.privacy))}
        ${link(`${local}terms.html`, escape(a.terms))}
        ${link(`mailto:${config.supportEmail}`, escape(t.contact))}
      </nav></div><div class="footer-bottom"><span>© ${year} ${escape(config.publisher)}</span><span>${escape(t.platforms.replace('iPhone', 'iPhone / iPhone Duo'))}</span></div>
      </footer>`;

    let content;
    if (page === 'index') {
      const faq = ['Offline', 'Mixed', 'Sync', 'Scans'].map(key =>
        `<details><summary>${escape(t[`faq${key}`])}<span aria-hidden="true">+</span></summary><p>${escape(t[`faq${key}Answer`])}</p></details>`).join('');
      const panels = [
        ['iphone', 'iPhone', s.iphoneUse, ['iphone-library', 'iphone-document', 'iphone', 'iphone-voices', 'iphone-region']],
        ['duo', 'iPhone Duo', s.duoUse, ['duo-library', 'duo-document', 'duo-listening', 'duo-voices', 'duo-region']],
        ['ipad', 'iPad', s.ipadUse, ['ipad-library', 'ipad', 'ipad-listening', 'ipad-voices', 'ipad-region']],
        ['mac', 'Mac', s.macUse, ['library', 'mac', 'mac-listening', 'mac-voices', 'mac-region']]
      ];
      const views = [
        ['library', s.homeView, a.captions[4]],
        ['document', s.documentView, a.captions[1]],
        ['listening', s.listeningView, a.captions[2]],
        ['voices', a.voiceView, a.captions[3]],
        ['region', a.regionView, a.captions[5]]
      ];
      const demo = audio.demos.find(item => item.locale === locale);
      if (!demo) throw new Error(`Missing segmentation recording: ${locale}`);
      const seconds = new Intl.NumberFormat(locale, { style: 'unit', unit: 'second', unitDisplay: 'short', maximumFractionDigits: 0 });
      const previewLanguage = audio.samples.find(clip => clip.locale === locale)?.language;
      if (!previewLanguage) throw new Error(`Missing default preview language: ${locale}`);
      const languageName = code => {
        if (code === 'mixed') return s.mixed;
        const language = audio.languages.find(item => item.code === code);
        if (!language) throw new Error(`Unknown audio language: ${code}`);
        return language.name;
      };
      const audioURL = clip => `${asset(`audio/${clip.file}`)}?v=${clip.sha256.slice(0, 12)}`;
      const player = (clip, id, isDemo = false) => `<div class="audio-player" data-audio-player>
        <audio id="${id}" controls preload="none" src="${audioURL(clip)}"
          aria-label="${escape(`${s.listen} · ${clip.voice} · ${languageName(clip.language)}`)}"${isDemo ? ' data-demo-audio' : ''}>
          ${link(audioURL(clip), escape(s.downloadAudio))}</audio>
        <p class="audio-error" role="alert" data-audio-error hidden>${escape(s.audioError)}</p>
        <div class="audio-caption"><span>${escape(seconds.format(clip.duration))} · <bdi>${escape(clip.voice)}</bdi></span>
          ${link(audioURL(clip), escape(s.downloadAudio))}</div></div>`;
      const voiceCards = audio.samples.filter(clip => clip.locale !== (locale === 'zh-Hant' ? 'zh-Hans' : 'zh-Hant')).map(clip => {
        const waveform = clip.peaks.map((peak, i) => {
          const height = Math.max(2, Math.sqrt(peak) * 42);
          return `M${i * 6 + 3} ${24 - height / 2}v${height}`;
        }).join('');
        return `<article class="voice-card" data-voice-language="${clip.language}">
          <div class="voice-heading"><h3><bdi>${escape(clip.voice)}</bdi></h3><span dir="auto">${escape(languageName(clip.language))}</span></div>
          <svg class="audio-wave" viewBox="0 0 288 48" fill="none" aria-hidden="true"><path d="${waveform}" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
          ${player(clip, `audio-${clip.id}`)}
          <details class="transcript"><summary>${escape(s.transcript)}</summary><p lang="${clip.locale === 'mixed' ? 'zh-Hans' : clip.locale}" dir="auto">${escape(clip.text)}</p></details>
        </article>`;
      }).join('');
      let sourceOffset = 0;
      const sourceLines = demo.lines.map((line, index) => {
        const lineStart = sourceOffset, lineEnd = lineStart + line.length;
        sourceOffset = lineEnd + 1;
        let cursor = lineStart, html = '';
        demo.cues.forEach((cue, cueIndex) => {
          const start = Math.max(lineStart, cue.location), end = Math.min(lineEnd, cue.location + cue.length);
          if (end <= start) return;
          html += escape(demo.text.slice(cursor, start));
          html += `<span data-source-cue="${cueIndex}">${escape(demo.text.slice(start, end))}</span>`;
          cursor = end;
        });
        html += escape(demo.text.slice(cursor, lineEnd));
        return `<p class="paper-line${index === 0 ? ' paper-title' : ''}">${html}</p>`;
      }).join('');
      content = `<main id="main">
        <section class="hero wrap">
          <div class="hero-copy"><p class="eyebrow offline-eyebrow">${icon('shield')}${escape(s.offlineTitle)}</p>
            <h1>${escape(a.hero)}</h1><p class="hero-description">${escape(s.heroBody)}</p>
            <p class="offline-note">${escape(s.offlineBody)}</p>
            <div class="hero-actions">${link('#voices', `${icon('wave')}${escape(s.listen)}`, 'button primary')}${cta('text-link')}</div>
            <p class="purchase-note">${escape(t.freeDownload)}<span aria-hidden="true"> · </span>${escape(t.freeAllowance)}</p>
          </div>
          <div class="hero-art">
            <div class="sound-ribbon" aria-hidden="true">${Array.from({ length: 23 }, (_, i) => `<i class="bar-${i % 6}"></i>`).join('')}</div>
            <figure class="desktop-shot">${image('mac', `${a.headlines[1]} — Mac`, '', true)}</figure>
            <figure class="tablet-shot">${image('ipad', s.ipadUse, '', true)}</figure>
            <figure class="duo-shot">${image('duo-listening', s.duoUse, '', true)}</figure>
            <figure class="phone-shot">${image('iphone', `${a.headlines[2]} — iPhone`, '', true)}</figure>
          </div>
        </section>
        <div class="stats wrap" aria-label="${escape(t.features)}">
          <div><strong>33</strong><span>${escape(t.readingLanguages)}</span></div>
          <div><strong>${audio.voiceCount}</strong><span>${escape(s.voicesStat)}</span></div>
          <div><strong>16</strong><span>${escape(t.interfaceLanguages)}</span></div>
          <div><strong>4</strong><span>iPhone · iPhone Duo · iPad · Mac</span></div>
        </div>
        <section class="section wrap" id="features"><div id="voices">
          <div class="section-heading"><p class="eyebrow">${escape(a.voiceTitle)}</p><h2>${escape(s.voicesTitle)}</h2><p>${escape(s.voicesBody)}</p></div>
          <div class="voice-toolbar" data-voice-filter hidden><label for="voice-language">${escape(s.selectLanguage)}</label>
            <select id="voice-language" data-voice-select>
              ${audio.languages.map(({ code, name }) => `<option value="${code}"${code === previewLanguage ? ' selected' : ''}>${escape(name)}</option>`).join('')}
              <option value="mixed">${escape(s.mixed)}</option>
            </select></div>
          <div class="voice-grid">${voiceCards}<article class="voice-card" data-voice-language="he-IL">
            <h3 lang="he" dir="rtl">עברית</h3><p>${escape(s.hebrewNote)}</p>
          </article></div>
          <p class="fine-print">${escape(s.sourceNote)}</p><p class="fine-print">${escape(t.voiceNote)}</p>
        </div></section>
        <section class="language-showcase section wrap" id="languages">
          <div class="section-heading"><p class="eyebrow">${escape(a.languageTitle)}</p><h2>${escape(s.languagesTitle)}</h2><p>${escape(s.languagesBody)}</p></div>
          <ul class="language-cloud" aria-label="${escape(t.readingLanguages)}">${audio.languages.map(language =>
            `<li><span lang="${language.code}" dir="auto">${escape(language.name)}</span></li>`).join('')}</ul>
        </section>
        <section class="rhythm-section section" id="segmentation"><div class="wrap">
          <div class="section-heading"><p class="eyebrow">${escape(a.sentenceTitle)}</p><h2>${escape(s.rhythmTitle)}</h2><p>${escape(s.rhythmBody)}</p></div>
          <div class="rhythm-demo" data-rhythm-demo>
            <div class="rhythm-layout">
              <div class="paper-example"><p class="demo-label">${escape(s.sourceLabel)}</p><div class="paper-copy">${sourceLines}</div></div>
              <div class="reading-example"><p class="demo-label">${escape(s.resultLabel)}</p>
                <ol class="reading-cues">${demo.cues.map((cue, index) => `<li data-cue="${index}" data-start="${cue.start}" data-end="${cue.end}">
                  <p>${escape(cue.text)}</p>${cue.endsParagraph ? `<span class="pause-marker" data-pause-marker>${escape(s.pause)}</span>` : ''}
                </li>`).join('')}</ol>
              </div>
            </div>
            <div class="rhythm-playback">${player(demo, 'audio-segmentation', true)}</div>
          </div>
          <ul class="rhythm-rules"><li>${icon('lines')}<span>${escape(s.fontRule)}</span></li><li>${icon('arrow')}<span>${escape(s.wrapRule)}</span></li><li>${icon('wave')}<span>${escape(s.punctuationRule)}</span></li></ul>
          <p class="fine-print">${escape(s.demoNote)}</p>
        </div></section>
        <section class="section wrap region-feature" id="reading-region">
          <div class="section-heading"><p class="eyebrow">${escape(a.regionView)}</p>
            <h2>${escape(a.headlines[5])}</h2><p>${escape(a.captions[5])}</p></div>
          <figure><a class="screenshot-link" href="${asset(`${locale}/duo-region.webp`)}" target="_blank" rel="noopener"
            aria-label="${escape(`iPhone Duo — ${a.regionView}. ${s.openScreenshot}`)}">
            ${image('duo-region', `iPhone Duo — ${a.regionView}`, 'product-screen')}</a>
            <figcaption>iPhone Duo · ${escape(a.regionView)}</figcaption></figure>
        </section>
        <section class="experience section" id="experience"><div class="wrap">
          <div class="section-heading centered"><p class="eyebrow">${escape(t.experience)}</p><h2>${escape(s.deviceTitle)}</h2><p>${escape(s.deviceBody)}</p></div>
          <div class="device-tabs" data-tabs aria-label="${escape(t.galleryLabel)}" hidden>
            ${panels.map(([id, name]) => `<button type="button" id="tab-${id}" aria-controls="panel-${id}">${name}</button>`).join('')}
          </div>
          <p class="gallery-hint">${escape(s.openScreenshot)}</p>
          <div class="device-panels">${panels.map(([id, name, description, files]) =>
            `<section class="device-panel ${id}" id="panel-${id}" data-panel aria-label="${name}">
              <p class="device-description">${escape(description)}</p>
              <div class="device-gallery">${views.map(([view, label, caption], index) =>
                `<figure data-view="${view}">
                  <div class="device-stage"><a class="screenshot-link" href="${asset(`${locale}/${files[index]}.webp`)}" target="_blank" rel="noopener" aria-label="${escape(`${name} — ${label}. ${s.openScreenshot}`)}">
                    ${id === 'iphone' ? '<div class="phone-frame">' : ''}${image(files[index], `${name} — ${label}`, 'product-screen')}${id === 'iphone' ? '</div>' : ''}
                  </a></div>
                  <figcaption><strong>${escape(label)}</strong><span>${escape(caption)}</span></figcaption>
                </figure>`).join('')}</div>
            </section>`).join('')}</div>
          <div class="detail-grid">
            <article>${icon('lines')}<h3>${escape(s.designTitle)}</h3><p>${escape(s.designBody)}</p></article>
            <article>${icon('scan')}<h3>${escape(t.ocrTitle)}</h3><p>${escape(t.ocrBody)}</p></article>
            <article>${icon('book')}<h3>${escape(t.libraryTitle)}</h3><p>${escape(t.libraryBody)}</p></article>
          </div>
        </div></section>
        <section class="privacy-section wrap section"><div class="privacy-symbol" aria-hidden="true">${icon('shield')}</div>
          <div><p class="eyebrow">${escape(a.privacy)}</p><h2>${escape(t.privacyTitle)}</h2><p>${escape(t.privacyBody)}</p>
            ${link(`${local}privacy.html`, `${escape(t.privacyLink)}${icon('arrow')}`, 'text-link')}</div>
        </section>
        <section class="faq-section wrap section" id="faq"><div class="section-heading"><p class="eyebrow">${escape(t.faq)}</p><h2>${escape(t.faqTitle)}</h2></div>
          <div class="faq-list">${faq}</div>
        </section>
        <section class="download-section wrap" id="download" tabindex="-1"><div class="download-card">
          <img src="${asset('app-icon.webp')}" width="72" height="72" alt="" loading="lazy">
          <h2>${escape(t.buyTitle)}</h2><p>${escape(t.buyBody)}</p>
          <h3>${escape(t.freeDownload)}</h3><p class="plan-summary">${escape(a.freeDetails)}</p>
          <h3>${escape(config.name)} Pro</h3><p>${escape(a.proBenefits)}</p>
          <div class="price"><bdi>US$${escape(config.monthlyPriceUSD)}</bdi><span>${escape(a.monthly)}</span></div>
          <div class="price"><bdi>US$${escape(config.yearlyPriceUSD)}</bdi><span>${escape(a.yearly)}</span></div>
          <div class="price"><bdi>US$${escape(config.lifetimePriceUSD)}</bdi><span>${escape(a.lifetime)}</span></div>
          <p class="plan-summary">${escape(a.lifetimeTerms)}</p>
          <p class="plan-summary">${escape(a.subscriptionTerms)}</p>
          <p class="plan-summary">${escape(a.lifetimeSubscriptionWarning)}</p>
          <p class="plan-summary">${escape(a.subscriptionNetwork)}</p>
          ${config.appStoreUrl ? cta('button light') : `<p class="pending-label">${escape(t.pending)}</p><p class="pending-body">${escape(t.pendingBody)}</p>`}
          <p class="price-note">${escape(t.priceNote)}</p><p class="requirements">${escape(t.requirements)}</p>
        </div></section>
        <section class="support-strip wrap"><div><h2>${escape(t.contact)}</h2><p>${escape(t.supportBody)}</p></div>
          ${link(`mailto:${config.supportEmail}`, escape(config.supportEmail), 'text-link')}</section>
      </main>`;
    } else if (page === '404') {
      content = `<main id="main" class="not-found wrap"><p class="eyebrow">404</p><h1>${escape(t.notFound)}</h1><p>${escape(t.notFoundBody)}</p>${link(home, escape(t.home), 'button primary')}</main>`;
    } else {
      const sections = legal[locale][page];
      const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${config.updated}T12:00:00Z`));
      content = `<main id="main" class="legal-main wrap"><div class="legal-header">
        ${link(home, `← ${escape(t.home)}`, 'text-link')}<h1>${escape(a[page])}</h1><p>${escape(t.legalIntro)}</p>
        <p class="legal-date">${escape(t.updated)} <time datetime="${config.updated}">${escape(date)}</time> · ${escape(config.publisher)}</p>
        </div><div class="legal-layout"><aside class="legal-toc"><nav aria-label="${escape(t.contents)}"><p>${escape(t.contents)}</p>
        ${sections.map(([heading], i) => link(`#section-${i + 1}`, escape(heading))).join('')}</nav></aside>
        <article class="legal-copy">${sections.map(([heading, body], i) => `<section id="section-${i + 1}">
          <h2>${escape(heading)}</h2><p>${escape(body)}</p></section>`).join('')}
          <section class="legal-contact"><h2>${escape(t.contact)}</h2><p>${escape(config.publisher)}<br>${link(`mailto:${config.supportEmail}`, escape(config.supportEmail))}</p>
          <p>${page === 'terms' ? link('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/', escape(t.appleLicense)) :
            link('https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement', escape(t.githubPrivacy))}</p>
          ${link(`${local}${page === 'privacy' ? 'terms' : 'privacy'}.html`, escape(a[page === 'privacy' ? 'terms' : 'privacy']))}
          </section></article></div></main>`;
    }
    const canonical = urlFor(canonicalPath);
    const alternate = locales.map(([code]) => `<link rel="alternate" hreflang="${code}" href="${escape(urlFor(`${code}/${page === '404' ? 'index' : page}.html`) ?? `${prefix}${code}/${page === '404' ? 'index' : page}.html`)}">`).join('\n');
    const socialImage = urlFor(`assets/${locale}/mac.webp`) ?? asset(`${locale}/mac.webp`);
    return `<!doctype html>
<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${page === '404' ? `<base href="${escape(base ? new URL(base).pathname : '/')}"><meta name="robots" content="noindex">` : ''}
<title>${escape(title)}</title><meta name="description" content="${escape(description)}">
<meta name="color-scheme" content="light dark"><meta name="theme-color" content="#f7f8fc">
<meta name="referrer" content="strict-origin-when-cross-origin">
${canonical ? `<link rel="canonical" href="${escape(canonical)}"><meta property="og:url" content="${escape(canonical)}">` : ''}
${alternate}
<link rel="alternate" hreflang="x-default" href="${escape(urlFor(page === 'privacy' || page === 'terms' ? `en/${page}.html` : 'index.html') ?? `${prefix}${page === 'privacy' || page === 'terms' ? `en/${page}.html` : 'index.html'}`)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="${escape(config.name)}">
<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}">
<meta property="og:image" content="${escape(socialImage)}"><meta property="og:image:alt" content="${escape(a.headlines[1])}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${asset('app-mark.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${asset('site.css')}">
<script type="module" src="${asset('site.js')}"></script>
</head><body${atRoot && page === 'index' ? ' data-language-entry' : ''}>${header}${content}${footer}</body></html>\n`;
  }
  for (const [locale] of locales) {
    if (!siteCopy[locale] || !legal[locale] || !app[locale]) throw new Error(`Missing locale: ${locale}`);
    await mkdir(join(out, locale), { recursive: true });
    for (const page of ['index', 'privacy', 'terms']) {
      await writeFile(join(out, locale, `${page}.html`), render(locale, page));
    }
  }
  await writeFile(join(out, 'index.html'), render('en', 'index', true));
  await writeFile(join(out, '404.html'), render('en', '404', true));
  await writeFile(join(out, 'robots.txt'), `User-agent: *\nAllow: /\n${base ? `Sitemap: ${urlFor('sitemap.xml')}\n` : ''}`);
  const paths = locales.flatMap(([locale]) => ['index', 'privacy', 'terms'].map(page => `${locale}/${page}.html`));
  await writeFile(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${base ? paths.map(path => `<url><loc>${escape(urlFor(path))}</loc></url>`).join('') : ''}</urlset>\n`);
  console.log(`Built 48 localized pages + language entry + 404. Download: ${config.appStoreUrl ? 'configured' : 'pending'}.`);
  if (!base) console.log('Set siteUrl or SITE_URL for production canonical URLs and sitemap (automatic in Pages workflow).');
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await build();
