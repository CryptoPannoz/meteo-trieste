#!/usr/bin/env python3
"""Genera il path SVG della costa reale (OSM natural=coastline) per la mappa vento.

Output: terra.txt con la stringa `d` (subpath multipli) già proiettata
nelle coordinate della mappa (viewBox 762x1000).
"""
import json, math, sys, urllib.request

# bbox di query (più larga della mappa, per chiudere bene i bordi)
QS, QW, QN, QE = 44.55, 12.90, 46.05, 14.80
# bbox della mappa (deve combaciare con la proiezione nel HTML)
LON0, LON1, LAT0, LAT1 = 13.15, 14.45, 44.70, 45.90
KX, KY = 586.2, 833.33

def px(lon): return (lon - LON0) * KX
def py(lat): return (LAT1 - lat) * KY

# ---------- 1. Overpass ----------
import os
cache = sys.path[0] + "/overpass.json"
if os.path.exists(cache):
    data = json.load(open(cache))
else:
    query = f'[out:json][timeout:120];way["natural"="coastline"]({QS},{QW},{QN},{QE});out geom;'
    req = urllib.request.Request(
        "https://overpass-api.de/api/interpreter",
        data=("data=" + urllib.parse.quote(query)).encode(),
        headers={"User-Agent": "ventotrieste-mappa/1.0 (bebroggi@gmail.com)"})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.load(r)
    json.dump(data, open(cache, "w"))
ways = [[(nd["lon"], nd["lat"]) for nd in el["geometry"]]
        for el in data["elements"] if el["type"] == "way" and "geometry" in el]
print(f"ways: {len(ways)}, punti totali: {sum(len(w) for w in ways)}")

# ---------- 2. merge delle way in catene/anelli (per estremi coincidenti) ----------
def key(p): return (round(p[0], 7), round(p[1], 7))
chains = [list(w) for w in ways]
merged = True
while merged:
    merged = False
    out = []
    used = [False] * len(chains)
    for i, a in enumerate(chains):
        if used[i]: continue
        used[i] = True
        cur = list(a)
        changed = True
        while changed:
            changed = False
            for j, b in enumerate(chains):
                if used[j]: continue
                if key(cur[-1]) == key(b[0]):    cur += b[1:];              used[j] = True; changed = merged = True
                elif key(cur[-1]) == key(b[-1]): cur += list(reversed(b))[1:]; used[j] = True; changed = merged = True
                elif key(cur[0]) == key(b[-1]):  cur = b[:-1] + cur;        used[j] = True; changed = merged = True
                elif key(cur[0]) == key(b[0]):   cur = list(reversed(b))[:-1] + cur; used[j] = True; changed = merged = True
        out.append(cur)
    chains = out
rings  = [c for c in chains if key(c[0]) == key(c[-1]) and len(c) > 3]
opens  = [c for c in chains if key(c[0]) != key(c[-1])]
print(f"anelli (isole): {len(rings)}, catene aperte: {len(opens)}")
for c in opens:
    print("  aperta:", len(c), "pt, da", c[0], "a", c[-1])

# ---------- 3. terraferma: catena aperta più lunga + chiusura lato terra ----------
main = max(opens, key=len)
# orientala ovest -> est
if main[0][0] > main[-1][0]:
    main.reverse()
# chiusura larga fuori bbox: est -> angolo NE -> angolo NW -> ovest
mainland = main + [(QE + 0.2, main[-1][1]), (QE + 0.2, QN + 0.2), (QW - 0.2, QN + 0.2), (QW - 0.2, main[0][1])]

# ---------- 4. clip Sutherland–Hodgman sul bbox della mappa ----------
def clip(poly):
    def inside(p, edge):
        if edge == "W": return p[0] >= LON0
        if edge == "E": return p[0] <= LON1
        if edge == "S": return p[1] >= LAT0
        return p[1] <= LAT1
    def inter(a, b, edge):
        if edge in "WE":
            x = LON0 if edge == "W" else LON1
            t = (x - a[0]) / (b[0] - a[0])
            return (x, a[1] + t * (b[1] - a[1]))
        y = LAT0 if edge == "S" else LAT1
        t = (y - a[1]) / (b[1] - a[1])
        return (a[0] + t * (b[0] - a[0]), y)
    for edge in "WESN":
        if not poly: return []
        out = []
        for i in range(len(poly)):
            a, b = poly[i - 1], poly[i]
            if inside(b, edge):
                if not inside(a, edge): out.append(inter(a, b, edge))
                out.append(b)
            elif inside(a, edge):
                out.append(inter(a, b, edge))
        poly = out
    return poly

# ---------- 5. Douglas–Peucker ----------
def dp(pts, tol):
    if len(pts) < 3: return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i0, i1 = stack.pop()
        ax, ay = pts[i0]; bx, by = pts[i1]
        dx, dy = bx - ax, by - ay
        den = math.hypot(dx, dy) or 1e-12
        dmax, imax = 0, -1
        for i in range(i0 + 1, i1):
            d = abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / den
            if d > dmax: dmax, imax = d, i
        if dmax > tol:
            keep[imax] = True
            stack.append((i0, imax)); stack.append((imax, i1))
    return [p for p, k in zip(pts, keep) if k]

def dp_ring(pts, tol):
    """DP per poligoni chiusi: con primo==ultimo gli ancoraggi coincidono e
    collasserebbe tutto a 2 punti; si semplifica in due metà separate."""
    if key(pts[0]) == key(pts[-1]): pts = pts[:-1]
    if len(pts) < 6: return pts
    m = len(pts) // 2
    a = dp(pts[:m + 1], tol)
    b = dp(pts[m:] + [pts[0]], tol)
    return a[:-1] + b[:-1]

def area(poly):
    s = 0
    for i in range(len(poly)):
        x0, y0 = poly[i - 1]; x1, y1 = poly[i]
        s += x0 * y1 - x1 * y0
    return abs(s) / 2

TOL = 0.00045          # ~40 m: buon compromesso dettaglio/peso
MIN_AREA = 4e-6        # scarta solo gli scogli più piccoli (< ~0,03 km²)

polys = []
land = clip(mainland)
land = dp(land, TOL)
polys.append(land)
print(f"terraferma: {len(land)} punti dopo semplificazione")

kept = 0
# anelli chiusi + catene aperte (isole tagliate dal bbox di query: Cres, Krk…)
candidati = rings + [c for c in opens if c is not main]
for r in sorted(candidati, key=len, reverse=True):
    c = clip(r)
    if len(c) < 4 or area(c) < MIN_AREA: continue
    c = dp_ring(c, TOL)
    if len(c) < 4: continue
    cx = sum(p[0] for p in c) / len(c); cy = sum(p[1] for p in c) / len(c)
    print(f"  isola: {len(c):4d} pt, centro ({cx:.3f},{cy:.3f})")
    polys.append(c); kept += 1
print(f"isole tenute: {kept}")

# ---------- 6. stringa path proiettata ----------
def d_str(poly):
    pts = [f"{px(lon):.1f} {py(lat):.1f}" for lon, lat in poly]
    return "M" + "L".join(pts) + "Z"

d = "".join(d_str(p) for p in polys)
open(sys.path[0] + "/terra.txt", "w").write(d)
print(f"path totale: {len(d)} caratteri ({len(d)/1024:.1f} KB)")
