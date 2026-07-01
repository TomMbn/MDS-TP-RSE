import { chromium } from 'playwright';

const IMAGE_EXT = /\.(png|jpe?g|gif|bmp|tiff?)(\?|$)/i;
const NEXT_GEN_EXT = /\.(webp|avif)(\?|$)/i;
const FONT_EXT = /\.(woff2?|ttf|otf|eot)(\?|$)/i;
const COMPRESSIBLE_TYPES = /text\/html|text\/css|javascript|json|svg/i;

/**
 * Navigue vers `url` avec une stratégie robuste face aux architectures asynchrones :
 * on tente d'abord d'attendre l'inactivité réseau complète (networkidle), mais certaines
 * SPA font du polling continu (websockets, analytics) et ne deviennent jamais "idle".
 * Dans ce cas on retombe sur un simple `load` + un délai de stabilisation fixe, plutôt
 * que de faire planter l'audit.
 */
async function gotoRobust(page, url, timeout) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout });
    return;
  } catch (err) {
    if (!/Timeout/i.test(err.message)) throw err;
  }

  // Fallback : la page a chargé mais le réseau reste actif en continu.
  await page.goto(url, { waitUntil: 'load', timeout });
  await page.waitForTimeout(2000);
}

/**
 * Exécute `fn` avec `retries` tentatives supplémentaires en cas d'échec transitoire
 * (timeout réseau, navigation abandonnée). Chaque tentative repart d'une page neuve.
 */
async function withRetries(fn, retries) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export async function collectPageMetrics(url, { timeout = 30000, browser: sharedBrowser, retries = 1 } = {}) {
  const browser = sharedBrowser ?? (await chromium.launch());
  const ownsBrowser = !sharedBrowser;

  try {
    return await withRetries(() => runAudit(browser, url, timeout), retries);
  } finally {
    if (ownsBrowser) await browser.close();
  }
}

async function runAudit(browser, url, timeout) {
  const context = await browser.newContext();
  const page = await context.newPage();

  const requests = [];
  const warnings = [];

  page.on('response', async (response) => {
    try {
      const request = response.request();
      const headers = response.headers();
      let body = Buffer.alloc(0);
      try {
        body = await response.body();
      } catch {
        // opaque/redirected responses may not expose a body
      }
      const resourceType = request.resourceType();
      let whitespaceRatio = 0;
      if ((resourceType === 'script' || resourceType === 'stylesheet') && body.length > 0) {
        const text = body.toString('utf-8');
        const whitespaceChars = (text.match(/\s/g) || []).length;
        whitespaceRatio = whitespaceChars / text.length;
      }

      requests.push({
        url: response.url(),
        resourceType,
        status: response.status(),
        headers,
        sizeBytes: body.length,
        _whitespaceRatio: whitespaceRatio,
      });
    } catch {
      // ignore responses that fail to resolve (aborted, navigations, etc.)
    }
  });

  // Une page qui plante ou une exception JS non interceptée ne doit jamais faire
  // planter l'audit : on les capture comme avertissements et on continue.
  page.on('crash', () => warnings.push('La page a crashé pendant le chargement.'));
  page.on('pageerror', (err) => warnings.push(`Erreur JS non interceptée : ${err.message}`));

  try {
    const startTime = Date.now();
    await gotoRobust(page, url, timeout);
    const loadTimeMs = Date.now() - startTime;

    const dom = await page.evaluate(() => {
      function maxDepth(node) {
        if (!node.children || node.children.length === 0) return 1;
        return 1 + Math.max(...Array.from(node.children).map(maxDepth));
      }

      const images = Array.from(document.images).map((img) => {
        const rect = img.getBoundingClientRect();
        return {
          src: img.currentSrc || img.src,
          loading: img.getAttribute('loading'),
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          displayWidth: rect.width,
          displayHeight: rect.height,
          inViewport: rect.top < window.innerHeight,
        };
      });

      const videos = Array.from(document.querySelectorAll('video')).map((v) => ({
        autoplay: v.autoplay,
        hasControls: v.controls,
        muted: v.muted,
      }));

      const usesClientStorage =
        (window.localStorage && window.localStorage.length > 0) ||
        'serviceWorker' in navigator && navigator.serviceWorker.controller !== null;

      return {
        totalNodes: document.querySelectorAll('*').length,
        maxDepth: maxDepth(document.body),
        images,
        videos,
        hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
        htmlSizeChars: document.documentElement.outerHTML.length,
        usesClientStorage,
      };
    });

    const pageOrigin = new URL(url).origin;
    const thirdPartyDomains = new Set(
      requests
        .map((r) => {
          try {
            return new URL(r.url).origin;
          } catch {
            return null;
          }
        })
        .filter((origin) => origin && origin !== pageOrigin)
    );

    return {
      url,
      loadTimeMs,
      requests,
      dom,
      thirdPartyDomains: Array.from(thirdPartyDomains),
      warnings,
    };
  } finally {
    await context.close();
  }
}

export const patterns = { IMAGE_EXT, NEXT_GEN_EXT, FONT_EXT, COMPRESSIBLE_TYPES };
