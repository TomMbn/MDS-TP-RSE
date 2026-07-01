import { patterns } from '../collector.js';
import { computeEcoIndexApprox } from '../ecoindex.js';

const { IMAGE_EXT, NEXT_GEN_EXT, FONT_EXT, COMPRESSIBLE_TYPES } = patterns;

const CATEGORY = {
  WEIGHT: 'Poids & formats',
  NETWORK: 'Réseau',
  DOM: 'DOM & structure',
};

function bytesToKB(b) {
  return b / 1024;
}

function isTextType(contentType = '') {
  return COMPRESSIBLE_TYPES.test(contentType);
}

/**
 * Chaque critère reçoit les métriques brutes collectées par le navigateur headless
 * et retourne un verdict normalisé. `pass` détermine si le critère est respecté ;
 * `weight` sert au calcul du score global pondéré.
 */
export const CRITERIA = [
  {
    id: 'RGESN-1.1',
    label: 'Poids total de la page',
    category: CATEGORY.WEIGHT,
    weight: 3,
    evaluate(m) {
      const totalKB = bytesToKB(m.requests.reduce((sum, r) => sum + r.sizeBytes, 0));
      const thresholdKB = 1536; // 1.5 Mo
      return {
        pass: totalKB <= thresholdKB,
        value: `${totalKB.toFixed(0)} Ko`,
        threshold: `≤ ${thresholdKB} Ko`,
        detail: `Poids total transféré : ${totalKB.toFixed(0)} Ko sur ${m.requests.length} requêtes.`,
      };
    },
  },
  {
    id: 'RGESN-1.6',
    label: 'Formats d\'image nouvelle génération (WebP/AVIF)',
    category: CATEGORY.WEIGHT,
    weight: 2,
    evaluate(m) {
      const images = m.requests.filter((r) => IMAGE_EXT.test(r.url) || NEXT_GEN_EXT.test(r.url));
      const nextGen = images.filter((r) => NEXT_GEN_EXT.test(r.url));
      const ratio = images.length === 0 ? 1 : nextGen.length / images.length;
      return {
        pass: ratio >= 0.8,
        value: `${nextGen.length}/${images.length} images en WebP/AVIF`,
        threshold: '≥ 80% des images en WebP/AVIF',
        detail: `${images.length - nextGen.length} image(s) encore en format legacy (PNG/JPEG/GIF).`,
      };
    },
  },
  {
    id: 'RGESN-1.2',
    label: 'Poids total des images',
    category: CATEGORY.WEIGHT,
    weight: 2,
    evaluate(m) {
      const totalImgKB = bytesToKB(
        m.requests.filter((r) => r.resourceType === 'image').reduce((sum, r) => sum + r.sizeBytes, 0)
      );
      const thresholdKB = 500;
      return {
        pass: totalImgKB <= thresholdKB,
        value: `${totalImgKB.toFixed(0)} Ko`,
        threshold: `≤ ${thresholdKB} Ko`,
        detail: `Poids cumulé des images : ${totalImgKB.toFixed(0)} Ko.`,
      };
    },
  },
  {
    id: 'RGESN-1.9',
    label: 'Nombre de polices web chargées',
    category: CATEGORY.WEIGHT,
    weight: 1,
    evaluate(m) {
      const fonts = m.requests.filter((r) => FONT_EXT.test(r.url));
      return {
        pass: fonts.length <= 2,
        value: `${fonts.length} police(s)`,
        threshold: '≤ 2 polices web',
        detail: `${fonts.length} fichier(s) de police détecté(s).`,
      };
    },
  },
  {
    id: 'RGESN-1.3',
    label: 'Poids total du CSS',
    category: CATEGORY.WEIGHT,
    weight: 1,
    evaluate(m) {
      const cssKB = bytesToKB(m.requests.filter((r) => r.resourceType === 'stylesheet').reduce((s, r) => s + r.sizeBytes, 0));
      return {
        pass: cssKB <= 100,
        value: `${cssKB.toFixed(0)} Ko`,
        threshold: '≤ 100 Ko',
        detail: `Poids CSS cumulé : ${cssKB.toFixed(0)} Ko.`,
      };
    },
  },
  {
    id: 'RGESN-1.4',
    label: 'Poids total du JavaScript',
    category: CATEGORY.WEIGHT,
    weight: 2,
    evaluate(m) {
      const jsKB = bytesToKB(m.requests.filter((r) => r.resourceType === 'script').reduce((s, r) => s + r.sizeBytes, 0));
      return {
        pass: jsKB <= 300,
        value: `${jsKB.toFixed(0)} Ko`,
        threshold: '≤ 300 Ko',
        detail: `Poids JS cumulé : ${jsKB.toFixed(0)} Ko.`,
      };
    },
  },
  {
    id: 'RGESN-1.5',
    label: 'Minification des ressources CSS/JS',
    category: CATEGORY.WEIGHT,
    weight: 1,
    evaluate(m) {
      const textAssets = m.requests.filter((r) => r.resourceType === 'script' || r.resourceType === 'stylesheet');
      if (textAssets.length === 0) {
        return { pass: true, value: 'N/A', threshold: 'ratio espaces < 15%', detail: 'Aucun asset CSS/JS.' };
      }
      // Heuristique : un fichier minifié a très peu de retours à la ligne / espaces par octet.
      const nonMinified = textAssets.filter((r) => r._whitespaceRatio > 0.15);
      const ratio = nonMinified.length / textAssets.length;
      return {
        pass: ratio <= 0.2,
        value: `${nonMinified.length}/${textAssets.length} fichiers non minifiés`,
        threshold: '≤ 20% de fichiers non minifiés',
        detail: `Détection heuristique basée sur la densité d'espaces/retours à la ligne.`,
      };
    },
  },
  {
    id: 'RGESN-2.1',
    label: 'Nombre total de requêtes HTTP',
    category: CATEGORY.NETWORK,
    weight: 2,
    evaluate(m) {
      return {
        pass: m.requests.length <= 40,
        value: `${m.requests.length} requêtes`,
        threshold: '≤ 40 requêtes',
        detail: `${m.requests.length} requêtes réseau interceptées lors du chargement.`,
      };
    },
  },
  {
    id: 'RGESN-2.2',
    label: 'Compression des ressources textuelles (Gzip/Brotli)',
    category: CATEGORY.NETWORK,
    weight: 3,
    evaluate(m) {
      const textResponses = m.requests.filter((r) => isTextType(r.headers['content-type']));
      const compressed = textResponses.filter((r) => !!r.headers['content-encoding']);
      const ratio = textResponses.length === 0 ? 1 : compressed.length / textResponses.length;
      return {
        pass: ratio >= 0.9,
        value: `${compressed.length}/${textResponses.length} ressources compressées`,
        threshold: '≥ 90% des ressources textuelles compressées',
        detail: `Vérifie l'en-tête Content-Encoding (gzip/br) sur les réponses HTML/CSS/JS/JSON.`,
      };
    },
  },
  {
    id: 'RGESN-2.3',
    label: 'Cache-Control sur les ressources statiques',
    category: CATEGORY.NETWORK,
    weight: 1,
    evaluate(m) {
      const staticAssets = m.requests.filter((r) => ['image', 'stylesheet', 'script', 'font'].includes(r.resourceType));
      const cached = staticAssets.filter((r) => !!r.headers['cache-control']);
      const ratio = staticAssets.length === 0 ? 1 : cached.length / staticAssets.length;
      return {
        pass: ratio >= 0.8,
        value: `${cached.length}/${staticAssets.length} assets avec Cache-Control`,
        threshold: '≥ 80% des assets statiques avec Cache-Control',
        detail: `Un cache long-terme sur les assets statiques évite des requêtes réseau répétées.`,
      };
    },
  },
  {
    id: 'RGESN-2.4',
    label: 'Domaines tiers sollicités',
    category: CATEGORY.NETWORK,
    weight: 1,
    evaluate(m) {
      return {
        pass: m.thirdPartyDomains.length <= 3,
        value: `${m.thirdPartyDomains.length} domaine(s) tiers`,
        threshold: '≤ 3 domaines tiers',
        detail: m.thirdPartyDomains.length > 0 ? m.thirdPartyDomains.join(', ') : 'Aucun domaine tiers.',
      };
    },
  },
  {
    id: 'RGESN-2.5',
    label: 'Absence d\'erreurs réseau (4xx/5xx)',
    category: CATEGORY.NETWORK,
    weight: 2,
    evaluate(m) {
      const errors = m.requests.filter((r) => r.status >= 400);
      return {
        pass: errors.length === 0,
        value: `${errors.length} erreur(s)`,
        threshold: '0 erreur',
        detail: errors.length > 0 ? errors.map((e) => `${e.status} ${e.url}`).join('; ') : 'Toutes les requêtes ont abouti.',
      };
    },
  },
  {
    id: 'RGESN-2.6',
    label: 'Vidéos en lecture automatique',
    category: CATEGORY.NETWORK,
    weight: 1,
    evaluate(m) {
      const wastefulVideos = m.dom.videos.filter((v) => v.autoplay);
      return {
        pass: wastefulVideos.length === 0,
        value: `${wastefulVideos.length} vidéo(s) autoplay`,
        threshold: '0 vidéo en autoplay',
        detail: 'Une vidéo en autoplay consomme de la bande passante sans action explicite de l\'utilisateur.',
      };
    },
  },
  {
    id: 'RGESN-3.1',
    label: 'Nombre de nœuds DOM',
    category: CATEGORY.DOM,
    weight: 3,
    evaluate(m) {
      return {
        pass: m.dom.totalNodes <= 800,
        value: `${m.dom.totalNodes} nœuds`,
        threshold: '≤ 800 nœuds',
        detail: `Un DOM volumineux augmente le coût de rendu et de mémoire côté client.`,
      };
    },
  },
  {
    id: 'RGESN-3.2',
    label: 'Profondeur maximale du DOM',
    category: CATEGORY.DOM,
    weight: 1,
    evaluate(m) {
      return {
        pass: m.dom.maxDepth <= 15,
        value: `${m.dom.maxDepth} niveaux`,
        threshold: '≤ 15 niveaux',
        detail: `Une arborescence trop profonde complexifie le CSSOM et le rendu.`,
      };
    },
  },
  {
    id: 'RGESN-3.3',
    label: 'Lazy-loading des médias hors-champ',
    category: CATEGORY.DOM,
    weight: 2,
    evaluate(m) {
      const offscreen = m.dom.images.filter((img) => !img.inViewport);
      const lazy = offscreen.filter((img) => img.loading === 'lazy');
      const ratio = offscreen.length === 0 ? 1 : lazy.length / offscreen.length;
      return {
        pass: ratio >= 0.9,
        value: `${lazy.length}/${offscreen.length} images hors-champ en lazy-loading`,
        threshold: '≥ 90% des images hors-champ avec loading="lazy"',
        detail: `Le lazy-loading évite de télécharger des médias jamais vus par l'utilisateur.`,
      };
    },
  },
  {
    id: 'RGESN-3.4',
    label: 'Verbosité du HTML',
    category: CATEGORY.DOM,
    weight: 1,
    evaluate(m) {
      const sizeKB = m.dom.htmlSizeChars / 1024;
      return {
        pass: sizeKB <= 100,
        value: `${sizeKB.toFixed(0)} Ko de markup`,
        threshold: '≤ 100 Ko',
        detail: `Un HTML verbeux (balises redondantes, structure non sémantique) alourdit le parsing.`,
      };
    },
  },
  {
    id: 'RGESN-3.5',
    label: 'Meta viewport (structure mobile-first)',
    category: CATEGORY.DOM,
    weight: 1,
    evaluate(m) {
      return {
        pass: m.dom.hasViewportMeta,
        value: m.dom.hasViewportMeta ? 'présent' : 'absent',
        threshold: 'présent',
        detail: `La meta viewport évite le rendu desktop forcé sur mobile (re-render, zoom, sur-consommation).`,
      };
    },
  },
];

export function evaluateCriteria(metrics) {
  const results = CRITERIA.map((criterion) => {
    const outcome = criterion.evaluate(metrics);
    return {
      id: criterion.id,
      label: criterion.label,
      category: criterion.category,
      weight: criterion.weight,
      ...outcome,
    };
  });

  const totalWeight = results.reduce((s, r) => s + r.weight, 0);
  const passedWeight = results.filter((r) => r.pass).reduce((s, r) => s + r.weight, 0);
  const criteriaScore = Math.round((passedWeight / totalWeight) * 100);

  const totalKB = bytesToKB(metrics.requests.reduce((sum, r) => sum + r.sizeBytes, 0));
  const eco = computeEcoIndexApprox({
    domNodes: metrics.dom.totalNodes,
    requestCount: metrics.requests.length,
    sizeKB: totalKB,
  });

  return {
    results,
    criteriaScore,
    passedCount: results.filter((r) => r.pass).length,
    totalCount: results.length,
    ecoIndex: eco.score,
    ecoIndexDetail: eco.detail,
    totalPageWeightKB: Math.round(totalKB),
    totalRequests: metrics.requests.length,
  };
}
