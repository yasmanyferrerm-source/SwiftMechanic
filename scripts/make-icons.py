"""Generates SwiftMechanic's Android launcher icons, splash screens and Play Store graphics.

Run:  python3 scripts/make-icons.py   (needs Pillow)
Output: resources/android/res (copied into the Android project at build time) and store/ graphics.
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RES = os.path.join(ROOT, 'resources', 'android', 'res')
STORE = os.path.join(ROOT, 'store')
TOP, BOT = (251, 191, 36), (234, 120, 8)
DARK = (11, 18, 32)
SS = 4


def gradient(w, h, a=TOP, b=BOT):
    img = Image.new('RGBA', (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,))
    return img


def glyph(size, color=DARK):
    """Car silhouette with a wrench across it, drawn in a size x size box (transparent bg)."""
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = S / 100.0
    # car body
    d.rounded_rectangle([14 * u, 46 * u, 86 * u, 70 * u], radius=8 * u, fill=color)
    d.polygon([(26 * u, 47 * u), (34 * u, 30 * u), (66 * u, 30 * u), (74 * u, 47 * u)], fill=color)
    # windows (cut out)
    clear = (0, 0, 0, 0)
    d.polygon([(32 * u, 45 * u), (37.5 * u, 34.5 * u), (48.5 * u, 34.5 * u), (48.5 * u, 45 * u)], fill=clear)
    d.polygon([(51.5 * u, 45 * u), (51.5 * u, 34.5 * u), (62.5 * u, 34.5 * u), (68 * u, 45 * u)], fill=clear)
    # wheels
    for cx in (31, 69):
        d.ellipse([(cx - 10) * u, 61 * u, (cx + 10) * u, 81 * u], fill=clear)
        d.ellipse([(cx - 8) * u, 63 * u, (cx + 8) * u, 79 * u], fill=color)
        d.ellipse([(cx - 3.2) * u, 67.8 * u, (cx + 3.2) * u, 74.2 * u], fill=clear)
    # headlight
    d.rounded_rectangle([79 * u, 52 * u, 85 * u, 56 * u], radius=1.5 * u, fill=clear)
    img = img.resize((size, size), Image.LANCZOS)
    return img


def wrench_badge(size):
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = S / 100.0
    d.ellipse([60 * u, 6 * u, 96 * u, 42 * u], fill=(255, 255, 255, 255))
    # wrench
    w = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    wd = ImageDraw.Draw(w)
    wd.rounded_rectangle([76 * u, 14 * u, 81 * u, 36 * u], radius=2 * u, fill=DARK)
    wd.ellipse([71.5 * u, 9 * u, 85.5 * u, 23 * u], fill=DARK)
    wd.rectangle([76.2 * u, 7 * u, 80.8 * u, 15 * u], fill=(0, 0, 0, 0))
    w = w.rotate(-40, center=(78.5 * u, 24 * u), resample=Image.BICUBIC)
    img.alpha_composite(w)
    return img.resize((size, size), Image.LANCZOS)


def icon_art(size, bg=True):
    base = gradient(size, size) if bg else Image.new('RGBA', (size, size), (0, 0, 0, 0))
    g = glyph(int(size * 0.78))
    off = (size - g.width) // 2
    base.alpha_composite(g, (off, off + int(size * 0.03)))
    b = wrench_badge(int(size * 0.78))
    base.alpha_composite(b, (off, off + int(size * 0.03)))
    return base


def rounded(img, r):
    m = Image.new('L', (img.width * SS, img.height * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, m.width - 1, m.height - 1], radius=r * SS, fill=255)
    m = m.resize(img.size, Image.LANCZOS)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), m)
    return out


def circle(img):
    m = Image.new('L', (img.width * SS, img.height * SS), 0)
    ImageDraw.Draw(m).ellipse([0, 0, m.width - 1, m.height - 1], fill=255)
    m = m.resize(img.size, Image.LANCZOS)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), m)
    return out


def save(img, *parts):
    p = os.path.join(*parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    img.save(p)


DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for name, k in DENS.items():
    n = int(48 * k)
    full = icon_art(n * 4).resize((n, n), Image.LANCZOS)
    save(rounded(full, n * 0.18), RES, f'mipmap-{name}', 'ic_launcher.png')
    save(circle(full), RES, f'mipmap-{name}', 'ic_launcher_round.png')
    fg_size = int(108 * k)
    fg = Image.new('RGBA', (fg_size, fg_size), (0, 0, 0, 0))
    art = icon_art(int(fg_size * 0.62) * 4, bg=False).resize((int(fg_size * 0.62),) * 2, Image.LANCZOS)
    fg.alpha_composite(art, ((fg_size - art.width) // 2,) * 2)
    save(fg, RES, f'mipmap-{name}', 'ic_launcher_foreground.png')
    bgimg = gradient(fg_size, fg_size)
    save(bgimg, RES, f'mipmap-{name}', 'ic_launcher_background.png')

ADAPTIVE = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
'''
os.makedirs(os.path.join(RES, 'mipmap-anydpi-v26'), exist_ok=True)
for f in ('ic_launcher.xml', 'ic_launcher_round.xml'):
    open(os.path.join(RES, 'mipmap-anydpi-v26', f), 'w').write(ADAPTIVE)

# Splash screens (dark background, centered icon) – Capacitor's default file names
SPL = {'': (480, 320), 'port-mdpi': (320, 480), 'port-hdpi': (480, 800), 'port-xhdpi': (720, 1280), 'port-xxhdpi': (960, 1600), 'port-xxxhdpi': (1280, 1920),
       'land-mdpi': (480, 320), 'land-hdpi': (800, 480), 'land-xhdpi': (1280, 720), 'land-xxhdpi': (1600, 960), 'land-xxxhdpi': (1920, 1280)}
for q, (w, h) in SPL.items():
    img = Image.new('RGBA', (w, h), DARK + (255,))
    s = int(min(w, h) * 0.32)
    ic = rounded(icon_art(s * 2).resize((s, s), Image.LANCZOS), s * 0.22)
    img.alpha_composite(ic, ((w - s) // 2, (h - s) // 2))
    save(img.convert('RGB'), RES, 'drawable' + (f'-{q}' if q else ''), 'splash.png')

# ---- Play Store graphics ----
os.makedirs(STORE, exist_ok=True)
icon512 = icon_art(1024).resize((512, 512), Image.LANCZOS).convert('RGB')  # Play adds its own rounding
icon512.save(os.path.join(STORE, 'icon-512.png'))


def font(sz, bold=True):
    for f in (['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] if bold else ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']):
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


fg = Image.new('RGBA', (1024, 500), DARK + (255,))
d = ImageDraw.Draw(fg)
for x in range(1024):  # subtle amber glow on the right
    t = max(0, (x - 500) / 524)
    d.line([(x, 0), (x, 500)], fill=(int(11 + 40 * t), int(18 + 22 * t), int(32 - 10 * t), 255))
ic = rounded(icon_art(560).resize((280, 280), Image.LANCZOS), 60)
fg.alpha_composite(ic, (680, 110))
d.text((60, 140), 'SwiftMechanic', font=font(64), fill=(255, 255, 255))
d.text((62, 230), 'Describe the problem.', font=font(34, False), fill=(200, 210, 228))
d.text((62, 276), 'Get the fix for your exact car.', font=font(34, False), fill=(251, 191, 36))
d.text((62, 350), 'OBD-II codes  •  Recalls  •  AI diagnosis', font=font(24, False), fill=(147, 161, 186))
fg.convert('RGB').save(os.path.join(STORE, 'feature-graphic-1024x500.png'))
print('icons, splash and store graphics written')
