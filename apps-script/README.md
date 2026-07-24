# Meteo Trieste Proxy (Google Apps Script)

Web app che espone come JSON per `index.html`:
- centraline (**Trieste molo**, **Monte Grisa**, **Muggia**, Istria…) da [vetercek.com](https://vetercek.com)
  (le pagine vetercek non mandano header CORS, quindi il browser non può leggerle direttamente).
  Da lug 2026 i **valori correnti** arrivano dal feed API ufficiale `xml/podatki.php`
  (accordo con Jaka: **mai più spesso di 5 min** → `DATI_CACHE_TTL = 300`); le pagine
  HTML `/danes/` servono solo per lo storico (tabella + trend). Il feed dà anche le
  coordinate delle stazioni, esposte nel payload come `gps`.
- stazione **Terrapieno di Barcola** da Windguru (stazione 5307; l'API `iapi.php`
  accetta solo richieste con Referer windguru.cz, che il browser non può impostare)

- Script: https://script.google.com/d/1P_ijzBLUXFrW1xc_bZ0n9fEXjBQhYPh44_Z9xnzRf2FYsY4aSjVeZG2S/edit
- Account: bebroggi@gmail.com
- Endpoint usato dalla pagina: deployment `@1` (URL in `index.html`, costante `PROXY`)

## Modificare e rideployare

```bash
cx push            # carica il codice
cx deploy -d "v2"  # crea un nuovo deployment versionato
```

⚠️ Un nuovo deployment ha un **nuovo URL**: aggiornare la costante `PROXY` in `index.html`.

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
