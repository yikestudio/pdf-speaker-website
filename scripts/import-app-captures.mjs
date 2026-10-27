import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { locales } from '../src/locales.mjs';

const [platform, ...results] = process.argv.slice(2);
if (!['mac', 'iphone', 'ipad'].includes(platform) || !results.length) {
  throw new Error('Usage: node scripts/import-app-captures.mjs mac|iphone|ipad result.xcresult [...]');
}
const app = resolve(import.meta.dirname, '../../ListenToPDF');
const output = join(app, 'StoreAssets/WebsiteCaptures');
const names = ['01-hero', '02-document', '03-listening', '04-navigation', '05-library'];
const languages = { en: 'en-US', 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-Hant', ja: 'ja-JP',
  ko: 'ko-KR', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', 'pt-BR': 'pt-BR', it: 'it-IT',
  ru: 'ru-RU', ar: 'ar-SA', hi: 'hi-IN', id: 'id-ID', tr: 'tr-TR', vi: 'vi-VN' };
const books = JSON.parse(await readFile(join(app, 'ListenToPDF/SampleBooks/index.json'), 'utf8'));
const traditional = JSON.parse(await readFile(join(app, '.build/WebsiteCaptures/TraditionalSample/index.json'), 'utf8'))[0];
const sha256 = data => createHash('sha256').update(data).digest('hex');
const captures = new Map();
await mkdir(output, { recursive: true });
for (const result of results) {
  const temporary = await mkdtemp(join(output, 'attachments-'));
  try {
    execFileSync('xcrun', ['xcresulttool', 'export', 'attachments', '--path', resolve(result), '--output-path', temporary],
      { stdio: 'pipe', maxBuffer: 8 * 1024 * 1024 });
    const tests = JSON.parse(await readFile(join(temporary, 'manifest.json'), 'utf8'));
    for (const item of tests.flatMap(test => test.attachments)) {
      if (item.isAssociatedWithFailure) continue;
      for (const [locale] of locales) for (const name of names) {
        if (!item.suggestedHumanReadableName.startsWith(`Website-${locale}-${name}_`)) continue;
        if (basename(item.exportedFileName) !== item.exportedFileName) throw new Error('Unsafe attachment path.');
        const key = `${locale}/${name}`;
        if (captures.has(key) && captures.get(key).timestamp >= item.timestamp) continue;
        const data = await readFile(join(temporary, item.exportedFileName));
        if (!data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
          throw new Error(`Not a PNG capture: ${key}`);
        }
        captures.set(key, { data, timestamp: item.timestamp, resultBundle: basename(result),
          attachment: item.suggestedHumanReadableName, device: item.deviceName });
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
const expected = locales.flatMap(([locale]) => names.map(name => `${locale}/${name}`));
const missing = expected.filter(key => !captures.has(key));
if (missing.length) throw new Error(`Missing complete localized ${platform} captures: ${missing.join(', ')}`);
const provenance = [];
for (const [locale] of locales) {
  const language = languages[locale];
  const book = locale === 'zh-Hant' ? traditional : books.find(item => item.language === language);
  if (!book) throw new Error(`Missing source book: ${locale}`);
  const documentSource = locale === 'zh-Hant' ? '.build/WebsiteCaptures/TraditionalSample/zh-Hant.pdf'
    : `ListenToPDF/SampleBooks/${language}.pdf`;
  const documentSHA256 = sha256(await readFile(join(app, documentSource)));
  await mkdir(join(output, 'Raw', platform, locale), { recursive: true });
  for (const name of names) {
    const { data, ...capture } = captures.get(`${locale}/${name}`);
    const source = `Raw/${platform}/${locale}/${name}.png`;
    await writeFile(join(output, source), data);
    provenance.push({ locale, source, documentLocale: locale, documentSource, documentSHA256,
      documentTitle: book.title, chapterTitle: book.chapterTitles[0], sha256: sha256(data), ...capture });
  }
}
await writeFile(join(output, `${platform}.json`), `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`Imported ${provenance.length} genuine ${platform} captures with matching document and interface languages.`);
