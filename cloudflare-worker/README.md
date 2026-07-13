# vetercek-relay (Cloudflare Worker)

Ponte che permette al proxy Apps Script di rileggere **vetercek.com**, che blocca
le richieste senza User-Agent da browser. Vedi il commento in `vetercek-relay.js`.

Fa anche da estrattore per le **webcam rtsp.me** (es. Saturnia/Sacchetta):
`/?rtspme=kyztSFeT` risponde `{ "url": "https://…m3u8…" }` con l'URL HLS firmato
del momento, che il sito usa per un player con autoplay. Per aggiornarlo basta
rideployare `vetercek-relay.js` (passo 4 qui sotto) sullo stesso worker: finché
non lo fai, il sito ripiega da solo sull'iframe rtsp.me (tasto play).

## Deploy (dalla dashboard, ~5 minuti, senza CLI)

1. Vai su <https://dash.cloudflare.com> → accedi o crea un account gratuito.
2. **Workers & Pages** → **Create application** → **Workers** → **Create Worker**.
3. Dai un nome (es. `vetercek-relay`) → **Deploy**.
4. **Edit code** → cancella il codice di esempio → incolla il contenuto di
   [`vetercek-relay.js`](vetercek-relay.js) → **Deploy**.
5. Copia l'URL del worker (tipo `https://vetercek-relay.TUONOME.workers.dev`).
6. Provalo nel browser:
   `https://vetercek-relay.TUONOME.workers.dev/?url=https%3A%2F%2Fvetercek.com%2Fdanes%2Findex.php%3Fpostaja%3Dmontegrisa`
   Deve mostrare la pagina di Monte Grisa con la tabella vento.
7. Passami l'URL: imposto `VETERCEK_RELAY` in `apps-script/Code.js` e rideployo.

## Deploy alternativo (CLI wrangler)

```bash
npm i -g wrangler
wrangler login
wrangler deploy vetercek-relay.js --name vetercek-relay --compatibility-date 2024-01-01
```

## Limiti / costi

Piano gratuito: 100.000 richieste/giorno. La cache di 60s fa sì che vetercek venga
letto al massimo una volta al minuto per stazione, a prescindere dal traffico del sito.
