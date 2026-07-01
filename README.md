# rgesn-audit-cli

CLI d'audit automatisé RGESN/GreenIT capable de bloquer une CI/CD ("breaking build")
si une page web dépasse son budget d'impact environnemental.

## Installation

```bash
npm install
npx playwright install chromium
```

## Usage

```bash
# Auditer une URL distante
node bin/cli.js --url https://example.com --threshold 50 --max-weight-kb 1500

# Auditer un dossier local (serveur statique intégré)
node bin/cli.js --dir ./mon-site --out reports/report.json --out-md reports/report.md

# Simuler une page non optimisée (pas de compression/cache)
node bin/cli.js --dir ./mon-site --no-compress --no-cache-headers
```

Options principales :

| Option | Description | Défaut |
|---|---|---|
| `--url` | URL à auditer (http/https/file) | — |
| `--dir` | Dossier local à servir et auditer | — |
| `--threshold` | Seuil minimal d'EcoIndex approximé (0-100) | 50 |
| `--max-weight-kb` | Poids maximal de page en Ko | 1536 |
| `--out` | Chemin du rapport JSON | `reports/report.json` |
| `--out-md` | Chemin du rapport Markdown | — |

Code de sortie : `0` si le budget est respecté, `1` si un seuil est dépassé (pour bloquer une pipeline CI/CD).

## Crash-test de validation (Sprint 1)

Deux pages de démonstration sont fournies dans `test-pages/` :

- **`v1-grenelle/`** : page volontairement surchargée (10 images PNG brutes non compressées, DOM de ~2000 nœuds, CSS/JS non minifiés, vidéo en autoplay, aucun lazy-loading, aucune compression/cache serveur).
- **`v2-sobre/`** : page optimisée (images WebP, DOM minimal, CSS/JS minifiés, lazy-loading, compression Gzip/Brotli et Cache-Control activés).

```bash
npm run audit:v2   # ~18/18 critères, EcoIndex ~96, exit 0
npm run audit:v1   # ~8/18 critères, EcoIndex ~34, exit 1 (build cassé)
```

## Les 18 critères automatisés

### Poids & formats

| ID | Critère | Seuil |
|---|---|---|
| RGESN-1.1 | Poids total de la page | ≤ 1.5 Mo |
| RGESN-1.6 | Formats d'image nouvelle génération (WebP/AVIF) | ≥ 80% des images |
| RGESN-1.2 | Poids total des images | ≤ 500 Ko |
| RGESN-1.9 | Nombre de polices web chargées | ≤ 2 |
| RGESN-1.3 | Poids total du CSS | ≤ 100 Ko |
| RGESN-1.4 | Poids total du JavaScript | ≤ 300 Ko |
| RGESN-1.5 | Minification des ressources CSS/JS | ≤ 20% de fichiers non minifiés |

### Réseau

| ID | Critère | Seuil |
|---|---|---|
| RGESN-2.1 | Nombre total de requêtes HTTP | ≤ 40 |
| RGESN-2.2 | Compression Gzip/Brotli des ressources textuelles | ≥ 90% |
| RGESN-2.3 | Cache-Control sur les ressources statiques | ≥ 80% |
| RGESN-2.4 | Domaines tiers sollicités | ≤ 3 |
| RGESN-2.5 | Absence d'erreurs réseau (4xx/5xx) | 0 |
| RGESN-2.6 | Vidéos en lecture automatique | 0 |

### DOM & structure

| ID | Critère | Seuil |
|---|---|---|
| RGESN-3.1 | Nombre de nœuds DOM | ≤ 800 |
| RGESN-3.2 | Profondeur maximale du DOM | ≤ 15 niveaux |
| RGESN-3.3 | Lazy-loading des médias hors-champ | ≥ 90% |
| RGESN-3.4 | Verbosité du HTML | ≤ 100 Ko |
| RGESN-3.5 | Présence de la meta viewport | présent |

> Les identifiants `RGESN-x.y` sont indicatifs et servent à regrouper les critères par thème ;
> ils ne prétendent pas correspondre exactement à la numérotation officielle du référentiel RGESN.

## Score global et EcoIndex approximé

- **Score critères pondéré** : moyenne pondérée (poids 1 à 3 par critère) du taux de critères respectés.
- **EcoIndex approximé** (`src/ecoindex.js`) : score composite inspiré de la méthodologie EcoIndex.fr /
  GreenIT-Analysis, basé sur 3 dimensions (nombre de nœuds DOM, nombre de requêtes, poids total en Ko),
  chacune notée de 0 à 100 par interpolation sur les tables de quantiles publiques du projet, puis
  combinées avec la pondération officielle 3/2/1. **Ce n'est pas le score EcoIndex certifié**, seulement
  une approximation pédagogique reproduisant la même logique de notation.

## Architecture

```
bin/cli.js              → point d'entrée CLI (commander), logique de breaking build
src/collector.js         → pilotage Playwright (navigation, interception réseau, extraction DOM)
src/server.js             → serveur statique local (simulation compression/cache pour les tests)
src/criteria/index.js    → les 18 critères et leur logique d'évaluation
src/ecoindex.js           → calcul du score composite par quantiles
src/report/index.js      → rapport console (stdout) + export JSON/Markdown
test-pages/               → pages V1 (Grenelle) et V2 (Sobre) pour le crash-test
```

## Sprint 2 (à venir)

- Packaging GitHub Action réutilisable.
- Renforcement de la robustesse (retries réseau, timeouts, gestion des pages asynchrones complexes).
