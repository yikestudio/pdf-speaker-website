import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { locales } from '../src/locales.mjs';

const root = resolve(import.meta.dirname, '..');
const source = resolve(process.argv[2] ?? join(root, '../ListenToPDF/StoreAssets'));
const captures = join(source, 'WebsiteCaptures');
const captureMetadata = (await Promise.all(['mac', 'iphone', 'duo', 'ipad'].map(async platform =>
  JSON.parse(await readFile(join(captures, `${platform}.json`), 'utf8'))))).flat();
const assets = join(root, 'public/assets');
await mkdir(assets, { recursive: true });
const keys = {
  hero: '让 PDF 开口，让阅读继续。',
  heroBody: '欢迎使用 PDF Speaker',
  voiceTitle: '自研引擎，多样好声音',
  voiceBody: '高质量自研语音引擎，多种声音风格，让 PDF 听起来更动人。',
  languageTitle: '丰富语言，听见更广阔的世界',
  languageBody: '多种朗读语言，支持中英文混读，并按语言记住喜爱的声音。',
  sentenceTitle: '智能断句，读得更自然',
  sentenceBody: '智能识别语句边界，逐句朗读与同步高亮，阅读聆听自由切换。',
  localTitle: '文档留在你的设备上',
  localBody: '本地处理 PDF 与语音，无需注册账号。',
  privacy: '隐私政策',
  terms: '用户条款',
  voiceView: '声音',
  regionView: '朗读区域'
};
const copy = {};
const provenance = [];
const images = [
  ['mac', '02-document', 'mac', 1600],
  ['iphone', '03-listening', 'iphone', 660],
  ['ipad', '02-document', 'ipad', 1000],
  ['mac', '05-library', 'library', 1200],
  ['mac', '03-listening', 'mac-listening', 1600],
  ['ipad', '05-library', 'ipad-library', 1000],
  ['ipad', '03-listening', 'ipad-listening', 1000],
  ['iphone', '05-library', 'iphone-library', 660],
  ['iphone', '02-document', 'iphone-document', 660],
  ['mac', '04-voices', 'mac-voices', 1600],
  ['ipad', '04-voices', 'ipad-voices', 1000],
  ['iphone', '04-voices', 'iphone-voices', 660],
  ['duo', '05-library', 'duo-library', 1400],
  ['duo', '02-document', 'duo-document', 1400],
  ['duo', '03-listening', 'duo-listening', 1400],
  ['duo', '04-voices', 'duo-voices', 1400],
  ['iphone', '06-region', 'iphone-region', 660],
  ['duo', '06-region', 'duo-region', 1400],
  ['ipad', '06-region', 'ipad-region', 1000],
  ['mac', '06-region', 'mac-region', 1600]
];
for (const [locale] of locales) {
  const data = JSON.parse(await readFile(join(source, `Localization/${locale}.json`), 'utf8'));
  copy[locale] = Object.fromEntries(Object.entries(keys).map(([key, original]) => {
    if (!data.translations[original]) throw new Error(`Missing ${locale}: ${original}`);
    return [key, data.translations[original]];
  }));
  copy[locale].headlines = data.listing.screenshot_headlines;
  copy[locale].captions = data.listing.screenshot_captions;
  copy[locale].description = data.listing.promotional_text;
  await mkdir(join(assets, locale), { recursive: true });
  for (const [platform, file, name, width] of images) {
    const relative = `Raw/${platform}/${locale}/${file}.png`;
    const input = join(captures, relative);
    const capture = captureMetadata.find(item => item.source === relative && item.locale === locale);
    const sourceData = await readFile(input);
    const sourceHash = createHash('sha256').update(sourceData).digest('hex');
    if (!capture || capture.documentLocale !== locale || capture.sha256 !== sourceHash) {
      throw new Error(`Capture language or provenance mismatch: ${relative}`);
    }
    const output = join(assets, locale, `${name}.webp`);
    execFileSync('cwebp', ['-quiet', '-q', '86', '-resize', String(width), '0', input, '-o', output]);
    provenance.push({ ...capture, locale, source: `WebsiteCaptures/${relative}`, output: `${locale}/${name}.webp`,
      // cwebp rounds the inferred dimension up when the other dimension is zero.
      width, height: Math.ceil(width * sourceData.readUInt32BE(20) / sourceData.readUInt32BE(16)),
      webpSHA256: createHash('sha256').update(await readFile(output)).digest('hex') });
  }
}
await copyFile(join(source, 'Brand/app-mark.svg'), join(assets, 'app-mark.svg'));
execFileSync('cwebp', ['-quiet', '-lossless', '-resize', '192', '192',
  join(source, 'Brand/app-icon-1024.png'), '-o', join(assets, 'app-icon.webp')]);
await mkdir(join(root, 'src/content'), { recursive: true });
await writeFile(join(root, 'src/content/app-copy.json'), JSON.stringify(copy, null, 2) + '\n');
await writeFile(join(assets, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
console.log(`Imported ${provenance.length} real localized screenshots; no app dependency is needed to build.`);
