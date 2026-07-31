# -*- coding: utf-8 -*-
"""
技術マップ用 風景イラスト（SVG）ジェネレータ
  - 俯瞰（鳥瞰）視点の都市を中心に、山・ダム・河川・公園・港・海までを一望する縮図
  - ビル/窓/街路樹/車/高速道路など反復要素はコードで大量生成する
出力: assets/images/cityscape.svg
"""
import random, math, io

W, H = 1600, 1000
R = random.Random(20260731)

out = []      # 地面レイヤー（回転する板）
sky_out = []  # 空レイヤー（回転しない背景）
def add(s): out.append(s)
def add_sky(s): sky_out.append(s)

# ------------------------------------------------------------------
# パレット（彩度高め・くっきり）
# ------------------------------------------------------------------
ROAD      = "#586a7a"
ROAD_EDGE = "#46586a"
ROAD_LINE = "#ffffff"
GREEN     = ["#3aa css"]
TREE      = ["#2f9e4f", "#3fae57", "#249247", "#4bbb63"]
WATER     = "#3fb0e5"
WATER_D   = "#2b93cc"

BLD_FACE = ["#f4f7fa","#e8eef4","#ffffff","#dfe8f0","#f7f2e8"]
BLD_GLASS= ["#6fc9ee","#57b8e6","#8ad7f2","#43a9dd","#9ee0f5"]
BLD_WARM = ["#f0a44a","#e88c5a","#e0705f","#efc06a","#d98b6a"]
BLD_TEAL = ["#4fc3b0","#5fd0c0","#3fb3a2"]
WIN      = "#cfe9fb"
WIN_LIT  = "#ffe9a8"
CAR      = ["#e0705f","#f2c14e","#5f9fd0","#69b06a","#ffffff","#d94f4f","#8a7fd0"]

def esc(v):
    return ("%.1f" % v).rstrip("0").rstrip(".")

def pts(seq):
    return " ".join("%s,%s" % (esc(a), esc(b)) for a, b in seq)

# ------------------------------------------------------------------
# 汎用パーツ
# ------------------------------------------------------------------
def building(x, y, w, h, d, face, side=None, roof=None,
             wcols=0, wrows=0, lit=0.18, stroke="#9fb0c0", sw=1.2,
             spire=0, dome=False):
    """
    俯瞰の立体ビル。(x,y)=正面左上, w=幅, h=高さ, d=奥行き
    正面／側面／屋根の3面で立体を表現し、正面と側面に窓を並べる。
    """
    g = []
    if side is None: side = shade(face, 0.82)
    if roof is None: roof = shade(face, 1.12)

    # 屋根（上面）
    g.append('<polygon points="%s" fill="%s" stroke="%s" stroke-width="%s" stroke-linejoin="round"/>'
             % (pts([(x, y), (x + d, y - d * .55), (x + w + d, y - d * .55), (x + w, y)]), roof, stroke, sw))
    # 側面（右）
    g.append('<polygon points="%s" fill="%s" stroke="%s" stroke-width="%s" stroke-linejoin="round"/>'
             % (pts([(x + w, y), (x + w + d, y - d * .55), (x + w + d, y + h - d * .55), (x + w, y + h)]), side, stroke, sw))
    # 正面
    g.append('<rect x="%s" y="%s" width="%s" height="%s" fill="%s" stroke="%s" stroke-width="%s"/>'
             % (esc(x), esc(y), esc(w), esc(h), face, stroke, sw))

    # 窓（正面）
    if wcols and wrows:
        mx, my = w * .14, h * .10
        cw = (w - mx * 2) / (wcols * 2 - 1)
        ch = (h - my * 2) / (wrows * 2 - 1)
        for c in range(wcols):
            for r in range(wrows):
                wx = x + mx + c * cw * 2
                wy = y + my + r * ch * 2
                col = WIN_LIT if R.random() < lit else WIN
                g.append('<rect x="%s" y="%s" width="%s" height="%s" fill="%s" opacity=".95"/>'
                         % (esc(wx), esc(wy), esc(cw), esc(ch), col))
        # 窓（側面・平行四辺形で簡略表現）
        for r in range(wrows):
            wy = y + my + r * ch * 2
            p = [(x + w + d * .18, wy - d * .10), (x + w + d * .80, wy - d * .45),
                 (x + w + d * .80, wy - d * .45 + ch), (x + w + d * .18, wy - d * .10 + ch)]
            g.append('<polygon points="%s" fill="%s" opacity=".55"/>' % (pts(p), WIN))

    # 塔屋・アンテナ
    if spire:
        cx = x + w / 2 + d * .5
        g.append('<rect x="%s" y="%s" width="4" height="%s" fill="#b8c6d2"/>' % (esc(cx - 2), esc(y - d * .55 - spire), esc(spire)))
        g.append('<circle cx="%s" cy="%s" r="4" fill="#e0705f"/>' % (esc(cx), esc(y - d * .55 - spire)))
    if dome:
        cx = x + w / 2 + d * .28
        g.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" stroke="%s" stroke-width="%s"/>'
                 % (esc(cx), esc(y - d * .55), esc(w * .46), esc(w * .30), shade(face, 1.18), stroke, sw))
    return "".join(g)

