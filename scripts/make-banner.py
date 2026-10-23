# Generates the Fire TV launcher banner (320x180) and icon. Original artwork: a flame mark + wordmark,
# deliberately no arrow/smile under the logo (third-party trademark).
#   uv run --with pillow python scripts/make-banner.py
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RES = Path(__file__).resolve().parent.parent / "apps/tv-shell/app/src/main/res"
BG, ORANGE, WHITE = (11, 15, 23), (255, 122, 26), (232, 237, 245)


def font(size: int, bold: bool = True):
    for name in (["arialbd.ttf", "DejaVuSans-Bold.ttf"] if bold else ["arial.ttf", "DejaVuSans.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def flame(d: ImageDraw.ImageDraw, cx: float, cy: float, s: float):
    d.polygon([(cx, cy - s), (cx + s * 0.62, cy + s * 0.15), (cx + s * 0.4, cy + s * 0.75),
               (cx - s * 0.4, cy + s * 0.75), (cx - s * 0.62, cy + s * 0.15)], fill=ORANGE)
    d.polygon([(cx, cy - s * 0.15), (cx + s * 0.3, cy + s * 0.35), (cx + s * 0.2, cy + s * 0.75),
               (cx - s * 0.2, cy + s * 0.75), (cx - s * 0.3, cy + s * 0.35)], fill=(255, 200, 120))


banner = Image.new("RGB", (320, 180), BG)
d = ImageDraw.Draw(banner)
flame(d, 62, 82, 42)
d.text((112, 52), "fire", font=font(54), fill=WHITE)
d.text((112 + d.textlength("fire", font=font(54)), 52), "fit", font=font(54), fill=ORANGE)
d.text((114, 118), "form coach", font=font(22, bold=False), fill=(154, 166, 184))
(RES / "drawable").mkdir(parents=True, exist_ok=True)
banner.save(RES / "drawable/banner.png")

icon = Image.new("RGB", (96, 96), BG)
flame(ImageDraw.Draw(icon), 48, 44, 36)
(RES / "mipmap-xhdpi").mkdir(parents=True, exist_ok=True)
icon.save(RES / "mipmap-xhdpi/ic_launcher.png")
print("wrote banner.png and ic_launcher.png")
