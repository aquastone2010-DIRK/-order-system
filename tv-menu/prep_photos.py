"""整理輪播與菜單用的照片素材。
1. 實拍俯拍盤：以霍夫圓偵測盤緣，去背成圓形 PNG（assets/plate_*.png），菜單與字卡共用。
2. 輪播畫布 1280x1120（build/c_*.jpg），供 build_video.sh 推近動畫；輸出畫面 640x560。
   - 盤子卡：深色聚光背景＋盤子與陰影，盤子置於上方，下方留給品名與價格。
   - 照片卡：AI 首頁圖、雞腿湯海報直接裁切滿版。"""
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1280, 1120
SRC = 'assets/src/'
PLATES = ['lurou', 'chicken', 'pork', 'tofu']


def cut_plate(k):
    g = cv2.GaussianBlur(cv2.imread(f'{SRC}real_{k}.jpg', 0), (9, 9), 2)
    c = cv2.HoughCircles(g, cv2.HOUGH_GRADIENT, dp=1.5, minDist=500, param1=60, param2=40, minRadius=400, maxRadius=480)
    x, y, r = c[0][0]
    r -= 3  # 往內縮一點，避開盤緣外的背景
    d = int(2 * r)
    x0, y0 = int(round(x - r)), int(round(y - r))
    im = Image.open(f'{SRC}real_{k}.jpg').convert('RGB').crop((x0, y0, x0 + d, y0 + d))
    mask = Image.new('L', (d * 4, d * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, d * 4 - 1, d * 4 - 1), fill=255)
    im.putalpha(mask.resize((d, d), Image.LANCZOS))
    im.save(f'assets/plate_{k}.png')
    return im


def spotlight():
    # 深色聚光背景：中央 #3A2215，四周 #120A06，加細微雜訊避免色階斷層
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.hypot((xx - W / 2) / (W * 0.62), (yy - H * 0.36) / (H * 0.62))
    t = np.clip(r, 0, 1)[..., None]
    c0, c1 = np.array([58, 34, 21]), np.array([18, 10, 6])
    a = c0 * (1 - t) + c1 * t + np.random.default_rng(1).normal(0, 2.2, (H, W, 1))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def plate_canvas(plate, out):
    bg = spotlight().convert('RGBA')
    d = 820
    p = plate.resize((d, d), Image.LANCZOS)
    x, y = (W - d) // 2, 40
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((x + 10, y + 50, x + d + 10, y + d + 50), fill=(0, 0, 0, 170))
    bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(36)))
    bg.alpha_composite(p, (x, y))
    bg.convert('RGB').save(out, quality=92)


def crop_fill(src, box, out):
    Image.open(SRC + src).convert('RGB').crop(box).resize((W, H), Image.LANCZOS).save(out, quality=92)


if __name__ == '__main__':
    for k in PLATES:
        plate_canvas(cut_plate(k), f'build/c_{k}.jpg')
    crop_fill('ai_lurou.jpg', (860, 220, 1500, 780), 'build/c_home.jpg')
    crop_fill('poster_soups.jpg', (70, 560, 910, 1295), 'build/c_soup1.jpg')
    crop_fill('poster_soups.jpg', (1090, 390, 1970, 1160), 'build/c_soup2.jpg')
    # 2400x1792 情境照，裁成 8:7
    crop_fill('ai_bowls.jpg', (176, 0, 2224, 1792), 'build/c_bowls.jpg')
    crop_fill('ai_counter.jpg', (60, 0, 2108, 1792), 'build/c_counter.jpg')
    crop_fill('ai_trotter.jpg', (0, 0, 2048, 1792), 'build/c_trotter.jpg')
