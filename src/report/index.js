import fs from 'node:fs';
import path from 'node:path';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const INVERSE = '\x1b[7m';

const WIDTH = Math.min(Math.max(process.stdout.columns || 80, 60), 100);

function colorFor(score) {
  if (score >= 75) return GREEN;
  if (score >= 50) return YELLOW;
  return RED;
}

function line(char = '─') {
  return char.repeat(WIDTH);
}

function box(title) {
  const inner = WIDTH - 2;
  const padded = truncate(` ${title} `, inner);
  const left = Math.max(0, Math.floor((inner - padded.length) / 2));
  const right = Math.max(0, inner - padded.length - left);
  console.log(`${CYAN}┌${'─'.repeat(inner)}┐${RESET}`);
  console.log(`${CYAN}│${'─'.repeat(left)}${BOLD}${padded}${RESET}${CYAN}${'─'.repeat(right)}│${RESET}`);
  console.log(`${CYAN}└${'─'.repeat(inner)}┘${RESET}`);
}

/** Barre de progression textuelle "[████░░░░] 62/100", colorée selon le score. */
function scoreBar(score, width = 20) {
  const filled = Math.round((Math.max(0, Math.min(100, score)) / 100) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `${colorFor(score)}${bar}${RESET} ${colorFor(score)}${BOLD}${score}/100${RESET}`;
}

function truncate(str, max) {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

export function printConsoleReport(audit, { label, thresholdEcoIndex, thresholdWeightKB }) {
  const { results, criteriaScore, passedCount, totalCount, ecoIndex, ecoIndexDetail, totalPageWeightKB, totalRequests } = audit;

  console.log('');
  box(`AUDIT RGESN / GREENIT — ${label}`);
  console.log('');

  const byCategory = {};
  for (const r of results) {
    byCategory[r.category] ??= [];
    byCategory[r.category].push(r);
  }

  const labelWidth = Math.min(48, WIDTH - 30);

  for (const [category, items] of Object.entries(byCategory)) {
    console.log(`${BOLD}${CYAN}▸ ${category}${RESET}`);
    console.log(`${DIM}${line('·')}${RESET}`);
    for (const r of items) {
      const mark = r.pass ? `${GREEN}✔${RESET}` : `${RED}✘${RESET}`;
      const refTag = r.ref?.code ? `RGESN ${r.ref.code}` : '  —   ';
      const labelPadded = truncate(r.label, labelWidth).padEnd(labelWidth);
      console.log(`  ${mark}  ${DIM}${refTag.padEnd(9)}${RESET} ${labelPadded} ${r.value}`);
      if (!r.pass) {
        console.log(`     ${DIM}└─ seuil attendu : ${r.threshold}${RESET}`);
      }
    }
    console.log('');
  }

  console.log(`${BOLD}${CYAN}▸ Résumé${RESET}`);
  console.log(`${DIM}${line('·')}${RESET}`);
  console.log(`  Critères respectés     ${GREEN}${passedCount}${RESET}/${totalCount}`);
  console.log(`  Score critères pondéré ${scoreBar(criteriaScore)}`);
  console.log(`  EcoIndex approximé     ${scoreBar(ecoIndex)}  ${DIM}(DOM ${ecoIndexDetail.qScore} · requêtes ${ecoIndexDetail.rScore} · poids ${ecoIndexDetail.sScore})${RESET}`);
  console.log(`  Poids total de page    ${totalPageWeightKB} Ko`);
  console.log(`  Requêtes réseau        ${totalRequests}`);
  console.log('');

  const breaches = [];
  if (ecoIndex < thresholdEcoIndex) breaches.push(`EcoIndex ${ecoIndex} < seuil ${thresholdEcoIndex}`);
  if (totalPageWeightKB > thresholdWeightKB) breaches.push(`Poids ${totalPageWeightKB} Ko > seuil ${thresholdWeightKB} Ko`);

  if (breaches.length > 0) {
    console.log(`${RED}${INVERSE}${BOLD} ✘ BUDGET D'IMPACT DÉPASSÉ — BUILD CASSÉ ${RESET}`);
    breaches.forEach((b) => console.log(`  ${RED}• ${b}${RESET}`));
  } else {
    console.log(`${GREEN}${INVERSE}${BOLD} ✔ BUDGET D'IMPACT RESPECTÉ ${RESET}`);
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
    md += `| Statut | Référence | Critère | Valeur | Seuil |\n|---|---|---|---|---|\n`;
    for (const r of items) {
      const refCell = r.ref?.code ? `[RGESN ${r.ref.code}](${r.ref.url})` : `[GreenIT](${r.ref?.url})`;
      md += `| ${r.pass ? '✔' : '✘'} | ${refCell} | ${r.label} | ${r.value} | ${r.threshold} |\n`;
    }
    md += '\n';
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md);
}
