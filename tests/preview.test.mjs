import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { resolve } from 'node:path';

test('preview serves seekable audio with exact byte ranges under a project subpath', async () => {
  const root = resolve(import.meta.dirname, '..');
  const child = spawn(process.execPath, [resolve(root, 'scripts/serve.mjs')], {
    env: { ...process.env, PORT: '0', BASE_PATH: '/pdf-speaker' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  try {
    const origin = await new Promise((accept, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error(`Preview did not start: ${errors}`)), 10000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Preview exited (${code}): ${errors}`)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+(?=\/)/);
        if (match) { clearTimeout(timeout); accept(match[0]); }
      });
    });
    const url = `${origin}/pdf-speaker/assets/audio/en-voice-1.mp3`;
    const data = await readFile(resolve(root, '_site/assets/audio/en-voice-1.mp3'));
    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-type'), 'audio/mpeg');
    assert.equal(Number(head.headers.get('content-length')), data.length);
    assert.equal(head.headers.get('accept-ranges'), 'bytes');
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    for (const [range, start, end] of [['bytes=0-31', 0, 31], ['bytes=-16', data.length - 16, data.length - 1],
      ['bytes=32-', 32, data.length - 1]]) {
      const response = await fetch(url, { headers: { Range: range } });
      assert.equal(response.status, 206, range);
      assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${data.length}`);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), data.subarray(start, end + 1));
    }
    for (const range of [`bytes=${data.length}-`, 'bytes=9-3', 'bytes=-0']) {
      const response = await fetch(url, { headers: { Range: range } });
      assert.equal(response.status, 416);
      assert.equal(response.headers.get('content-range'), `bytes */${data.length}`);
    }
    assert.equal(errors, '');
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
});
