#!/usr/bin/env python3
"""產生 App 圖示（iOS／Android／桌面）

用法：
  python3 tools/make-icons.py                  # 有 img/brand-mark.png 就用它，否則用暫時的 ⚡ 圖示
  python3 tools/make-icons.py 路徑/logo.png     # 指定品牌標誌（建議：只含圖形標誌、正方形、透明或白底、≥1024px）

輸出（icons/）：
  icon-192.png、icon-512.png        Android／Chrome 安裝圖示
  maskable-512.png                  Android 自適應圖示（標誌縮在中央 80% 安全區內，外圍補底色）
  apple-touch-icon.png（180×180）    iPhone／iPad 主畫面圖示（iOS 不支援透明，補底色）
  favicon-32.png                    瀏覽器分頁圖示
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'icons'
BG = (250, 247, 240)        # 米白底（與品富食品標誌底色相近）
TEAL = (15, 118, 110)       # 快取GO 主色


def fallback_mark(size=1024):
    """暫時圖示：青綠圓角方塊＋白色閃電"""
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=size // 5, fill=TEAL)
    s = size / 100
    bolt = [(56, 12), (26, 56), (47, 56), (40, 88), (74, 42), (53, 42), (62, 12)]
    d.polygon([(x * s, y * s) for x, y in bolt], fill='white')
    return im


def load_mark(path):
    im = Image.open(path).convert('RGBA')
    # 去掉四周空白（依不透明度或接近白色判斷），再補成正方形
    bg = Image.new('RGBA', im.size, (255, 255, 255, 0))
    diff = Image.new('L', im.size)
    px, dp = im.load(), diff.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b, a = px[x, y]
            dp[x, y] = 255 if a > 20 and not (r > 235 and g > 230 and b > 220) else 0
    box = diff.getbbox() or (0, 0, *im.size)
    im = im.crop(box)
    side = max(im.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2), im)
    return sq


def compose(mark, size, scale, bg=None):
    canvas = Image.new('RGBA', (size, size), bg + (255,) if bg else (0, 0, 0, 0))
    inner = int(size * scale)
    m = mark.resize((inner, inner), Image.LANCZOS)
    canvas.paste(m, ((size - inner) // 2, (size - inner) // 2), m)
    return canvas


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'img' / 'brand-mark.png'
    if src.exists():
        mark, branded = load_mark(src), True
    else:
        mark, branded = fallback_mark(), False
    OUT.mkdir(exist_ok=True)
    bg = BG if branded else None
    compose(mark, 192, 0.86 if branded else 1, bg).save(OUT / 'icon-192.png', optimize=True)
    compose(mark, 512, 0.86 if branded else 1, bg).save(OUT / 'icon-512.png', optimize=True)
    compose(mark, 512, 0.62, BG if branded else TEAL).save(OUT / 'maskable-512.png', optimize=True)
    compose(mark, 180, 0.80 if branded else 1, BG if branded else TEAL).convert('RGB').save(OUT / 'apple-touch-icon.png', optimize=True)
    compose(mark, 32, 0.94 if branded else 1, bg).save(OUT / 'favicon-32.png', optimize=True)
    print(('品牌標誌：' + str(src)) if branded else '找不到品牌標誌，使用暫時圖示（放入 img/brand-mark.png 後重跑即可）')
    for f in sorted(OUT.iterdir()):
        print(f'  {f.name:24} {Image.open(f).size}')


if __name__ == '__main__':
    main()
