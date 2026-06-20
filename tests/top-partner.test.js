import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOP_PARTNER_META_DESCRIPTION,
  TOP_PARTNER_META_TITLE,
  TOP_PARTNER_OG_IMAGE_PATH,
  TOP_PARTNER_PHOTO_PROXY_BASE,
  buildPhotoProxyUrl,
  firstValidUrl,
  normalizeWaNumber,
  sanitizePartnerRow,
  shufflePartners,
} from '../lib/top-partner.js';
import {
  buildTopPartnerBunnyPath,
  buildTopPartnerCdnUrl,
  mirrorTopPartnerPhoto,
  normalizeBunnyDownloadUrl,
} from '../lib/top-partner-bunny.js';

test('top partner SEO metadata is ready for public sharing', () => {
  assert.equal(TOP_PARTNER_META_TITLE, 'Top Partner Alhijaz Indowisata');
  assert.equal(
    TOP_PARTNER_META_DESCRIPTION,
    'Temukan partner unggulan resmi yang responsif dan mudah dihubungi untuk konsultasi umroh dan haji plus.'
  );
  assert.equal(TOP_PARTNER_OG_IMAGE_PATH, '/og/top-partner.png');
});

test('normalizeWaNumber converts local mobile numbers to Indonesian international digits', () => {
  assert.equal(normalizeWaNumber('0822-9000-20'), '62822900020');
  assert.equal(normalizeWaNumber('+62 812 9909 795'), '628129909795');
  assert.equal(normalizeWaNumber('628129909795'), '628129909795');
  assert.equal(normalizeWaNumber('12345'), '');
  assert.equal(normalizeWaNumber(''), '');
});

test('firstValidUrl accepts first URL-like line and rejects bare names or non-social placeholders', () => {
  assert.equal(firstValidUrl('  https://instagram.com/alhijaz\r\nhttps://instagram.com/second'), 'https://instagram.com/alhijaz');
  assert.equal(firstValidUrl('www.alhijazindonesia.com'), 'https://www.alhijazindonesia.com');
  assert.equal(firstValidUrl('-'), '');
  assert.equal(firstValidUrl('Windy'), '');
  assert.equal(firstValidUrl('https://maps.app.goo.gl/abc', { rejectMaps: true }), '');
});

test('buildPhotoProxyUrl builds the Alhijaz image-resizer proxy and hides empty photos', () => {
  assert.equal(buildPhotoProxyUrl(''), '');
  assert.equal(
    buildPhotoProxyUrl('sm0107820251001173530p.jpeg'),
    `${TOP_PARTNER_PHOTO_PROXY_BASE}sm0107820251001173530p.jpeg`
  );
});

test('sanitizePartnerRow trims names, ignores YouTube, normalizes WhatsApp, and sanitizes social URLs', () => {
  const partner = sanitizePartnerRow([
    ' NIKITA SARI/BAGAS PRAMUDITA\t',
    '0822900020',
    'sm0107820251001173530p.jpeg',
    'Windy',
    'https://www.instagram.com/alhijaz_indowisataa\r\nhttps://www.instagram.com/other',
    'https://youtu.be/fVtZ4A5o0nI',
    'https://maps.app.goo.gl/not-tiktok',
    'www.alhijazindonesia.com\r\nhttps://second.example',
    '89',
  ]);

  assert.deepEqual(partner, {
    id: '89',
    name: 'NIKITA SARI/BAGAS PRAMUDITA',
    phone: '62822900020',
    waLink: 'https://wa.me/62822900020?text=Assalamualaikum%2C%20saya%20ingin%20info%20umroh%20Alhijaz',
    photo: `${TOP_PARTNER_PHOTO_PROXY_BASE}sm0107820251001173530p.jpeg`,
    photoFile: 'sm0107820251001173530p.jpeg',
    facebook: '',
    instagram: 'https://www.instagram.com/alhijaz_indowisataa',
    tiktok: '',
    website: 'https://www.alhijazindonesia.com',
  });
});

test('sanitizePartnerRow keeps partner visible when phone or photo is missing', () => {
  const partner = sanitizePartnerRow(['Agen Resmi', '-', '', '', '', '', '-', '', '']);
  assert.equal(partner.name, 'Agen Resmi');
  assert.equal(partner.phone, '');
  assert.equal(partner.waLink, '');
  assert.equal(partner.photo, '');
});

