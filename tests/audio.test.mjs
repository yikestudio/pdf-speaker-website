import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { locales } from '../src/locales.mjs';
import { showcase } from '../src/content/showcase.mjs';
import { demoPassages } from '../src/content/demo-passages.mjs';
import { escape } from '../scripts/build.mjs';

const out = resolve(import.meta.dirname, '../_site');
const audio = JSON.parse(await readFile(join(out, 'assets/audio/manifest.json'), 'utf8'));
const withoutSpaces = text => text.replace(/\s/g, '');

test('all 16 pages contain fully localized, evidence-led showcases', async () => {
  assert.deepEqual(Object.keys(showcase).sort(), locales.map(([code]) => code).sort());
  for (const [code] of locales) {
    assert.deepEqual(Object.keys(showcase[code]), Object.keys(showcase.en));
    const html = await readFile(join(out, code, 'index.html'), 'utf8');
    for (const value of Object.values(showcase[code])) {
      assert.ok(value.trim(), code);
      assert.ok(html.includes(escape(value)), `${code}: missing ${value}`);
    }
    for (const id of ['voices', 'languages', 'segmentation', 'experience']) {
      assert.ok(html.includes(`id="${id}"`), code);
    }
    if (code !== 'en') assert.notEqual(showcase[code].rhythmTitle, showcase.en.rhythmTitle);
  }
});

test('83 real recordings have hashes, nonempty MP3 audio, measured waveforms and a bounded download size', async () => {
  assert.equal(audio.schema, 2);
  assert.equal(audio.samples.length, 67);
  assert.equal(audio.demos.length, 16);
  assert.equal(audio.voiceCount, 39);
  assert.equal(audio.languages.length, 33);
  assert.equal(new Set(audio.languages.map(item => item.code)).size, 33);
  assert.equal(audio.provenance.sources.length, 5);
  const clips = [...audio.samples, ...audio.demos];
  assert.equal(new Set(clips.map(clip => clip.file)).size, 83);
  let bytes = 0;
  for (const clip of clips) {
    const data = await readFile(join(out, 'assets/audio', clip.file));
    assert.equal(createHash('sha256').update(data).digest('hex'), clip.sha256, clip.id);
    assert.match(clip.sourceSHA256, /^[a-f\d]{64}$/);
    assert.equal(data.toString('ascii', 0, 3), 'ID3', clip.id);
    assert.ok(data.length > 2000 && data.length < 500_000, clip.id);
    assert.ok(clip.duration > 1 && clip.duration < 30, clip.id);
    assert.equal(clip.peaks.length, 48);
    assert.ok(clip.peaks.every(value => value >= 0 && value <= 1), clip.id);
    assert.ok(clip.peaks.some(value => value > 0.01), clip.id);
    assert.ok(clip.text.trim() && clip.voiceID && clip.engine, clip.id);
    bytes += data.length;
  }
  assert.ok(bytes < 12_000_000, `${bytes} audio bytes`);
});

test('each hero shows all four devices and explains local offline listening', async () => {
  for (const [code] of locales) {
    const html = await readFile(join(out, code, 'index.html'), 'utf8');
    const hero = html.match(/<section class="hero wrap">([\s\S]*?)<\/section>/)?.[1];
    assert.ok(hero, code);
    assert.equal([...hero.matchAll(/<img /g)].length, 4, code);
    for (const device of ['mac', 'ipad', 'iphone', 'duo-listening']) {
      assert.ok(hero.includes(`assets/${code}/${device}.webp`), `${code}: ${device}`);
    }
    assert.ok(hero.includes(escape(showcase[code].offlineTitle)), code);
    assert.ok(hero.includes(escape(showcase[code].offlineBody)), code);
    if (code !== 'en') assert.notEqual(showcase[code].offlineTitle, showcase.en.offlineTitle);
  }
});

