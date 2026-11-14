#!/bin/bash
# AMES turntable render - run on a rented NVIDIA GPU box:   bash run.sh
# Renders the four pieces first, then the 29 gemstones. It packs and zips
# after every item, so if credit runs out you keep everything finished so far
# in ~/ames-spins.zip. Re-running resumes where it stopped.
set -e
cd "$(dirname "$0")"
KIT=$(pwd)
mkdir -p ~/cuts && ln -sfn "$KIT"/pieces ~/cuts/pieces
if [ ! -d .venv ]; then
  command -v uv >/dev/null || { curl -LsSf https://astral.sh/uv/install.sh | sh; }
  export PATH=$HOME/.local/bin:$PATH
  uv venv -p 3.13 .venv
  uv pip install -p .venv/bin/python bpy==5.3.0 pillow
fi
PY="$KIT/.venv/bin/python"
export GPU=${GPU:-1}
pack() { (cd ~/cuts && "$PY" "$KIT/pack_spins.py" >/dev/null && "$PY" -c "import shutil,os; shutil.make_archive(os.path.expanduser('~/ames-spins'), 'zip', os.path.expanduser('~/cuts/dist'), 'ames-engine')"); }
for p in ${PIECES:-ring earrings bracelet necklace}; do
  echo "=== $p  $(date +%H:%M)"
  FRAMES=${PIECE_FRAMES:-72} SIZE=1080 DETAIL=${DETAIL:-1440} SPP=${PIECE_SPP:-320} "$PY" -I build_piece.py $p spin 2>&1 | grep -E "TURN|STUDIO|rror|Trace"
  pack; echo "    packed $p -> ~/ames-spins.zip"
done
echo "=== gemstones  $(date +%H:%M)"
FRAMES=${GEM_FRAMES:-36} SIZE=1080 SPP=${GEM_SPP:-220} "$PY" -I gems.py ${GEMS:-} 2>&1 | while read -r l; do
  case "$l" in *"GEM DONE"*) echo "$l"; pack;; *STUDIO*|*rror*|*Trace*) echo "$l";; esac
done
pack
echo "ALL DONE $(date +%H:%M) - download ~/ames-spins.zip"
