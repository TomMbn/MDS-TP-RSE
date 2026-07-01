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

Chaque critère est relié au **critère officiel exact du [RGESN v1.0.1](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf)**
(référentiel gouvernemental publié par la mission Numérique écoresponsable), avec un lien direct vers
la page du PDF officiel décrivant le problème traité. Quand le RGESN n'a pas de critère dédié à un
contrôle strictement technique, il est marqué **GreenIT** et relié à une source de référence
(méthodologie EcoIndex, MDN, web.dev).

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
| Absence d'erreurs réseau (4xx/5xx) | GreenIT — [statuts HTTP (MDN)](https://developer.mozilla.org/fr/docs/Web/HTTP/Status) | 0 |
| Vidéos en lecture automatique | [RGESN 4.2](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=35) — *lecture automatique désactivée* | 0 |

### DOM & structure

| Critère | Référence | Seuil |
|---|---|---|
| Nombre de nœuds DOM | GreenIT — [méthodologie EcoIndex](https://www.ecoindex.fr/comment-ca-marche/) | ≤ 800 |
| Profondeur maximale du DOM | GreenIT — [DOM size (web.dev)](https://web.dev/dom-size/) | ≤ 15 niveaux |
| Lazy-loading des médias hors-champ | [RGESN 6.8](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=71) — *éviter le chargement de ressources inutilisées* | ≥ 90% |
| Verbosité du HTML | GreenIT — [sémantique HTML (MDN)](https://developer.mozilla.org/fr/docs/Glossary/Semantics) | ≤ 100 Ko |
| Présence de la meta viewport | [RGESN 1.6](https://ecoresponsable.numerique.gouv.fr/docs/2023/rgesn-referentiel-general-ecoconception-v1.0.1.pdf#page=13) — *adaptation à différents terminaux d'affichage* | présent |

13 des 18 critères sont directement rattachés à un critère RGESN officiel ; les 5 restants sont des
contrôles techniques complémentaires (mesure de la taille du DOM, erreurs HTTP, verbosité du markup)
issus de la méthodologie GreenIT/EcoIndex, non couverts explicitement par le RGESN mais couramment
utilisés en audit de performance web.

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