def shade(hexcol, k):
    """色の明度を調整"""
    hexcol = hexcol.lstrip("#")
    r, g, b = (int(hexcol[i:i+2], 16) for i in (0, 2, 4))
    f = lambda v: max(0, min(255, int(v * k)))
    return "#%02x%02x%02x" % (f(r), f(g), f(b))

def tree(x, y, s=1.0, kind="round"):
    col = TREE[R.randrange(len(TREE))]
    if kind == "cone":
        return ('<g><rect x="%s" y="%s" width="%s" height="%s" fill="#7b5432"/>'
                '<polygon points="%s" fill="%s"/></g>'
                % (esc(x - 1.6 * s), esc(y), esc(3.2 * s), esc(7 * s),
                   pts([(x, y - 22 * s), (x + 9 * s, y + 1), (x - 9 * s, y + 1)]), col))
    return ('<g><rect x="%s" y="%s" width="%s" height="%s" fill="#7b5432"/>'
            '<circle cx="%s" cy="%s" r="%s" fill="%s"/></g>'
            % (esc(x - 1.6 * s), esc(y), esc(3.2 * s), esc(7 * s),
               esc(x), esc(y - 2 * s), esc(9 * s), col))

def trees_along(path_pts, step=26, s=1.0, offset=0):
    """折れ線に沿って街路樹を並べる"""
    g = []
    for i in range(len(path_pts) - 1):
        (x1, y1), (x2, y2) = path_pts[i], path_pts[i + 1]
        dist = math.hypot(x2 - x1, y2 - y1)
        n = max(1, int(dist / step))
        for k in range(n):
            t = k / n
            x = x1 + (x2 - x1) * t
            y = y1 + (y2 - y1) * t
            nx, ny = -(y2 - y1) / dist, (x2 - x1) / dist
            g.append(tree(x + nx * offset, y + ny * offset, s))
    return "".join(g)

def car(x, y, ang=0, s=1.0):
    c = CAR[R.randrange(len(CAR))]
    return ('<g transform="translate(%s,%s) rotate(%s)">'
            '<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="%s" stroke="#33414f" stroke-width=".7"/>'
            '<rect x="%s" y="%s" width="%s" height="%s" rx="1" fill="#cfe9fb" opacity=".85"/></g>'
            % (esc(x), esc(y), esc(ang), esc(-5 * s), esc(-2.6 * s), esc(10 * s), esc(5.2 * s), esc(1.4 * s), c,
               esc(-1.6 * s), esc(-1.8 * s), esc(4 * s), esc(3.6 * s)))

def cars_along(path_pts, n=6, s=1.0, spread=5):
    g = []
    for i in range(n):
        t = (i + .5) / n
        seg = t * (len(path_pts) - 1)
        k = min(int(seg), len(path_pts) - 2)
        f = seg - k
        (x1, y1), (x2, y2) = path_pts[k], path_pts[k + 1]
        x = x1 + (x2 - x1) * f
        y = y1 + (y2 - y1) * f
        ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
        d = math.hypot(x2 - x1, y2 - y1) or 1
        nx, ny = -(y2 - y1) / d, (x2 - x1) / d
        o = spread if i % 2 == 0 else -spread
        g.append(car(x + nx * o, y + ny * o, ang, s))
    return "".join(g)

