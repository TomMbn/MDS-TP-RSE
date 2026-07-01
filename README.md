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
# Utilisable directement (exécutable), ou via `node bin/cli.js`
./bin/cli.js --url https://example.com --threshold 50 --max-weight-kb 1500

# Installation globale optionnelle : expose la commande `rgesn-audit` partout
npm link
rgesn-audit --url https://example.com --threshold 50

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

Les 18 critères sont **tous** reliés à un **critère officiel exact du [RGESN v1.0.1](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf)**
(référentiel gouvernemental publié par la mission Numérique écoresponsable, janvier 2023), avec un lien
direct vers la page du PDF officiel décrivant le problème traité. Certains critères RGESN étant larges
(ex : 6.1 "poids maximum par écran"), plusieurs contrôles automatisés peuvent en être des sous-mesures
techniques (poids CSS, poids JS, poids images sont trois sous-mesures du même critère 6.1).

### Poids & formats

| Critère | Référence | Seuil |
|---|---|---|
| Poids total de la page | [RGESN 6.1](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=64) — *poids maximum par écran* | ≤ 1.5 Mo |
| Formats d'image adaptés (WebP/AVIF) | [RGESN 5.1](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=54) — *format de fichier adapté au contenu de chaque image* | ≥ 80% des images |
| Compression / poids total des images | [RGESN 5.2](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=55) — *niveau de compression adapté des images* | ≤ 500 Ko |
| Nombre de polices web chargées | [RGESN 4.10](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=43) — *polices du système d'exploitation* | ≤ 2 |
| Poids total du CSS | [RGESN 6.1](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=64) — *poids maximum par écran* | ≤ 100 Ko |
| Poids total du JavaScript | [RGESN 6.1](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=64) — *poids maximum par écran* | ≤ 300 Ko |
| Minification des ressources CSS/JS | [RGESN 6.4](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=66) — *techniques de compression sur les ressources transférées* | ≤ 20% de fichiers non minifiés |

### Réseau

| Critère | Référence | Seuil |
|---|---|---|
| Nombre total de requêtes HTTP | [RGESN 6.2](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=65) — *limite de requêtes par écran* | ≤ 40 |
| Compression Gzip/Brotli des ressources textuelles | [RGESN 7.2](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=77) — *transmission de contenus compressés depuis le serveur* | ≥ 90% |
| Cache-Control sur les ressources statiques | [RGESN 6.3](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=66) — *mécanismes de mise en cache* | ≥ 80% |
| Domaines tiers sollicités | [RGESN 6.11](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=74) — *ressources statiques hébergées sur un même domaine* | ≤ 3 |
| Absence d'erreurs réseau (4xx/5xx) | [RGESN 6.2](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=65) — *limite de requêtes par écran* (une requête en erreur consomme le budget sans apporter de contenu) | 0 |
| Vidéos en lecture automatique | [RGESN 4.2](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=35) — *lecture automatique désactivée* | 0 |

### DOM & structure

| Critère | Référence | Seuil |
|---|---|---|
| Dimensionnement des images à leur contexte d'affichage | [RGESN 6.5](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=68) — *dimensions d'origine correspondant au contexte d'affichage* | ≤ 20% d'images sur-dimensionnées |
| Chargement de composants complets de bibliothèques (bundles JS) | [RGESN 6.7](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=70) — *limiter le chargement aux composants utilisés des bibliothèques* | 0 fichier JS unique > 150 Ko |
| Chargement progressif (lazy-loading) des médias hors-champ | [RGESN 6.6](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=69) — *mécanisme de chargement progressif (lazy loading)* | ≥ 90% |
| Stockage côté client pour limiter les échanges réseau | [RGESN 6.9](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=72) — *stockage côté client pour éviter des échanges réseau inutiles* | localStorage ou Service Worker actif |
| Présence de la meta viewport | [RGESN 1.6](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=13) — *adaptation à différents terminaux d'affichage* | présent |

Les 18 critères sont donc **tous** rattachés à un critère officiel du RGESN v1.0.1, avec un lien vers
la page exacte du PDF gouvernemental décrivant l'objectif et la mise en œuvre attendue. Certains
critères RGESN (6.1, 6.2) sont volontairement réutilisés par plusieurs contrôles automatisés lorsqu'ils
couvrent une notion large (poids total par écran, budget de requêtes).

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

## Sprint 2 — Robustesse & mode batch concurrent

### Robustesse face aux architectures asynchrones

- **Fallback de chargement** (`src/collector.js`, `gotoRobust`) : certaines SPA ne deviennent jamais
  `networkidle` (polling, websockets, analytics). L'outil tente d'abord `networkidle`, puis retombe
  sur `load` + un délai de stabilisation fixe plutôt que d'échouer.
- **Retries** (`--retries`, défaut 1) : une tentative supplémentaire est effectuée sur timeout/erreur
  de navigation transitoire, avec un contexte de navigation neuf à chaque essai.
- **Isolation par contexte** : chaque audit s'exécute dans un `browser.newContext()` dédié (cookies,
  cache, réseau isolés), ce qui permet d'exécuter plusieurs audits en parallèle sur un même navigateur
  sans qu'ils ne se polluent mutuellement.
- **Aucun plantage sur erreur JS** : les crashs de page et exceptions JS non interceptées de la page
  auditée sont capturés comme avertissements (affichés en console) et n'interrompent jamais l'audit.

### Mode batch (concurrence)

```bash
node bin/cli.js --config audit.config.example.json --concurrency 3
```

Le fichier de config liste plusieurs cibles (`url` ou `dir`, avec seuils optionnels par cible) :

```json
[
  { "label": "V1 Grenelle", "dir": "test-pages/v1-grenelle", "compress": false, "cacheHeaders": false },
  { "label": "V2 Sobre", "dir": "test-pages/v2-sobre" }
]
```

Chaque cible génère son propre rapport JSON/Markdown (`reports/<label>.json`). Un résumé consolidé
est affiché en fin d'exécution, et l'outil sort en code `1` si **au moins une** cible dépasse son
budget d'impact — utile pour auditer plusieurs pages critiques d'un site en une seule étape CI.
