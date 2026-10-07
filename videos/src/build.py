# -*- coding: utf-8 -*-
"""品富餐飲 店內短影片產生器：腳本 → 台灣華語配音 → 動態字卡 → 1080p MP4（固定 90 秒）

用法：
  python build.py --fonts FONT_DIR --emoji EMOJI_DIR --work WORK_DIR --out OUT_DIR [--only 01,02]

FONT_DIR 需有 NotoSansTC.ttf（Google Fonts 可變字重版）；
EMOJI_DIR 需有 <碼位>.png（Noto Emoji 512px）。
"""
import argparse, asyncio, hashlib, math, os, random, re, ssl, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import imageio_ffmpeg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content import VIDEOS  # noqa: E402

W, H, FPS, TOTAL = 1920, 1080, 25, 90.0
SR = 24000
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
CA_BUNDLE = os.environ.get("TTS_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
RATES = ["+0%", "+5%", "+10%"]  # 由慢到快，挑最慢且放得進 90 秒者（超過 +10% 會太趕）


# ---------------- 配音 ----------------
def tts(text, voice, rate, out):
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return
    import edge_tts.communicate as c
    if os.path.exists(CA_BUNDLE):
        c._SSL_CTX = ssl.create_default_context(cafile=CA_BUNDLE)
    import edge_tts
    for attempt in range(4):
        try:
            asyncio.run(edge_tts.Communicate(text, voice, rate=rate).save(out))
            if os.path.getsize(out) > 0:
                return
        except Exception as e:  # 網路偶發中斷時重試
            print("  TTS retry", attempt + 1, e)
    raise RuntimeError("TTS failed: " + text[:20])


def decode(path):
    raw = subprocess.run([FFMPEG, "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def plan_timing(video, work):
    """選擇語速並分配每幕時長，總長固定 90 秒。"""
    for rate in RATES:
        clips = []
        for i, s in enumerate(video["scenes"]):
            key = hashlib.sha1(f"{video['voice']}|{rate}|{s['say']}".encode()).hexdigest()[:12]
            p = os.path.join(work, f"v{video['id']}_s{i:02d}_{key}.mp3")  # 以文字內容為快取鍵，改稿必重錄
            tts(s["say"], video["voice"], rate, p)
            clips.append(decode(p))
        lead, tail = 0.5, 0.7
        need = [len(a) / SR + lead + tail for a in clips]
        if sum(need) <= TOTAL - 1.0:
            extra = (TOTAL - sum(need)) / len(need)
            durs = [n + extra for n in need]
            durs[-1] = TOTAL - sum(durs[:-1])  # 浮點誤差補到最後一幕
            print(f"  [{video['id']}] rate={rate} speech={sum(len(a) for a in clips)/SR:.1f}s pad/scene={extra:.2f}s")
            return rate, clips, durs, lead
    raise RuntimeError("旁白過長，90 秒放不下，請縮短腳本")


# ---------------- 背景音樂（自行合成，無版權疑慮） ----------------
def music(total):
    n = int(total * SR)
    t = np.arange(n) / SR
    out = np.zeros(n, dtype=np.float64)
    base = 261.63
    semis = {"C": 0, "Am": -3, "F": -7, "G": -5}
    chords = {"C": [0, 4, 7], "Am": [0, 3, 7], "F": [0, 4, 7], "G": [0, 4, 7]}
    prog = ["C", "Am", "F", "G"]
    seg = 4.0
    for k in range(int(total // seg) + 1):
        name = prog[k % 4]
        root = base * 2 ** (semis[name] / 12)
        a, b = int(k * seg * SR), min(n, int((k * seg + seg + 1.0) * SR))
        if a >= n:
            break
        tt = t[a:b] - k * seg
        env = np.minimum(1, tt / 1.0) * np.minimum(1, np.maximum(0, (seg + 1.0 - tt)) / 1.0)
        for iv in chords[name]:
            f = root * 2 ** (iv / 12) / 2
            out[a:b] += env * (np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(4 * np.pi * f * tt)) * 0.10
        # 輕柔分解和弦
        for j in range(8):
            st = a + int(j * 0.5 * SR)
            if st >= n:
                break
            iv = chords[name][[0, 1, 2, 1, 0, 2, 1, 2][j]]
            f = root * 2 ** (iv / 12) * 2
            L = min(n - st, int(1.2 * SR))
            tl = np.arange(L) / SR
            out[st:st + L] += np.sin(2 * np.pi * f * tl) * np.exp(-tl * 4) * 0.06
    fade_in, fade_out = int(1.5 * SR), int(3.0 * SR)
    out[:fade_in] *= np.linspace(0, 1, fade_in)
    out[-fade_out:] *= np.linspace(1, 0, fade_out)
    return out / (np.abs(out).max() + 1e-9)


def build_audio(clips, durs, lead, path):
    n = int(TOTAL * SR)
    voice = np.zeros(n)
    t0 = 0.0
    for a, d in zip(clips, durs):
        st = int((t0 + lead) * SR)
        voice[st:st + len(a)] += a[: max(0, n - st)]
        t0 += d
    voice = voice / (np.abs(voice).max() + 1e-9) * 0.89          # 旁白峰值約 -1 dBFS
    mix = voice + music(TOTAL) * 0.12                            # 背景音樂約 -18 dB
    mix = np.clip(mix, -0.99, 0.99)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())


# ---------------- 畫面 ----------------
class Fonts:
    def __init__(self, path):
        self.path, self.cache = path, {}

    def get(self, size, weight="Bold"):
        k = (size, weight)
        if k not in self.cache:
            f = ImageFont.truetype(self.path, size)
            f.set_variation_by_name(weight)
            self.cache[k] = f
        return self.cache[k]


def text_sprite(text, font, fill=(255, 255, 255, 255), shadow=True):
    l, t, r, b = font.getbbox(text)
    pad = 16
    im = Image.new("RGBA", (r - l + pad * 2, b - t + pad * 2), (0, 0, 0, 0))
    if shadow:
        sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).text((pad - l + 3, pad - t + 4), text, font=font, fill=(0, 0, 0, 120))
        im = Image.alpha_composite(im, sh.filter(ImageFilter.GaussianBlur(4)))
    ImageDraw.Draw(im).text((pad - l, pad - t), text, font=font, fill=fill)
    return im


def fit_font(fonts, text, max_w, size, weight):
    while size > 28:
        f = fonts.get(size, weight)
        if f.getlength(text) <= max_w:
            return f
        size -= 4
    return fonts.get(size, weight)


def with_alpha(im, k):
    if k >= 0.999:
        return im
    im = im.copy()
    im.putalpha(im.getchannel("A").point(lambda a: int(a * max(0.0, k))))
    return im


def ease_out(x):
    x = min(1, max(0, x))
    return 1 - (1 - x) ** 3


def ease_back(x):
    x = min(1, max(0, x))
    c1 = 1.70158
    return 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2


def background(v):
    BW, BH = W + 400, H + 200
    y, x = np.mgrid[0:BH, 0:BW].astype(np.float32)
    g = np.clip((x / BW) * 0.55 + (y / BH) * 0.45, 0, 1)[..., None]
    c1, c2 = np.array(v["c1"], np.float32), np.array(v["c2"], np.float32)
    arr = (c1 * (1 - g) + c2 * g).astype(np.uint8)
    bg = Image.fromarray(arr, "RGB").convert("RGBA")
    rnd = random.Random(int(v["id"]))
    bok = Image.new("RGBA", (BW, BH), (0, 0, 0, 0))
    d = ImageDraw.Draw(bok)
    for _ in range(22):
        r = rnd.randint(60, 260)
        cx, cy = rnd.randint(0, BW), rnd.randint(0, BH)
        col = v["accent"] if rnd.random() < 0.35 else (255, 255, 255)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=col + (rnd.randint(10, 26),))
    bg = Image.alpha_composite(bg, bok.filter(ImageFilter.GaussianBlur(24)))
    return bg.convert("RGB")


def chunks(say):
    parts = [p for p in re.split(r"(?<=[，。？！：；、])", say) if p]
    out, cur = [], ""
    for p in parts:
        if len(cur) + len(p) <= 24:
            cur += p
        else:
            if cur:
                out.append(cur)
            cur = p
    if cur:
        out.append(cur)
    return out


def static_layer(v, fonts, idx, n):
    """每幕固定不動的部分：標頭、字幕底、進度條軌道。"""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((60, 36, 410, 112), 38, fill=(255, 255, 255, 34))
    d.text((90, 46), "PINFU", font=fonts.get(40, "Black"), fill=(255, 255, 255, 255))
    d.text((240, 50), "品富餐飲", font=fonts.get(34, "Bold"), fill=v["accent"] + (255,))
    label = f"{v['series']}｜{v['title']}"
    f = fonts.get(32, "Medium")
    d.text((W - 80 - f.getlength(label), 56), label, font=f, fill=(255, 255, 255, 220))
    # 幕次圓點
    for k in range(n):
        cx = 430 - (n - 1) * 14 + k * 28
        col = v["accent"] + (255,) if k == idx else (255, 255, 255, 80)
        d.ellipse((cx - 6, 820 - 6, cx + 6, 820 + 6), fill=col)
    d.rounded_rectangle((80, 868, W - 80, 996), 28, fill=(0, 0, 0, 110))
    d.rounded_rectangle((80, 1030, W - 80, 1040), 5, fill=(255, 255, 255, 50))
    return im


def render_video(v, durs, lead, clips, fonts, emoji_dir, audio_path, out_path, thumb_path):
    bg = background(v)
    n = len(v["scenes"])
    scenes = []
    for i, s in enumerate(v["scenes"]):
        icon = Image.open(os.path.join(emoji_dir, s["icon"] + ".png")).convert("RGBA").resize((300, 300), Image.LANCZOS)
        card = Image.new("RGBA", (480, 480), (0, 0, 0, 0))
        cd = ImageDraw.Draw(card)
        cd.ellipse((20, 20, 460, 460), fill=(255, 255, 255, 235))
        cd.ellipse((20, 20, 460, 460), outline=v["accent"] + (255,), width=10)
        card.alpha_composite(icon, (90, 90))
        sh = Image.new("RGBA", (560, 560), (0, 0, 0, 0))
        ImageDraw.Draw(sh).ellipse((60, 70, 500, 510), fill=(0, 0, 0, 90))
        sh = sh.filter(ImageFilter.GaussianBlur(18))
        sh.alpha_composite(card, (40, 40))
        head = text_sprite(s["head"], fit_font(fonts, s["head"], 1060, 92, "Black"))
        pts = []
        for p in s["points"]:
            f = fit_font(fonts, p, 900, 52, "Medium")
            tw = int(f.getlength(p))
            pill = Image.new("RGBA", (tw + 120, 96), (0, 0, 0, 0))
            pd = ImageDraw.Draw(pill)
            pd.rounded_rectangle((0, 0, tw + 110, 92), 46, fill=(255, 255, 255, 40))
            pd.ellipse((28, 34, 52, 58), fill=v["accent"] + (255,))
            l, t, r, b = f.getbbox(p)
            pd.text((72 - l, (92 - (b - t)) // 2 - t), p, font=f, fill=(255, 255, 255, 255))
            pts.append(pill)
        subs = chunks(s["say"])
        sub_imgs = [text_sprite(c.rstrip("，。、；："), fit_font(fonts, c, 1660, 50, "Bold")) for c in subs]
        speech = len(clips[i]) / SR
        total_chars = sum(len(c) for c in subs)
        bounds, acc = [], lead
        for c in subs:
            acc += speech * len(c) / total_chars
            bounds.append(acc)
        scenes.append(dict(card=sh, head=head, pts=pts, subs=sub_imgs, bounds=bounds,
                           static=static_layer(v, fonts, i, n), dur=durs[i]))

    cmd = [FFMPEG, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-i", audio_path, "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p",
           "-profile:v", "high", "-level", "4.1", "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
           "-t", f"{TOTAL:.2f}", "-movflags", "+faststart", out_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    total_frames = int(TOTAL * FPS)
    starts = np.cumsum([0] + durs[:-1])
    thumb_frame = int((starts[1] + 2.5) * FPS)
    for fi in range(total_frames):
        t = fi / FPS
        si = min(n - 1, int(np.searchsorted(starts, t, side="right") - 1))
        sc, lt = scenes[si], t - starts[si]
        fade = min(ease_out(lt / 0.5), ease_out((sc["dur"] - lt) / 0.4)) if si < n - 1 else ease_out(lt / 0.5)
        ox = int(60 + 40 * math.sin(t * 0.25))
        oy = int(50 + 30 * math.cos(t * 0.2))
        frame = bg.crop((ox, oy, ox + W, oy + H)).convert("RGBA")
        frame.alpha_composite(sc["static"])
        # 圖示卡：彈出 + 漂浮
        sc_k = 0.82 + 0.18 * ease_back(lt / 0.7)
        size = int(560 * sc_k)
        card = sc["card"].resize((size, size), Image.BILINEAR) if size != 560 else sc["card"]
        fy = int(8 * math.sin(lt * 1.6))
        frame.alpha_composite(with_alpha(card, fade), (430 - size // 2, 470 - size // 2 + fy))
        # 標題：滑入
        e = ease_out(lt / 0.6)
        frame.alpha_composite(with_alpha(sc["head"], fade * e), (780 + int(70 * (1 - e)), 230))
        for k, pill in enumerate(sc["pts"]):
            ek = ease_out((lt - 0.45 - 0.35 * k) / 0.5)
            if ek > 0:
                frame.alpha_composite(with_alpha(pill, fade * ek), (790 + int(50 * (1 - ek)), 420 + k * 120))
        # 字幕
        ci = next((k for k, b in enumerate(sc["bounds"]) if lt < b), len(sc["bounds"]) - 1)
        sub = sc["subs"][ci]
        frame.alpha_composite(with_alpha(sub, fade), ((W - sub.width) // 2, 932 - sub.height // 2))
        # 進度條
        ImageDraw.Draw(frame).rounded_rectangle((80, 1030, 80 + max(10, int((W - 160) * t / TOTAL)), 1040), 5,
                                                fill=v["accent"] + (255,))
        rgb = frame.convert("RGB")
        if fi == thumb_frame:
            rgb.save(thumb_path, quality=88)
        proc.stdin.write(rgb.tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("ffmpeg failed")


# ---------------- 匯出：字幕、分鏡時間表、音軌（給 Gemini 實拍版剪輯用） ----------------
def fmt_srt(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def export_extras(v, clips, durs, lead, wav, base):
    import json
    rows, srt, t0, n = [], [], 0.0, 1
    for i, (s, d) in enumerate(zip(v["scenes"], durs)):
        subs = chunks(s["say"])
        speech = len(clips[i]) / SR
        total_chars = sum(len(c) for c in subs)
        st = t0 + lead
        for c in subs:
            en = st + speech * len(c) / total_chars
            srt.append(f"{n}\n{fmt_srt(st)} --> {fmt_srt(en)}\n{c.rstrip('，。、；：')}\n")
            n, st = n + 1, en
        rows.append({"scene": i + 1, "start": round(t0, 2), "end": round(t0 + d, 2), "head": s["head"],
                     "say": s["say"], "veo": s["veo"]})
        t0 += d
    with open(base + ".srt", "w", encoding="utf-8") as f:
        f.write("\n".join(srt))
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump({"id": v["id"], "title": v["title"], "series": v["series"], "voice": v["voice"],
                   "scenes": rows}, f, ensure_ascii=False, indent=1)
    subprocess.run([FFMPEG, "-y", "-v", "error", "-i", wav, "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
                    base + "_配音音軌.m4a"], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fonts", required=True)
    ap.add_argument("--emoji", required=True)
    ap.add_argument("--work", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--no-video", action="store_true", help="只輸出音軌／字幕／時間表")
    a = ap.parse_args()
    os.makedirs(a.work, exist_ok=True); os.makedirs(a.out, exist_ok=True)
    fonts = Fonts(os.path.join(a.fonts, "NotoSansTC.ttf"))
    only = set(filter(None, a.only.split(",")))
    for v in VIDEOS:
        if only and v["id"] not in only:
            continue
        rate, clips, durs, lead = plan_timing(v, a.work)
        wav = os.path.join(a.work, f"v{v['id']}.wav")
        build_audio(clips, durs, lead, wav)
        name = f"PINFU_{v['id']}_{v['title'].replace(' ', '')}"
        extras = os.path.join(a.out, "gemini_kit")
        os.makedirs(extras, exist_ok=True)
        export_extras(v, clips, durs, lead, wav, os.path.join(extras, name))
        if a.no_video:
            continue
        thumbs = os.path.join(a.out, "thumbs")
        os.makedirs(thumbs, exist_ok=True)
        render_video(v, durs, lead, clips, fonts, a.emoji, wav,
                     os.path.join(a.out, name + ".mp4"), os.path.join(thumbs, name + ".jpg"))
        print(f"  done {name}.mp4")


if __name__ == "__main__":
    main()
