#!/bin/bash
set -e

# Resolve to repo root (one level up from commands/)
cd "$(dirname "$0")/.."

if [ ! -d "node_modules" ]; then
  echo "Dependencies not installed."
  echo
  echo "  If this is your first time, run:"
  echo "    ./commands/setup.command"
  echo
  echo "  Or install manually:"
  echo "    npm install && npm run setup"
  echo
  exit 1
fi

# Clean stale PID file
PID_FILE=".glui.pid"
if [ -f "$PID_FILE" ]; then
  old_pid=$(cat "$PID_FILE" 2>/dev/null)
  if [ -n "$old_pid" ] && ! kill -0 "$old_pid" 2>/dev/null; then
    rm -f "$PID_FILE"
  fi
fi

echo "Building the GLUI runtime and floating pill..."
if ! npm run build; then
  echo
  echo "Build failed. Try: npm install && npm run setup"
  exit 1
fi

echo "GLUI running. ⌥ + Space to toggle. Use ./commands/stop.command or tray icon > Quit to close."

# Launch in a new process group and record the PID
unset ELECTRON_RUN_AS_NODE
npx electron . &
APP_PID=$!
echo "$APP_PID" > "$PID_FILE"

# Clean up PID file when the app exits
wait "$APP_PID" 2>/dev/null
rm -f "$PID_FILE"
