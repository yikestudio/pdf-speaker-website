import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../public/assets/audio');
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
let maximumGapRMS = 0;
for (const clip of [...manifest.samples, ...manifest.demos]) {
  const decoded = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-i', join(root, clip.file),
    '-f', 's16le', '-ar', '48000', '-ac', '1', 'pipe:1'], { maxBuffer: 8 * 1024 * 1024 });
  if (decoded.error) throw decoded.error;
  assert.equal(decoded.status, 0, `${clip.id}: ${decoded.stderr}`);
  const pcm = decoded.stdout;
  assert.ok(Math.abs(pcm.length / 96000 - clip.duration) < 0.06, `${clip.id}: decoded duration changed`);
  let energy = 0;
  for (let i = 0; i < pcm.length; i += 2) energy += (pcm.readInt16LE(i) / 32768) ** 2;
  assert.ok(Math.sqrt(energy / (pcm.length / 2)) > 0.005, `${clip.id}: silent recording`);
  if (clip.cues.length) {
    const from = Math.ceil((clip.cues[0].end + 0.04) * 48000);
    const to = Math.floor((clip.cues[1].start - 0.04) * 48000);
    assert.ok(to - from >= 48000 * 0.36, `${clip.id}: paragraph gap too short`);
    let gapEnergy = 0;
    for (let i = from; i < to; i++) gapEnergy += (pcm.readInt16LE(i * 2) / 32768) ** 2;
    const rms = Math.sqrt(gapEnergy / (to - from));
    assert.ok(rms < 0.002, `${clip.id}: paragraph gap contains audible content (${rms})`);
    maximumGapRMS = Math.max(maximumGapRMS, rms);
  }
}
console.log(`Decoded all ${manifest.samples.length + manifest.demos.length} MP3 files; all ${manifest.demos.length} paragraph gaps verified. Maximum gap RMS: ${maximumGapRMS.toFixed(6)}.`);
