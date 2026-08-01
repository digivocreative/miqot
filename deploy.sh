#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Telegram notification config (injected via systemd EnvironmentFile=/home/ubuntu/miqot/.env)
TG_TOKEN="${TELEGRAM_DEPLOY_BOT_TOKEN:?TELEGRAM_DEPLOY_BOT_TOKEN not set}"
TG_CHAT_ID="${TELEGRAM_DEPLOY_CHAT_ID:?TELEGRAM_DEPLOY_CHAT_ID not set}"

# Notifikasi TIDAK boleh menggagalkan deploy (karena itu selalu `return 0`),
# tapi kegagalannya WAJIB terlihat di journal. Versi lama memakai
# `> /dev/null 2>&1 || true` yang menelan segalanya: token deploy basi
# (systemd membaca EnvironmentFile sekali saat service start, jadi proses
# webhook lama masih memegang token pra-rotasi) membuat Telegram membalas 401
# dari 18 Jul s/d 1 Agt 2026 tanpa satu pun jejak di log. Token disamarkan dari
# output supaya rahasia tidak bocor ke journal.
send_telegram() {
  if [[ -z "${TG_TOKEN}" || -z "${TG_CHAT_ID}" ]]; then
    echo "==> Telegram notification skipped: TG_TOKEN/TELEGRAM_BOT_TOKEN or TG_CHAT_ID/TELEGRAM_CHAT_ID is not configured"
    return 0
  fi

  local message="$1"
  local response http_code body
  # `local` dipisah dari assignment supaya exit code curl tidak tertelan `local`.
  response=$(curl -sS -m 15 -w $'\n%{http_code}' -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d chat_id="${TG_CHAT_ID}" \
    -d parse_mode="Markdown" \
    -d text="${message}" 2>&1) || {
      echo "==> WARNING: notifikasi Telegram GAGAL (curl error): ${response//${TG_TOKEN}/***}"
      return 0
    }

  http_code=$(tail -n1 <<< "${response}")
  body=$(sed '$d' <<< "${response}")
  if [[ "${http_code}" == "200" && "${body}" == *'"ok":true'* ]]; then
    return 0
  fi

  echo "==> WARNING: notifikasi Telegram GAGAL (HTTP ${http_code}): ${body//${TG_TOKEN}/***}"
  if [[ "${http_code}" == "401" ]]; then
    echo "==> Petunjuk: token kemungkinan sudah dirotasi di .env tapi deploy-webhook.service"
    echo "    masih memegang nilai lama. Jalankan: sudo systemctl restart deploy-webhook.service"
  fi
  return 0
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

echo "==> Building application (staging — zero blank window)..."
# Re-export VITE_* from the CURRENT .env so Vite bakes the right values, overriding
# any stale VITE_* inherited from the long-running webhook listener's environment.
while IFS= read -r kv; do export "$kv"; done < <(grep -E '^VITE_[A-Za-z0-9_]+=' .env || true)
# Build the SPA into a staging dir. Vite empties its outDir at the START of the build,
# so building in place would leave the live dist/ without its chunks for ~40s (blank
# page on fresh loads). Build to dist_staging, then swap into place atomically below.
rm -rf dist_staging dist_old
npm run build:spa -- --outDir dist_staging --emptyOutDir
npm run build:functions

echo "==> Retaining previous hashed assets for stale clients..."
if [ -d dist/assets ]; then
  mkdir -p dist_staging/assets
  cp -an dist/assets/. dist_staging/assets/ || true
  find dist_staging/assets -type f -mtime +45 -delete || true
fi

echo "==> Swapping dist into place (atomic)..."
mv dist dist_old
mv dist_staging dist || { mv dist_old dist; echo "==> Swap failed — rolled back to previous dist"; exit 1; }
rm -rf dist_old

echo "==> Restarting miqot service..."
# getIndexHtml() re-reads on mtime change, so the running process already serves the new
# build the instant dist/ is swapped — the restart is only to pick up backend/server.js
# changes, and no longer causes a blank window.
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