test('shufflePartners preserves all entries while using supplied random source', () => {
  const partners = [
    { id: '1', name: 'A' },
    { id: '2', name: 'B' },
    { id: '3', name: 'C' },
    { id: '4', name: 'D' },
  ];
  const seq = [0.1, 0.7, 0.2];
  const shuffled = shufflePartners(partners, () => seq.shift() ?? 0);

  assert.deepEqual(shuffled.map((p) => p.id), ['2', '4', '3', '1']);
  assert.deepEqual(partners.map((p) => p.id), ['1', '2', '3', '4']);
  assert.deepEqual(new Set(shuffled.map((p) => p.id)), new Set(['1', '2', '3', '4']));
});

test('buildTopPartnerBunnyPath sanitizes filenames into the top-partner folder', () => {
  assert.equal(buildTopPartnerBunnyPath(' sm 01/test.jpg '), 'top-partner/sm_01_test.jpg');
  assert.equal(buildTopPartnerBunnyPath('sm01.jpg', 2320), 'top-partner/v2320/sm01.jpg');
  assert.equal(buildTopPartnerBunnyPath(''), '');
});

test('buildTopPartnerCdnUrl points partner photos to Bunny CDN', () => {
  assert.equal(
    buildTopPartnerCdnUrl('alhijaz.b-cdn.net', 'sm0107820251001173530p.jpeg'),
    'https://alhijaz.b-cdn.net/top-partner/sm0107820251001173530p.jpeg'
  );
  assert.equal(
    buildTopPartnerCdnUrl('alhijaz.b-cdn.net', 'sm0107820251001173530p.jpeg', 2320),
    'https://alhijaz.b-cdn.net/top-partner/v2320/sm0107820251001173530p.jpeg'
  );
});

test('normalizeBunnyDownloadUrl only upgrades the leading URL scheme', () => {
  const proxyUrl = `${TOP_PARTNER_PHOTO_PROXY_BASE}sm01.jpg`;
  assert.equal(normalizeBunnyDownloadUrl(proxyUrl), proxyUrl);
  assert.equal(normalizeBunnyDownloadUrl('http://example.com/file.jpg'), 'https://example.com/file.jpg');
});

test('mirrorTopPartnerPhoto uploads missing photo and returns versioned Bunny CDN photo URL', async () => {
  const calls = [];
  const partner = {
    name: 'Agen',
    photo: 'https://alhijazindowisata.com/jadwal/_s.php?.max=350&.img=http://115.124.86.220/m/sm01.jpg',
    photoFile: 'sm01.jpg',
  };

  const mirrored = await mirrorTopPartnerPhoto(partner, {
    enabled: true,
    cdnHostname: 'alhijaz.b-cdn.net',
    fileExists: async (path) => {
      calls.push(['exists', path]);
      return false;
    },
    downloadFile: async (url) => {
      calls.push(['download', url]);
      return { buffer: Buffer.from('img'), contentType: 'image/jpeg' };
    },
    uploadFile: async (path, buffer, contentType) => {
      calls.push(['upload', path, buffer.toString(), contentType]);
    },
    logger: { warn() {} },
  });

  assert.equal(mirrored.photo, 'https://alhijaz.b-cdn.net/top-partner/v3/sm01.jpg');
  assert.deepEqual(calls, [
    ['exists', 'top-partner/sm01.jpg'],
    ['download', partner.photo],
    ['exists', 'top-partner/v3/sm01.jpg'],
    ['upload', 'top-partner/v3/sm01.jpg', 'img', 'image/jpeg'],
  ]);
});

test('mirrorTopPartnerPhoto keeps stable CDN photo URL when Bunny already has a valid file', async () => {
  const calls = [];
  const partner = {
    name: 'Agen',
    photo: 'https://alhijazindowisata.com/jadwal/_s.php?.max=350&.img=http://115.124.86.220/m/sm01.jpg',
    photoFile: 'sm01.jpg',
  };

  const mirrored = await mirrorTopPartnerPhoto(partner, {
    enabled: true,
    cdnHostname: 'alhijaz.b-cdn.net',
    fileExists: async (path) => {
      calls.push(['exists', path]);
      return true;
    },
    downloadFile: async () => {
      calls.push(['download']);
      return { buffer: Buffer.from('img'), contentType: 'image/jpeg' };
    },
    uploadFile: async () => {
      calls.push(['upload']);
    },
    logger: { warn() {} },
  });

  assert.equal(mirrored.photo, 'https://alhijaz.b-cdn.net/top-partner/sm01.jpg');
  assert.deepEqual(calls, [['exists', 'top-partner/sm01.jpg']]);
});
