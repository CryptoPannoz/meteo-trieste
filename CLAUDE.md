# Vento Trieste — meteo in tempo reale

Vento/bora a Trieste in tempo reale, raffiche e previsioni.
- **Repo:** github.com/CryptoPannoz/meteo-trieste
- **Dominio:** ventotrieste.info
- **Clasp:** ✅ account **bebroggi@gmail.com**. scriptId in `.clasp.json`.
- **GoatCounter:** sito `ventotrieste` (ventotrieste.goatcounter.com), senza cookie. Il token API per /admin sta nel
  Worker `ventotrieste-previsioni`, mai nei file.

## Pagine nuove: sempre GoatCounter (regola di Alberto, 14/11/2026)
Ogni pagina nuova del sito, articoli della guida compresi, prima del push ha:
1. **GoatCounter + eventi dei clic**, prima di `</body>`, come in tutte le altre pagine:
   ```html
   <!-- GoatCounter (statistiche anonime, senza cookie) + eventi dei clic (/eventi.js) -->
   <script data-goatcounter="https://ventotrieste.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
   <script src="/eventi.js?v=20261107" defer></script>
   ```
2. **Una riga in `PAGINE_NUOVE`** di `admin/admin.js` (percorso, nome, data, testo degli eventi): così Alberto la
   vede nella scheda «Pagine nuove» di /admin, con le visite e il link a GoatCounter per le provenienze.
3. Se va indicizzata: la riga in `sitemap.xml`. Se è un articolo della guida: la carta e il `BlogPosting` in
   `guida/index.html` e la riga in «Altri articoli» di tutti gli altri articoli.

GoatCounter non si configura: il percorso compare da solo alla prima visita. Una pagina che non va contata
(redirect, area riservata) ha il commento `<!-- senza-goatcounter -->`: `controlla-deploy.sh` ferma il deploy di
una pagina nuova che non ha né lo script né il commento.
---
*Workspace multi-progetto — vedi `PROJECTS.md` nella radice. GitHub: gh=CryptoPannoz. 🔒 Niente credenziali nei file.*