def pond(cx, cy, rx, ry, rot=0):
    return ('<g transform="translate(%s,%s) rotate(%s)">'
            '<ellipse rx="%s" ry="%s" fill="%s" stroke="#9fe0f7" stroke-width="2.5"/>'
            '<ellipse rx="%s" ry="%s" cy="%s" fill="#7fd4f0" opacity=".55"/></g>'
            % (esc(cx), esc(cy), esc(rot), esc(rx), esc(ry), WATER, esc(rx * .55), esc(ry * .42), esc(-ry * .25)))

def balloon(x, y, s=1.0, c1="#e8534f", c2="#f2c14e", c3="#4fb3e8"):
    return ('<g transform="translate(%s,%s) scale(%s)">'
            '<path d="M0 -46 C 26 -46 34 -22 34 -8 C 34 10 16 26 0 40 C -16 26 -34 10 -34 -8 C -34 -22 -26 -46 0 -46 Z" fill="%s"/>'
            '<path d="M0 -46 C 12 -46 17 -22 17 -8 C 17 10 8 26 0 40 C -8 26 -17 10 -17 -8 C -17 -22 -12 -46 0 -46 Z" fill="%s"/>'
            '<path d="M0 -46 C 5 -46 7 -22 7 -8 C 7 10 3 26 0 40 C -3 26 -7 10 -7 -8 C -7 -22 -5 -46 0 -46 Z" fill="%s"/>'
            '<path d="M-9 40 L -6 52 M9 40 L 6 52" stroke="#8a6a4a" stroke-width="2" fill="none"/>'
            '<rect x="-8" y="50" width="16" height="12" rx="2" fill="#a9743f" stroke="#7b5432" stroke-width="1.5"/>'
            '</g>' % (esc(x), esc(y), esc(s), c1, c2, c3))

def road_band(p, width, dash=True, lanes=True):
    """道路（太い線＋中央線）"""
    d = "M " + " L ".join("%s %s" % (esc(a), esc(b)) for a, b in p)
    g = ['<path d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-linejoin="round" stroke-linecap="round"/>'
         % (d, ROAD_EDGE, esc(width + 4)),
         '<path d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-linejoin="round" stroke-linecap="round"/>'
         % (d, ROAD, esc(width))]
    if dash:
        g.append('<path d="%s" fill="none" stroke="%s" stroke-width="1.8" stroke-dasharray="10 12" opacity=".9"/>' % (d, ROAD_LINE))
    if lanes and width >= 22:
        g.append('<path d="%s" fill="none" stroke="%s" stroke-width="1.2" stroke-dasharray="6 10" opacity=".45" transform="translate(0,%s)"/>'
                 % (d, ROAD_LINE, esc(-width * .28)))
        g.append('<path d="%s" fill="none" stroke="%s" stroke-width="1.2" stroke-dasharray="6 10" opacity=".45" transform="translate(0,%s)"/>'
                 % (d, ROAD_LINE, esc(width * .28)))
    return "".join(g)

# ==================================================================
# 描画開始
#   描画順（奥→手前）が重要：
#   空 → 遠景 → 大地 → 山・ダム → 河川 → 海 → 市街地の舗装 →
#   道路・IC → 公園・郊外 → 街路樹 → ビル群 → 高架鉄道 → 橋・港 → 気球
# ==================================================================
DEFS = ('''<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#1f7fd0"/><stop offset=".45" stop-color="#6fc0ee"/>
  <stop offset=".78" stop-color="#bfe6fa"/><stop offset="1" stop-color="#e6f6ff"/>
</linearGradient>
<linearGradient id="grd" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#8ed258"/><stop offset="1" stop-color="#68b840"/>
</linearGradient>
<linearGradient id="sea" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#5fc5ea"/><stop offset="1" stop-color="#1878b4"/>
</linearGradient>
<linearGradient id="riv" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#7fd4f0"/><stop offset="1" stop-color="#2fa2dc"/>
</linearGradient>
<linearGradient id="mtn" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#8090cf"/><stop offset="1" stop-color="#4f5f9c"/>
</linearGradient>
<linearGradient id="mtn2" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#6f7fc0"/><stop offset="1" stop-color="#414f8a"/>
</linearGradient>
<linearGradient id="pave" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#eef2f6"/><stop offset="1" stop-color="#dae3ec"/>
</linearGradient>
</defs>''')


