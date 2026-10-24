"""把各來源照片整理成 1280x1120 畫布，供 build_video.sh 推近動畫使用。
輸出畫面 640x560 中，上方 640x420 是照片窗，下方字帶會蓋住其餘部分；
所以重點內容放在畫布上方 1280x840 的範圍內。"""
import numpy as np
from PIL import Image, ImageFilter

W, H, WIN = 1280, 1120, 840
SRC = 'assets/src/'


def crop_fill(src, box, out):
    # 依視窗比例裁切後放滿上方視窗
    im = Image.open(SRC + src).convert('RGB').crop(box).resize((W, WIN), Image.LANCZOS)
    canvas = Image.new('RGB', (W, H), im.getpixel((W // 2, WIN - 1)))
    canvas.paste(im, (0, 0))
    canvas.save(out, quality=92)


def plate(src, out, size=1000):
    # 俯拍盤子：邊緣羽化融入背景色，盤子置於視窗中央
    im = Image.open(SRC + src).convert('RGB').resize((size, size), Image.LANCZOS)
    a = np.asarray(im).astype(float)
    yy, xx = np.mgrid[0:size, 0:size]
    r = np.hypot(xx - size / 2, yy - size / 2) / size
    ring = (r > 0.45) & (r < 0.49)
    bg = tuple(int(v) for v in a[ring].mean(axis=0))
    mask = np.clip((0.49 - r) / 0.06, 0, 1)
    canvas = Image.new('RGB', (W, H), bg)
    m = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))
    canvas.paste(im, ((W - size) // 2, WIN // 2 - size // 2), m)
    canvas.save(out, quality=92)
    return bg


crop_fill('ai_lurou.jpg', (820, 260, 1560, 746), 'build/c_home.jpg')
crop_fill('poster_soups.jpg', (60, 560, 950, 1144), 'build/c_soup1.jpg')
crop_fill('poster_soups.jpg', (1080, 470, 1970, 1054), 'build/c_soup2.jpg')
for k in ['lurou', 'chicken', 'pork', 'tofu']:
    print(k, plate(f'real_{k}.jpg', f'build/c_{k}.jpg'))