test('32 recorded languages compare two voices; Hebrew remains explicitly unrecorded', () => {
  assert.deepEqual(audio.unrecorded, [{ language: 'he-IL', reason: 'system-voice-license' }]);
  assert.equal(new Set(audio.samples.filter(clip => clip.language !== 'mixed').map(clip => clip.language)).size, 32);
  for (const { code } of audio.languages) {
    const samples = audio.samples.filter(sample => sample.language === code && sample.locale !== 'zh-Hant');
    if (code === 'he-IL') {
      assert.equal(samples.length, 0);
      continue;
    }
    assert.equal(samples.length, 2, code);
    assert.equal(samples[0].text, samples[1].text, code);
    assert.notEqual(samples[0].voiceID, samples[1].voiceID, code);
  }
});

test('16 localized layout demos retain real 450 ms boundaries and exact source mapping', () => {
  for (const [code] of locales) {
    const samples = audio.samples.filter(sample => sample.locale === code);
    assert.equal(samples.length, 2, code);
    assert.equal(samples[0].text, samples[1].text, code);
    assert.notEqual(samples[0].voiceID, samples[1].voiceID, code);
    const demo = audio.demos.find(item => item.locale === code);
    assert.deepEqual(demo.lines, demoPassages[code], code);
    assert.equal(demo.text, demo.lines.join('\n'), code);
    assert.equal(demo.cues.length, 3, code);
    assert.deepEqual(demo.cues.map(cue => cue.endsParagraph), [true, false, false], code);
    assert.equal(demo.cues[0].text, demo.lines[0], code);
    assert.equal(withoutSpaces(demo.cues[1].text), withoutSpaces(demo.lines[1] + demo.lines[2]), code);
    assert.equal(withoutSpaces(demo.cues[2].text), withoutSpaces(demo.lines[3]), code);
    assert.ok(Math.abs(demo.cues[1].start - demo.cues[0].end - 0.45) < 0.001, code);
    let end = 0;
    for (const cue of demo.cues) {
      assert.equal(withoutSpaces(demo.text.slice(cue.location, cue.location + cue.length)), withoutSpaces(cue.text), code);
      assert.ok(cue.start >= end && cue.end > cue.start && cue.end <= demo.duration, code);
      end = cue.end;
    }
  }
  const mixed = audio.samples.find(sample => sample.locale === 'mixed');
  assert.ok(mixed.voiceID.startsWith('moss/zh-CN-mixed/'));
  assert.match(mixed.text, /\p{Script=Han}/u);
  assert.match(mixed.text, /[a-zA-Z]/);
});

test('audio is accessible, lazy, local, non-autoplaying and usable without JavaScript', async () => {
  for (const [code] of locales) {
    const html = await readFile(join(out, code, 'index.html'), 'utf8');
    const players = [...html.matchAll(/<audio\b([^>]+)>/g)].map(match => match[1]);
    assert.equal(players.length, 66, code);
    for (const attributes of players) {
      assert.match(attributes, /\bcontrols\b/);
      assert.match(attributes, /preload="none"/);
      assert.match(attributes, /aria-label="[^"]+"/);
      assert.match(attributes, /src="\.\.\/assets\/audio\/[a-zA-Z0-9-]+\.mp3"/);
      assert.doesNotMatch(attributes, /\bautoplay\b/);
    }
    assert.equal((html.match(/class="transcript"/g) ?? []).length, 65);
    assert.equal((html.match(/data-cue="/g) ?? []).length, 3);
    assert.equal((html.match(/data-audio-error hidden/g) ?? []).length, 66);
    const select = html.match(/<select[^>]*data-voice-select[^>]*>([\s\S]*?)<\/select>/)?.[1];
    assert.ok(select, code);
    for (const { code: language } of audio.languages) assert.ok(select.includes(`value="${language}"`), language);
    assert.equal((select.match(/<option /g) ?? []).length, 34);
    const preferred = audio.samples.find(sample => sample.locale === code).language;
    assert.ok(select.includes(`value="${preferred}" selected`), code);
    assert.ok(html.includes(`data-voice-language="he-IL"`));
    assert.ok(html.includes(escape(showcase[code].hebrewNote)));
  }
  const js = await readFile(join(out, 'assets/site.js'), 'utf8');
  assert.doesNotMatch(js, /speechSynthesis|getUserMedia/);
  assert.match(js, /other\.pause\(\)/);
  assert.match(js, /addEventListener\('error'/);
});
