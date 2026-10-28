import { readFile, writeFile, mkdir, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { resolve, join, basename, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { demoPassages } from '../src/content/demo-passages.mjs';

const root = resolve(import.meta.dirname, '..');
const app = resolve(process.argv[2] ?? join(root, '../ListenToPDF'));
const output = join(root, 'public/assets/audio');
const stamp = Date.now();
const existingResult = process.argv[3];
const replacementID = process.argv[4];
if (replacementID && !existingResult) throw new Error('A replacement requires a completed App audio result bundle.');
const result = existingResult ? resolve(existingResult) : join(app, `.build/Website-Audio-${stamp}.xcresult`);
const log = join(app, `.build/Website-Audio-${stamp}.log`);
const temporary = await mkdtemp(join(tmpdir(), 'pdf-speaker-audio-'));
const sha256 = data => createHash('sha256').update(data).digest('hex');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr ?? ''}\nApp log: ${log}`);
  return result.stdout;
}
function peaks(wave) {
  if (wave.toString('ascii', 0, 4) !== 'RIFF' || wave.toString('ascii', 36, 40) !== 'data') {
    throw new Error('Expected the app’s normalized mono PCM WAV.');
  }
  const samples = (wave.length - 44) / 2;
  return Array.from({ length: 48 }, (_, bin) => {
    let peak = 0;
    const from = Math.floor(bin * samples / 48), to = Math.floor((bin + 1) * samples / 48);
    for (let i = from; i < to; i += 4) peak = Math.max(peak, Math.abs(wave.readInt16LE(44 + i * 2)));
    return Math.round(peak / 32768 * 1000) / 1000;
  });
}
try {
  await mkdir(join(app, '.build'), { recursive: true });
  if (!existingResult) {
    console.log(`Generating audio with the App. Log: ${log}`);
    const fd = openSync(log, 'w');
    try {
      run('xcodebuild', [
      'test', '-project', 'ListenToPDF.xcodeproj', '-scheme', 'ListenToPDF-macOS',
      '-destination', 'platform=macOS', '-derivedDataPath', '.build/StoreAssets/DerivedData-macOS',
      '-resultBundlePath', result, 'VALIDATION_SUFFIX=.websitecaptures', 'CODE_SIGNING_ALLOWED=YES',
      'CODE_SIGN_IDENTITY=-', 'DEVELOPMENT_TEAM=',
      '-only-testing:ListenToPDF-macOSTests/OfflineSpeechTests/testExportWebsiteAudioSamples'
    ], {
      cwd: app, stdio: ['ignore', fd, fd],
      env: { ...process.env, TEST_RUNNER_PDF_SPEAKER_WEBSITE_AUDIO: JSON.stringify(
        Object.entries(demoPassages).map(([locale, lines]) => ({ locale, lines }))) }
      });
    } finally { closeSync(fd); }
  }
  run('xcrun', ['xcresulttool', 'export', 'attachments', '--path', result, '--output-path', temporary]);
  const attachments = JSON.parse(await readFile(join(temporary, 'manifest.json'), 'utf8'))
    .flatMap(test => test.attachments);
  function attachment(name) {
    const extension = extname(name), stem = basename(name, extension);
    const matches = attachments.filter(item => item.suggestedHumanReadableName === name ||
      (item.suggestedHumanReadableName.startsWith(`${stem}_`) && item.suggestedHumanReadableName.endsWith(extension)));
    if (matches.length !== 1) throw new Error(`Expected one attachment named ${name}, got ${matches.length}.`);
    const path = matches[0].exportedFileName;
    if (basename(path) !== path) throw new Error('Invalid attachment path.');
    return join(temporary, path);
  }
  const incoming = JSON.parse(await readFile(attachment('website-audio.json'), 'utf8'));
  const manifest = replacementID ? JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')) : incoming;
  let replacementIndex = -1;
  if (replacementID) {
    if (incoming.schema !== 2 || incoming.samples.length !== 1 || incoming.demos.length !== 0 ||
        incoming.samples[0].id !== replacementID) throw new Error('Expected exactly the requested voice sample.');
    replacementIndex = manifest.samples.findIndex(clip => clip.id === replacementID);
    const previous = manifest.samples[replacementIndex], next = incoming.samples[0];
    if (!previous || ['id', 'locale', 'language', 'text'].some(key => previous[key] !== next[key]) ||
        next.language === 'he-IL' || next.engine !== 'moss') {
      throw new Error('Replacement must preserve the existing passage and use the recorded App engine.');
    }
  }
  if (manifest.schema !== 2 || manifest.samples.length !== 67 || manifest.demos.length !== 16 || manifest.languages.length !== 33 ||
      manifest.voiceCount !== 39) throw new Error('Unexpected App catalog or incomplete audio export.');
  if (manifest.samples.some(clip => clip.language === 'he-IL') ||
      JSON.stringify(manifest.unrecorded) !== JSON.stringify([{ language: 'he-IL', reason: 'system-voice-license' }])) {
    throw new Error('System-voice licensing exclusion must be retained.');
  }
  await mkdir(output, { recursive: true });
  for (const clip of replacementID ? incoming.samples : [...manifest.samples, ...manifest.demos]) {
    if (!/^[a-zA-Z0-9-]+$/.test(clip.id)) throw new Error('Invalid clip ID.');
    const wav = attachment(clip.file);
    const source = await readFile(wav);
    const file = `${clip.id}.mp3`;
    run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '96k',
      '-write_xing', '1', '-id3v2_version', '3', join(output, file)]);
    const seconds = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', join(output, file)]));
    if (!Number.isFinite(seconds) || Math.abs(seconds - clip.duration) > 0.06) {
      throw new Error(`${file}: encoding changed the timing.`);
    }
    clip.sourceSHA256 = sha256(source);
    clip.sha256 = sha256(await readFile(join(output, file)));
    clip.peaks = peaks(source);
    clip.file = file;
    console.log(`${file}: ${seconds.toFixed(2)}s`);
  }
  const sources = [
    'ListenToPDF/TextSegments.swift', 'ListenToPDF/OpenSourceSpeech.swift', 'ListenToPDF/SpeechOutput.swift',
    'Packages/OfflineSpeech/Sources/OfflineSpeech/OfflineSynthesizer.swift',
    'Packages/OfflineSpeech/Sources/OfflineSpeech/MossSynthesizer.swift'
  ];
  const provenance = {
    generatedAt: new Date().toISOString(),
    method: 'App inference; PreparedSpeechAudio normalization; TextSegments layout boundaries; SpeechBufferPolicy pauses at 1x. No microphone or browser TTS.',
    encoding: 'MP3, 96 kbps with gapless timing metadata. Paragraph demos join generated segments; generation wait and output-device latency are excluded.',
    resultBundle: basename(result),
    sourceSnapshot: 'Working-tree source checksums captured at import.',
    sources: await Promise.all(sources.map(async file => ({ file, sha256: sha256(await readFile(join(app, file))) })))
  };
  if (replacementID) {
    incoming.samples[0].provenance = provenance;
    manifest.samples[replacementIndex] = incoming.samples[0];
  } else {
    manifest.provenance = provenance;
  }
  await mkdir(join(output, 'licenses'), { recursive: true });
  await copyFile(join(app, 'Packages/OfflineSpeech/Sources/OfflineSpeech/Resources/Supertonic/LICENSE'),
    join(output, 'licenses/Supertonic-MIT.txt'));
  await copyFile(join(app, 'Packages/OfflineSpeech/Sources/OfflineSpeech/Resources/Moss/Licenses/MOSS-LICENSE'),
    join(output, 'licenses/MOSS-Apache-2.0.txt'));
  await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(replacementID ? `Replaced ${replacementID}; all other recordings retained.`
    : `Exported ${manifest.samples.length} voice samples and ${manifest.demos.length} layout demos.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