# ---------------- 空・星・雲（空レイヤー） ----------------
add_sky('<rect width="%d" height="%d" fill="url(#sky)"/>' % (W, H))
for _ in range(90):
    add_sky('<circle cx="%s" cy="%s" r="%s" fill="#fff" opacity="%s"/>'
        % (esc(R.uniform(0, W)), esc(R.uniform(0, 150)), esc(R.uniform(.6, 1.5)), esc(R.uniform(.25, .8))))

def cloud(x, y, s):
    return ('<g transform="translate(%s,%s) scale(%s)" fill="#ffffff">'
            '<ellipse rx="34" ry="14"/><ellipse cx="26" cy="5" rx="24" ry="11"/>'
            '<ellipse cx="-26" cy="5" rx="22" ry="10"/><ellipse cx="6" cy="-8" rx="20" ry="12"/></g>'
            % (esc(x), esc(y), esc(s)))
for (cx, cy, cs) in [(150,120,1.1),(430,86,.9),(700,140,1.2),(980,74,1.0),
                     (1250,132,1.1),(1490,92,.85),(320,196,.7),(1110,200,.65),(860,218,.6)]:
    add_sky(cloud(cx, cy, cs))

# 遠景の山なみ（空レイヤー：地平線の背景）
add_sky('<polygon points="%s" fill="#8098c8" opacity=".9"/>' % pts(
    [(0,300),(120,246),(240,286),(360,238),(500,282),(640,244),(780,286),(920,250),
     (1060,288),(1200,246),(1340,284),(1480,250),(1600,290),(1600,360),(0,360)]))

# ---------------- ここから地面レイヤー ----------------
add('<path d="M0 332 Q 200 308 400 332 T 800 332 T 1200 332 T 1600 332 L 1600 378 L 0 378 Z" fill="#2b8746"/>')
for _ in range(170):
    add('<circle cx="%s" cy="%s" r="%s" fill="%s"/>'
        % (esc(R.uniform(0, W)), esc(R.uniform(318, 372)), esc(R.uniform(6, 12)), TREE[R.randrange(len(TREE))]))

# ---------------- 大地 ----------------
add('<polygon points="%s" fill="url(#grd)"/>' % pts([(0,358),(1600,358),(1600,1000),(0,1000)]))

# ---------------- 左：山地・森・ダム ----------------
# ※ 地面レイヤーは y=330 から切り出すため、山頂が切れないよう頂点は 330 より下に置く
add('<polygon points="%s" fill="url(#mtn)" stroke="#414f8a" stroke-width="2"/>' % pts([(0,486),(148,352),(296,486)]))
add('<polygon points="%s" fill="#fff"/>' % pts([(110,398),(148,352),(188,398),(166,416),(130,416)]))
add('<polygon points="%s" fill="url(#mtn2)" stroke="#3a477e" stroke-width="2"/>' % pts([(116,486),(296,340),(476,486)]))
add('<polygon points="%s" fill="#fff"/>' % pts([(252,392),(296,340),(342,392),(318,412),(276,412)]))
add('<polygon points="%s" fill="#6f7fc0" stroke="#414f8a" stroke-width="2"/>' % pts([(330,486),(452,362),(574,486)]))
add('<polygon points="%s" fill="#fff"/>' % pts([(420,412),(452,362),(486,412),(468,428),(438,428)]))
for _ in range(80):
    add(tree(R.uniform(10, 580), R.uniform(462, 540), R.uniform(.7, 1.15), "cone"))

# ダム（貯水＋堤体）
add('<path d="M352 470 q80 26 160 6 l0 -26 q-80 20 -160 -8 z" fill="#7fd4f0" stroke="#5fc0e0" stroke-width="2"/>')
add('<path d="M352 470 q80 26 160 6 l0 48 q-80 20 -160 -6 z" fill="#e2e9ef" stroke="#aab7c3" stroke-width="2.5"/>')
add('<rect x="422" y="488" width="28" height="32" rx="3" fill="#c3cdd6" stroke="#a2b0bc" stroke-width="1.4"/>')

