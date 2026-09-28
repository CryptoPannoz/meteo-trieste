#!/usr/bin/env python3
"""Costa del campo di regata della Barcolana (Miramare -> Muggia, fino alla boa Paloma).

Stessa idea di mappa/genera-costa.py ma molto piu' zoomata: OSM natural=coastline +
dighe (man_made=breakwater) + moli lunghi (man_made=pier), proiettati nel viewBox
1000 x 842 della mappa del percorso. Output: costa.js (window.BARCOLANA_COSTA).
Costa: dati (c) OpenStreetMap contributors (ODbL).

Uso:  python3 genera-costa.py            (scarica da Overpass, cache in overpass.json)
      python3 genera-costa.py dati.json  (usa un export Overpass gia' scaricato)
"""
import json, math, os, sys, urllib.parse, urllib.request

# bbox della query (piu' larga della mappa, cosi' la catena costiera entra ed esce lontano)
QS, QW, QN, QE = 45.50, 13.40, 45.80, 13.95
# bbox della mappa: DEVE combaciare con LON0/LAT1/KX/KY in index.html
LON0, LON1, LAT0, LAT1 = 13.54, 13.80, 45.575, 45.728
KX = 1000 / (LON1 - LON0)                       # 3846.15 unita' per grado di longitudine
KY = KX / math.cos(math.radians((LAT0 + LAT1) / 2))   # stessa scala metrica in latitudine
W, H = 1000.0, round((LAT1 - LAT0) * KY)

def px(lon): return (lon - LON0) * KX
def py(lat): return (LAT1 - lat) * KY

# ---------- 1. dati OSM ----------
here = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "overpass.json")
if os.path.exists(src):
    data = json.load(open(src))
else:
    query = ('[out:json][timeout:90];('
             f'way["natural"="coastline"]({QS},{QW},{QN},{QE});'
             'way["man_made"~"breakwater|pier"](45.63,13.70,45.72,13.78););out geom;')
    req = urllib.request.Request(
        "https://overpass-api.de/api/interpreter",
        data=("data=" + urllib.parse.quote(query)).encode(),
        headers={"User-Agent": "ventotrieste-mappa/1.0 (bebroggi@gmail.com)"})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.load(r)
    json.dump(data, open(src, "w"))

coast, dighe, moli = [], [], []
for el in data["elements"]:
    if el.get("type") != "way" or "geometry" not in el:
        continue
    pts = [(nd["lon"], nd["lat"]) for nd in el["geometry"]]
    tags = el.get("tags", {})
    if tags.get("natural") == "coastline":
        coast.append(pts)
    elif tags.get("man_made") == "breakwater" and pts[0] == pts[-1] and len(pts) > 3:
        dighe.append(pts)
    elif tags.get("man_made") in ("pier", "breakwater"):
        moli.append(pts)

# ---------- 2. merge delle way costiere in catene/anelli ----------
def key(p): return (round(p[0], 7), round(p[1], 7))
chains = [list(w) for w in coast]
merged = True
while merged:
    merged = False
    out, used = [], [False] * len(chains)
    for i, a in enumerate(chains):
        if used[i]: continue
        used[i] = True
        cur, changed = list(a), True
        while changed:
            changed = False
            for j, b in enumerate(chains):
                if used[j]: continue
                if key(cur[-1]) == key(b[0]):    cur += b[1:]; used[j] = changed = merged = True
                elif key(cur[0]) == key(b[-1]):  cur = b[:-1] + cur; used[j] = changed = merged = True
        out.append(cur)
    chains = out
rings = [c for c in chains if key(c[0]) == key(c[-1]) and len(c) > 3]
opens = [c for c in chains if key(c[0]) != key(c[-1])]
print(f"anelli: {len(rings)}, catene aperte: {len(opens)}")

# ---------- 3. terraferma: catena aperta piu' lunga, chiusa lungo il bordo della query ----------
# In OSM la terra sta a SINISTRA del verso della way: dalla fine della catena si risale il
# bordo del rettangolo in senso antiorario (y verso nord) fino all'inizio.
main = max(opens, key=len)
def perim(p):
    x, y = p
    w, h = QE - QW, QN - QS
    d = [abs(y - QS), abs(x - QE), abs(y - QN), abs(x - QW)]
    lato = d.index(min(d))
    return [x - QW, w + (y - QS), w + h + (QE - x), 2 * w + h + (QN - y)][lato]
