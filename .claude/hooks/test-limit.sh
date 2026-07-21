#!/usr/bin/env bash
# PreToolUse/Bash: batasi jumlah test run per sesi.
# exit 0 = lolos, exit 2 = blokir + stderr dikirim balik ke Claude.
set -uo pipefail

input=$(cat)

command=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')
session_id=$(printf '%s' "$input" | jq -r '.session_id // "unknown"')

# Cuma hitung command yang benar-benar menjalankan test.
if ! printf '%s' "$command" |
  grep -Eq '(^|[^[:alnum:]_.-])(npm[[:space:]]+(run[[:space:]]+)?test|vitest|jest)([^[:alnum:]_.-]|$)'; then
  exit 0
fi

# session_id dipakai sebagai nama file -> buang karakter aneh.
session_id=${session_id//[^a-zA-Z0-9_-]/_}
counter_file="/tmp/cc-test-count-${session_id}"

count=0
[ -f "$counter_file" ] && count=$(cat "$counter_file" 2>/dev/null)
case "$count" in '' | *[!0-9]*) count=0 ;; esac

count=$((count + 1))

if [ "$count" -gt 3 ]; then
  echo "Batas 3x test run tercapai. Stop, lakukan analisis root cause, jelaskan diagnosis dan opsi perbaikan ke user sebelum lanjut." >&2
  exit 2
fi

printf '%s' "$count" >"$counter_file"
exit 0