# ---------------- 河川（ダム → 都市の南 → 海） ----------------
river_pts = [(396,486),(440,570),(470,650),(520,730),(600,800),(720,860),(880,900),(1060,928),(1250,936)]
d_river = "M " + " L ".join("%s %s" % (esc(a), esc(b)) for a, b in river_pts)
add('<path d="%s" fill="none" stroke="#5fc0e0" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>' % d_river)
add('<path d="%s" fill="none" stroke="url(#riv)" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/>' % d_river)
add('<path d="%s" fill="none" stroke="#bfeaf9" stroke-width="4" opacity=".65" stroke-linecap="round" transform="translate(0,-14)"/>' % d_river)

# ---------------- 海 ----------------
add('<polygon points="%s" fill="url(#sea)"/>' % pts([(1600,596),(1272,792),(1196,1000),(1600,1000)]))
for i in range(8):
    add('<path d="M%s %s q24 -14 48 0 t48 0" fill="none" stroke="#fff" stroke-width="4" opacity=".42" stroke-linecap="round"/>'
        % (esc(1300 + (i % 3) * 92), esc(836 + i * 20)))

# ---------------- 市街地の舗装ブロック ----------------
CITY = [(792,432),(1306,456),(1256,782),(806,742)]
add('<polygon points="%s" fill="url(#pave)" stroke="#c3cfda" stroke-width="2.5"/>' % pts(CITY))

def city_lerp(t, u):
    """市街地ブロック内の座標（t=横0..1, u=縦0..1）"""
    ax = 792 + (1306 - 792) * t; ay = 432 + (456 - 432) * t
    bx = 806 + (1256 - 806) * t; by = 742 + (782 - 742) * t
    return (ax + (bx - ax) * u, ay + (by - ay) * u)

# 街区の格子道路（市街地内の細街路）
for i in range(1, 6):
    t = i / 6
    a = city_lerp(t, 0); b = city_lerp(t, 1)
    add('<path d="M %s %s L %s %s" stroke="#46586a" stroke-width="13" fill="none"/>' % (esc(a[0]), esc(a[1]), esc(b[0]), esc(b[1])))
    add('<path d="M %s %s L %s %s" stroke="#5d7082" stroke-width="10" fill="none"/>' % (esc(a[0]), esc(a[1]), esc(b[0]), esc(b[1])))
    add('<path d="M %s %s L %s %s" stroke="#fff" stroke-width="1.3" stroke-dasharray="7 9" opacity=".8" fill="none"/>' % (esc(a[0]), esc(a[1]), esc(b[0]), esc(b[1])))
for i in range(1, 5):
    u = i / 5
    a = city_lerp(0, u); b = city_lerp(1, u)
    add('<path d="M %s %s L %s %s" stroke="#46586a" stroke-width="13" fill="none"/>' % (esc(a[0]), esc(a[1]), esc(b[0]), esc(b[1])))
    add('<path d="M %s %s L %s %s" stroke="#5d7082" stroke-width="10" fill="none"/>' % (esc(a[0]), esc(a[1]), esc(b[0]), esc(b[1])))
    add('<path d="M %s %s L %s %s" stroke="#fff" stroke-width="1.3" stroke-dasharray="7 9" opacity=".8" fill="none"/>' % (esc(a[0]), esc(a[1]), esc(b[0]), esc(b[1])))

# ---------------- 幹線道路・インターチェンジ ----------------
# 幹線（左手前 → 都市南 → 港）
hw_main = [(40,1000),(180,946),(340,900),(500,860),(660,812),(840,772),(1010,730),(1170,690),(1310,652)]
add(road_band(hw_main, 34))
# 幹線（奥・山裾を避けて右へ）
hw_far = [(596,436),(760,424),(940,420),(1140,428),(1340,446),(1560,474)]
add(road_band(hw_far, 24))
# 都市へ下る縦幹線
hw_v1 = [(688,470),(714,560),(742,660),(772,760),(800,880),(820,1000)]
add(road_band(hw_v1, 24))
# 郊外道（左の山方面）
hw_rural = [(120,700),(260,672),(400,650),(520,616),(620,552),(676,492)]
add(road_band(hw_rural, 18, lanes=False))

