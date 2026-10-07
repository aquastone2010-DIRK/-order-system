# 品富餐飲 店內 AI 短影片

| 檔案 | 說明 |
|---|---|
| `PINFU_00_店內循環合輯_6部.mp4` | 6 部串接，9 分鐘，分店循環播放用 |
| `PINFU_01`～`PINFU_06_*.mp4` | 單部成品，各 90 秒，1080p H.264＋AAC |
| `品富店內AI短影片_小白操作手冊.docx` | USB 播放教學、Gemini 製作教學、分鏡表與提示詞、數據來源 |
| `gemini_kit/` | 每部的配音音軌（.m4a）、字幕（.srt）、分鏡時間表（.json），套用 Gemini 實拍畫面時使用 |
| `thumbs/` | 每部影片縮圖 |
| `src/` | 腳本（`content.py`）與產生程式 |

## 修改腳本後重製

```bash
pip install pillow numpy imageio-ffmpeg edge-tts python-docx
python src/build.py --fonts FONT_DIR --emoji EMOJI_DIR --work WORK_DIR --out OUT_DIR
python src/make_guide.py OUT_DIR/gemini_kit 手冊.docx
```

- `FONT_DIR/NotoSansTC.ttf`：Google Fonts「Noto Sans TC」可變字重版
- `EMOJI_DIR/<碼位>.png`：Noto Emoji 512px 圖示（`https://fonts.gstatic.com/s/e/notoemoji/latest/<碼位>/512.png`）
- 配音使用 edge-tts 台灣華語語音；程式會自動挑選能放進 90 秒的最慢語速（上限 +10%）
