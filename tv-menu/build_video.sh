#!/usr/bin/env bash
# 一鍵產生電視菜單影片：菜單底圖（1920x1080）＋右上 640x560 輪播
# 需要：node + playwright（產生底圖與字卡）、ffmpeg
# 用法：./build_video.sh [輸出檔名]，預設 build/yang-tv-menu.mp4
set -euo pipefail
cd "$(dirname "$0")"
out=${1:-build/yang-tv-menu.mp4}
mkdir -p build

# 1. 產生底圖與字卡
node render.js "file://$PWD/menu.html?prod" build/menu-bg.png 1920 1080
for c in lurou soup1 soup2; do node render.js "file://$PWD/slides.html?card=$c" "build/ov_$c.png" 640 560 transparent; done
for c in meal combo qr; do node render.js "file://$PWD/slides.html?card=$c" "build/card_$c.png" 640 560; done

FPS=30
XF=0.5   # 轉場秒數

# 2. 各段落：照片緩慢推近（Ken Burns）＋字帶；字卡靜態
photo() { # 照片 字帶 秒數 輸出
  local n=$(( $3 * FPS ))
  ffmpeg -loglevel error -y -i "$1" -loop 1 -i "$2" -filter_complex \
    "[0:v]scale=1280:1120,zoompan=z='1+0.0008*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$n:s=640x560:fps=$FPS[p];[p][1:v]overlay=0:0:shortest=1,format=yuv420p" \
    -frames:v $n -c:v libx264 -crf 16 "$4"
}
card() { # 字卡 秒數 輸出
  ffmpeg -loglevel error -y -loop 1 -framerate $FPS -i "$1" -t "$2" -vf format=yuv420p -c:v libx264 -crf 16 "$3"
}
photo assets/lurou.jpg build/ov_lurou.png 5 build/s1.mp4
card  build/card_meal.png 5 build/s2.mp4
photo assets/soup1.jpg build/ov_soup1.png 5 build/s3.mp4
photo assets/soup2.jpg build/ov_soup2.png 5 build/s4.mp4
card  build/card_combo.png 5 build/s5.mp4
card  build/card_qr.png 7 build/s6.mp4

# 3. 交叉淡入串接（offset = 前面累計長度 - 轉場 × 次數）
durs=(5 5 5 5 5 7)
inputs=(); for i in 1 2 3 4 5 6; do inputs+=(-i "build/s$i.mp4"); done
fc=""; prev="[0:v]"; acc=${durs[0]}
for i in 1 2 3 4 5; do
  off=$(awk "BEGIN{print $acc - $XF * $i}")
  fc+="${prev}[$i:v]xfade=transition=fade:duration=$XF:offset=$off[x$i];"
  prev="[x$i]"; acc=$(( acc + durs[i] ))
done
ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex "${fc%;}" -map "$prev" -c:v libx264 -crf 16 build/loop.mp4

# 4. 疊到菜單底圖，輸出電視相容格式（H.264 High@4.0、yuv420p、30fps、無音軌）
ffmpeg -loglevel error -y -loop 1 -framerate $FPS -i build/menu-bg.png -i build/loop.mp4 \
  -filter_complex "[0:v][1:v]overlay=1280:0:shortest=1,format=yuv420p" \
  -c:v libx264 -profile:v high -level 4.0 -preset slow -crf 20 -maxrate 10M -bufsize 20M \
  -r $FPS -an -movflags +faststart "$out"
echo "完成：$out"
