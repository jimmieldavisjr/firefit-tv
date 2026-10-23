# Builds the app's image assets from the owner's reference art in docs/reference (private, gitignored):
#  - exercise photos + cover/fire backgrounds for the web app (JPEG, sized for the 1.3 GB Fire TV Stick)
#  - Fire TV launcher banner (320x180 + 640x360) and icon from the FireFIT app-card art
#  - 1920x1080 store background for an Appstore listing
# Third-party logos visible on shoes are blurred so they don't appear in the app or the demo video.
#   uv run --with pillow python scripts/make-assets.py
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "docs/reference"
WEB = ROOT / "apps/web/public/img"
RES = ROOT / "apps/tv-shell/app/src/main/res"
STORE = ROOT / "docs/store-assets"
for d in (WEB, STORE, RES / "drawable", RES / "drawable-xhdpi", RES / "mipmap-xhdpi", RES / "mipmap-xxxhdpi"):
    d.mkdir(parents=True, exist_ok=True)


def blur(img: Image.Image, boxes: list[tuple[int, int, int, int]], radius: int = 6) -> Image.Image:
    """Soft, feathered elliptical blur over each box so the edit blends into the shoe."""
    blurred = img.filter(ImageFilter.GaussianBlur(radius))
    mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(mask)
    for box in boxes:
        draw.ellipse(box, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(10))
    return Image.composite(blurred, img, mask)


# Shoe-logo regions (pixel boxes in each source image)
EXERCISES = {
    "squat": ("workouts/firefit_squat_landscape.png", [(500, 565, 585, 640), (770, 560, 915, 622)]),
    "pushup": ("workouts/firefit_pushup_landscape.png", [(252, 445, 365, 548)]),
    "plank": ("workouts/firefit_plank_landscape.png", [(287, 402, 395, 500)]),
}
for name, (src, boxes) in EXERCISES.items():
    im = blur(Image.open(REF / src).convert("RGB"), boxes)
    im.save(WEB / f"{name}.jpg", quality=80, optimize=True, progressive=True)
    im.resize((640, 360), Image.LANCZOS).save(WEB / f"{name}-sm.jpg", quality=78, optimize=True)

cover = blur(Image.open(REF / "cover-photo.png").convert("RGB"), [(1020, 772, 1125, 872), (1430, 745, 1600, 868)])
cover.save(WEB / "cover.jpg", quality=80, optimize=True, progressive=True)
cover.resize((1920, 1080), Image.LANCZOS).save(STORE / "fire-tv-background-1920x1080.jpg", quality=88, optimize=True)

card = Image.open(REF / "app-card.png").convert("RGB")  # 1672x941, the FireFIT flame + wordmark
card.save(WEB / "fire-bg.jpg", quality=80, optimize=True, progressive=True)
card.resize((1280, 720), Image.LANCZOS).save(STORE / "fire-tv-app-card-1280x720.jpg", quality=88, optimize=True)

# Launcher banner: 16:9 crop around the logo
w, h = card.size
crop = card.crop((int(w * 0.08), int(h * 0.12), int(w * 0.92), int(h * 0.12) + int(w * 0.84 * 9 / 16)))
crop.resize((320, 180), Image.LANCZOS).save(RES / "drawable/banner.png", optimize=True)
crop.resize((640, 360), Image.LANCZOS).save(RES / "drawable-xhdpi/banner.png", optimize=True)

# Icon: the flame, square
flame = card.crop((int(w * 0.13), int(h * 0.17), int(w * 0.13) + int(h * 0.56), int(h * 0.17) + int(h * 0.56)))
flame.resize((96, 96), Image.LANCZOS).save(RES / "mipmap-xhdpi/ic_launcher.png", optimize=True)
flame.resize((192, 192), Image.LANCZOS).save(RES / "mipmap-xxxhdpi/ic_launcher.png", optimize=True)
print("assets written:", sorted(p.name for p in WEB.iterdir()))
