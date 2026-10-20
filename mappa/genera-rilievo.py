#!/usr/bin/env python3
"""Genera il rilievo (ombreggiatura + tinta altimetrica) della terraferma per la mappa vento.

Alberto (20 ott 2026): "serve qualcosa di più terrain reale" sulla mappa da mobile. La mappa
resta un SVG disegnato a mano (mappa-golfo.js): qui si prepara solo un'immagine da mettere
sotto la terra, ritagliata nell'SVG sulla costa OSM (path TERRA). Il mare non serve: dove
la quota è <= 0 il colore è quello piatto della pianura, tanto l'SVG lo copre.

Output (nella cartella di questo script):
  rilievo.webp        mappa intera, 2 px per unità → 1524×2000 px (viewBox 0 0 762 1000)
  rilievo-golfo.webp  dettaglio del Golfo per lo zoom, 4 px per unità, riquadro in unità
                      mappa x 90→450, y 30→340 → 1440×1240 px

Proiezione (deve combaciare con mappa-golfo.js e genera-costa.py), equirettangolare:
  x = (lon − 13.15) × 586.2      y = (45.90 − lat) × 833.33

Dati: AWS Terrain Tiles, formato terrarium (open data, Registry of Open Data on AWS):
  https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
  quota (m) = R×256 + G + B/256 − 32768. z11 per la mappa intera, z12 per il Golfo.
  Le tile si scaricano una volta in ~/.cache/ventotrieste-rilievo (fuori dal repo).
  Attribuzione: vedi ATTRIBUZIONE qui sotto (va riportata accanto alla mappa).

Rigenerare (numpy e Pillow non ci sono nel python di sistema):
  python3 -m venv /tmp/venv-rilievo
  /tmp/venv-rilievo/bin/pip install numpy pillow
  /tmp/venv-rilievo/bin/python mappa/genera-rilievo.py            # immagini
  /tmp/venv-rilievo/bin/python mappa/genera-rilievo.py --anteprima DIR
      # in più: DIR/anteprima-*.png con la costa TERRA di mappa-golfo.js disegnata sopra,
      # per controllare che raster e costa combacino
"""
import io, math, os, re, sys, time, urllib.request
import numpy as np
from PIL import Image, ImageDraw

QUI = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.expanduser("~/.cache/ventotrieste-rilievo/terrarium")
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

# dicitura dalla documentazione dei Terrain Tiles (github.com/tilezen/joerd, docs/attribution.md):
# per quest'area servono le righe di Europa (EU-DEM), USGS (SRTM/GMTED2010) e NOAA (ETOPO1)
ATTRIBUZIONE = ("Rilievo: Terrain Tiles (AWS Open Data). Europe terrain data produced using Copernicus "
                "data and information funded by the European Union - EU-DEM layers; "
                "global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey; "
                "Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration")

# proiezione della mappa
LON0, LAT1, KX, KY = 13.15, 45.90, 586.2, 833.33

# ---------- 1. tile terrarium (con cache) ----------
def tile(z, x, y):
    f = os.path.join(CACHE, str(z), str(x), f"{y}.png")
    if not os.path.exists(f):
        os.makedirs(os.path.dirname(f), exist_ok=True)
        req = urllib.request.Request(URL.format(z=z, x=x, y=y),
                                     headers={"User-Agent": "ventotrieste-mappa/1.0 (bebroggi@gmail.com)"})
        for tentativo in range(4):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    dati = r.read()
                break
            except Exception as e:
                if tentativo == 3: raise
                print(f"  riprovo {z}/{x}/{y}: {e}")
                time.sleep(2 + tentativo * 3)
        open(f, "wb").write(dati)
    a = np.asarray(Image.open(f).convert("RGB"), dtype=np.float64)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768

# coordinate Web Mercator in pixel globali allo zoom z
def merc(lon, lat, z):
    n = 256 * 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2 * n
    return x, y

