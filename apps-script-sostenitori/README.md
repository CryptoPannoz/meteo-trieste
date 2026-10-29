# Sostenitori automatici da PayPal (Google Apps Script)

Web app che legge le email PayPal **"Hai ricevuto denaro"** (da `assistenza@paypal.it`) e
restituisce i nomi di chi ha pagato, per aggiungerli da soli all'elenco "Chi sostiene il
progetto" del footer (`footer-widgets.js`, costante `SOSTENITORI_URL`).

- Script: https://script.google.com/d/1TJ07Y_BvBDK5pV1lVcgLGbtGY4M36OCe5Fk4cfDhlgNDUHSuItKm0-a5/edit
- Web app (acceso sul sito il 28 ott 2026; `@2` del 29 ott: maiuscole): https://script.google.com/macros/s/AKfycbx09_Q0STvkwW4vl2q8molo_Q--kwG2H2hwq0CfsQA69PgSIONZY0y7AH2CLaDkdP-3/exec
- Account: bebroggi@gmail.com. Progetto **separato** dal proxy dei dati (`apps-script/`):
  il proxy non ha e non deve avere accesso a Gmail.
- Gmail in **sola lettura** (`gmail.readonly`): lo script non segna, sposta né cancella email.
- Escono solo i nomi: niente importi, indirizzi email o date dei pagamenti.
- Si leggono solo le email dal **16 ott 2026** (`DAL` in `Code.js`). Chi ha donato prima è
  già nell'elenco scritto a mano in `footer-widgets.js`. Prima di fine giugno 2026, inoltre,
  le email "Hai ricevuto denaro" erano pagamenti estranei al sito.
- È **tutto automatico** (scelta di Alberto, 20 ott 2026): ogni pagamento "Hai ricevuto denaro"
  finisce tra i sostenitori, anche se non è una donazione. Per togliere un nome: editor →
  ⚙️ Impostazioni progetto → Proprietà script → `esclusi` = nomi separati da virgola.
- Gmail si rilegge al massimo ogni 15 minuti, alla prima visita che arriva dopo. Non ci sono
  trigger: il budget dei trigger del conto lo usa il proxy dei dati.

## Prima pubblicazione (una volta sola)

Dalla cartella `apps-script-sostenitori/` (ha il suo `.clasp.json`):

```bash
git pull
clasp push --force
clasp create-deployment --description "v1: sostenitori da email PayPal"
```

Poi, nell'editor dello script (link sopra): scegli la funzione **`autorizza`** → ▶ **Esegui**
→ concedi l'accesso in lettura a Gmail. Google mostra l'avviso "app non verificata": è
normale per uno script personale. Vai su Avanzate → Vai a … (non sicuro) → Consenti.
Il log mostra i nomi trovati.

L'URL della web app è `https://script.google.com/macros/s/<ID del deployment>/exec`
(`clasp list-deployments` mostra l'ID). Va scritto in `SOSTENITORI_URL` in `footer-widgets.js`.

Prova: `<URL>?diag=1` → `{ "sostenitori": [...], "emailLette": N, "errore": null }`.

## Aggiornare

```bash
git pull
clasp push --force
clasp deploy -i <ID del deployment> --description "v2: …"   # stesso URL
```
