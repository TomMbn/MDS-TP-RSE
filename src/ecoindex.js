/**
 * Score composite inspiré de la méthodologie EcoIndex.fr (GreenIT-Analysis).
 * Ce n'est PAS le score EcoIndex certifié : c'est une approximation pédagogique
 * basée sur les mêmes 3 dimensions (nœuds DOM, requêtes, poids) et la même
 * logique de notation par quantiles, avec la pondération officielle 3/2/1.
 *
 * Les tables de quantiles ci-dessous sont les tables publiques du projet
 * GreenIT-Analysis (cnumr) : chaque tableau contient 21 bornes qui découpent
 * l'espace des valeurs observées sur le web en 20 tranches de 5 points.
 */

const DOM_QUANTILES = [0, 47, 75, 159, 233, 298, 358, 417, 476, 537, 603, 674, 753, 843, 947, 1076, 1237, 1443, 1721, 2135, 2967];
const REQUEST_QUANTILES = [0, 2, 15, 25, 34, 42, 49, 56, 63, 70, 78, 86, 95, 105, 117, 130, 147, 170, 201, 253, 382];
const SIZE_KB_QUANTILES = [0, 1.37, 144, 319, 479, 631, 783, 937, 1098, 1265, 1448, 1648, 1876, 2142, 2464, 2865, 3402, 4204, 5670, 7969, 13725];

/** Convertit une valeur brute en score 0-100 (100 = meilleur) par interpolation entre les bornes de quantile. */
function quantileScore(value, quantiles) {
  let i = 0;
  while (i < quantiles.length - 1 && value > quantiles[i + 1]) i++;

  if (i >= quantiles.length - 1) return 0;

  const lower = quantiles[i];
  const upper = quantiles[i + 1];
  const fractionInBucket = upper === lower ? 0 : (value - lower) / (upper - lower);
  const rank = i + fractionInBucket; // 0 (meilleur) .. 20 (pire)

  return Math.max(0, Math.min(100, 100 - rank * 5));
}

export function computeEcoIndexApprox({ domNodes, requestCount, sizeKB }) {
  const qScore = quantileScore(domNodes, DOM_QUANTILES);
  const rScore = quantileScore(requestCount, REQUEST_QUANTILES);
  const sScore = quantileScore(sizeKB, SIZE_KB_QUANTILES);

  const composite = (3 * qScore + 2 * rScore + 1 * sScore) / 6;

  return {
    score: Math.round(composite),
    detail: { qScore: Math.round(qScore), rScore: Math.round(rScore), sScore: Math.round(sScore) },
  };
}
