// ── Email alias forwarding (alias@alhijaz.co → email pribadi agent) ──
//
// Arsitektur: MX alhijaz.co → Resend Inbound (catch-all domain) → webhook
// `email.received` → handler ini → lookup local-part vs agents.email_alias →
// kirim ulang via resend.emails.send (from alias, reply-to pengirim asli).
// Alias dipilih agent sendiri SEKALI (immutable setelah dibuat, tidak terikat
// slug); tidak ada provisioning per-alias di Resend — routing murni lookup.
//
// Aktif hanya bila RESEND_API_KEY + RESEND_WEBHOOK_SECRET terisi (lihat
// wiring di server.js). Log ke tabel email_forward_log; idempoten terhadap
// webhook retry via unique index (resend_email_id, agent_id) status forwarded.

import crypto from 'node:crypto';

export const ALIAS_DOMAIN = 'alhijaz.co';

// Local-part yang tidak boleh menjadi alias (dan ikut diblok sebagai slug baru).
// 'bismillah' = sender transactional Resend; sisanya alamat role-account standar
// (RFC 2142) + istilah yang menyesatkan bila dipakai perorangan.
export const RESERVED_EMAIL_LOCAL_PARTS = [
  'bismillah',
  'postmaster', 'abuse', 'webmaster', 'hostmaster', 'mailer-daemon',
  'admin', 'administrator', 'mail', 'email', 'noreply', 'no-reply',
  'info', 'support', 'cs', 'kontak', 'contact', 'halo', 'hello',
  'sales', 'marketing', 'security', 'root', 'billing', 'finance',
  'dmarc', 'dmarc-report', 'alhijaz', 'official',
];

const REPLAY_TOLERANCE_SEC = 5 * 60;