# インターチェンジ（市街地の西・開けた緑地に配置して見せる）
ICX, ICY = 676, 486
add('<ellipse cx="%d" cy="%d" rx="104" ry="40" fill="none" stroke="%s" stroke-width="26"/>' % (ICX, ICY, ROAD_EDGE))
add('<ellipse cx="%d" cy="%d" rx="104" ry="40" fill="none" stroke="%s" stroke-width="22"/>' % (ICX, ICY, ROAD))
add('<ellipse cx="%d" cy="%d" rx="104" ry="40" fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="9 11" opacity=".9"/>' % (ICX, ICY))
for rp in [[(572,486),(540,470),(500,452)], [(780,486),(860,462),(940,442)],
           [(676,526),(682,566),(692,606)], [(676,446),(668,414),(658,392)]]:
    add(road_band(rp, 15, dash=False, lanes=False))

# 走行車
add(cars_along(hw_main, 16, 1.2, 8))
add(cars_along(hw_far, 11, .85, 6))
add(cars_along(hw_v1, 9, 1.0, 6))
add(cars_along([(572,486),(676,446),(780,486),(676,526),(572,486)], 8, .9, 0))

# ---------------- 公園 ----------------
add('<ellipse cx="545" cy="662" rx="118" ry="56" fill="#8ed860" stroke="#5faf3a" stroke-width="3"/>')
add('<path d="M445 680 q104 -50 208 -12" fill="none" stroke="#f2ead2" stroke-width="9"/>')
add(pond(586, 682, 42, 19, -8))
for (tx, ty, ts) in [(468,640,1.15),(510,620,1.0),(562,624,1.1),(618,640,.95),
                     (458,688,.9),(646,668,1.0),(506,700,.85),(578,644,.9)]:
    add(tree(tx, ty, ts))
add('<g transform="translate(506,668)"><polygon points="0,-18 22,0 -22,0" fill="#e0705f"/>'
    '<rect x="-16" y="0" width="4" height="15" fill="#c3cdd6"/><rect x="12" y="0" width="4" height="15" fill="#c3cdd6"/></g>')

# ---------------- 郊外（田畑・住宅） ----------------
for i in range(5):
    x0 = 70 + i * 60; y0 = 726 + i * 18
    add('<polygon points="%s" fill="%s" stroke="#9fc45e" stroke-width="1.5"/>'
        % (pts([(x0,y0),(x0+58,y0-12),(x0+70,y0+32),(x0+12,y0+46)]), ["#c9dd8a","#b6d477","#d4e59a"][i % 3]))
for (hx, hy, hc) in [(210,822,"#e0705f"),(268,846,"#5f9fd0"),(168,860,"#efc06a"),
                     (330,812,"#e0705f"),(392,838,"#5f9fd0"),(250,900,"#69b06a"),(120,900,"#e88c5a")]:
    add('<g transform="translate(%s,%s)"><rect x="-17" y="0" width="34" height="26" fill="#f7f4ec" stroke="#cfc7b6" stroke-width="1.3"/>'
        '<polygon points="-21,0 0,-17 21,0" fill="%s" stroke="%s" stroke-width="1.3"/></g>'
        % (esc(hx), esc(hy), hc, shade(hc, .8)))

# 池
for (px, py, prx, pry, prot) in [(160,600,44,20,-10),(250,690,34,15,8),(1436,540,48,21,-6),
                                 (860,470,38,16,4),(1180,500,32,14,10),(120,960,38,17,-14),(430,930,42,18,6)]:
    add(pond(px, py, prx, pry, prot))

# ---------------- 街路樹 ----------------
add(trees_along(hw_main, 44, 1.05, 27))
add(trees_along(hw_main, 44, 1.05, -27))
add(trees_along(hw_far, 48, .72, 17))
add(trees_along(hw_v1, 46, .92, 20))
add(trees_along(hw_rural, 50, .8, 15))
for _ in range(80):
    add(tree(R.uniform(30, 640), R.uniform(500, 990), R.uniform(.6, 1.15)))
for _ in range(46):
    add(tree(R.uniform(1320, 1590), R.uniform(400, 640), R.uniform(.6, 1.05)))
for _ in range(26):
    add(tree(R.uniform(640, 800), R.uniform(560, 740), R.uniform(.7, 1.0)))

# ==================================================================
# ビル群（奥列 → 中列 → 手前列。彩度を高めてくっきり）
# ==================================================================
R.seed(11)
PAL_MIX = BLD_GLASS * 3 + BLD_WARM * 2 + BLD_TEAL + BLD_FACE * 2

