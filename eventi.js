/* eventi.js — clic importanti contati come "eventi" in GoatCounter (30 set 2026).

   Stesso strumento delle visite: niente cookie, niente dati personali, solo contatori
   per nome. Un solo ascoltatore dei clic per tutto il sito (fase di cattura: arriva
   anche quando altri gestori fermano la propagazione, come il tasto "Altro" del menu
   in basso o le centraline della mappa). Nel pannello GoatCounter gli eventi sono
   nella sezione "Events" e hanno la forma "categoria: dettaglio":

     aggiorna: <pagina>            tasto Aggiorna
     esce: <sito>                  link verso altri siti (titolo = indirizzo completo)
     email                         link mailto
     birra: apri | copia bitcoin   sostegno al progetto (Revolut/PayPal = "esce: ...")
     popup barcolana: apri|chiudi  popup in basso della home
     tema: chiaro|scuro · lingua: it|en · menu: apri · dock: <voce>
     apri sezione: <id>            gruppi a scomparsa (es. "istria")
     guida: <spot o bora> · webcam: aggiorna | play
     barcolana vento: live|prev · barcolana previsione: <ora> · barcolana lato: <n>
     barcolana centralina: <nome> · barcolana classifiche: <anno> · condividi: whatsapp|copia link|copia url (firma, vt-app.js)
     registro: scarica csv | cambia giorno | mostra tutto | centralina <id>   (/registro/ e Barcolana; titolo = pagina)
     registro: giorno dal grafico | grafico mese|sett   grafico dei giorni ventosi (/registro/)
     versione: passa a lite|pro    interruttore Lite · Pro della home (footer-widgets.js)
     giorno:sessione-N · giorno:nuova-persona · giorno:lite|pro   persone e sessioni (sotto)

   GoatCounter invia con sendBeacon: il conteggio arriva anche se il clic cambia pagina.
   Su localhost GoatCounter non conta nulla (è normale). Per contare altro da una pagina:
   window.vtConta("nome evento"). */
