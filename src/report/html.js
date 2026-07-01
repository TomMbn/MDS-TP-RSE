import fs from 'node:fs';
import path from 'node:path';

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function scoreColor(score) {
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#eab308';
  return '#ef4444';
}

/** Jauge circulaire en CSS pur (conic-gradient), aucune dépendance JS externe. */
function gauge(score, label) {
  const color = scoreColor(score);
  return `
    <div class="gauge">
      <div class="gauge-ring" style="background: conic-gradient(${color} ${score * 3.6}deg, #1f2937 0deg)">
        <div class="gauge-inner">
          <span class="gauge-score" style="color:${color}">${score}</span>
          <span class="gauge-max">/100</span>
        </div>
      </div>
      <div class="gauge-label">${esc(label)}</div>
    </div>`;
}

const BASE_CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2.5rem 1.5rem 4rem;
    background: #0b0f17; color: #e5e7eb;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  .wrap { max-width: 980px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  .meta { color: #9ca3af; font-size: 0.85rem; margin-bottom: 2rem; }
  .meta code { color: #60a5fa; }
  .gauges { display: flex; gap: 2rem; flex-wrap: wrap; margin-bottom: 2.5rem; }
  .gauge { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; }
  .gauge-ring {
    width: 108px; height: 108px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
  }
  .gauge-inner {
    width: 84px; height: 84px; border-radius: 50%; background: #0b0f17;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .gauge-score { font-size: 1.6rem; font-weight: 700; }
  .gauge-max { font-size: 0.7rem; color: #6b7280; }
  .gauge-label { font-size: 0.8rem; color: #9ca3af; text-align: center; }
  .verdict {
    padding: 0.9rem 1.2rem; border-radius: 10px; font-weight: 700; margin-bottom: 2.5rem;
    display: flex; align-items: center; gap: 0.6rem; font-size: 0.95rem;
  }
  .verdict.pass { background: rgba(34,197,94,0.12); color: #4ade80; border: 1px solid rgba(34,197,94,0.35); }
  .verdict.fail { background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.35); }
  .verdict ul { margin: 0.4rem 0 0; padding-left: 1.2rem; font-weight: 400; }
  .category { margin-bottom: 1.75rem; }
  .category h2 {
    font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.04em;
    color: #93c5fd; border-bottom: 1px solid #1f2937; padding-bottom: 0.5rem; margin-bottom: 0.75rem;
  }
  table { width: 100%; border-collapse: collapse; }
  tr { border-bottom: 1px solid #161b26; }
  td { padding: 0.6rem 0.5rem; vertical-align: top; font-size: 0.87rem; }
  td.status { width: 28px; text-align: center; font-size: 1rem; }
  td.status.pass { color: #4ade80; }
  td.status.fail { color: #f87171; }
  td.ref { width: 110px; white-space: nowrap; }
  .badge {
    display: inline-block; font-size: 0.72rem; font-weight: 600; padding: 0.15rem 0.5rem;
    border-radius: 5px; background: #1e293b; color: #93c5fd; text-decoration: none;
  }
  .badge:hover { background: #253449; }
  td.label { color: #e5e7eb; }
  td.value { color: #d1d5db; white-space: nowrap; text-align: right; }
  .threshold { display: block; font-size: 0.76rem; color: #6b7280; margin-top: 0.15rem; }
  footer { margin-top: 3rem; color: #4b5563; font-size: 0.78rem; text-align: center; }
  footer a { color: #60a5fa; }
  .compare-table { width: 100%; border-collapse: collapse; margin-bottom: 2.5rem; }
  .compare-table th, .compare-table td { padding: 0.6rem 0.8rem; text-align: left; border-bottom: 1px solid #161b26; font-size: 0.87rem; }
  .compare-table th { color: #93c5fd; font-weight: 600; }
  .compare-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .pill { display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; }
  .pill.pass { background: rgba(34,197,94,0.15); color: #4ade80; }
  .pill.fail { background: rgba(239,68,68,0.15); color: #f87171; }
`;

function renderCategories(results) {
  const byCategory = {};
  for (const r of results) {
    byCategory[r.category] ??= [];
    byCategory[r.category].push(r);
  }

  return Object.entries(byCategory)
    .map(
      ([category, items]) => `
    <section class="category">
      <h2>${esc(category)}</h2>
      <table>
        ${items
          .map(
            (r) => `
        <tr>
          <td class="status ${r.pass ? 'pass' : 'fail'}">${r.pass ? '✔' : '✘'}</td>
          <td class="ref">${r.ref?.url ? `<a class="badge" href="${esc(r.ref.url)}" target="_blank" rel="noopener">RGESN ${esc(r.ref.code)}</a>` : ''}</td>
          <td class="label">${esc(r.label)}${!r.pass ? `<span class="threshold">Seuil attendu : ${esc(r.threshold)}</span>` : ''}</td>
          <td class="value">${esc(r.value)}</td>
        </tr>`
          )
          .join('')}
      </table>
    </section>`
    )
    .join('');
}

export function writeHtmlReport(audit, meta, outPath) {
  const { results, criteriaScore, passedCount, totalCount, ecoIndex, ecoIndexDetail, totalPageWeightKB, totalRequests } = audit;

  const breaches = [];
  if (ecoIndex < meta.thresholdEcoIndex) breaches.push(`EcoIndex ${ecoIndex} < seuil ${meta.thresholdEcoIndex}`);
  if (totalPageWeightKB > meta.thresholdWeightKB) breaches.push(`Poids ${totalPageWeightKB} Ko > seuil ${meta.thresholdWeightKB} Ko`);

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audit RGESN — ${esc(meta.label)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
  <div class="wrap">
    <h1>Audit RGESN / GreenIT — ${esc(meta.label)}</h1>
    <div class="meta">
      <code>${esc(meta.url)}</code> · généré le ${esc(new Date(meta.date).toLocaleString('fr-FR'))}
    </div>

    <div class="gauges">
      ${gauge(criteriaScore, 'Score critères pondéré')}
      ${gauge(ecoIndex, 'EcoIndex approximé')}
    </div>

    <div class="verdict ${breaches.length ? 'fail' : 'pass'}">
      <div>
        ${breaches.length ? '✘ Budget d\'impact dépassé — build cassé' : '✔ Budget d\'impact respecté'}
        <div style="font-weight:400;font-size:0.85rem;color:#9ca3af;margin-top:0.2rem">
          ${passedCount}/${totalCount} critères respectés · ${totalPageWeightKB} Ko · ${totalRequests} requêtes ·
          DOM ${ecoIndexDetail.qScore} / requêtes ${ecoIndexDetail.rScore} / poids ${ecoIndexDetail.sScore}
        </div>
        ${breaches.length ? `<ul>${breaches.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      </div>
    </div>

    ${renderCategories(results)}

    <footer>Rapport généré par rgesn-audit-cli · référentiel <a href="https://ecoresponsable.numerique.gouv.fr/publications/referentiel-general-ecoconception/" target="_blank" rel="noopener">RGESN v1.0.1</a></footer>
  </div>
</body>
</html>`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
}

/** Page d'index pour le mode batch : tableau comparatif de toutes les cibles auditées. */
export function writeHtmlIndex(outcomes, outPath) {
  const rows = outcomes
    .map((o) => {
      const status = o.breaches.length > 0 ? 'fail' : 'pass';
      const reportLink = o.htmlPath ? path.basename(o.htmlPath) : null;
      return `
      <tr>
        <td>${reportLink ? `<a href="${esc(reportLink)}">${esc(o.label)}</a>` : esc(o.label)}</td>
        <td><span class="pill ${status}">${status === 'pass' ? 'OK' : 'ÉCHEC'}</span></td>
        <td class="num">${o.ecoIndex ?? '—'}</td>
        <td class="num">${o.criteriaScore ?? '—'}</td>
        <td class="num">${o.totalPageWeightKB ?? '—'} Ko</td>
        <td class="num">${o.totalRequests ?? '—'}</td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audit RGESN — Résumé batch</title>
<style>${BASE_CSS}</style>
</head>
<body>
  <div class="wrap">
    <h1>Audit RGESN / GreenIT — Résumé du batch</h1>
    <div class="meta">généré le ${esc(new Date().toLocaleString('fr-FR'))} · ${outcomes.length} cible(s)</div>

    <table class="compare-table">
      <thead>
        <tr><th>Cible</th><th>Statut</th><th>EcoIndex</th><th>Score critères</th><th>Poids</th><th>Requêtes</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <footer>Rapport généré par rgesn-audit-cli · référentiel <a href="https://ecoresponsable.numerique.gouv.fr/publications/referentiel-general-ecoconception/" target="_blank" rel="noopener">RGESN v1.0.1</a></footer>
  </div>
</body>
</html>`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
}