angoli = [(QE, QS), (QE, QN), (QW, QN), (QW, QS)]
t_ang = [QE - QW, (QE - QW) + (QN - QS), 2 * (QE - QW) + (QN - QS), 2 * (QE - QW) + 2 * (QN - QS)]
P = 2 * (QE - QW) + 2 * (QN - QS)
t0, t1 = perim(main[-1]), perim(main[0])
if t1 <= t0: t1 += P
# angoli del rettangolo incontrati in senso antiorario tra la fine e l'inizio della catena
lista = sorted([(ta + P * r, angoli[i]) for r in (0, 1) for i, ta in enumerate(t_ang)])
chiusura = [a for tt, a in lista if t0 < tt < t1]
mainland = main + chiusura

# ---------- 4. clip Sutherland-Hodgman sul bbox della mappa ----------
def clip(poly):
    def inside(p, e):
        return {"W": p[0] >= LON0, "E": p[0] <= LON1, "S": p[1] >= LAT0, "N": p[1] <= LAT1}[e]
    def inter(a, b, e):
        if e in ("W", "E"):
            x = LON0 if e == "W" else LON1
            t = (x - a[0]) / (b[0] - a[0]); return (x, a[1] + t * (b[1] - a[1]))
        y = LAT0 if e == "S" else LAT1
        t = (y - a[1]) / (b[1] - a[1]); return (a[0] + t * (b[0] - a[0]), y)
    for e in "WESN":
        if not poly: break
        out, prev = [], poly[-1]
        for cur in poly:
            if inside(cur, e):
                if not inside(prev, e): out.append(inter(prev, cur, e))
                out.append(cur)
            elif inside(prev, e):
                out.append(inter(prev, cur, e))
            prev = cur
        poly = out
    return poly

# ---------- 5. semplificazione Douglas-Peucker (in unita' mappa) ----------
def dp(pts, eps):
    if len(pts) < 3: return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1e-9
    imax, dmax = 0, 0
    for i in range(1, len(pts) - 1):
        d = abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / L
        if d > dmax: imax, dmax = i, d
    if dmax <= eps: return [pts[0], pts[-1]]
    return dp(pts[:imax + 1], eps)[:-1] + dp(pts[imax:], eps)

def proietta(poly): return [(px(lo), py(la)) for lo, la in poly]
def path(pts, chiudi=True):
    s = "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    return s + ("Z" if chiudi else "")

EPS = 0.45   # ~9 m: il molo Audace e le dighe restano riconoscibili
terra = [path(dp(proietta(clip(mainland)), EPS))]
for r in rings:
    c = clip(r)
    if len(c) > 3:
        s = dp(proietta(c), EPS)
        if len(s) > 3: terra.append(path(s))
d_dighe = [path(dp(proietta(clip(g)), 0.25)) for g in dighe if len(clip(g)) > 3]

def lunghezza_m(pts):
    return sum(math.hypot((b[0] - a[0]) * 111320 * math.cos(math.radians(a[1])), (b[1] - a[1]) * 110540)
               for a, b in zip(pts, pts[1:]))
d_moli = [path(proietta(m), False) for m in moli
          if lunghezza_m(m) > 90 and all(LON0 <= lo <= LON1 and LAT0 <= la <= LAT1 for lo, la in m)]

out = {"w": W, "h": H, "terra": "".join(terra), "dighe": "".join(d_dighe), "moli": "".join(d_moli)}
js = ("/* Costa del campo di regata (Barcolana): generata da genera-costa.py, non modificare a mano.\n"
      "   Dati (c) OpenStreetMap contributors (ODbL). */\n"
      "window.BARCOLANA_COSTA = " + json.dumps(out, separators=(",", ":")) + ";\n")
open(os.path.join(here, "costa.js"), "w").write(js)
print(f"viewBox 0 0 {W:.0f} {H}; terra {len(out['terra'])} car., dighe {len(d_dighe)}, moli {len(d_moli)}; costa.js {len(js)//1024} KB")
