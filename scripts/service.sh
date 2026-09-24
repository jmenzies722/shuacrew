#!/bin/sh
# ShuaCrew's always-on gateway, as a per-user launchd agent: starts at login, restarts if it
# crashes, and keeps schedules, playbooks and revenue syncs going with the app closed.
#
#   pnpm service install     install and start it (replaces a gateway you started by hand)
#   pnpm service status      is it loaded, and is it answering
#   pnpm service restart     restart it (after pulling new gateway code)
#   pnpm service logs        follow the log
#   pnpm service uninstall   stop it and remove it from login
set -eu

LABEL="com.shuacrew.gateway"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${SHUACREW_HOME:-$HOME/.shuacrew}"
LOG="$HOME_DIR/gateway.log"
PORT="${SHUACREW_PORT:-7420}"
DOMAIN="gui/$(id -u)"

healthy() { curl -fsS -m 2 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; }
loaded() { launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; }

wait_healthy() {
  i=0
  while [ $i -lt 60 ]; do
    healthy && return 0
    sleep 0.5
    i=$((i + 1))
  done
  return 1
}

# Keep the log from growing forever: past 20 MB, keep one old copy.
rotate() {
  if [ -f "$LOG" ] && [ "$(stat -f%z "$LOG")" -gt 20971520 ]; then
    mv -f "$LOG" "$LOG.1"
  fi
}

# A gateway started by hand (or by the app) holds the port; stop it so the service can take over.
# Only ever a ShuaCrew gateway — anything else on the port is left alone and reported.
free_port() {
  for pid in $(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null || true); do
    if ps -o command= -p "$pid" | grep -q "src/main.ts"; then
      echo "  stopping the gateway you started by hand (pid $pid)"
      kill "$pid"
      j=0
      while kill -0 "$pid" 2>/dev/null && [ $j -lt 40 ]; do sleep 0.25; j=$((j + 1)); done
    else
      echo "  port $PORT is used by something else: $(ps -o command= -p "$pid")" >&2
      exit 1
    fi
  done
}

write_plist() {
  mkdir -p "$HOME/Library/LaunchAgents" "$HOME_DIR"
  # A login shell, so the gateway gets the PATH you have in Terminal and can find node, claude
  # and codex. No API keys are set here: the agents use your subscriptions.
  cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>exec "$REPO/node_modules/.bin/tsx" src/main.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO/apps/gateway</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SHUACREW_SERVICE</key><string>1</string>
    <key>SHUACREW_PORT</key><string>$PORT</string>
    <key>SHUACREW_LOG</key><string>$LOG</string>
    <key>_ZO_DOCTOR</key><string>0</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>ExitTimeOutSecs</key><integer>20</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF
  plutil -lint "$PLIST" >/dev/null
}

case "${1:-status}" in
  install)
    echo "Installing the always-on gateway"
    [ -x "$REPO/node_modules/.bin/tsx" ] || { echo "  run pnpm install first" >&2; exit 1; }
    loaded && launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    free_port
    rotate
    write_plist
    launchctl bootstrap "$DOMAIN" "$PLIST"
    launchctl enable "$DOMAIN/$LABEL"
    if wait_healthy; then
      echo "  running on http://127.0.0.1:$PORT — starts at login, restarts if it stops"
    else
      echo "  installed, but it isn't answering yet — see: pnpm service logs" >&2
      exit 1
    fi
    ;;
  uninstall)
    loaded && launchctl bootout "$DOMAIN/$LABEL" || true
    rm -f "$PLIST"
    echo "Removed. The gateway is stopped; the Mac app starts one when you open it."
    ;;
  restart)
    loaded || { echo "Not installed — run: pnpm service install" >&2; exit 1; }
    rotate
    launchctl kickstart -k "$DOMAIN/$LABEL"
    wait_healthy && echo "Restarted." || { echo "Restarted, but not answering yet — see: pnpm service logs" >&2; exit 1; }
    ;;
  status)
    if loaded; then
      pid=$(launchctl print "$DOMAIN/$LABEL" | awk '/^\tpid = /{print $3}')
      runs=$(launchctl print "$DOMAIN/$LABEL" | awk '/runs = /{print $3; exit}')
      echo "Installed: yes (pid ${pid:-none}, started $runs time(s) since login)"
    else
      echo "Installed: no — run: pnpm service install"
    fi
    healthy && echo "Answering: yes, http://127.0.0.1:$PORT" || echo "Answering: no"
    ;;
  logs)
    exec tail -n 50 -f "$LOG"
    ;;
  *)
    echo "usage: pnpm service install|status|restart|logs|uninstall" >&2
    exit 2
    ;;
esac
