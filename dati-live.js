/* dati-live.js — lettura del payload del proxy (Apps Script) per tutte le pagine.

   Perché esiste (29 set 2026): il proxy Apps Script ha una latenza molto irregolare
   che NON dipende dal nostro codice (la copia in cache è già pronta): la stessa
   chiamata risponde in 2 secondi o resta appesa 25-40 secondi, e ogni tanto finisce
   con una pagina HTML 404 di Google invece del JSON. Misurato: 404 dopo 39s, subito
   dopo 200 in 2s. Con una sola richiesta alla volta, il tasto "Aggiorna" (o l'apertura
   della pagina) poteva restare fermo quasi un minuto sui dati vecchi.

   Qui le richieste partono "a staffetta": la prima subito; se entro 3s non ha
   risposto ne parte una seconda, a 7s una terza. Vince la prima risposta JSON
   valida e le altre vengono annullate. Un errore (404, rete) fa partire subito la
   successiva senza aspettare. Nessun costo sulla quota: il proxy serve la copia in
   cache, non riscarica le fonti (il ritmo delle letture lo decide il trigger
   ogni 5 minuti, come da accordo con vetercek).

   Chiamate contemporanee (auto-refresh + tasto Aggiorna) condividono la stessa corsa. */
(function () {
  "use strict";
  var PROXY = "https://script.google.com/macros/s/AKfycbxev3jcFdaCa1MM8lAx56sMBWYCkoUprA7C3Q_uGyCxNEYEjgKF6P3BiDaadr4zvUTpPg/exec";
  var PARTENZE_MS = [0, 3000, 7000];    // quando parte ciascun tentativo (max 3: il proxy ha un tetto di esecuzioni contemporanee)
  var TIMEOUT_MS = 30000;               // oltre: errore, la pagina mostra la cache e riprova
  var inCorso = null;

  function payloadValido(d) {
    return !!(d && typeof d === "object" && !d.fatal && d.updated);
  }

  function corsa() {
    return new Promise(function (resolve, reject) {
      var controlli = [], timer = [], finito = false, falliti = 0, partiti = 0, ultimoErr = null;
      function chiudi() {
        finito = true;
        timer.forEach(clearTimeout);
        controlli.forEach(function (c) { try { c.abort(); } catch (e) {} });
      }
      function parti() {
        if (finito || partiti >= PARTENZE_MS.length) return;
        partiti++;
        var ac = ("AbortController" in window) ? new AbortController() : null;
        if (ac) controlli.push(ac);
        fetch(PROXY + "?ts=" + Date.now() + "-" + partiti, ac ? { signal: ac.signal } : undefined)
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
          .then(function (d) {
            if (!payloadValido(d)) throw new Error((d && d.fatal) || "payload non valido");
            if (finito) return;
            chiudi();
            resolve(d);
          })
          .catch(function (err) {
            if (finito) return;
            ultimoErr = err;
            falliti++;
            if (falliti >= PARTENZE_MS.length) { chiudi(); reject(err); return; }
            parti();   // errore rapido (404, rete): il tentativo dopo parte subito
          });
      }
      PARTENZE_MS.forEach(function (ms, i) {
        if (i === 0) parti();
        else timer.push(setTimeout(parti, ms));
      });
      timer.push(setTimeout(function () {
        if (finito) return;
        chiudi();
        reject(ultimoErr || new Error("timeout " + TIMEOUT_MS / 1000 + "s"));
      }, TIMEOUT_MS));
    });
  }

  /* minuti trascorsi da un istante (Date, ms o ISO) */
  function etaMin(t) {
    var ms = (t instanceof Date) ? t.getTime() : (typeof t === "number" ? t : Date.parse(t));
    return isNaN(ms) ? null : Math.max(0, Math.round((Date.now() - ms) / 60000));
  }

  window.VTDati = {
    PROXY: PROXY,
    fetch: function () {
      if (!inCorso) {
        inCorso = corsa();
        inCorso.then(function () { inCorso = null; }, function () { inCorso = null; });
      }
      return inCorso;
    },
    etaMin: etaMin,
    /* "adesso" / "3 min fa" / "2 h fa" (lang "en": "just now" / "3 min ago") */
    etaTesto: function (t, lang) {
      var m = etaMin(t);
      if (m == null) return "";
      var en = lang === "en";
      if (m < 1) return en ? "just now" : "adesso";
      if (m < 90) return m + (en ? " min ago" : " min fa");
      return Math.round(m / 60) + (en ? " h ago" : " h fa");
    }
  };
})();
