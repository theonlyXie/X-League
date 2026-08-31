"""Turn the supplied brush mark into every icon slot the app declares.

What arrives is a picture *of* an icon: a rounded cream tile photographed on a
black page. Both platforms round their own corners, so shipping it whole would
put a dark frame inside the mask. The page is lifted off — flood-filled from
the four corners, then the antialiased arc cleaned with a rounded mask
measured from the artwork itself — and every slot is drawn from the mark.
"""
from PIL import Image, ImageDraw
import sys

# Run from the repository root, after `pip install pillow`:
#     python3 scripts/make-icons.py assets/brand/x-mark-source.png
# It rewrites every file in assets/ that app.json points at. The source mark is
# kept in the repository so the icons can be regenerated rather than re-traced.
SRC = sys.argv[1] if len(sys.argv) > 1 else 'assets/brand/x-mark-source.png'
OUT = 'assets'
CREAM = (247, 240, 230)

src = Image.open(SRC).convert('RGB')
W = src.width

# Where the tile's own corner arc meets the top edge, which is the radius.
p = src.load()
def is_cream(x, y):
    return sum(abs(a - b) for a, b in zip(p[x, y], CREAM)) <= 40
RADIUS = next(x for x in range(W) if is_cream(x, 0))

flat = src.copy()
for corner in [(0, 0), (W - 1, 0), (0, W - 1), (W - 1, W - 1)]:
    ImageDraw.floodfill(flat, corner, CREAM, thresh=90)

# The flood stops at the antialiasing, leaving a grey thread along the arc.
# A mask a few pixels inside the measured radius takes it with it.
inside = Image.new('L', (W, W), 0)
ImageDraw.Draw(inside).rounded_rectangle([3, 3, W - 4, W - 4], radius=RADIUS + 6, fill=255)
page = Image.new('RGB', (W, W), CREAM)
page.paste(flat, (0, 0), inside)
flat = page

# What is left that is not the page is the mark: the black X and the gold bar.
px = flat.load()
minx, miny, maxx, maxy = W, W, -1, -1
for y in range(W):
    for x in range(W):
        r, g, b = px[x, y]
        if abs(r - CREAM[0]) + abs(g - CREAM[1]) + abs(b - CREAM[2]) > 60:
            minx, miny = min(minx, x), min(miny, y)
            maxx, maxy = max(maxx, x), max(maxy, y)
mark = flat.crop((minx, miny, maxx + 1, maxy + 1))
print(f'radius {RADIUS}, mark {mark.size} of {W}')


def sized(fraction, canvas):
    m = mark.copy()
    m.thumbnail((int(canvas * fraction), int(canvas * fraction)), Image.LANCZOS)
    return m


def alpha_mark(fraction, canvas):
    """The mark on transparency, its ink lifted off the page it was painted on.

    Alpha is not a brightness ramp. Every pixel here is ink laid over cream at
    some coverage, so the coverage is recovered per channel and the ink colour
    un-premultiplied out of it: painting the result back over cream reproduces
    the original exactly. Reading alpha off the distance from cream instead —
    the obvious version — leaves the gold bar at two-thirds opacity and the
    brush stroke goes pale.
    """
    m = sized(fraction, canvas)
    out = Image.new('RGBA', m.size)
    mp, op = m.load(), out.load()
    for y in range(m.height):
        for x in range(m.width):
            c = mp[x, y]
            a = max((CREAM[i] - c[i]) / CREAM[i] for i in range(3))
            if a <= 0.004:
                op[x, y] = (0, 0, 0, 0)
                continue
            a = min(a, 1.0)
            ink = tuple(
                max(0, min(255, int(round((c[i] - (1 - a) * CREAM[i]) / a)))) for i in range(3)
            )
            op[x, y] = ink + (int(round(a * 255)),)
    return out


def on_cream(canvas, fraction):
    out = Image.new('RGB', (canvas, canvas), CREAM)
    m = sized(fraction, canvas)
    out.paste(m, ((canvas - m.width) // 2, (canvas - m.height) // 2))
    return out


def centred(canvas, layer, alpha=True):
    out = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    out.paste(layer, ((canvas - layer.width) // 2, (canvas - layer.height) // 2), layer if alpha else None)
    return out


# The launcher icon. 0.84 rather than full bleed: the arms of the X run for the
# corners, which is exactly where every platform mask cuts.
on_cream(1024, 0.84).save(f'{OUT}/icon.png')

# Android adaptive. The foreground is masked to a shape the manufacturer picks
# and shifted for parallax, so nothing may sit outside the 66% safe zone — an X
# drawn to the edges would lose its arms to a circle.
centred(512, alpha_mark(0.58, 512)).save(f'{OUT}/android-icon-foreground.png')
Image.new('RGBA', (512, 512), CREAM + (255,)).save(f'{OUT}/android-icon-background.png')

# The themed icon: Android tints it by the wallpaper, so only the alpha counts.
m = alpha_mark(0.58, 432)
solid = Image.new('RGBA', m.size, (0, 0, 0, 255))
solid.putalpha(m.getchannel('A'))
centred(432, solid).save(f'{OUT}/android-icon-monochrome.png')

# The splash. Its ground is the Void, and a black X on near-black is nothing,
# so the mark keeps its cream tile there — the app's own card, on the dark.
S = 1024
mask = Image.new('L', (S * 4, S * 4), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S * 4 - 1, S * 4 - 1], radius=int(S * 4 * 0.22), fill=255)
mask = mask.resize((S, S), Image.LANCZOS)
tile = on_cream(S, 0.76).convert('RGBA')
tile.putalpha(mask)
tile.save(f'{OUT}/splash-icon.png')

on_cream(48, 0.88).convert('RGBA').save(f'{OUT}/favicon.png')
print('written')
