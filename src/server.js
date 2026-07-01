import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};

function shouldCompress(ext) {
  return ext === '.html' || ext === '.css' || ext === '.js';
}

export function startStaticServer(rootDir, { compress = false, cacheHeaders = false } = {}) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.join(rootDir, urlPath === '/' ? 'index.html' : urlPath);

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };

      if (cacheHeaders && ext !== '.html') {
        headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      }

      const acceptEncoding = req.headers['accept-encoding'] || '';

      if (compress && shouldCompress(ext)) {
        if (acceptEncoding.includes('br')) {
          headers['Content-Encoding'] = 'br';
          res.writeHead(200, headers);
          res.end(zlib.brotliCompressSync(data));
          return;
        } else if (acceptEncoding.includes('gzip')) {
          headers['Content-Encoding'] = 'gzip';
          res.writeHead(200, headers);
          res.end(zlib.gzipSync(data));
          return;
        }
      }

      res.writeHead(200, headers);
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port, url: `http://127.0.0.1:${port}/` });
    });
  });
}
