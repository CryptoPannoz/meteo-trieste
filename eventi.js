/* eventi.js — clic importanti contati come "eventi" in GoatCounter (30 set 2026).

   Stesso strumento delle visite: niente cookie, niente dati personali, solo contatori
   per nome. Un solo ascoltatore dei clic per tutto il sito (fase di cattura: arriva
   anche quando altri gestori fermano la propagazione, come il tasto "Altro" del menu
   in basso o le centraline della mappa). Nel pannello GoatCounter gli eventi sono
   nella sezione "Events" e hanno la forma "categoria: dettaglio":

     aggiorna: <pagina>            tasto Aggiorna
     esce: <sito>                  link verso altri siti (titolo = indirizzo completo)
     email                         link mailto
     richiesta modifica: <tipo>    modulo "Richiedi una modifica" nel piede
     birra: apri | copia bitcoin   sostegno al progetto (Revolut/PayPal = "esce: ...")
     popup barcolana: apri|chiudi  popup in basso della home
     tema: chiaro|scuro · lingua: it|en · menu: apri · dock: <voce>
     apri sezione: <id>            gruppi a scomparsa (es. "istria")
     guida: <spot o bora> · webcam: aggiorna | play
     barcolana vento: live|prev · barcolana previsione: <ora> · barcolana lato: <n>
     barcolana centralina: <nome> · barcolana classifiche: <anno> · condividi: whatsapp|copia link
     registro: scarica csv | cambia giorno | mostra tutto | centralina <id>   (/registro/ e Barcolana; titolo = pagina)
     registro: giorno dal grafico | grafico mese|sett   grafico dei giorni ventosi (/registro/)

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

  document.addEventListener("submit", function (ev) {
    var f = ev.target;
    if (!f || f.id !== "footerRequestForm") return;
    var tipo = document.getElementById("footerRequestType");
    var msg = document.getElementById("footerRequestText");
    if (msg && !msg.value.trim()) return;                // modulo vuoto: non parte nulla
    conta("richiesta modifica: " + (tipo ? tipo.value : "?"));
  }, true);
})();
