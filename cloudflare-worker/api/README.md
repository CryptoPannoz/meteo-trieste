# ventotrieste-api (Cloudflare Worker)

API JSON per i partner. Primo cliente: **RAI**, grafica della diretta della
**Barcolana 58** (11 ottobre 2026), polling ogni 5 secondi dal loro sistema di playout.

Accordo (WhatsApp con Federico, 7 ott 2026): niente credito in grafica (compliance RAI),
i commentatori dello streaming dicono che i dati sono forniti da **vento.barcolana.it, progetto
di Alberto Broggi** (redirect a `ventotrieste.info/barcolana2026/`). La frase è nel campo `credito`.

## Fonti

Solo stazioni della **Protezione Civile della Regione FVG** (API pubblica `monitor.protezionecivile.fvg.it`,
licenza CC BY 4.0), le uniche che possiamo ridistribuire. Dicitura obbligatoria (ARPA FVG,
1 ott 2026), nel campo `fonte`: "Fonte: Protezione Civile della Regione Friuli Venezia Giulia",
licenza e "dati elaborati". Non chiamarli "OSMER".

| stazione | id PC FVG | note |
|---|---|---|
| Trieste molo | 212 | misura del villaggio |
| Muggia | 500 | "Muggia S+M", a livello del mare |
| Boa Paloma | 574 | in mezzo al Golfo, a ovest delle boe 1 e 2 |

Fuori di proposito: **vetercek** (accordo con Jaka valido solo per il sito) e
**Windguru/Barcola** (offline dal 2 ott 2026, e comunque non nostra).

Pubblicano ogni 15 minuti con 3-20 minuti di ritardo. Il cron le rilegge ogni 5 minuti.
Una stazione con più di 40 minuti non entra nei calcoli; se non ne resta nessuna i punti
hanno `"disponibile": false` e i valori a `null`.

## Endpoint

- `GET /v1/barcolana?key=CHIAVE` (oppure header `X-Api-Key: CHIAVE`): i punti e le stazioni.
- `GET /v1/stato`: età in minuti dei dati di ogni stazione. Senza chiave, senza valori.
  Da guardare la domenica mattina.

URL: `https://ventotrieste-api.bebroggi.workers.dev`

## Punti

| id | tipo | come |
|---|---|---|
| `partenza` | stima | centro della linea P1 – P/4 |
| `boa1`, `boa2` | stima | posizioni dalla mappa ufficiale (come in `/barcolana2026/`) |
| `arrivo` | stima | centro della linea A1 – A |
| `villaggio` | misura | stazione Trieste molo |

Stima = media pesata 1/d² delle stazioni fresche (stessa formula della pagina
`/barcolana2026/`); la direzione è una media vettoriale. `fonti` elenca le stazioni che
pesano più del 15%. `ora_misura` di una stima è la più vecchia tra le misure usate.

Campi di ogni punto: `nome`, `tipo` (`misura`/`stima`), `disponibile`, `vento_kt`,
`raffica_kt`, `vento_kmh`, `raffica_kmh`, `direzione_gradi` (da dove viene il vento),
`direzione` (16 settori, N, NNE…), `ora_misura` (ISO, UTC), `ora_misura_locale` (HH:MM,
ora italiana), `eta_min`, `fonti`, `lat`, `lon`.

## Chiavi

Le chiavi stanno nel secret `CHIAVI` del Worker, separate da virgola. Per revocarne una
si rimette il secret senza quella chiave. La chiave RAI è in `.auth/rai-api-key.txt`
(fuori da git). In locale: file `.dev.vars` con `CHIAVI=prova-locale` (fuori da git).

## Deploy

```bash
cd cloudflare-worker/api
npx wrangler login                                       # una volta, account bebroggi@gmail.com
npx wrangler deploy
npx wrangler secret put CHIAVI < ../../.auth/rai-api-key.txt
```

Prova in locale: `npx wrangler dev --local --test-scheduled`, poi
`curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"` per far partire il cron e
`curl "http://localhost:8787/v1/barcolana?key=prova-locale"`.

## Costi

Piano gratuito. Il polling a 5s fa ~17.300 richieste al giorno (limite: 100.000 al giorno
su tutto l'account, insieme al sito). La lettura di KV resta in memoria 30 secondi, quindi
il polling non consuma la quota KV. Il cron scrive solo quando un dato cambia: al massimo
~190 scritture al giorno, che con le ~620 di `ventotrieste-dati` restano sotto le 1000
giornaliere del piano gratuito (limite per account).
