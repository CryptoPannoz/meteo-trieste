# Meteo Trieste Proxy (Google Apps Script)

Web app che espone come JSON per `index.html`:
- centraline (**Trieste molo**, **Monte Grisa**, **Muggia**, Istria…) da [vetercek.com](https://vetercek.com)
  (le pagine vetercek non mandano header CORS, quindi il browser non può leggerle direttamente).
  Da lug 2026 i **valori correnti** arrivano dal feed API ufficiale `xml/podatki.php`
  (accordo con Jaka: **mai più spesso di 5 min** → è il trigger `riscaldaCache`, ogni 5 min
  esatti, a dettare il ritmo delle letture; `DATI_FRESCO_S = 360` è volutamente più larga,
  vedi il commento nel codice); le pagine
  HTML `/danes/` servono solo per lo storico (tabella + trend). Il feed dà anche le
  coordinate delle stazioni, esposte nel payload come `gps`.
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

## Riscaldamento della cache (trigger — da installare a mano)

Senza trigger, ogni volta che la copia in cache invecchia il costo della ricostruzione
ricade su un visitatore a caso: fino a ~26s a container freddo. Chi torna sul sito non
se ne accorge (il frontend ridisegna subito dalla cache in `localStorage`), chi arriva da
un **browser nuovo** vede "Dati non disponibili".

Installazione, una volta sola — editor Apps Script → icona ⏰ **Attivazioni** →
**Aggiungi attivazione**:

| campo | valore |
|---|---|
| Funzione | `riscaldaCache` |
| Origine evento | Basata sul tempo |
| Tipo di attivazione | Timer a minuti |
| Intervallo | **Ogni 5 minuti** |

Si installa a mano di proposito: farlo da codice (`ScriptApp.newTrigger`) richiederebbe
lo scope `script.scriptapp` nel manifest, e finché l'utente che pubblica non riautorizza
la web app risponde "autorizzazione richiesta" — cioè il sito resta senza dati.

Il trigger ha un budget di 60 min/giorno (la quota consumer è 90): superato quello salta
un'esecuzione su due invece di esaurirla e lasciare il sito scoperto fino a mezzanotte.

Controllo: **`?diag=1`** sull'endpoint restituisce esecuzioni del giorno, minuti di
trigger consumati ed età della cache in secondi.

```json
{ "giorno":"2026-08-06", "esecuzioni":112, "saltate":0,
  "minutiTrigger":9.4, "budgetMinuti":60, "cacheEtaSec":47, "triggerAttivo":true }
```

`triggerAttivo: false` a giornata avviata = il trigger non è installato.

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