// Verifikasi signature webhook Svix (skema yang dipakai Resend) tanpa
// dependency: HMAC-SHA256 atas `${id}.${timestamp}.${body}` dengan key
// base64 setelah prefix "whsec_". Header svix-signature bisa berisi beberapa
// kandidat dipisah spasi ("v1,xxx v1,yyy") — cocok salah satu = valid.
export function verifySvixSignature(secret, headers, rawBody, nowMs = Date.now()) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!secret || !id || !timestamp || !signatureHeader) return false;

  const tsSec = Number(timestamp);
  if (!Number.isFinite(tsSec)) return false;
  if (Math.abs(nowMs / 1000 - tsSec) > REPLAY_TOLERANCE_SEC) return false;

  let key;
  try {
    key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  } catch {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');
  const expectedBuf = Buffer.from(expected);

  for (const candidate of String(signatureHeader).split(' ')) {
    const [version, sig] = candidate.split(',');
    if (version !== 'v1' || !sig) continue;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}

// "Budi <budi@x.com>" | "budi@x.com" → { name, address }
function parseAddress(input) {
  if (!input) return { name: '', address: '' };
  const m = String(input).match(/^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/);
  if (m) return { name: (m[1] || '').trim(), address: m[2].trim() };
  return { name: '', address: String(input).trim() };
}

// Display name aman untuk header From/Reply-To: buang CR/LF, kutip, backslash.
function sanitizeDisplayName(name) {
  return String(name).replace(/[\r\n"\\]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function sanitizeHeaderValue(value) {
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}

// Nama/alamat pengirim asli tampil di body (bukan cuma header) — konten
// dikendalikan pengirim, wajib di-escape sebelum masuk HTML.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Lookup case-insensitive di Record header hasil receiving.get
function headerValue(headers, name) {
  if (!headers) return '';
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return String(v || '');
  }
  return '';
}

async function logForward(supabase, row) {
  try {
    const { error } = await supabase.from('email_forward_log').insert(row);
    // 23505 = duplikat karena webhook retry — memang diharapkan, bukan masalah
    if (error && error.code !== '23505') {
      console.warn('[email-alias] gagal tulis log:', error.message);
    }
  } catch (err) {
    console.warn('[email-alias] gagal tulis log:', err.message);
  }
}

function buildForwardPayload({ fullEmail, fromParsed, alias, agentEmail, attachments }) {
  const origAddr = fromParsed.address || '';
  // Display name TANPA alamat email — pola `Nama (email@x)` di display name
  // memicu heuristik anti-phishing Gmail (salah satu penyebab masuk spam).
  // Alamat asli tetap terlihat: di Reply-To dan baris info awal body.
  const origLocal = origAddr.split('@')[0] || '';
  const display = sanitizeDisplayName(`${fromParsed.name || origLocal || 'Pengirim'} via Alhijaz`);

  // References/In-Reply-To dari email asli supaya bolak-balik percakapan yang
  // sama menyatu jadi satu thread di Gmail agent.
  const headers = {};
  const refs = sanitizeHeaderValue(
    [headerValue(fullEmail.headers, 'references'), fullEmail.message_id].filter(Boolean).join(' ')
  );
  if (refs) headers.References = refs;
  if (fullEmail.message_id) headers['In-Reply-To'] = sanitizeHeaderValue(fullEmail.message_id);
  // Penanda forward otomatis sesuai pedoman forwarder Google + RFC 3834 —
  // membantu Gmail mengklasifikasikan sebagai terusan, bukan bulk mail.
  headers['Auto-Submitted'] = 'auto-forwarded';
  headers['X-Forwarded-For'] = alias;
  headers['X-Forwarded-To'] = sanitizeHeaderValue(agentEmail);

  const payload = {
    from: `"${display}" <${alias}>`,
    to: agentEmail,
    subject: fullEmail.subject || '(tanpa subjek)',
    headers,
  };
  if (origAddr) {
    payload.replyTo = fromParsed.name
      ? `"${sanitizeDisplayName(fromParsed.name)}" <${origAddr}>`
      : origAddr;
  }
  if (attachments && attachments.length) payload.attachments = attachments;

  // Baris info ala Gmail-forward di awal body: agent tetap melihat alamat
  // pengirim asli meski tidak lagi ada di display name.
  const senderLabel = fromParsed.name ? `${fromParsed.name} <${origAddr}>` : (origAddr || 'tidak dikenal');
  if (fullEmail.html) {
    payload.html =
      `<div style="font-size:12px;color:#667085;border-bottom:1px solid #e4e7ec;padding-bottom:8px;margin-bottom:12px">` +
      `Diteruskan dari <b>${escapeHtml(senderLabel)}</b> untuk ${escapeHtml(alias)}</div>` +
      fullEmail.html;
  }
  if (fullEmail.text) {
    payload.text = `--- Diteruskan dari ${senderLabel} untuk ${alias} ---\n\n${fullEmail.text}`;
  }
  if (!payload.html && !payload.text) payload.text = `--- Diteruskan dari ${senderLabel} untuk ${alias} ---\n\n(pesan tanpa isi)`;
  return payload;
}

// Factory handler Express untuk POST /api/resend-inbound.
// Body HARUS Buffer mentah (express.raw) — verifikasi Svix butuh byte persis.
// getAgentByAlias dipakai dari cache agent (bukan query per email) agar spam
// ke catch-all tidak membebani DB — lihat [[db-io-throttling-incident]].
export function createResendInboundHandler({ resend, supabase, getAgentByAlias, webhookSecret, aliasDomain = ALIAS_DOMAIN }) {
  const reserved = new Set(RESERVED_EMAIL_LOCAL_PARTS);
  const suffix = `@${aliasDomain}`;

  return async function resendInboundHandler(req, res) {
    try {
      if (!Buffer.isBuffer(req.body)) {
        // Salah wiring parser — jangan lanjut, signature tak bisa diverifikasi
        console.error('[email-alias] req.body bukan Buffer — cek mounting express.raw');
        return res.status(500).json({ error: 'Raw body unavailable' });
      }
      const rawBody = req.body.toString('utf8');

      if (!verifySvixSignature(webhookSecret, req.headers, rawBody)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
      if (payload?.type !== 'email.received') {
        return res.json({ ok: true, ignored: payload?.type || 'unknown' });
      }

      const data = payload.data || {};
      const emailId = data.email_id;
      if (!emailId) return res.status(400).json({ error: 'email_id missing' });

      // Penerima: utamakan received_for (envelope recipient, menangkap BCC);
      // fallback header To+Cc. Satu email bisa menyasar beberapa alias sekaligus.
      const rawRecipients = data.received_for
        ? [].concat(data.received_for)
        : [...(data.to || []), ...(data.cc || [])];
      const localParts = [...new Set(
        rawRecipients
          .map((r) => parseAddress(r).address.toLowerCase())
          .filter((a) => a.endsWith(suffix))
          .map((a) => a.slice(0, -suffix.length))
      )];

      const fromParsed = parseAddress(data.from);
      const logBase = {
        resend_email_id: emailId,
        mail_from: (fromParsed.address || String(data.from || '')).slice(0, 320),
        subject: String(data.subject || '').slice(0, 500),
      };

      if (!localParts.length) {
        await logForward(supabase, { ...logBase, status: 'dropped_no_recipient' });
        return res.json({ ok: true, forwarded: 0 });
      }

      let fullEmail = null; // diambil sekali, lazy — hanya bila ada penerima valid
      let sendAttachments = null;
      let transient = false;
      let forwarded = 0;

      for (const localPart of localParts) {
        const logRow = { ...logBase, local_part: localPart.slice(0, 100) };

        if (reserved.has(localPart)) {
          await logForward(supabase, { ...logRow, status: 'dropped_reserved' });
          continue;
        }

        let agent;
        try {
          agent = await getAgentByAlias(localPart);
        } catch (err) {
          console.error('[email-alias] lookup agent gagal:', err.message);
          transient = true;
          continue;
        }
        if (!agent || agent.status !== 'active') {
          await logForward(supabase, { ...logRow, status: 'dropped_unknown' });
          continue;
        }
        if (!agent.email_alias_enabled || !agent.email) {
          await logForward(supabase, { ...logRow, agent_id: agent.id, status: 'dropped_disabled' });
          continue;
        }

        // Idempoten: webhook di-retry Resend saat kita balas non-200 —
        // jangan kirim dua kali ke agent yang sama.
        const { data: already, error: dupErr } = await supabase
          .from('email_forward_log')
          .select('id')
          .eq('resend_email_id', emailId)
          .eq('agent_id', agent.id)
          .eq('status', 'forwarded')
          .maybeSingle();
        if (dupErr) {
          transient = true;
          continue;
        }
        if (already) {
          forwarded++;
          continue;
        }

        if (!fullEmail) {
          const got = await resend.emails.receiving.get(emailId);
          if (got.error || !got.data) {
            console.error('[email-alias] receiving.get gagal:', got.error?.message);
            transient = true;
            break; // tanpa isi email tidak ada yang bisa diforward
          }
          fullEmail = got.data;

          if ((fullEmail.attachments || []).length > 0) {
            const att = await resend.emails.receiving.attachments.list({ emailId });
            if (att.error || !att.data) {
              console.error('[email-alias] attachments.list gagal:', att.error?.message);
              transient = true;
              break;
            }
            // download_url berlaku 1 jam — cukup karena forward langsung;
            // pada retry lambat URL di-fetch ulang dari awal (fullEmail reset).
            sendAttachments = (att.data.data || []).map((a) => ({
              path: a.download_url,
              filename: a.filename || 'lampiran',
              contentType: a.content_type,
              ...(a.content_id ? { contentId: a.content_id } : {}),
            }));
          }
        }

        const alias = `${localPart}${suffix}`;
        const sent = await resend.emails.send(
          buildForwardPayload({ fullEmail, fromParsed, alias, agentEmail: agent.email, attachments: sendAttachments })
        );
        if (sent.error) {
          const code = sent.error.statusCode || 0;
          console.error(`[email-alias] forward ${alias} → ${agent.email} gagal:`, sent.error.message);
          if (code === 429 || code >= 500) {
            transient = true; // rate limit / gangguan Resend → biar di-retry
          } else {
            await logForward(supabase, {
              ...logRow,
              agent_id: agent.id,
              status: 'failed',
              detail: `${sent.error.name || 'error'}: ${sent.error.message}`.slice(0, 500),
            });
          }
          continue;
        }

        forwarded++;
        await logForward(supabase, { ...logRow, agent_id: agent.id, status: 'forwarded', detail: sent.data?.id });
      }

      // Non-200 memicu retry Resend; yang sudah terkirim aman berkat guard idempoten
      if (transient) return res.status(500).json({ error: 'Transient failure, please retry' });
      return res.json({ ok: true, forwarded });
    } catch (err) {
      console.error('[email-alias] handler error:', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  };
}