def quote(lon, lat, z):
    """Quota su una griglia lon/lat (array 2D), bilineare dal mosaico di tile allo zoom z."""
    mx, my = merc(lon, lat, z)
    mx, my = mx - 0.5, my - 0.5                 # centri dei pixel delle tile
    tx0, ty0 = int(mx.min() // 256), int(my.min() // 256)
    tx1, ty1 = int(mx.max() // 256) + 1, int(my.max() // 256) + 1
    nx, ny = tx1 - tx0 + 1, ty1 - ty0 + 1
    print(f"  z{z}: {nx}×{ny} tile ({tx0}–{tx1}, {ty0}–{ty1})")
    mos = np.zeros((ny * 256, nx * 256))
    for j in range(ny):
        for i in range(nx):
            mos[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = tile(z, tx0 + i, ty0 + j)
    fx, fy = mx - tx0 * 256, my - ty0 * 256
    x0 = np.clip(np.floor(fx).astype(int), 0, mos.shape[1] - 2)
    y0 = np.clip(np.floor(fy).astype(int), 0, mos.shape[0] - 2)
    ax, ay = fx - x0, fy - y0
    return ((mos[y0, x0] * (1 - ax) + mos[y0, x0 + 1] * ax) * (1 - ay) +
            (mos[y0 + 1, x0] * (1 - ax) + mos[y0 + 1, x0 + 1] * ax) * ay)

# ---------- 2. griglia della mappa ----------
def griglia(ux0, uy0, w, h, ppu):
    """lon/lat dei centri pixel di un riquadro (in unità mappa) a ppu pixel per unità,
    con un pixel di bordo in più per calcolare le pendenze."""
    i = (np.arange(-1, w + 1) + 0.5) / ppu + ux0
    j = (np.arange(-1, h + 1) + 0.5) / ppu + uy0
    lon = LON0 + i / KX
    lat = LAT1 - j / KY
    return np.meshgrid(lon, lat)

# ---------- 3. stile ----------
# tinta altimetrica tenue: pianura e costa crema, Carso e colline verde oliva chiaro,
# Ćićarija, Učka, Snežnik beige-grigio
TINTA = [
    (0,    (243, 239, 226)),   # #f3efe2
    (60,   (239, 238, 221)),
    (180,  (229, 232, 206)),
    (350,  (218, 224, 190)),
    (550,  (214, 214, 182)),
    (800,  (214, 204, 178)),
    (1100, (205, 194, 174)),
    (1500, (196, 188, 176)),
]

def tinta(z):
    qs = np.array([q for q, _ in TINTA], dtype=float)
    out = np.empty(z.shape + (3,))
    for c in range(3):
        out[..., c] = np.interp(z, qs, [col[c] for _, col in TINTA])
    return out

ESAGERAZIONE = 2.2
# ombreggiatura multi-direzionale morbida: luce principale da NO, più due di riempimento,
# così il ciglione del Carso e la costiera si leggono senza ombre nere
LUCI = [(315, 45, 0.60), (270, 50, 0.20), (0, 50, 0.20)]

def ombra(z, lat, ppu):
    # passo della griglia in metri (la proiezione è quasi isometrica: KY/KX ≈ 1/cos 45,3°)
    dx = (1 / (ppu * KX)) * 111320 * np.cos(np.radians(lat))
    dy = (1 / (ppu * KY)) * 110574
    zz = np.maximum(z, 0) * ESAGERAZIONE        # il mare è piatto: niente bordi finti in costa
    gy, gx = np.gradient(zz)
    gx = gx / dx
    gy = -gy / dy                                 # le righe vanno verso sud: nord = −y
    pend = np.arctan(np.hypot(gx, gy))
    asp = np.arctan2(gx, gy)                      # direzione di massima salita, da nord in senso orario
    hs = np.zeros_like(z)
    for az, alt, peso in LUCI:
        a, h = math.radians(az), math.radians(alt)
        # la faccia è illuminata quando scende verso la luce (normale verso la sorgente)
        v = np.sin(h) * np.cos(pend) + np.cos(h) * np.sin(pend) * np.cos(a - asp - math.pi)
        hs += peso * np.clip(v, 0, 1)
    piatto = sum(p * math.sin(math.radians(al)) for _, al, p in LUCI)
    # piano = 1; versanti in ombra più scuri, quelli al sole appena più chiari
    m = 1 + 0.95 * (hs - piatto)
    return np.clip(m, 0.62, 1.10)

def rilievo(ux0, uy0, w, h, ppu, z):
    lon, lat = griglia(ux0, uy0, w, h, ppu)
    q = quote(lon, lat, z)
    rgb = tinta(np.maximum(q, 0)) * ombra(q, lat, ppu)[..., None]
    rgb[q <= 0] = TINTA[0][1]
    rgb = rgb[1:-1, 1:-1]
    return Image.fromarray(np.clip(np.round(rgb), 0, 255).astype(np.uint8)), q[1:-1, 1:-1]

def salva(img, nome, limite_kb=250):
    """WebP alla qualità più alta che sta sotto il limite."""
    for qualita in (82, 78, 74, 70, 66, 62, 58, 54, 50):
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=qualita, method=6)
        if buf.tell() <= limite_kb * 1024: break
    open(os.path.join(QUI, nome), "wb").write(buf.getvalue())
    print(f"{nome}: {img.size[0]}×{img.size[1]} px, qualità {qualita}, {buf.tell() / 1024:.0f} KB")

# ---------- 4. anteprima di controllo: costa TERRA sopra il raster ----------
def terra():
    s = open(os.path.join(QUI, "..", "mappa-golfo.js"), encoding="utf-8").read()
    d = re.search(r'var TERRA = "([^"]+)"', s).group(1)
    polys = []
    for sub in re.findall(r"M([^MZ]+)Z", d):
        nums = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", sub)]
        polys.append(list(zip(nums[0::2], nums[1::2])))
    return polys

def anteprima(img, ux0, uy0, ppu, f):
    """Due pannelli: la costa TERRA disegnata sul raster, e la mappa composta
    (mare dell'SVG, rilievo ritagliato sulla costa)."""
    w, h = img.size
    sopra = img.copy()
    dr = ImageDraw.Draw(sopra)
    maschera = Image.new("L", (w, h), 0)
    dm = ImageDraw.Draw(maschera)
    for p in terra():
        pts = [((x - ux0) * ppu, (y - uy0) * ppu) for x, y in p]
        dm.polygon(pts, fill=255)
        dr.line(pts + [pts[0]], fill=(200, 30, 40), width=max(1, ppu // 2))
    mare = Image.new("RGB", (w, h), (201, 234, 240))
    composta = Image.composite(img, mare, maschera)
    dc = ImageDraw.Draw(composta)
    for p in terra():
        pts = [((x - ux0) * ppu, (y - uy0) * ppu) for x, y in p]
        dc.line(pts + [pts[0]], fill=(95, 139, 150), width=max(1, ppu))
    out = Image.new("RGB", (w * 2 + 20, h), (255, 255, 255))
    out.paste(sopra, (0, 0)); out.paste(composta, (w + 20, 0))
    out.save(f)
    print(f"anteprima: {f}")

if __name__ == "__main__":
    dir_ant = sys.argv[sys.argv.index("--anteprima") + 1] if "--anteprima" in sys.argv else None
    print("mappa intera")
    img, _ = rilievo(0, 0, 1524, 2000, 2, 11)
    salva(img, "rilievo.webp")
    if dir_ant: anteprima(img, 0, 0, 2, os.path.join(dir_ant, "anteprima-rilievo.png"))
    print("dettaglio del Golfo")
    img, _ = rilievo(90, 30, 1440, 1240, 4, 12)
    salva(img, "rilievo-golfo.webp")
    if dir_ant: anteprima(img, 90, 30, 4, os.path.join(dir_ant, "anteprima-rilievo-golfo.png"))
    print(ATTRIBUZIONE)
