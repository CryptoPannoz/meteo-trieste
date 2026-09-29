# Cloudflare Worker del progetto

Due worker sull'account Cloudflare **bebroggi@gmail.com** (`*.bebroggi.workers.dev`):

- **`vetercek-relay`** (questa cartella): ponte verso vetercek.com, descritto sotto.
- **`ventotrieste-dati`** ([`dati/`](dati/), set 2026): copia del payload del proxy Apps
  Script, aggiornata ogni minuto da un cron e salvata in KV, servita alle pagine in ~0,15s
  (Apps Script ci mette 2-18s e a volte fallisce). Le pagine lo leggono tramite
  [`/dati-live.js`](../dati-live.js) e tornano al proxy se il worker non risponde o ha una
  copia di più di 9 minuti. Stato: `https://ventotrieste-dati.bebroggi.workers.dev/?diag=1`.
  Deploy: `cd cloudflare-worker/dati && npx wrangler deploy` (serve `npx wrangler login`).
  Windguru (Barcola) risponde 403 alle richieste da Cloudflare: Barcola resta quella del proxy.

# vetercek-relay (Cloudflare Worker)

Ponte che permette al proxy Apps Script di rileggere **vetercek.com**, che blocca
le richieste senza User-Agent da browser. Vedi il commento in `vetercek-relay.js`.

Fa anche da check di stato per le **webcam rtsp.me** (es. Saturnia/Sacchetta):
`/?rtspme=kyztSFeT` risponde `{ "online": true|false, "poster": "…jpg…", "url": null }`.
(Fino a lug 2026 estraeva l'URL HLS per un player con autoplay; il nuovo player
rtsp.me firma l'HLS legandolo all'IP del visitatore, quindi oggi il sito monta
l'iframe ufficiale e usa questo endpoint solo per decidere se mostrare la sezione.)
Per aggiornare il worker basta rideployare `vetercek-relay.js` (passo 4 qui sotto)
sullo stesso worker.

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
