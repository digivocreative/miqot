# Dev-MCP — Runbook

> Status 2026-07-10: **claude.ai Web custom connector berhasil terhubung**.
> Dokumen ini adalah catatan operasional/debug untuk Dev-MCP. Jangan simpan
> nilai `DEV_MCP_PASSWORD`, token, atau secret apa pun di sini.

## Tujuan

Dev-MCP adalah MCP developer-tool read-only (`POST /dev-mcp`) untuk memberi
Claude konteks repo saat brainstorming: dokumentasi, struktur project, pencarian
kode, dan baca file tracked. Ini berbeda dari `mcp-server.js` (`/mcp`) yang
mengekspos data bisnis per-agent.

## Implementasi

- File utama: `dev-mcp.js`.
- Mount: `server.js` memanggil `initDevMcp(app, { log })` setelah `initMcpServer`.
- Endpoint MCP: `POST /dev-mcp`.
- OAuth/discovery:
  - `/.well-known/oauth-protected-resource`
  - `/.well-known/oauth-protected-resource/dev-mcp`
  - `/.well-known/oauth-authorization-server`
  - `/.well-known/oauth-authorization-server/dev-mcp`
  - `/oauth/dev/register`
  - `/oauth/dev/authorize`
  - `/oauth/dev/token`
- Tools read-only:
  - `project_overview`
  - `design_system`
  - `list_docs`
  - `read_doc`
  - `project_tree`
  - `search_code`
  - `read_file`

## Batas Aman

- Hanya file `git ls-files` / `git grep` yang bisa dibaca.
- `.env`, untracked files, dan secret gitignored tidak bisa bocor melalui tool.
- Path traversal ditolak.
- Git dipanggil via `execFile`, bukan shell.
- Blocklist tambahan bisa pakai `DEV_MCP_BLOCK_GLOBS`.
- Dev-MCP read-only: test `tests/dev-mcp.test.js` menjaga tidak ada write/git mutation.

## Auth

- claude.ai Web custom connector wajib OAuth, bukan bearer statis.
- `DEV_MCP_PASSWORD` mengaktifkan gerbang single-user OAuth. Kosong = endpoint nonaktif.
- `DEV_MCP_SECRET` menandatangani artefak OAuth. Jika kosong, secret diturunkan dari
  `JWT_SECRET` via HMAC agar token Dev-MCP tetap terpisah dari JWT dashboard.
- Revoke semua token: rotate `DEV_MCP_SECRET` lalu restart service.
- Auth code single-use, PKCE S256 wajib.
- Access token `aud` terikat ke resource `<base>/dev-mcp`, exp 8 jam.
- Refresh token exp 30 hari.
- Access/refresh token dikirim sebagai opaque wrapper (`mcp_at_...`, `mcp_rt_...`)
  agar client tidak bergantung pada detail JWT internal.

## Bug Yang Sudah Diperbaiki

1. `buildBaseUrl` memaksa `https` untuk host non-localhost. Cloudflare -> Caddy
   bisa mengirim `x-forwarded-proto: http`, sementara Claude menolak metadata `http://`.
2. CORS + `OPTIONS` preflight diaktifkan untuk `/dev-mcp`, `/oauth/dev`, dan
   `/.well-known/oauth-*`. Header `WWW-Authenticate` diekspos agar browser Claude
   bisa membaca 401 challenge dan memulai OAuth.
3. Halaman authorize membawa semua hidden field OAuth, termasuk `response_type`.
4. Token endpoint menerima `redirect_uri` opsional saat token exchange.
5. Resource/scope OAuth sekarang divalidasi dan di-echo sesuai permintaan Claude.
6. Access token menambahkan klaim `iss`, `client_id`, `jti`, dan `scope` bila relevan.
7. Token response memakai opaque token wrapper.
8. Logging diagnostik sementara (`tlog`, request trace CORS, authorize/token OK)
   sudah dibersihkan setelah koneksi berhasil.

## Root Cause Connector Gagal

Gejala lama:

```text
DCR -> authorize -> token OK
tidak ada POST authenticated ke /dev-mcp setelah token
Claude menampilkan "Authorization with the MCP server failed" + ofid_...
```

