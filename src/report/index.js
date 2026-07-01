import fs from 'node:fs';
import path from 'node:path';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function colorFor(score) {
  if (score >= 75) return GREEN;
  if (score >= 50) return YELLOW;
  return RED;
}

export function printConsoleReport(audit, { label, thresholdEcoIndex, thresholdWeightKB }) {
  const { results, criteriaScore, passedCount, totalCount, ecoIndex, ecoIndexDetail, totalPageWeightKB, totalRequests } = audit;

  console.log('');
  console.log(`${BOLD}=== Audit RGESN/GreenIT — ${label} ===${RESET}`);
  console.log('');

  const byCategory = {};
  for (const r of results) {
    byCategory[r.category] ??= [];
    byCategory[r.category].push(r);
  }

  for (const [category, items] of Object.entries(byCategory)) {
    console.log(`${BOLD}${category}${RESET}`);
    for (const r of items) {
      const mark = r.pass ? `${GREEN}✔${RESET}` : `${RED}✘${RESET}`;
      console.log(`  ${mark} ${r.id.padEnd(11)} ${r.label} — ${r.value} (seuil : ${r.threshold})`);
    }
    console.log('');
  }

  console.log(`${BOLD}Résumé${RESET}`);
  console.log(`  Critères respectés : ${passedCount}/${totalCount}`);
  console.log(`  Score critères (pondéré) : ${colorFor(criteriaScore)}${criteriaScore}/100${RESET}`);
  console.log(
    `  EcoIndex approximé : ${colorFor(ecoIndex)}${ecoIndex}/100${RESET} ${DIM}(DOM: ${ecoIndexDetail.qScore}, requêtes: ${ecoIndexDetail.rScore}, poids: ${ecoIndexDetail.sScore})${RESET}`
  );
  console.log(`  Poids total de page : ${totalPageWeightKB} Ko  |  Requêtes : ${totalRequests}`);
  console.log('');

  const breaches = [];
  if (ecoIndex < thresholdEcoIndex) breaches.push(`EcoIndex ${ecoIndex} < seuil ${thresholdEcoIndex}`);
  if (totalPageWeightKB > thresholdWeightKB) breaches.push(`Poids ${totalPageWeightKB} Ko > seuil ${thresholdWeightKB} Ko`);

  if (breaches.length > 0) {
    console.log(`${RED}${BOLD}✘ BUDGET D'IMPACT DÉPASSÉ${RESET}`);
    breaches.forEach((b) => console.log(`  ${RED}- ${b}${RESET}`));
  } else {
    console.log(`${GREEN}${BOLD}✔ Budget d'impact respecté${RESET}`);
  }
  console.log('');

  return breaches;
}

export function writeJsonReport(audit, meta, outPath) {
  const payload = { meta, ...audit };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
}

export function writeMarkdownReport(audit, meta, outPath) {
  const { results, criteriaScore, passedCount, totalCount, ecoIndex, totalPageWeightKB, totalRequests } = audit;

  let md = `# Rapport d'audit RGESN/GreenIT — ${meta.label}\n\n`;
  md += `- URL : \`${meta.url}\`\n`;
  md += `- Date : ${meta.date}\n`;
  md += `- Score critères pondéré : **${criteriaScore}/100** (${passedCount}/${totalCount} critères respectés)\n`;
  md += `- EcoIndex approximé : **${ecoIndex}/100**\n`;
  md += `- Poids total : **${totalPageWeightKB} Ko** — Requêtes : **${totalRequests}**\n\n`;

  const byCategory = {};
  for (const r of results) {
    byCategory[r.category] ??= [];
    byCategory[r.category].push(r);
  }

  for (const [category, items] of Object.entries(byCategory)) {
    md += `## ${category}\n\n`;
    md += `| Statut | ID | Critère | Valeur | Seuil |\n|---|---|---|---|---|\n`;
    for (const r of items) {
      md += `| ${r.pass ? '✔' : '✘'} | ${r.id} | ${r.label} | ${r.value} | ${r.threshold} |\n`;
    }
    md += '\n';
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md);
}