def row(y_base, x0, x1, hmin, hmax, wmin, wmax, lit, spire_p=.0, dome_p=.0):
    x = x0
    while x < x1:
        w = R.uniform(wmin, wmax); h = R.uniform(hmin, hmax); d = w * .44
        y = y_base + R.uniform(-10, 12)
        add(building(x, y - h, w, h, d, R.choice(PAL_MIX),
                     wcols=max(2, int(w / 13)), wrows=max(3, int(h / 17)), lit=lit,
                     spire=(R.random() < spire_p) * R.uniform(16, 32),
                     dome=(R.random() < dome_p)))
        x += w + R.uniform(9, 19)

row(492, 800, 1300, 46, 104, 26, 46, .16)          # 奥列
row(566, 806, 1296, 60, 136, 30, 54, .18, .08)      # 中列その1
row(646, 812, 1288, 70, 158, 34, 58, .20, .10, .05) # 中列その2
row(726, 818, 1276, 84, 186, 38, 62, .24, .12, .06) # 手前列

# ランドマーク（高層タワー群）
for (tx, ty, tw, th, tc, sp, dm) in [
    (868, 760, 60, 214, "#4fb3e8", 28, False),
    (988, 772, 64, 236, "#f0a44a", 0,  True),
    (1108, 764, 58, 208, "#4fc3b0", 24, False),
    (1216, 776, 62, 190, "#57b8e6", 0,  False)]:
    add(building(tx, ty - th, tw, th, tw * .46, tc,
                 wcols=max(3, int(tw / 14)), wrows=max(6, int(th / 18)), lit=.26, spire=sp, dome=dm))

# 電波塔
add('<polygon points="%s" fill="#cfdae6" stroke="#9fb0c0" stroke-width="1.8"/>' % pts([(1300,690),(1316,436),(1332,690)]))
add('<polygon points="%s" fill="#e0705f" stroke="#bd5747" stroke-width="1.4"/>' % pts([(1303,576),(1316,522),(1329,576)]))
add('<rect x="1311" y="392" width="10" height="46" fill="#b8c6d2"/>')
add('<circle cx="1316" cy="388" r="6.5" fill="#f2c14e"/>')

# 低層の商業施設
for (sx, sy, sw2, sh2, sc) in [(820,790,88,42,"#efc06a"),(930,802,80,38,"#e88c5a"),
                               (1030,798,86,40,"#5fd0c0"),(1140,806,76,36,"#e0705f")]:
    add(building(sx, sy - sh2, sw2, sh2, 22, sc, wcols=3, wrows=2, lit=.3))

# 市街地の緑
for _ in range(40):
    add(tree(R.uniform(806, 1290), R.uniform(470, 780), R.uniform(.5, .8)))

# ==================================================================
# 高架鉄道（都市を斜めに横断）
# ==================================================================
rail = [(760,850),(920,806),(1080,758),(1240,710),(1390,666),(1510,632)]
d_rail = "M " + " L ".join("%s %s" % (esc(a), esc(b)) for a, b in rail)
for i in range(len(rail) - 1):
    for k in range(3):
        t = (i + k / 3) / (len(rail) - 1)
        seg = t * (len(rail) - 1); j = min(int(seg), len(rail) - 2); f = seg - j
        x = rail[j][0] + (rail[j+1][0] - rail[j][0]) * f
        y = rail[j][1] + (rail[j+1][1] - rail[j][1]) * f
        add('<rect x="%s" y="%s" width="10" height="34" fill="#c3cdd6" stroke="#a2b0bc" stroke-width="1.1"/>' % (esc(x - 5), esc(y)))
add('<path d="%s" fill="none" stroke="#b6c2cc" stroke-width="19" stroke-linecap="round"/>' % d_rail)
add('<path d="%s" fill="none" stroke="#eef3f7" stroke-width="13" stroke-linecap="round"/>' % d_rail)
add('<path d="%s" fill="none" stroke="#9fb0c0" stroke-width="1.4" stroke-dasharray="4 7"/>' % d_rail)
add('<g transform="translate(1080,758) rotate(-17)">'
    '<rect x="-68" y="-13" width="136" height="21" rx="7" fill="#f7fafc" stroke="#8fa2b2" stroke-width="1.6"/>'
    '<rect x="-68" y="-6" width="136" height="6.5" fill="#1f86c8"/>'
    + "".join('<rect x="%d" y="-10" width="17" height="8.5" rx="2" fill="#cfe9fb"/>' % xx
              for xx in (-62, -38, -14, 10, 34)) +
    '</g>')

