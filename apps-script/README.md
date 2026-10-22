# Meteo Trieste Proxy (Google Apps Script)

Web app che espone come JSON per `index.html`:
- centraline (**Trieste molo**, **Monte Grisa**, **Muggia**, Istria…) da [vetercek.com](https://vetercek.com)
  (le pagine vetercek non mandano header CORS, quindi il browser non può leggerle direttamente).
  Da lug 2026 i **valori correnti** arrivano dal feed API ufficiale `xml/podatki.php`
  (accordo con Jaka: **mai più spesso di 5 min** → è il cron del Worker Cloudflare, con
  `?riscalda=1` ai minuti multipli di 5, a dettare il ritmo delle letture; `DATI_FRESCO_S = 360`
  è volutamente più larga, vedi il commento nel codice); le pagine
  HTML `/danes/` servono solo per lo storico (tabella + trend). Il feed dà anche le
  coordinate delle stazioni, esposte nel payload come `gps`.
- **Trieste molo** ogni 15 minuti dall'API pubblica della [Protezione Civile FVG](https://monitor.protezionecivile.fvg.it/)
  (stazione OSMER 212, sensori 5/6/7/2; da set 2026, v45). vetercek pubblica la stessa stazione
  solo una volta all'ora: resta come riserva se l'API non risponde (`triesteFonte` nel payload
  dice quale fonte è stata usata: `pcfvg` o `vetercek`).
- stazione **Terrapieno di Barcola** da Windguru (stazione 5307; l'API `iapi.php`
  accetta solo richieste con Referer windguru.cz, che il browser non può impostare)
- stazione meteo **spiaggia di Lignano** da [lignanosabbiadoro.com/meteo-lignano](https://www.lignanosabbiadoro.com/meteo-lignano)
  (payload `lignanoLive`: vento quasi in tempo reale in kt, direzione in gradi, temperatura
  aria/mare, umidità, pressione — la stazione OSMER via vetercek per Lignano è solo oraria)

- Script: https://script.google.com/d/1P_ijzBLUXFrW1xc_bZ0n9fEXjBQhYPh44_Z9xnzRf2FYsY4aSjVeZG2S/edit
- Account: bebroggi@gmail.com
- Endpoint usato dalla pagina: deployment `@1` (URL in `index.html`, costante `PROXY`)

## Modificare e rideployare

⚠️ **Prima di pushare: `git pull`.** `clasp push` carica quello che c'è nella cartella
locale, senza sapere nulla di git. Pushare da un checkout indietro rispetto a `origin/main`
manda in produzione codice vecchio e cancella funzionalità (successo ago 2026: sparì
`lignanoLive` dal payload). Per rimediare in fretta: `clasp deploy -i <ID> --versionNumber <N>`
torna a una versione precedente **senza** ricaricare il codice.

```bash
git pull                                            # SEMPRE per primo
clasp push --force                                  # carica il codice su HEAD
clasp deploy -i AKfycbxev3jcFdaC…UTPg -d "v36: …"   # pubblica sull'URL già in uso
```

Passando `-i / --deploymentId` del deployment esistente si crea una nuova **versione**
sullo **stesso URL**: la costante `PROXY` in `index.html` non va toccata. Un `clasp deploy`
*senza* `-i` crea invece un deployment nuovo con URL nuovo (da evitare).
`clasp list-deployments` elenca gli ID.

## Riscaldamento della cache (`?riscalda=1`, dal Worker Cloudflare)

Senza riscaldamento, ogni volta che la copia in cache invecchia il costo della ricostruzione
ricade su un visitatore a caso: fino a ~26s a container freddo. Chi torna sul sito non
se ne accorge (il frontend ridisegna subito dalla cache in `localStorage`), chi arriva da
un **browser nuovo** vede "Dati non disponibili".

Dal **22 ott 2026** la ricostruzione la chiede il cron del Worker Cloudflare
`ventotrieste-dati` (vedi [`cloudflare-worker/dati`](../cloudflare-worker/dati/ventotrieste-dati.js)):
ai minuti multipli di 5 chiama il proxy con `?riscalda=1`, che ricostruisce il payload e lo
restituisce, e il Worker lo scrive subito in KV. Il proxy non ricostruisce se l'ultima
ricostruzione è finita da meno di 4 minuti (`RISCALDA_MIN_S`), così vetercek non viene mai
letto più spesso di 5 minuti.

**Perché non più il trigger Apps Script.** Fino al 22 ott lo faceva un trigger a tempo
(`riscaldaCache`, ogni 5 minuti). I trigger però falliscono ogni tanto *dentro Google*,
prima ancora di eseguire il codice: "We're sorry, a server error occurred while reading from
storage. Error code INTERNAL" (in 0 secondi) o "We're sorry, a server error occurred. Please
wait a bit and try again" (dopo 60 secondi appesi) — 3 volte tra il 21 e il 22 ott, con
`riscaldaCache` già tutta in try/catch dal 29 set. Nessun try/catch li può intercettare, e
ognuno arriva come mail "Summary of failures". Le esecuzioni della **web app** invece non
mandano mail: se una chiamata va storta il Worker riprova al giro dopo e il sito intanto
serve la copia di 5 minuti prima.

➡️ **L'attivazione su `riscaldaCache` va tolta**: editor Apps Script → icona ⏰
**Attivazioni** → sulla riga di `riscaldaCache` i tre puntini → **Elimina attivazione**.
Finché resta, non fa danni (trova la cache appena rinfrescata dal Worker e non rilegge le
fonti) ma può continuare a mandare mail.

**Piano B** (solo se il Worker sparisse): reinstallare l'attivazione, una volta sola —
**Aggiungi attivazione** con:

| campo | valore |
|---|---|
| Funzione | `riscaldaCache` |
| Origine evento | Basata sul tempo |
| Tipo di attivazione | Timer a minuti |
| Intervallo | **Ogni 5 minuti** |

Si installa a mano di proposito: farlo da codice (`ScriptApp.newTrigger`) richiederebbe
lo scope `script.scriptapp` nel manifest, e finché l'utente che pubblica non riautorizza
la web app risponde "autorizzazione richiesta" — cioè il sito resta senza dati.
Il trigger ha un budget di 60 min/giorno (la quota consumer dei trigger è 90; la web app
non ci rientra): superato quello salta un'esecuzione su due invece di esaurirla e lasciare
il sito scoperto fino a mezzanotte.

Controllo: **`?diag=1`** sull'endpoint restituisce le ricostruzioni del giorno, i minuti
consumati ed età della cache in secondi (i nomi `minutiTrigger`/`triggerAttivo` sono
storici: contano le ricostruzioni chieste dal Worker).

```json
{ "giorno":"2026-08-06", "esecuzioni":112, "saltate":0,
  "minutiTrigger":9.4, "budgetMinuti":60, "cacheEtaSec":47, "triggerAttivo":true }
```

`triggerAttivo: false` a giornata avviata = nessuno sta riscaldando la cache (il cron del
Worker non chiama il proxy).

## Latenza e frontend

Anche con la cache pronta, Apps Script risponde in modo irregolare: misurato il 29 set 2026
su 10 richieste, da 2 a 18 secondi, e 2 finite con una pagina HTML 404 dopo 11 e 39 secondi.
Per questo le pagine NON leggono più il proxy direttamente: [`/dati-live.js`](../dati-live.js)
chiede il payload al Worker Cloudflare `ventotrieste-dati` (vedi
[`cloudflare-worker/README.md`](../cloudflare-worker/README.md)), che ogni minuto ne copia
l'ultima versione dal proxy e risponde in ~0,15s. Solo se il Worker non risponde o ha una
copia di più di 9 minuti si torna al proxy, con richieste "a staffetta" (la seconda parte a
3s, la terza a 7s, vince la prima risposta JSON valida, timeout 30s). Non costa quota: il
proxy serve la copia in cache.

## Risposta JSON

```json
{
  "trieste":    [{ "ora": "11:00", "direzione": "ENE", "kt": "9.7",  "sunki": "19.4", "temp": "24.9" }],
  "monteGrisa": [{ "ora": "10:49", "direzione": "ENE", "kt": "10.0", "sunki": "13.0", "temp": "21.6" }],
  "muggia":     [{ "ora": "10:30", "direzione": "E",   "kt": "13.2", "sunki": "16.9", "temp": "-" }],
  "gps":        { "trieste": { "lat": 45.6466, "lon": 13.7789 } },
  "barcola":    { "wind_avg": 5.2, "wind_max": 9.1, "wind_min": 1, "wind_direction": 117,
                  "temperature": 25.8, "mslp": 1010.9, "rh": 60,
                  "datetime": "2026-06-10 11:10:33 CEST", "unixtime": 1781082633 },
  "updated": "2026-06-10T08:55:00.000Z"
}
```

(`sunki` = raffica, nome ereditato dalle colonne di vetercek.com)
