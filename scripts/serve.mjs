import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../_site');
const port = Number(process.env.PORT ?? 4173);
const prefix = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');
if (prefix && !/^\/[\w/-]+$/.test(prefix)) throw new Error('BASE_PATH must be an absolute URL path.');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.xml': 'application/xml', '.txt': 'text/plain',
  '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
    }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (prefix && pathname === prefix) {
      res.writeHead(302, { Location: `${prefix}/` }); res.end(); return;
    }
    if (prefix && !pathname.startsWith(`${prefix}/`)) { res.writeHead(404); res.end('Not found'); return; }
    const relative = pathname.slice(prefix.length).replace(/^\/+/, '');
    let file = resolve(root, relative);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    try {
      const info = await stat(file);
      if (info.isDirectory()) {
        if (!pathname.endsWith('/')) {
          res.writeHead(302, { Location: `${pathname}/` }); res.end(); return;
        }
        file = resolve(file, 'index.html');
      }
      const data = await readFile(file);
      const headers = {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store', 'Content-Length': data.length, 'Accept-Ranges': 'bytes'
      };
      let start = 0, end = data.length - 1, status = 200;
      if (req.method === 'GET' && req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        let valid = Boolean(match && (match[1] || match[2]));
        if (valid) {
          if (match[1]) {
            start = Number(match[1]);
            end = match[2] ? Number(match[2]) : end;
            valid = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end;
          } else {
            const suffix = Number(match[2]);
            valid = Number.isSafeInteger(suffix) && suffix > 0;
            start = Math.max(0, data.length - suffix);
          }
          valid = valid && start < data.length;
        }
        if (!valid) {
          res.writeHead(416, { ...headers, 'Content-Length': 0, 'Content-Range': `bytes */${data.length}` });
          res.end(); return;
        }
        end = Math.min(end, data.length - 1);
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${data.length}`;
        headers['Content-Length'] = end - start + 1;
      }
      res.writeHead(status, headers);
      res.end(req.method === 'HEAD' ? undefined : data.subarray(start, end + 1));
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : await readFile(resolve(root, '404.html')));
    }
  } catch (error) {
    console.error('Preview request failed:', error);
    res.writeHead(error instanceof URIError ? 400 : 500);
    res.end('Request failed; see the preview server log.');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`PDF Speaker preview: http://127.0.0.1:${server.address().port}${prefix}/`));
server.on('error', error => { console.error(error); process.exitCode = 1; });