# ---------------- 橋（幹線が河川を渡る） ----------------
add('<g transform="rotate(-17 630 820)">'
    '<rect x="558" y="802" width="146" height="28" rx="4" fill="#f2f6f9" stroke="#b6c2cc" stroke-width="1.8"/>'
    '<path d="M564 802 q67 -38 134 0" fill="none" stroke="#dfe6ec" stroke-width="7.5"/>'
    '<rect x="572" y="830" width="8" height="26" fill="#b6c2cc"/><rect x="682" y="830" width="8" height="26" fill="#b6c2cc"/>'
    '</g>')

# ---------------- 港 ----------------
add('<polygon points="%s" fill="#e9eef3" stroke="#c2ccd6" stroke-width="2.2"/>'
    % pts([(1236,822),(1400,858),(1378,924),(1216,884)]))
for (cx2, cy2, cc) in [(1262,844,"#e0705f"),(1302,854,"#5f9fd0"),(1342,864,"#f2c14e"),
                       (1274,874,"#69b06a"),(1316,884,"#e0705f"),(1356,892,"#8a7fd0")]:
    add('<rect x="%s" y="%s" width="34" height="19" rx="2" fill="%s" stroke="#33414f" stroke-width=".9"/>' % (esc(cx2), esc(cy2), cc))
add('<g stroke="#b6c2cc" stroke-width="7.5" fill="none"><path d="M1380 842 v-60 h-56"/><path d="M1380 782 h36"/></g>')
add('<g transform="translate(1486,900)"><path d="M-46 0 h92 l-15 24 h-62 z" fill="#f7fafc" stroke="#b6c2cc" stroke-width="1.6"/>'
    '<rect x="-20" y="-23" width="40" height="23" fill="#cfd9e2" stroke="#b6c2cc" stroke-width="1.3"/>'
    '<rect x="-5" y="-37" width="9" height="15" fill="#e0705f"/></g>')
add('<g transform="translate(1352,972)"><path d="M-28 0 h56 l-10 15 h-36 z" fill="#f7fafc" stroke="#b6c2cc" stroke-width="1.3"/>'
    '<rect x="-11" y="-13" width="22" height="13" fill="#cfd9e2"/></g>')
add('<path d="M1418 706 l106 30" stroke="#e2e9ef" stroke-width="13" stroke-linecap="round" fill="none"/>')

# ---------------- 気球 ----------------
add_sky(balloon(232, 208, 1.05, "#e8534f", "#f2c14e", "#4fb3e8"))
add_sky(balloon(556, 166, .8,  "#4fb3e8", "#ffffff", "#e8534f"))
add_sky(balloon(884, 230, .9,  "#f2c14e", "#69b06a", "#ffffff"))
add_sky(balloon(1214, 188, 1.0, "#c86fd0", "#f2c14e", "#4fb3e8"))
add_sky(balloon(1476, 248, .75, "#69b06a", "#ffffff", "#e8534f"))

# ==================================================================
# 書き出し
#   sky.svg       … 回転しない背景（空・雲・気球・遠景の山）
#   cityscape.svg … 回転する地面の板（y=330 以降を切り出す）
# ==================================================================
GROUND_TOP, GROUND_H = 330, 670

sky_svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
           'preserveAspectRatio="none" width="%d" height="%d">' % (W, H, W, H)
           + DEFS + "\n".join(sky_out) + '</svg>')
io.open("assets/images/sky.svg", "w", encoding="utf-8").write(sky_svg)

ground_svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 %d %d %d" '
              'width="%d" height="%d">' % (GROUND_TOP, W, GROUND_H, W, GROUND_H)
              + DEFS + "\n".join(out) + '</svg>')
io.open("assets/images/cityscape.svg", "w", encoding="utf-8").write(ground_svg)

print("written: sky.svg %.1f KB / cityscape.svg %.1f KB (elements=%d)"
      % (len(sky_svg)/1024, len(ground_svg)/1024, ground_svg.count("<")))
