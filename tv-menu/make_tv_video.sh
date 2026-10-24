#!/usr/bin/env bash
# 把菜單圖（1920x1080）與多支影片片段合成（疊在右上 640x560 影片區）一支電視可 USB 播放的 MP4。
# 用法：./make_tv_video.sh menu.png 輸出.mp4 片段1.mp4 [片段2.mp4 ...]
# 片段建議拍 1:1 方形（1080x1080），每支 6–10 秒，不需要聲音。
set -euo pipefail

if [ $# -lt 3 ]; then
  echo "用法：$0 menu.png 輸出.mp4 片段1.mp4 [片段2.mp4 ...]" >&2
  exit 1
fi

menu=$1; out=$2; shift 2

inputs=(-loop 1 -framerate 30 -i "$menu")
filters=""
labels=""
i=1
for clip in "$@"; do
  inputs+=(-i "$clip")
  # 等比縮放後置中裁成 640x560
  filters+="[$i:v]scale=640:560:force_original_aspect_ratio=increase,crop=640:560,setsar=1,fps=30[c$i];"
  labels+="[c$i]"
  i=$((i + 1))
done
n=$#

filters+="${labels}concat=n=$n:v=1:a=0[vid];"
filters+="[0:v][vid]overlay=1280:0:shortest=1,format=yuv420p[outv]"

# H.264 High@4.0、yuv420p、30fps、無音軌：老電視 USB 播放相容性最高的組合
ffmpeg -y "${inputs[@]}" -filter_complex "$filters" -map "[outv]" \
  -c:v libx264 -profile:v high -level 4.0 -preset slow -crf 20 -maxrate 10M -bufsize 20M \
  -r 30 -an -movflags +faststart "$out"
