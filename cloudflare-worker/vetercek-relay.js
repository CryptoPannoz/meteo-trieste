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
 * Secondo compito — ?rtspme=<camId> (es. la webcam Saturnia, id kyztSFeT):
 * check di stato per le webcam rtsp.me. STORIA: fino a lug 2026 la pagina embed
 * conteneva l'URL HLS firmato e il worker lo estraeva ({url:…}) per un player
 * con autoplay. rtsp.me ha poi rifatto il player (SPA): l'HLS è ora firmato e
 * LEGATO ALL'IP del richiedente (?ip=…), quindi un URL ottenuto dal worker non
 * è riproducibile dal visitatore, e anche /error/<id>.json (il vecchio check di
 * stato usato dal sito) non esiste più. Oggi questo endpoint interroga la nuova
 * session API (richiede Referer rtsp.me; CORS chiuso per gli altri origin) e
 * risponde { online, poster, url:null }: il sito, se online, monta l'iframe
 * ufficiale rtsp.me (tasto play). "poster" è l'anteprima jpg firmata (non
 * legata all'IP), usabile come immagine di attesa.
 *
 * Sicurezza: accetta SOLO URL di vetercek.com e id webcam rtsp.me (non è un
 * proxy aperto).
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

    const params = new URL(request.url).searchParams;

    // ?rtspme=<camId> → stato webcam rtsp.me: { online, poster, url:null }
    const camId = params.get('rtspme');
    if (camId) {
      if (!/^[A-Za-z0-9_-]{4,16}$/.test(camId)) {
        return new Response('Bad cam id', { status: 400, headers: CORS });
      }
      const out = { online: false, poster: null, url: null }; // url: compat col vecchio formato
      try {
        // 1) session API: risponde solo con Referer rtsp.me (da altri origin: forbidden_origin)
        const sess = await fetch('https://rtsp.me/api/embed/' + camId + '/token/', {
          headers: {
            'User-Agent': BROWSER_UA,
            'Referer': 'https://rtsp.me/embed/' + camId + '/',
          },
          cf: { cacheTtl: 120, cacheEverything: true },
        });
        if (sess.ok) {
          const s = await sess.json().catch(() => null);
          if (s && s.status === 'ok' && s.token) {
            out.online = true;
            // 2) token → poster (anteprima jpg firmata ma NON legata all'IP).
            //    Best-effort: se fallisce, online resta true e il sito usa l'iframe.
            try {
              const st = await fetch((s.url || 'https://fn.rtsp.me') + '/token/' + s.token, {
                headers: { 'User-Agent': BROWSER_UA },
              });
              if (st.ok) {
                const j = await st.json().catch(() => null);
                if (j && j.poster) out.poster = j.poster;
              }
            } catch (ignore) {}
          }
        }
      } catch (err) {
        return new Response('Upstream error: ' + err, { status: 502, headers: CORS });
      }
      return new Response(JSON.stringify(out), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=120',
          ...CORS,
        },
      });
    }

    const target = params.get('url');

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
