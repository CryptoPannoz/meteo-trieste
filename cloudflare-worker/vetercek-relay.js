/**
 * vetercek-relay — Cloudflare Worker
 *
 * Perché esiste: vetercek.com blocca le richieste che non hanno uno User-Agent
 * da browser (difesa anti-bot). Il nostro proxy gira su Google Apps Script, che
 * FORZA il proprio User-Agent ("Google-Apps-Script") e non permette di cambiarlo,
 * quindi viene bloccato ("Indirizzo non disponibile"). Questo Worker fa da ponte:
 * riceve l'URL vetercek, lo scarica con uno User-Agent da browser e lo restituisce.
 *
 * Uso:  https://<worker>.workers.dev/?url=<URL vetercek codificato>
 * In Apps Script (Code.js) basta impostare:
 *   var VETERCEK_RELAY = 'https://<worker>.workers.dev/?url=';
 *
 * Sicurezza: accetta SOLO URL di vetercek.com (non è un proxy aperto).
 * Cache: 60s al bordo Cloudflare, così il traffico del sito non martella vetercek
 * (è proprio il picco di richieste ad aver probabilmente fatto scattare il blocco).
 */

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const target = new URL(request.url).searchParams.get('url');

    // Solo vetercek.com: niente proxy aperto.
    if (!target || !/^https:\/\/(www\.)?vetercek\.com\//i.test(target)) {
      return new Response('Forbidden: solo vetercek.com', { status: 403, headers: CORS });
    }

    let upstream;
    try {
      upstream = await fetch(target, {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
        },
        // cache al bordo: una sola lettura ogni 60s a prescindere dal traffico
        cf: { cacheTtl: 60, cacheEverything: true },
      });
    } catch (err) {
      return new Response('Upstream error: ' + err, { status: 502, headers: CORS });
    }

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
        ...CORS,
      },
    });
  },
};
