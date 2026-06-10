# Meteo Trieste Proxy (Google Apps Script)

Web app che legge i dati delle centraline **Monte Grisa** e **Muggia** da
[vetercek.com](https://vetercek.com) e li espone come JSON per `index.html`
(le pagine vetercek non mandano header CORS, quindi il browser non può leggerle direttamente).

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
  "monteGrisa": [{ "ora": "10:49", "direzione": "ENE", "kt": "10.0", "sunki": "13.0", "temp": "21.6" }],
  "muggia":     [{ "ora": "10:30", "direzione": "E",   "kt": "13.2", "sunki": "16.9", "temp": "-" }],
  "updated": "2026-06-10T08:55:00.000Z"
}
```

(`sunki` = raffica, nome ereditato dalle colonne di vetercek.com)
