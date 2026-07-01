import { chromium } from 'playwright';

const IMAGE_EXT = /\.(png|jpe?g|gif|bmp|tiff?)(\?|$)/i;
const NEXT_GEN_EXT = /\.(webp|avif)(\?|$)/i;
const FONT_EXT = /\.(woff2?|ttf|otf|eot)(\?|$)/i;
const COMPRESSIBLE_TYPES = /text\/html|text\/css|javascript|json|svg/i;

export async function collectPageMetrics(url, { timeout = 30000 } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const requests = [];

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

  const startTime = Date.now();
  await page.goto(url, { waitUntil: 'networkidle', timeout });
  const loadTimeMs = Date.now() - startTime;

  const dom = await page.evaluate(() => {
    function maxDepth(node) {
      if (!node.children || node.children.length === 0) return 1;
      return 1 + Math.max(...Array.from(node.children).map(maxDepth));
    }

    const images = Array.from(document.images).map((img) => ({
      src: img.currentSrc || img.src,
      loading: img.getAttribute('loading'),
      width: img.naturalWidth,
      height: img.naturalHeight,
      inViewport: img.getBoundingClientRect().top < window.innerHeight,
    }));

    const videos = Array.from(document.querySelectorAll('video')).map((v) => ({
      autoplay: v.autoplay,
      hasControls: v.controls,
      muted: v.muted,
    }));

    return {
      totalNodes: document.querySelectorAll('*').length,
      maxDepth: maxDepth(document.body),
      images,
      videos,
      hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
      htmlSizeChars: document.documentElement.outerHTML.length,
    };
  });

  await browser.close();

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
  };
}

export const patterns = { IMAGE_EXT, NEXT_GEN_EXT, FONT_EXT, COMPRESSIBLE_TYPES };
