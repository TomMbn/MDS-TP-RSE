#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { collectPageMetrics } from '../src/collector.js';
import { evaluateCriteria } from '../src/criteria/index.js';
import { printConsoleReport, writeJsonReport, writeMarkdownReport } from '../src/report/index.js';
import { writeHtmlReport, writeHtmlIndex } from '../src/report/html.js';
import { startStaticServer } from '../src/server.js';

process.on('unhandledRejection', (err) => {
  console.error(`Erreur inattendue non gérée : ${err?.message ?? err}`);
  process.exitCode = 1;
});

const program = new Command();

program
  .name('rgesn-audit')
  .description("CLI d'audit automatisé RGESN/GreenIT avec breaking build CI/CD")
  .option('--url <url>', 'URL de la page à auditer (http(s):// ou file://)')
  .option('--dir <path>', 'Dossier local à servir et auditer (alternative à --url)')
  .option('--no-compress', 'Désactive la compression Gzip/Brotli du serveur local (--dir uniquement)')
  .option('--no-cache-headers', 'Désactive les en-têtes Cache-Control du serveur local (--dir uniquement)')
  .option('--label <label>', 'Nom affiché pour ce rapport', 'Audit')
  .option('--out <path>', 'Chemin du rapport JSON', 'reports/report.json')
  .option('--out-md <path>', 'Chemin du rapport Markdown (optionnel)')
  .option('--out-html <path>', 'Chemin du rapport HTML', 'reports/report.html')
  .option('--no-html', 'Désactive la génération du rapport HTML')
  .option('--threshold <score>', "Seuil minimal d'EcoIndex approximé (0-100)", '50')
  .option('--max-weight-kb <kb>', 'Poids maximal de page en Ko avant blocage', '1536')
  .option('--timeout <ms>', 'Timeout de chargement de page en ms', '30000')
  .option('--retries <n>', "Nombre de nouvelles tentatives en cas d'échec réseau/timeout", '1')
  .option('--config <path>', 'Fichier JSON listant plusieurs cibles à auditer en parallèle (mode batch)')
  .option('--concurrency <n>', 'Nombre d\'audits exécutés en parallèle en mode batch', '3')
  .parse(process.argv);

const opts = program.opts();

if (!opts.config && !opts.url && !opts.dir) {
  console.error('Erreur : fournir --url, --dir, ou --config');
  process.exit(1);
}

/** Exécute `worker` sur `items` avec au plus `limit` exécutions concurrentes. */
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

function slugify(label) {
  return label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * Audite une cible unique (URL distante ou dossier local servi temporairement).
 * `browser` est partagé entre audits concurrents : chaque audit ouvre son propre
 * contexte isolé (cookies, cache, réseau indépendants), ce qui permet la concurrence
 * sans qu'un audit ne pollue les métriques d'un autre.
 */
async function runSingleAudit(target, browser) {
  const thresholdEcoIndex = Number(target.threshold ?? opts.threshold);
  const thresholdWeightKB = Number(target.maxWeightKb ?? opts.maxWeightKb);
  const label = target.label ?? opts.label;

  let server;
  let targetUrl = target.url;

  if (target.dir) {
    const started = await startStaticServer(path.resolve(target.dir), {
      compress: target.compress ?? true,
      cacheHeaders: target.cacheHeaders ?? true,
    });
    server = started.server;
    targetUrl = started.url;
  }

  console.log(`[${label}] Analyse de ${targetUrl} ...`);

  let metrics;
  try {
    metrics = await collectPageMetrics(targetUrl, {
      timeout: Number(target.timeout ?? opts.timeout),
      retries: Number(target.retries ?? opts.retries),
      browser,
    });
  } catch (err) {
    server?.close();
    console.error(`[${label}] Erreur lors du chargement de la page : ${err.message}`);
    return { label, failed: true, breaches: [`Échec du chargement : ${err.message}`] };
  }

  const outJson = target.out ?? (opts.config ? `reports/${slugify(label)}.json` : opts.out);
  const outMd = target.outMd ?? (opts.config ? `reports/${slugify(label)}.md` : opts.outMd);
  const htmlEnabled = target.html ?? opts.html;
  const outHtml = htmlEnabled ? target.outHtml ?? (opts.config ? `reports/${slugify(label)}.html` : opts.outHtml) : null;

  server?.close();

  if (metrics.warnings.length > 0) {
    console.warn(`[${label}] Avertissements : ${metrics.warnings.join(' | ')}`);
  }

  const audit = evaluateCriteria(metrics);

  const meta = {
    label,
    url: target.url ?? target.dir,
    date: new Date().toISOString(),
    thresholdEcoIndex,
    thresholdWeightKB,
  };

  const breaches = printConsoleReport(audit, { label, thresholdEcoIndex, thresholdWeightKB });

  writeJsonReport(audit, meta, outJson);
  console.log(`[${label}] Rapport JSON écrit : ${path.resolve(outJson)}`);

  if (outMd) {
    writeMarkdownReport(audit, meta, outMd);
    console.log(`[${label}] Rapport Markdown écrit : ${path.resolve(outMd)}`);
  }

  if (outHtml) {
    writeHtmlReport(audit, meta, outHtml);
    console.log(`[${label}] Rapport HTML écrit : ${path.resolve(outHtml)}`);
  }

  return {
    label,
    failed: false,
    breaches,
    htmlPath: outHtml,
    ecoIndex: audit.ecoIndex,
    criteriaScore: audit.criteriaScore,
    totalPageWeightKB: audit.totalPageWeightKB,
    totalRequests: audit.totalRequests,
  };
}

async function main() {
  if (opts.config) {
    const targets = JSON.parse(fs.readFileSync(path.resolve(opts.config), 'utf-8'));
    const browser = await chromium.launch();

    let outcomes;
    try {
      outcomes = await runWithConcurrency(targets, Number(opts.concurrency), (target) => runSingleAudit(target, browser));
    } finally {
      await browser.close();
    }

    console.log('\n=== Résumé du batch ===');
    let anyBreach = false;
    for (const outcome of outcomes) {
      const status = outcome.breaches.length > 0 ? '✘' : '✔';
      if (outcome.breaches.length > 0) anyBreach = true;
      console.log(`  ${status} ${outcome.label}${outcome.breaches.length > 0 ? ` — ${outcome.breaches.join('; ')}` : ''}`);
    }

    if (opts.html) {
      const indexPath = 'reports/index.html';
      writeHtmlIndex(outcomes, indexPath);
      console.log(`\nRésumé HTML écrit : ${path.resolve(indexPath)}`);
    }

    process.exit(anyBreach ? 1 : 0);
  }

  const browser = await chromium.launch();
  let outcome;
  try {
    outcome = await runSingleAudit(
      { url: opts.url, dir: opts.dir, label: opts.label, out: opts.out, outMd: opts.outMd, outHtml: opts.outHtml, html: opts.html, compress: opts.compress, cacheHeaders: opts.cacheHeaders },
      browser
    );
  } finally {
    await browser.close();
  }
  process.exit(outcome.breaches.length > 0 ? 1 : 0);
}

main();
