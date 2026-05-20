#!/usr/bin/env python3
"""Generate a simple icon for the brewItInstead extension."""
from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT_DIR, exist_ok=True)

BG = (251, 146, 60, 255)
RING = (194, 65, 12, 255)
FG = (255, 255, 255, 255)

def font_for(size_px):
    candidates = [
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size_px)
            except Exception:
                continue
    return ImageFont.load_default()

def make(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = max(1, size // 16)
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=size // 5,
        fill=BG,
        outline=RING,
        width=max(1, size // 32),
    )
    font_size = int(size * 0.62)
    font = font_for(font_size)
    text = "B"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] - size * 0.03
    draw.text((x, y), text, font=font, fill=FG)
    return img

for size in (48, 128):
    img = make(size)
    out = os.path.join(OUT_DIR, f"icon-{size}.png")
    img.save(out, "PNG")
    print("wrote", out)
