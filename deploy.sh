#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Telegram notification config
TG_TOKEN="8684613765:AAE6AJg15u-N8SKWBaeGpasWpQVwD2SMC7c"
TG_CHAT_ID="1473701939"

send_telegram() {
  local message="$1"
  curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d chat_id="${TG_CHAT_ID}" \
    -d parse_mode="Markdown" \
    -d text="${message}" > /dev/null 2>&1 || true
}

COMMIT_INFO="${DEPLOY_COMMIT_MSG:-unknown}"
AUTHOR="${DEPLOY_COMMIT_AUTHOR:-unknown}"

send_telegram "🔄 *Deploy dimulai...*
📝 ${COMMIT_INFO}
👤 ${AUTHOR}"

echo "==> Stashing local changes (if any)..."
git stash || true

echo "==> Pulling latest from main..."
git pull origin main

echo "==> Installing dependencies..."
npm install --production=false

echo "==> Building application..."
npm run build

echo "==> Restarting miqot service..."
sudo systemctl restart miqot.service

# Verify service is running
sleep 2
if systemctl is-active --quiet miqot.service; then
  send_telegram "✅ *Deploy berhasil!*
📝 ${COMMIT_INFO}
👤 ${AUTHOR}"
  echo "==> Deploy complete!"
else
  send_telegram "❌ *Deploy gagal!*
📝 ${COMMIT_INFO}
👤 ${AUTHOR}
Service miqot tidak bisa start."
  echo "==> Deploy FAILED: service not running"
  exit 1
fi
