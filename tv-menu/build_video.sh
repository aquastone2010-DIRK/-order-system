#!/usr/bin/env bash
# 一鍵產生電視菜單影片：菜單底圖（1920x1080）＋右上 640x560 輪播
# 需要：python3（Pillow、numpy）、node + playwright、ffmpeg
# 用法：./build_video.sh [輸出檔名]，預設 build/yang-tv-menu.mp4
set -euo pipefail
cd "$(dirname "$0")"
out=${1:-build/yang-tv-menu.mp4}
mkdir -p build

FPS=30
XF=0.5     # 轉場秒數
FOCUS=0.375  # 推近中心點的高度比例（照片窗 420px 的中央 = 210/560）
# 色彩：一律在 RGB 合成，輸出時明確轉成 BT.709 電視範圍並標記，避免轉檔時偏灰、偏黃
TOYUV="scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"
TORGB="scale=in_color_matrix=bt709:in_range=tv,format=rgb24"
COLOR=(-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv)

# 輪播順序：名稱 類型（photo＝照片＋字帶，card＝文字卡） 秒數
SEQ=(
  "home photo 5"
  "lurou photo 5"
  "chicken photo 5"
  "pork photo 5"
  "meal card 5"
  "soup1 photo 5"
  "soup2 photo 5"
  "tofu photo 5"
  "combo card 5"
  "qr card 7"
)

# 1. 照片畫布、菜單底圖、字卡
python3 prep_photos.py >/dev/null
node render.js "file://$PWD/menu.html?prod" build/menu-bg.png 1920 1080

i=0; durs=(); inputs=()
for row in "${SEQ[@]}"; do
  read -r name kind sec <<<"$row"
  i=$((i + 1)); n=$((sec * FPS)); durs+=("$sec")
  if [ "$kind" = photo ]; then
    node render.js "file://$PWD/slides.html?card=$name" "build/ov_$name.png" 640 560 transparent
    # 2. 照片緩慢推近（Ken Burns），再疊上字帶
    ffmpeg -loglevel error -y -i "build/c_$name.jpg" -loop 1 -i "build/ov_$name.png" -filter_complex \
      "[0:v]format=rgb24,zoompan=z='1+0.0008*on':x='iw/2-(iw/zoom/2)':y='ih*$FOCUS-(ih/zoom*$FOCUS)':d=$n:s=640x560:fps=$FPS[p];[1:v]format=rgba[o];[p][o]overlay=0:0:shortest=1:format=rgb,$TOYUV" \
      -frames:v $n -c:v libx264 -crf 16 "${COLOR[@]}" "build/s$i.mp4"
  else
    node render.js "file://$PWD/slides.html?card=$name" "build/card_$name.png" 640 560
    ffmpeg -loglevel error -y -loop 1 -framerate $FPS -i "build/card_$name.png" -t "$sec" -vf "format=rgb24,$TOYUV" -c:v libx264 -crf 16 "${COLOR[@]}" "build/s$i.mp4"
  fi
  inputs+=(-i "build/s$i.mp4")
done

# 3. 交叉淡入串接（offset = 前面累計長度 - 轉場 × 次數）
fc=""; prev="[0:v]"; acc=${durs[0]}
for ((k = 1; k < ${#durs[@]}; k++)); do
  off=$(awk "BEGIN{print $acc - $XF * $k}")
  fc+="${prev}[$k:v]xfade=transition=fade:duration=$XF:offset=$off[x$k];"
  prev="[x$k]"; acc=$((acc + durs[k]))
done
ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex "${fc%;}" -map "$prev" -c:v libx264 -crf 16 "${COLOR[@]}" build/loop.mp4

# 4. 疊到菜單底圖，輸出電視相容格式（H.264 High@4.0、yuv420p、30fps、無音軌）
ffmpeg -loglevel error -y -loop 1 -framerate $FPS -i build/menu-bg.png -i build/loop.mp4 \
  -filter_complex "[0:v]format=rgb24[m];[1:v]$TORGB[v];[m][v]overlay=1280:0:shortest=1:format=rgb,$TOYUV" \
  -c:v libx264 -profile:v high -level 4.0 -preset slow -crf 20 -maxrate 10M -bufsize 20M \
  -r $FPS -an "${COLOR[@]}" -movflags +faststart "$out"
echo "完成：$out"
