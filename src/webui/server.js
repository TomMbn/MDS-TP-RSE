import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openInBrowser } from '../open.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORTS_DIR = path.join(ROOT, 'reports');
const PORT = Number(process.env.PORT || 4321);

function slugify(label) {
  return (
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'audit'
  );
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;;[^\x07]*\x07/g, '');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const BASE_CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 3rem 1.5rem; background: #0b0f17; color: #e5e7eb;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  .wrap { max-width: 640px; margin: 0 auto; }
  h1 { font-size: 1.4rem; margin: 0 0 0.4rem; }
  p.sub { color: #9ca3af; margin: 0 0 2rem; font-size: 0.9rem; }
  form { display: flex; flex-direction: column; gap: 1.1rem; }
  label { font-size: 0.82rem; color: #93c5fd; font-weight: 600; display: block; margin-bottom: 0.35rem; }
  input, select {
    width: 100%; padding: 0.6rem 0.7rem; border-radius: 8px; border: 1px solid #1f2937;
    background: #111827; color: #e5e7eb; font-size: 0.9rem;
  }
  input:focus, select:focus { outline: none; border-color: #3b82f6; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; }
  small { color: #6b7280; font-size: 0.76rem; display: block; margin-top: 0.3rem; }
  button {
    margin-top: 0.5rem; padding: 0.75rem 1rem; border-radius: 8px; border: none;
    background: #3b82f6; color: white; font-weight: 700; font-size: 0.95rem; cursor: pointer;
  }
  button:hover { background: #2563eb; }
  button:disabled { background: #374151; cursor: wait; }
  pre {
    background: #0f1420; border: 1px solid #1f2937; border-radius: 8px; padding: 1rem;
    overflow-x: auto; font-size: 0.8rem; white-space: pre-wrap; word-break: break-word;
  }
  a.report-link {
    display: inline-block; margin-top: 1rem; padding: 0.7rem 1.1rem; border-radius: 8px;
    background: #22c55e; color: #06210f; font-weight: 700; text-decoration: none;
  }
  .status { font-weight: 700; margin: 1.5rem 0 1rem; }
  .status.ok { color: #4ade80; }
  .status.ko { color: #f87171; }
`;

function renderForm() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>rgesn-audit — Lancer un audit</title>
<style>${BASE_CSS}</style>
</head>
<body>
  <div class="wrap">
    <h1>Audit RGESN / GreenIT</h1>
    <p class="sub">Lance <code>rgesn-audit</code> sur une URL et ouvre le rapport à la fin.</p>
    <form method="POST" action="/audit" onsubmit="document.getElementById('btn').disabled=true; document.getElementById('btn').textContent='Analyse en cours…';">
      <div>
        <label for="url">URL à auditer</label>
        <input id="url" name="url" type="url" placeholder="https://example.com" required>
        <small>L'adresse complète (avec https://) de la page qui sera chargée dans un navigateur headless.</small>
      </div>
      <div>
        <label for="label">Label</label>
        <input id="label" name="label" type="text" placeholder="Mon site" value="Audit">
        <small>Nom affiché dans le rapport et utilisé pour nommer les fichiers générés (ex. "Mon site" → reports/mon-site.html).</small>
      </div>
      <div class="row3">
        <div>
          <label for="threshold">Seuil EcoIndex</label>
          <input id="threshold" name="threshold" type="number" value="50" min="0" max="100">
          <small>Score minimal (0-100) attendu. En dessous, l'audit est considéré en échec ("build cassé").</small>
        </div>
        <div>
          <label for="maxWeightKb">Poids max (Ko)</label>
          <input id="maxWeightKb" name="maxWeightKb" type="number" value="1536" min="1">
          <small>Poids total maximum de la page (toutes ressources incluses) avant d'être considéré excessif.</small>
        </div>
        <div>
          <label for="runs">Passes (--runs)</label>
          <input id="runs" name="runs" type="number" value="1" min="1" max="10">
          <small>Nombre de chargements successifs ; la mesure médiane est retenue pour lisser la variance réseau.</small>
        </div>
      </div>
      <div class="row">
        <div>
          <label for="timeout">Timeout (ms)</label>
          <input id="timeout" name="timeout" type="number" value="30000" min="1000">
          <small>Délai maximal accordé au chargement de la page avant d'abandonner (en millisecondes).</small>
        </div>
        <div>
          <label for="retries">Retries</label>
          <input id="retries" name="retries" type="number" value="1" min="0" max="5">
          <small>Nombre de nouvelles tentatives en cas d'échec réseau ou de timeout transitoire.</small>
        </div>
      </div>
      <button id="btn" type="submit">Lancer l'audit</button>
      <small>L'audit tourne côté serveur (navigateur headless) ; la page attend la fin avant d'afficher le résultat.</small>
    </form>
  </div>
</body>
</html>`;
}

function renderResult({ label, slug, exitCode, output }) {
  const ok = exitCode === 0;
  const reportPath = `/reports/${slug}.html`;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Résultat — ${escapeHtml(label)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
  <div class="wrap">
    <h1>Résultat — ${escapeHtml(label)}</h1>
    <div class="status ${ok ? 'ok' : 'ko'}">${ok ? '✔ Budget d\'impact respecté' : '✘ Budget d\'impact dépassé — build cassé'}</div>
    <a class="report-link" href="${reportPath}" target="_blank" rel="noopener">Ouvrir le rapport détaillé →</a>
    <p class="sub" style="margin-top:2rem">Sortie console :</p>
    <pre>${escapeHtml(output)}</pre>
    <p class="sub"><a href="/" style="color:#60a5fa">← Lancer un autre audit</a></p>
  </div>
  <script>
    // Ouvre automatiquement le rapport détaillé dans un nouvel onglet.
    window.open(${JSON.stringify(reportPath)}, '_blank');
  </script>
</body>
</html>`;
}

function serveStatic(req, res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const mime = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

function runAudit({ url, label, threshold, maxWeightKb, runs, retries, timeout }) {
  const slug = slugify(label || 'audit');
  const args = [
    path.join(ROOT, 'bin', 'cli.js'),
    '--url', url,
    '--label', label || 'Audit',
    '--threshold', String(threshold),
    '--max-weight-kb', String(maxWeightKb),
    '--runs', String(runs),
    '--retries', String(retries),
    '--timeout', String(timeout),
    '--out', path.join(REPORTS_DIR, `${slug}.json`),
    '--out-md', path.join(REPORTS_DIR, `${slug}.md`),
    '--out-html', path.join(REPORTS_DIR, `${slug}.html`),
  ];

  return new Promise((resolve) => {
    const child = spawn('node', args, { cwd: ROOT });
    let output = '';
    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });
    child.on('close', (exitCode) => {
      resolve({ slug, exitCode, output: stripAnsi(output) });
    });
  });
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  if (req.method === 'GET' && urlPath === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderForm());
    return;
  }

  if (req.method === 'GET' && urlPath.startsWith('/reports/')) {
    const requested = path.normalize(path.join(REPORTS_DIR, decodeURIComponent(urlPath.slice('/reports/'.length))));
    if (!requested.startsWith(REPORTS_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    serveStatic(req, res, requested);
    return;
  }

  if (req.method === 'POST' && urlPath === '/audit') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      const params = new URLSearchParams(body);
      const label = params.get('label') || 'Audit';
      try {
        const { slug, exitCode, output } = await runAudit({
          url: params.get('url'),
          label,
          threshold: Number(params.get('threshold') || 50),
          maxWeightKb: Number(params.get('maxWeightKb') || 1536),
          runs: Number(params.get('runs') || 1),
          retries: Number(params.get('retries') || 1),
          timeout: Number(params.get('timeout') || 30000),
        });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderResult({ label, slug, exitCode, output }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Erreur : ${err.message}`);
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Interface d'audit disponible sur ${url}`);
  openInBrowser(url);
});
