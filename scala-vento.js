/* scala-vento.js — i colori del vento, uguali in tutto il sito (5 nov 2026).
   Alberto: stessi colori delle tabelle di previsione che i surfisti guardano già, così chi legge
   la mappa o il surfometro li riconosce al volo: bianco = niente, azzurro = arietta,
   verde = si esce, giallo-arancio = tanto, rosso = forte, fucsia = fortissimo.
   Colori presi cella per cella da una tabella di previsione del 5 nov (vento medio e raffiche
   da 2 a 38 kt); oltre i 38 kt la scala prosegue verso il viola.
   Li usano la mappa delle centraline (mappa-golfo.js) e il surfometro di tutte le pagine spot.
   La barra del surfometro e il caricamento con il logo hanno gli stessi colori scritti a mano in
   footer-widgets.css (variabile --vt-scala-vento): se cambia qualcosa qui, va cambiata anche lì. */
(function () {
  var PUNTI = [
    [0, "#ffffff"], [5, "#ffffff"], [7, "#b5f8f5"], [8.5, "#abf6f4"], [10, "#87f5c9"],
    [11, "#7cf78a"], [12, "#76f95f"], [13.5, "#75fb4c"], [15, "#80f74b"], [16, "#95f54b"],
    [17, "#c4f24d"], [18, "#dff14e"], [19, "#fced4f"], [20, "#f8d548"], [21, "#f3b341"],
    [22, "#ef8f3a"], [23, "#ed7538"], [24, "#ec5a38"], [25, "#eb4640"], [26, "#eb4449"],
    [28, "#ea3c7a"], [29, "#ea3a8e"], [31, "#ea36b6"], [32.5, "#ea35cb"], [34, "#ea34d8"],
    [36, "#ea34e7"], [38, "#ea33f4"], [45, "#b23cf6"], [55, "#7d3cf0"]
  ];
  function rgb(hex) { return [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); }); }
  function esa(c) { return "#" + c.map(function (v) { return ("0" + Math.round(v).toString(16)).slice(-2); }).join(""); }

  /* colore del vento in nodi, sfumato tra un punto e l'altro come nelle tabelle di previsione */
  function colore(kt) {
    kt = parseFloat(kt);
    if (isNaN(kt) || kt <= PUNTI[0][0]) return PUNTI[0][1];
    for (var i = 1; i < PUNTI.length; i++) {
      if (kt <= PUNTI[i][0]) {
        var a = PUNTI[i - 1], b = PUNTI[i], t = (kt - a[0]) / (b[0] - a[0]);
        var ca = rgb(a[1]), cb = rgb(b[1]);
        return esa(ca.map(function (v, j) { return v + (cb[j] - v) * t; }));
      }
    }
    return PUNTI[PUNTI.length - 1][1];
  }

  /* lo stesso colore, abbastanza scuro da leggersi come testo su fondo chiaro
     (luminosità al 34%, la tinta resta): il bianco diventa grigio, l'azzurro verde acqua */
  function scuro(kt) {
    var c = rgb(colore(kt)).map(function (v) { return v / 255; });
    var max = Math.max.apply(null, c), min = Math.min.apply(null, c), l = (max + min) / 2;
    if (l <= 0.34) return colore(kt);
    var d = max - min, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0, h = 0;
    if (d) {
      if (max === c[0]) h = ((c[1] - c[2]) / d) % 6;
      else if (max === c[1]) h = (c[2] - c[0]) / d + 2;
      else h = (c[0] - c[1]) / d + 4;
    }
    h *= 60; if (h < 0) h += 360;
    l = 0.34; s = Math.min(s, 0.9);
    var k = (1 - Math.abs(2 * l - 1)) * s, x = k * (1 - Math.abs((h / 60) % 2 - 1)), m = l - k / 2;
    var p = h < 60 ? [k, x, 0] : h < 120 ? [x, k, 0] : h < 180 ? [0, k, x] : h < 240 ? [0, x, k] : h < 300 ? [x, 0, k] : [k, 0, x];
    return esa(p.map(function (v) { return (v + m) * 255; }));
  }

  /* sfumatura CSS da 0 a maxKt nodi (per la legenda della mappa) */
  function gradiente(maxKt) {
    var parti = [];
    PUNTI.forEach(function (p) { if (p[0] <= maxKt) parti.push(p[1] + " " + (p[0] / maxKt * 100).toFixed(1) + "%"); });
    parti.push(colore(maxKt) + " 100%");
    return "linear-gradient(90deg," + parti.join(",") + ")";
  }

  window.VTScala = { colore: colore, scuro: scuro, gradiente: gradiente, punti: PUNTI };
})();
