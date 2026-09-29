#!/usr/bin/env python3
"""Base cartografica della mappa del percorso Barcolana: strade, ferrovia e zone urbane.

Completa costa.js (solo costa, dighe e moli) con la "trama" della città, come nella mappa
ufficiale del percorso: strade principali e locali, ferrovia, aree residenziali, industriali
e portuali. Stessa proiezione di genera-costa.py (viewBox 1000 x 842 sul Golfo), ma solo
nel riquadro del percorso: la pagina inquadra quello.
Output: strade.js (window.BARCOLANA_STRADE), path SVG con coordinate relative a 1 decimale.
Dati (c) OpenStreetMap contributors (ODbL).

Uso:  python3 genera-strade.py                    (scarica da Overpass, cache overpass-strade.json)
      python3 genera-strade.py a.json b.json ...   (usa export Overpass già scaricati)
Overpass risponde spesso 504/429 su query grandi: per questo le query sono separate e ritentate.
"""
import json, math, os, sys, time, urllib.parse, urllib.request

# proiezione: DEVE combaciare con genera-costa.py e con LON0/LAT1/KX/KY in index.html
LON0, LON1, LAT0, LAT1 = 13.54, 13.80, 45.575, 45.728
KX = 1000 / (LON1 - LON0)
KY = KX / math.cos(math.radians((LAT0 + LAT1) / 2))
def px(lon): return (lon - LON0) * KX
def py(lat): return (LAT1 - lat) * KY

# area utile (un po' più larga dell'inquadratura della pagina)
S, W, N, E = 45.585, 13.60, 45.73, 13.82
X0, X1, Y0, Y1 = px(W), px(E), py(N), py(S)

here = os.path.dirname(os.path.abspath(__file__))
BB = f"({S},{W},{N},{E})"
QUERY = [
    '[out:json][timeout:170];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|pedestrian)$"]' + BB + ';out geom;',
    '[out:json][timeout:170];way["highway"="service"]' + BB + ';out geom;',
    '[out:json][timeout:170];(way["railway"="rail"]' + BB + ';way["landuse"~"^(residential|industrial|commercial|retail|railway|port)$"]' + BB + ';);out geom;',
    '[out:json][timeout:170];relation["landuse"~"^(residential|industrial|commercial|retail|port)$"]' + BB + ';out geom;',
]

def scarica(q):
    for tentativo in range(5):
        try:
            req = urllib.request.Request("https://overpass-api.de/api/interpreter",
                data=("data=" + urllib.parse.quote(q)).encode(),
                headers={"User-Agent": "ventotrieste-mappa/1.0 (bebroggi@gmail.com)"})
            with urllib.request.urlopen(req, timeout=200) as r:
                return json.load(r)["elements"]
        except Exception as e:
            print("  overpass:", e, "- riprovo"); time.sleep(20)
    raise SystemExit("Overpass non risponde, riprova più tardi")

elements = []
if len(sys.argv) > 1:
    for f in sys.argv[1:]:
        elements += json.load(open(f))["elements"]
else:
    cache = os.path.join(here, "overpass-strade.json")
    if os.path.exists(cache):
        elements = json.load(open(cache))
    else:
        for q in QUERY:
            elements += scarica(q)
        json.dump(elements, open(cache, "w"))

# ---------- utilità geometriche ----------
def rdp(pts, eps):
    if len(pts) < 3: return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1e-9
    imax, dmax = 0, -1
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / L
        if d > dmax: imax, dmax = i, d
    if dmax > eps:
        return rdp(pts[:imax + 1], eps)[:-1] + rdp(pts[imax:], eps)
    return [pts[0], pts[-1]]

def rdp_anello(pts, eps):
    """anello chiuso: rdp non funziona se primo e ultimo punto coincidono,
    quindi lo spezzo nel punto più lontano dall'inizio e semplifico le due metà"""
    if len(pts) < 5: return pts
    x0, y0 = pts[0]
    k = max(range(len(pts)), key=lambda i: (pts[i][0] - x0) ** 2 + (pts[i][1] - y0) ** 2)
    return rdp(pts[:k + 1], eps)[:-1] + rdp(pts[k:], eps)

def dentro(pts):
    return any(X0 <= x <= X1 and Y0 <= y <= Y1 for x, y in pts)

def n1(v):
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    if s in ("-0", ""): return "0"
    return s.replace("-0.", "-.") if s.startswith("-0.") else (s[1:] if s.startswith("0.") else s)