Server sudah mengeluarkan token dengan benar. Request post-token dari broker
Claude tidak mencapai origin karena tertahan di Cloudflare edge/bot security.
Pola ini sama dengan kasus `anthropics/claude-ai-mcp#327`.

## Cloudflare Setup Wajib

Tambahkan IP Access Rules `Allow` untuk range outbound Anthropic. Cloudflare IP
Access Rules tidak menerima `/21`, jadi pecah menjadi delapan `/24`:

```text
160.79.104.0/24
160.79.105.0/24
160.79.106.0/24
160.79.107.0/24
160.79.108.0/24
160.79.109.0/24
160.79.110.0/24
160.79.111.0/24
```

Dashboard path:

```text
Cloudflare -> alhijaz.co -> Security -> WAF -> Tools -> IP Access Rules
```

atau dashboard baru:

```text
Security -> Security rules -> Create rule -> IP access rules
```

Buat WAF Custom Rule `Skip Dev MCP for Claude`:

```text
(ip.src in {
  160.79.104.0/24
  160.79.105.0/24
  160.79.106.0/24
  160.79.107.0/24
  160.79.108.0/24
  160.79.109.0/24
  160.79.110.0/24
  160.79.111.0/24
} and (
  http.request.uri.path eq "/dev-mcp" or
  starts_with(http.request.uri.path, "/oauth/dev/") or
  starts_with(http.request.uri.path, "/.well-known/oauth-")
))
```

Action: `Skip`. Centang opsi yang tersedia:

```text
All remaining custom rules
All managed rules
All Super Bot Fight Mode rules
All rate limiting rules
Browser Integrity Check
Security Level
User Agent Blocking
```

Jika `Bot Fight Mode` biasa aktif, matikan. WAF Skip tidak bisa bypass Bot Fight
Mode biasa pada pipeline Cloudflare.

## Cara Connect Di Claude Web

```text
Claude Web -> Settings -> Connectors -> Add custom connector
URL: https://alhijaz.co/dev-mcp
Login dengan password Dev-MCP
```

Rekomendasi Claude Project:

- Project Instructions berisi instruksi agar selalu memakai Dev-MCP dulu untuk
  pertanyaan terkait repo.
- Project Files sebaiknya kosong untuk dokumen yang sudah ada di repo. Jangan upload
  `project-summary.md` / `DESIGN-SYSTEM.md` sebagai file statis kecuali fallback,
  karena bisa stale. Dev-MCP membaca versi repo terbaru.

Contoh instruksi singkat:

```text
Before answering project-related questions, inspect the repo through the Dev-MCP
connector first. Use project_overview for new topics, design_system for UI/design,
project_tree for structure, search_code to locate implementation, and read_file
before explaining specific code. If Dev-MCP is unavailable, say so explicitly.
Never invent repo details and never request or expose secrets.
```

## Cara Tes

Prompt Claude Web:

```text
Gunakan Dev-MCP connector. Jalankan tool project_overview dan ringkas arsitektur repo ini dalam 5 poin.
```

Prompt pencarian:

```text
Gunakan Dev-MCP connector. Pakai search_code untuk mencari "initDevMcp", lalu sebutkan file dan fungsi yang relevan.
```

Di server:

```bash
sudo journalctl -u miqot.service -f | grep --line-buffered DevMCP
```

Setelah cleanup logging, log normal yang terlihat terutama tool calls, misalnya:

```text
[DevMCP] project_overview (no args)
[DevMCP] search_code (query)
```

Unit test:

```bash
node --test tests/dev-mcp.test.js
```

Ekspektasi saat dokumen ini ditulis: 21/21 pass.

## Deploy / Restart

Perubahan backend-only cukup:

```bash
sudo systemctl restart miqot.service
systemctl is-active miqot.service
```

Webhook deploy pernah tidak fire, jadi restart manual dipakai saat debug. Tetap commit
dan push perubahan code/docs agar durable.

## Security Follow-up

Password Dev-MCP pernah tampil di terminal/chat saat debug. Setelah koneksi stabil,
rotate `DEV_MCP_PASSWORD`, restart service, lalu reconnect Claude dengan password baru.
