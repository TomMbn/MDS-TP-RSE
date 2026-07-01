#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { collectPageMetrics } from '../src/collector.js';
import { evaluateCriteria } from '../src/criteria/index.js';
import { printConsoleReport, writeJsonReport, writeMarkdownReport } from '../src/report/index.js';
import { startStaticServer } from '../src/server.js';

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
  .option('--threshold <score>', 'Seuil minimal d\'EcoIndex approximé (0-100)', '50')
  .option('--max-weight-kb <kb>', 'Poids maximal de page en Ko avant blocage', '1536')
  .option('--timeout <ms>', 'Timeout de chargement de page en ms', '30000')
  .parse(process.argv);

const opts = program.opts();

if (!opts.url && !opts.dir) {
  console.error('Erreur : fournir --url ou --dir');
  process.exit(1);
}

async function main() {
  const thresholdEcoIndex = Number(opts.threshold);
  const thresholdWeightKB = Number(opts.maxWeightKb);

  let server;
  let targetUrl = opts.url;

  if (opts.dir) {
    const started = await startStaticServer(path.resolve(opts.dir), {
      compress: opts.compress,
      cacheHeaders: opts.cacheHeaders,
    });
    server = started.server;
    targetUrl = started.url;
  }

  console.log(`Analyse de ${targetUrl} ...`);

  let metrics;
  try {
    metrics = await collectPageMetrics(targetUrl, { timeout: Number(opts.timeout) });
  } catch (err) {
    console.error(`Erreur lors du chargement de la page : ${err.message}`);
    server?.close();
    process.exit(1);
  }

  server?.close();

  const audit = evaluateCriteria(metrics);

  const meta = {
    label: opts.label,
    url: opts.url,
    date: new Date().toISOString(),
    thresholdEcoIndex,
    thresholdWeightKB,
  };

  const breaches = printConsoleReport(audit, { label: opts.label, thresholdEcoIndex, thresholdWeightKB });

  writeJsonReport(audit, meta, opts.out);
  console.log(`Rapport JSON écrit : ${path.resolve(opts.out)}`);

  if (opts.outMd) {
    writeMarkdownReport(audit, meta, opts.outMd);
    console.log(`Rapport Markdown écrit : ${path.resolve(opts.outMd)}`);
  }

  if (breaches.length > 0) {
    process.exit(1);
  }
}

main();