(function () {
  "use strict";
  var pagina = location.pathname.replace(/^\/+|\/+$/g, "") || "home";
  var ultimo = {}, coda = [], attesa = null;

  function pronto() { return !!(window.goatcounter && typeof window.goatcounter.count === "function"); }
  function invia(d) { try { window.goatcounter.count(d); } catch (e) {} }

  function conta(nome, titolo) {
    var ora = Date.now();
    if (ultimo[nome] && ora - ultimo[nome] < 1500) return;   // doppio clic: un evento solo
    ultimo[nome] = ora;
    var d = { path: nome, title: titolo || pagina, event: true };
    if (pronto()) { invia(d); return; }
    // count.js (asincrono) non ancora arrivato: tengo l'evento finché carica, al massimo 15 s
    coda.push(d);
    if (attesa) return;
    var giri = 0;
    attesa = setInterval(function () {
      if (pronto()) { coda.splice(0).forEach(invia); }
      else if (++giri < 30) return;
      clearInterval(attesa); attesa = null; coda = [];
    }, 500);
  }
  window.vtConta = conta;

  function testo(el) { return (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60); }
  function lingua() { return document.documentElement.getAttribute("data-lang") || "it"; }
  // testo visibile nella lingua della pagina (Barcolana ha span .l-it / .l-en)
  function testoVisibile(el) {
    var s = el.querySelector(".l-" + lingua());
    return testo(s || el);
  }

  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var el;

    sessione();
    // ---- pagina Barcolana ----
    if ((el = t.closest("[data-modo]"))) return conta("barcolana vento: " + el.getAttribute("data-modo"));
    if ((el = t.closest("#prevOre button"))) return conta("barcolana previsione: " + testo(el));
    if ((el = t.closest("#clAnni button"))) return conta("barcolana classifiche: " + testo(el));
    if ((el = t.closest(".bc-staz-g"))) return conta("barcolana centralina: " + String(el.getAttribute("aria-label") || "").split(":")[0]);
    if ((el = t.closest("[data-lato]"))) return conta("barcolana lato: " + el.getAttribute("data-lato"));
    if (t.closest("#shareWa")) return conta("condividi: whatsapp");
    if (t.closest("#shareCopy")) return conta("condividi: copia link");
    if ((el = t.closest("[data-lang-btn]"))) return conta("lingua: " + el.getAttribute("data-lang-btn"));
    if (t.closest("#regCsv")) return conta("registro: scarica csv");
    if (t.closest("#regPrima, #regDopo, #regOggi")) return conta("registro: cambia giorno");
    if (t.closest("#regTutto")) return conta("registro: mostra tutto");
    if ((el = t.closest("[data-rv-serie]"))) return conta("registro: centralina " + el.getAttribute("data-rv-serie"));
    if (t.closest("[data-rv-giorno]")) return conta("registro: giorno dal grafico");
    if ((el = t.closest("[data-rv-tipo]"))) return conta("registro: grafico " + el.getAttribute("data-rv-tipo"));

    // ---- comuni a tutte le pagine ----
    if (t.closest("#btnAggiorna, #bcAggiorna")) return conta("aggiorna: " + pagina);
    if (t.closest("#bc58X")) return conta("popup barcolana: chiudi");
    if (t.closest("#bc58Pop .bc58-link")) return conta("popup barcolana: apri");
    if (t.closest("[onclick*='copiaBtc']")) return conta("birra: copia bitcoin");
    if (t.closest("#footerSupportButton, .topnav-birra, [onclick*='apriBirra'], .support-primary")) return conta("birra: apri");
    if ((el = t.closest("[onclick*='apriGuida']"))) {
      // apriGuida('grado') per gli spot, apriGuidaBora() per la Bora
      var g = String(el.getAttribute("onclick")).match(/apriGuida(\w*)\(\s*['"]?([^'")]*)/);
      return conta("guida: " + (g ? (g[2] || g[1]).toLowerCase() : pagina));
    }
    if (t.closest("[onclick*='aggiornaWebcam']")) return conta("webcam: aggiorna");
    if (t.closest(".cam-play")) return conta("webcam: play");
    if ((el = t.closest(".ux-mobile-dock a, .ux-mobile-dock button"))) {
      var v = el.querySelector(".ux-dock-label");
      return conta("dock: " + testo(v || el));
    }
    if ((el = t.closest("#menuToggle"))) {
      if (el.getAttribute("aria-expanded") !== "true") conta("menu: apri");
      return;
    }
    if (t.closest("#themeToggle")) {
      // il tema cambia dopo questo clic: lo leggo appena applicato
      setTimeout(function () { conta("tema: " + (document.documentElement.getAttribute("data-theme") === "light" ? "chiaro" : "scuro")); }, 0);
      return;
    }
    if ((el = t.closest("details > summary"))) {
      var det = el.parentElement;
      // nome stabile: id o prima classe (il testo di alcuni titoli contiene l'orario)
      var nomeSez = det.id || String(det.className || "").trim().split(/\s+/)[0];
      if (!det.open && nomeSez) conta("apri sezione: " + nomeSez);
      // un summary può contenere link: si prosegue con i controlli sotto
    }

    // ---- link ----
    if ((el = t.closest("a[href]"))) {
      var href = el.getAttribute("href") || "";
      if (/^mailto:/i.test(href)) return conta("email");
      if (/^https?:\/\//i.test(href) && el.hostname && el.hostname !== location.hostname &&
          !/(^|\.)ventotrieste\.info$/i.test(el.hostname)) {
        return conta("esce: " + el.hostname.replace(/^www\./i, ""), href.slice(0, 200));
      }
    }
  }, true);

  /* Persone e sessioni (28 ott 2026). Alberto: "ho bisogno di sapere quante persone guardano il sito
     al giorno e quante sessioni fa ognuna". GoatCounter conta visitatori senza cookie: per lui una
     visita è stesso indirizzo IP e stesso browser per qualche ora, quindi non vede chi torna dopo
     pranzo e conta due volte chi passa dal wifi al 4G. Qui il browser tiene in localStorage solo il
     giorno, quante sessioni ha fatto oggi e l'ora dell'ultima attività (nessun codice che lo
     identifichi) e a ogni sessione nuova manda UN evento con il numero d'ordine:
       giorno:sessione-1 … giorno:sessione-10   la 10 vale "dalla decima in poi" e parte una volta
       giorno:nuova-persona                     prima volta su ventotrieste.info da questo browser
       giorno:lite · giorno:pro                 versione usata oggi in home, una volta ciascuna
     Visitatori di giorno:sessione-1 = persone del giorno; somma di tutte le giorno:sessione-N =
     sessioni del giorno; giorno:sessione-N meno giorno:sessione-(N+1) = chi ne ha fatte N.
     Sessione nuova = più di 30 minuti senza attività, o un giorno nuovo (ora di Roma). Nomi senza
     spazi né virgole: l'API di GoatCounter cerca gli eventi per nome e li separa proprio lì.
     /admin li legge da GoatCounter (vento-previsioni, src/visite.js). Con lo storage bloccato
     (navigazione privata) non si conta niente: meglio un buco che persone contate due volte. */
  var CHIAVE_VISITE = "vt-visite", PAUSA = 30 * 60000, MAX_SESSIONI = 10;
  var ultimaSessione = 0;
  function oggiRoma() { return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }); }
  function sessione() {
    var ora = Date.now();
    if (ora - ultimaSessione < 60000) return;   // al più un controllo al minuto (clic, visibilità, timer)
    ultimaSessione = ora;
    var s, nuovaPersona = false, eventi = [];
    try {
      s = JSON.parse(localStorage.getItem(CHIAVE_VISITE) || "null");
      // chi ha già altre voci del sito (tema, cache dei dati…) c'era prima di questo contatore; non
      // contano le due che footer-widgets.js scrive subito arrivando da un link ?lite
      if (!s) nuovaPersona = !Object.keys(localStorage).some(function (k) { return !/^(vento-trieste-modo|vt-lite-provata)$/.test(k); });
    } catch (e) { return; }
    var giorno = oggiRoma();
    if (!s || typeof s !== "object") s = { g: giorno, n: 0, u: 0, v: "" };
    if (s.g !== giorno) { s.g = giorno; s.n = 0; s.v = ""; }
    if (!s.n || ora - s.u > PAUSA) {
      s.n++;
      if (s.n <= MAX_SESSIONI) eventi.push("giorno:sessione-" + s.n);
    }
    if (nuovaPersona) eventi.push("giorno:nuova-persona");
    // versione della home (html.vt-modi): Lite o Pro, una volta al giorno ciascuna
    var doc = document.documentElement;
    if (doc.classList.contains("vt-modi")) {
      var versione = doc.classList.contains("vt-lite") ? "lite" : "pro";
      if ((s.v || "").split(",").indexOf(versione) < 0) {
        s.v = (s.v ? s.v + "," : "") + versione;
        eventi.push("giorno:" + versione);
      }
    }
    s.u = ora;
    try { localStorage.setItem(CHIAVE_VISITE, JSON.stringify(s)); } catch (e) { return; }   // non salvato: si conterebbe due volte
    eventi.forEach(function (nome) { conta(nome); });
  }
  // dopo il cambio Lite ↔ Pro (footer-widgets.js) la nuova versione va contata subito
  window.vtSessione = function () { ultimaSessione = 0; sessione(); };
  sessione();
  // tornando sulla pagina si controlla subito; andando via si segna l'ora dell'ultima attività
  document.addEventListener("visibilitychange", function () { ultimaSessione = 0; sessione(); });
  // pagina aperta e guardata senza toccarla (il vento si aggiorna da solo): resta la stessa sessione
  setInterval(function () { if (!document.hidden) sessione(); }, 5 * 60000);

})();