def path(linee, chiuse=False):
    """M x y l dx dy ... con coordinate arrotondate a 0,1 unità (~2 m)."""
    out = []
    for pts in linee:
        q = [(round(x, 1), round(y, 1)) for x, y in pts]
        parti = ["M" + n1(q[0][0]) + " " + n1(q[0][1]), "l"]
        coppie = []
        for (xa, ya), (xb, yb) in zip(q, q[1:]):
            dx, dy = round(xb - xa, 1), round(yb - ya, 1)
            if dx == 0 and dy == 0: continue
            coppie.append(n1(dx) + ("" if n1(dy).startswith("-") else " ") + n1(dy))
        if not coppie: continue
        s = parti[0] + parti[1] + " ".join(coppie).replace(" -", "-")
        out.append(s + ("z" if chiuse else ""))
    return "".join(out)

def area(pts):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]))) / 2

def unisci(vie):
    """catene di way che si toccano -> anelli (per le relation multipoligono)"""
    k = lambda p: (round(p[0], 7), round(p[1], 7))
    catene = [list(v) for v in vie]
    cambiato = True
    while cambiato:
        cambiato = False
        for i in range(len(catene)):
            for j in range(len(catene)):
                if i == j or not catene[i] or not catene[j]: continue
                a, b = catene[i], catene[j]
                if k(a[-1]) == k(b[0]):    catene[i] = a + b[1:]; catene[j] = []; cambiato = True
                elif k(a[-1]) == k(b[-1]): catene[i] = a + b[::-1][1:]; catene[j] = []; cambiato = True
        catene = [c for c in catene if c]
    return [c for c in catene if len(c) > 3 and k(c[0]) == k(c[-1])]

# ---------- classificazione ----------
PRINCIPALI = {"motorway", "trunk", "primary", "secondary", "motorway_link", "trunk_link", "primary_link", "secondary_link"}
LOCALI = {"tertiary", "tertiary_link", "unclassified", "residential", "living_street", "pedestrian"}
visti = set()
strade1, strade2, strade3, ferrovia, urbano = [], [], [], [], []
for el in elements:
    ide = (el.get("type"), el.get("id"))
    if ide in visti: continue
    visti.add(ide)
    tags = el.get("tags", {})
    if el.get("type") == "relation":
        outer = [[(px(n["lon"]), py(n["lat"])) for n in m["geometry"]]
                 for m in el.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
        for anello in unisci(outer):
            if dentro(anello) and area(anello) > 6: urbano.append(rdp_anello(anello, 0.6))
        continue
    if "geometry" not in el: continue
    if tags.get("tunnel") in ("yes", "building_passage") or tags.get("layer", "0").startswith("-"): continue
    pts = [(px(n["lon"]), py(n["lat"])) for n in el["geometry"]]
    if not dentro(pts): continue
    hw, lu = tags.get("highway"), tags.get("landuse")
    if lu:
        if pts[0] == pts[-1] and area(pts) > 6: urbano.append(rdp_anello(pts, 0.6))
    elif tags.get("railway") == "rail":
        if tags.get("service") in ("yard", "siding", "spur"): continue
        ferrovia.append(rdp(pts, 0.4))
    elif hw in PRINCIPALI: strade1.append(rdp(pts, 0.35))
    elif hw in LOCALI:     strade2.append(rdp(pts, 0.35))
    elif hw == "service":
        if tags.get("service") in ("parking_aisle", "drive-through"): continue
        strade3.append(rdp(pts, 0.4))

out = {
    "urbano": path(urbano, chiuse=True),
    "strade3": path(strade3),
    "strade2": path(strade2),
    "strade1": path(strade1),
    "ferrovia": path(ferrovia),
}
js = ("/* Base cartografica del percorso Barcolana: strade, ferrovia e zone urbane.\n"
      "   Generato da genera-strade.py. Dati (c) OpenStreetMap contributors (ODbL). */\n"
      "window.BARCOLANA_STRADE = " + json.dumps(out, separators=(",", ":")) + ";\n")
open(os.path.join(here, "strade.js"), "w").write(js)
print({k: f"{len(v) / 1024:.0f} KB" for k, v in out.items()}, f"totale {len(js) / 1024:.0f} KB")
print(f"strade {len(strade1)}+{len(strade2)}+{len(strade3)}, ferrovia {len(ferrovia)}, urbano {len(urbano)}")
