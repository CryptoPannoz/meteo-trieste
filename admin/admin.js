/* admin.js — area riservata di Vento Trieste (26 ott 2026).
   La pagina non contiene dati né chiavi: dopo "Accedi con Google" il Worker
   ventotrieste-previsioni verifica che l'account sia quello autorizzato e risponde con una
   sessione di 12 ore (tenuta in sessionStorage: chiusa la scheda, si rientra).
   Le chiavi API si scrivono qui ma non si rileggono: il Worker le cifra e mostra solo
   "impostata, finisce con …1234". */
(function () {
  "use strict";

  // Client ID OAuth di Google Cloud (progetto "Vento Trieste", client "ventotrieste-admin",
  // origini https://ventotrieste.info e http://localhost:8777, modalità test): non è un segreto.
  const GOOGLE_CLIENT_ID = "57848470199-e86uchji59hd0n7t4ocho8kq2ssjic3g.apps.googleusercontent.com";
  const locale = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API = locale ? "http://localhost:8787" : "https://ventotrieste-previsioni.bebroggi.workers.dev";
  const CHIAVE_SESSIONE = "vt-admin-sessione";

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const data = iso => iso ? new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const n1 = v => v == null ? "–" : String(Math.round(v * 10) / 10).replace(".", ",");

  let sessione = null;
  try { sessione = sessionStorage.getItem(CHIAVE_SESSIONE); } catch (e) { sessione = null; }
  function salvaSessione(t) {
    sessione = t;
    try { t ? sessionStorage.setItem(CHIAVE_SESSIONE, t) : sessionStorage.removeItem(CHIAVE_SESSIONE); } catch (e) { /* storage bloccato: resta in memoria */ }
  }

  async function chiama(percorso, corpo) {
    const r = await fetch(API + percorso, {
      method: corpo ? "POST" : "GET",
      headers: Object.assign({ "Content-Type": "application/json" }, sessione ? { Authorization: "Bearer " + sessione } : {}),
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && sessione) { salvaSessione(null); mostraAccesso("Sessione scaduta: rientra."); throw new Error("accesso richiesto"); }
    if (!r.ok) throw new Error(j.errore || "errore " + r.status);
    return j;
  }

  /* ---------------- accesso ---------------- */
  function mostraAccesso(errore) {
    $("pannello").hidden = true;
    $("accesso").hidden = false;
    $("btnEsci").hidden = $("btnAggiorna").hidden = true;
    $("chi").textContent = "Area riservata";
    $("accessoErrore").hidden = !errore;
    $("accessoErrore").textContent = errore || "";
    $("btnSviluppo").hidden = !locale;
    if (!GOOGLE_CLIENT_ID) {
      $("accessoNota").hidden = false;
      $("accessoNota").textContent = "Il login con Google non è ancora configurato (manca il Client ID OAuth).";
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => {
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: dopoGoogle, auto_select: false, ux_mode: "popup" });
      window.google.accounts.id.renderButton($("bottoneGoogle"), { theme: "filled_black", size: "large", shape: "pill", text: "signin_with", locale: "it" });
    };
    if (!document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) document.head.appendChild(s);
  }
  async function dopoGoogle(risposta) {
    try {
      const j = await chiama("/admin/accesso", { credential: risposta.credential });
      salvaSessione(j.token);
      apriPannello();
    } catch (err) {
      mostraAccesso("Accesso negato: " + err.message);
    }
  }
  $("btnSviluppo").addEventListener("click", async () => {
    try {
      const j = await chiama("/admin/accesso-sviluppo", {});
      salvaSessione(j.token);
      apriPannello();
    } catch (err) {
      mostraAccesso("Accesso di sviluppo non disponibile: " + err.message);
    }
  });
  $("btnEsci").addEventListener("click", () => {
    salvaSessione(null);
    if (window.google && window.google.accounts) window.google.accounts.id.disableAutoSelect();
    mostraAccesso();
  });
  $("btnAggiorna").addEventListener("click", () => carica());

  /* ---------------- pannello ---------------- */
  function apriPannello() {
    $("accesso").hidden = true;
    $("pannello").hidden = false;
    $("btnEsci").hidden = $("btnAggiorna").hidden = false;
    carica();
  }
  async function carica() {
    $("aggiornato").textContent = "Controllo i servizi…";
    $("btnAggiorna").disabled = true;
    try {
      const s = await chiama("/admin/stato");
      $("chi").textContent = s.email;
      disegna(s);
      $("aggiornato").textContent = "Controllato alle " + new Date(s.quando).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    } catch (err) {
      $("aggiornato").textContent = "Non riesco a leggere lo stato: " + err.message;
    } finally {
      $("btnAggiorna").disabled = false;
    }
  }
  function righe(elenco) {
    return elenco.map(x => '<li><span class="pallino e-' + esc(x.esito) + '" aria-hidden="true"></span>' +
      '<span class="nome">' + esc(x.nome) + '</span><span class="det">' + esc(x.dettaglio) + "</span></li>").join("");
  }
  const NOME_ESITO = { ok: "funziona", attenzione: "da guardare", errore: "non funziona", spento: "spento" };
  function disegna(s) {
    $("servizi").innerHTML = righe(s.servizi.map(x => Object.assign({}, x, { nome: x.nome, dettaglio: x.dettaglio + " · " + NOME_ESITO[x.esito] })));
    $("centraline").innerHTML = s.centraline.length ? righe(s.centraline) : "<li>Pacchetto dati non disponibile</li>";
    $("registro").innerHTML = "<thead><tr><th>Giorno</th><th>Media</th><th>Ore &gt; 12 kt</th><th>Raffica</th><th>Spinta</th><th></th></tr></thead><tbody>" +
      s.registro.map(g => "<tr><td>" + esc(g.giorno.slice(8) + "/" + g.giorno.slice(5, 7)) + "</td><td>" + n1(g.media) + " kt</td><td>" + n1(g.oreSopra12) +
        "</td><td>" + n1(g.raffica) + " kt</td><td>" + n1(g.spinta) + "</td><td>" + (g.surfabile ? '<span class="surf">surfabile</span>' : "") + "</td></tr>").join("") + "</tbody>";
    disegnaVisite(s.visite);
    disegnaTelegram(s);
    disegnaChiavi(s.chiavi);
    disegnaImpostazioni(s.impostazioni);
  }
  function disegnaVisite(v) {
    const box = $("visite");
    if (!v) { box.innerHTML = ""; return; }
    if (!v.configurato) {
      box.innerHTML = '<p class="nota">Aggiungi il token API di GoatCounter qui sotto per vedere le visite. ' +
        (v.pannello ? '<a href="' + esc(v.pannello) + '" target="_blank" rel="noopener">Apri GoatCounter</a>' : "") + "</p>";
      return;
    }
    if (v.errore) { box.innerHTML = '<p class="errore">' + esc(v.errore) + "</p>"; return; }
    const giorni = v.giorni || [], oggi = giorni.length ? giorni[giorni.length - 1].visite : 0;
    const max = Math.max(1, ...giorni.map(g => g.visite || 0));
    box.innerHTML = '<div class="numeri"><div class="numero"><b>' + esc(oggi) + '</b><span>oggi</span></div>' +
      '<div class="numero"><b>' + esc(v.totale7) + '</b><span>ultimi 7 giorni</span></div></div>' +
      '<div class="barrette" aria-hidden="true">' + giorni.map(g => '<i style="height:' + Math.round((g.visite || 0) / max * 100) + '%"></i>').join("") + "</div>" +
      '<a href="' + esc(v.pannello) + '" target="_blank" rel="noopener">Apri GoatCounter</a>';
  }

  /* ---------------- chiavi ---------------- */
  const AIUTO = {
    anthropic: 'Si crea su <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>; metti anche un tetto di spesa mensile.',
    telegram: "Lo dà @BotFather quando crei il bot (/newbot).",
    goatcounter: 'Su GoatCounter: Settings › API, permesso di sola lettura delle statistiche.'
  };
  function disegnaChiavi(chiavi) {
    $("chiavi").innerHTML = Object.keys(chiavi).map(nome => {
      const c = chiavi[nome], p = c.prova;
      const statoTxt = c.impostata
        ? "Impostata il " + esc(data(c.quando)) + " · finisce con …" + esc(c.fine) +
          (p ? ' · <span class="' + (p.ok ? "ok" : "ko") + '">' + (p.ok ? "✓ " : "✗ ") + esc(p.testo) + "</span>" : "")
        : "Non impostata";
      return '<div class="voce" data-chiave="' + esc(nome) + '"><div><h3>' + esc(c.nome) + '</h3><p class="stato">' + statoTxt + '</p><p class="nota">' + (AIUTO[nome] || "") + "</p></div>" +
        '<div class="riga-campo"><label class="nascosto" for="k-' + esc(nome) + '">' + esc(c.nome) + "</label>" +
        '<input class="campo" id="k-' + esc(nome) + '" type="password" autocomplete="off" spellcheck="false" placeholder="' + (c.impostata ? "Incolla per sostituire" : "Incolla qui") + '">' +
        '<button type="button" class="primario" data-azione="salva">Salva</button></div>' +
        '<div class="azioni">' + (c.impostata ? '<button type="button" class="secondario" data-azione="prova">Prova</button><button type="button" class="secondario pericolo" data-azione="cancella">Togli</button>' : "") + "</div></div>";
    }).join("");
  }
  $("chiavi").addEventListener("click", async e => {
    const b = e.target.closest("button[data-azione]");
    if (!b) return;
    const voce = b.closest("[data-chiave]"), nome = voce.dataset.chiave, campo = voce.querySelector("input");
    b.disabled = true;
    try {
      if (b.dataset.azione === "salva") {
        if (!campo.value.trim()) throw new Error("campo vuoto");
        await chiama("/admin/chiave", { nome, valore: campo.value });
        campo.value = "";
        await chiama("/admin/chiave/prova", { nome }).catch(() => null);
      } else if (b.dataset.azione === "prova") {
        await chiama("/admin/chiave/prova", { nome });
      } else if (b.dataset.azione === "cancella") {
        if (!window.confirm("Togliere questa chiave?")) { b.disabled = false; return; }
        await chiama("/admin/chiave/cancella", { nome });
      }
      await carica();
    } catch (err) {
      campo.value = "";
      alert("Non riuscito: " + err.message);
      b.disabled = false;
    }
  });

  /* ---------------- Telegram ---------------- */
  let ultimoLink = null;
  function disegnaTelegram(s) {
    const token = s.chiavi && s.chiavi.telegram && s.chiavi.telegram.impostata;
    const chat = s.telegram && s.telegram.chat;
    const servizio = s.servizi.find(x => x.id === "telegram");
    let html = '<ul class="righe">' + righe([servizio || { esito: "spento", nome: "Bot", dettaglio: "" }]) + "</ul>";
    if (!token) {
      html += '<p class="nota">Crea il bot con @BotFather e incolla il token in "Chiavi API" qui sotto.</p>';
    } else {
      html += chat
        ? "<p>Chat autorizzata: <strong>" + esc(chat.nome) + "</strong> dal " + esc(data(chat.quando)) + ".</p>"
        : '<p class="nota">Nessuna chat autorizzata: premi "Collega il bot", poi apri il link dal telefono e premi Avvia.</p>';
      if (ultimoLink) html += '<p>Apri dal telefono (valido 30 minuti):<br><a class="link-bot" href="' + esc(ultimoLink.link) + '" target="_blank" rel="noopener">' + esc(ultimoLink.link) + "</a></p>";
      html += '<div class="azioni"><button type="button" class="primario" id="btnCollega">' + (chat ? "Ricollega il bot" : "Collega il bot") + "</button>" +
        (chat ? '<button type="button" class="secondario pericolo" id="btnScollega">Dimentica la chat</button>' : "") + "</div>";
    }
    $("telegram").innerHTML = html;
    const c = $("btnCollega"), sc = $("btnScollega");
    if (c) c.addEventListener("click", async () => {
      c.disabled = true;
      try { ultimoLink = await chiama("/admin/telegram/collega", {}); await carica(); }
      catch (err) { alert("Non riuscito: " + err.message); c.disabled = false; }
    });
    if (sc) sc.addEventListener("click", async () => {
      if (!window.confirm("Il bot smetterà di rispondere a questa chat finché non la ricolleghi. Procedo?")) return;
      try { await chiama("/admin/telegram/scollega", {}); await carica(); } catch (err) { alert("Non riuscito: " + err.message); }
    });
  }

  /* ---------------- Search Console, GoatCounter ----------------
     Google Analytics no (26 ott 2026, Alberto): vorrebbe dire banner dei cookie e privacy da
     rifare; le visite le conta GoatCounter, che non usa cookie. */
  function disegnaImpostazioni(imp) {
    const voci = [
      { nome: "gsc", titolo: "Search Console · proprietà", segnaposto: "sc-domain:ventotrieste.info",
        nota: '<a href="https://search.google.com/search-console?resource_id=' + encodeURIComponent(imp.gsc || "sc-domain:ventotrieste.info") + '" target="_blank" rel="noopener">Apri Search Console</a>' },
      { nome: "goatcounterSito", titolo: "GoatCounter · nome del sito", segnaposto: "ventotrieste",
        nota: '<a href="https://' + esc(imp.goatcounterSito || "ventotrieste") + '.goatcounter.com" target="_blank" rel="noopener">Apri GoatCounter</a>' }
    ];
    $("impostazioni").innerHTML = voci.map(v =>
      '<div class="voce" data-imp="' + v.nome + '"><div><h3>' + esc(v.titolo) + '</h3><p class="nota">' + v.nota + "</p></div>" +
      '<div class="riga-campo"><label class="nascosto" for="i-' + v.nome + '">' + esc(v.titolo) + "</label>" +
      '<input class="campo" id="i-' + v.nome + '" type="text" autocomplete="off" spellcheck="false" placeholder="' + esc(v.segnaposto) + '" value="' + esc(imp[v.nome] || "") + '">' +
      '<button type="button" class="secondario" data-azione="salva-imp">Salva</button></div></div>').join("");
  }
  $("impostazioni").addEventListener("click", async e => {
    const b = e.target.closest("button[data-azione='salva-imp']");
    if (!b) return;
    const voce = b.closest("[data-imp]");
    b.disabled = true;
    try { await chiama("/admin/impostazione", { nome: voce.dataset.imp, valore: voce.querySelector("input").value }); await carica(); }
    catch (err) { alert("Non riuscito: " + err.message); b.disabled = false; }
  });

  /* ---------------- via ---------------- */
  if (sessione) apriPannello(); else mostraAccesso();
})();
