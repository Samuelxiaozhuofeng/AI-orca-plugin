#!/bin/bash
# 生成「Orca Agent Bridge.app」：无 Dock 图标的小 App，打开即在后台跑本仓库的 bridge。
# App 常驻到 bridge 退出为止：实测 App 先退出时 bridge 的「责任进程」变成 node 自己，系统权限就归不到这个 App 上。
# 用法：bash bridge/build-app.sh [--out <目录>]（默认装到 /Applications）
set -euo pipefail

OUT_DIR=/Applications
if [ "${1:-}" = "--out" ]; then OUT_DIR="${2:?--out 缺少目录}"; fi
BRIDGE="$(cd "$(dirname "$0")" && pwd)/orca-agent-bridge.mjs"
NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "找不到 node，请先安装 Node 18+" >&2; exit 1; }
APP="$OUT_DIR/Orca Agent Bridge.app"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# App 内的启动脚本：补全 PATH（App 从 Finder/Orca 启动时没有终端里的 PATH，bridge 要靠它找到 claude）
cat > "$WORK/launch.sh" <<SH
#!/bin/bash
NODE=$(printf '%q' "$NODE")
BRIDGE=$(printf '%q' "$BRIDGE")
SH
cat >> "$WORK/launch.sh" <<'SH'
EXTRA="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/.volta/bin:$HOME/.bun/bin:$HOME/.claude/local"
for d in "$HOME"/.nvm/versions/node/*/bin; do [ -d "$d" ] && EXTRA="$EXTRA:$d"; done
export PATH="$EXTRA:$(dirname "$NODE"):${PATH:-/usr/bin:/bin:/usr/sbin:/sbin}"
HOME_DIR="${ORCA_BRIDGE_HOME:-$HOME/.orca-agent-bridge}"
PORT="${ORCA_BRIDGE_PORT:-18673}"
# 已在监听就不再起第二个
/usr/bin/nc -z 127.0.0.1 "$PORT" 2>/dev/null && exit 0
umask 077
mkdir -p "$HOME_DIR"
LOG="$HOME_DIR/bridge.log"
touch "$LOG" && chmod 600 "$LOG"
# 前台运行，App 一直陪着 bridge；bridge 被 pkill 或端口被占退出时不弹错误框
"$NODE" "$BRIDGE" >>"$LOG" 2>&1 </dev/null || true
SH

cat > "$WORK/main.applescript" <<'AS'
do shell script quoted form of (POSIX path of (path to resource "launch.sh"))
AS

mkdir -p "$OUT_DIR"
rm -rf "$APP"
osacompile -o "$APP" "$WORK/main.applescript"
install -m 755 "$WORK/launch.sh" "$APP/Contents/Resources/launch.sh"
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$APP/Contents/Info.plist"
codesign --force --deep -s - "$APP"
echo "已生成：$APP"
echo "node：$NODE"
echo "bridge：$BRIDGE"
