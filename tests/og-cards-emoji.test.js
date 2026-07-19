/**
 * Regression guard for every OG card generator.
 *
 * Pango raises a *fatal* error — abort(), not a JS exception — when it cannot
 * find a colour-emoji face for the requested weight. Any card that renders
 * unsanitised text from the database can therefore be crashed (and take the
 * Express process with it) by a single emoji in an agent name, a tour leader,
 * a jamaah name, or a package title.
 *
 * These tests render each card with emoji in every free-text field. If the
 * sanitiser regresses they don't fail politely: the whole test runner dies,
 * which is exactly the signal, because that is what production would do.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  escapeXml,
  stripUnrenderableGlyphs,
  generateOgPng,
  generatePackageValueAgentCardPng,
  generatePortalJamaahOgPng,
  generateFlightShareOgPng,
} from '../lib/og-generator.mjs';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const EMOJI_NAME = 'Nikita 🌟 Sari ❤️';

function assertPng(png) {
  assert.ok(Buffer.isBuffer(png));
  assert.ok(png.subarray(0, 4).equals(PNG_MAGIC), 'output is a PNG');
}

test('stripUnrenderableGlyphs removes emoji but keeps ordinary text', () => {
  assert.equal(stripUnrenderableGlyphs('Nikita 🌟 Sari'), 'Nikita Sari');
  assert.equal(stripUnrenderableGlyphs('Omelan yang bikin rindu ❤️'), 'Omelan yang bikin rindu');
  assert.equal(stripUnrenderableGlyphs('👨‍👩‍👧'), '', 'ZWJ sequences leave nothing behind');
  assert.equal(stripUnrenderableGlyphs('🇸🇦'), '', 'flags are regional-indicator pairs');
  assert.equal(stripUnrenderableGlyphs('Umrah & Haji — 9 hari'), 'Umrah & Haji — 9 hari');
  assert.equal(stripUnrenderableGlyphs('Buka →'), 'Buka →', 'typographic arrows still render');
});

test('escapeXml sanitises as well as escapes, for every card at once', () => {
  assert.equal(escapeXml('A & B 🌟 <x>'), 'A &amp; B &lt;x&gt;');
});

test('generateOgPng survives an emoji agent name and website', async () => {
  assertPng(await generateOgPng({
    name: EMOJI_NAME,
    website: 'nikita.example.com 🌐',
    phone: '628123456789',
    photoBuffer: null,
  }));
});

test('generateOgPng falls back when the name is nothing but emoji', async () => {
  assertPng(await generateOgPng({ name: '🌟🌟', website: '', phone: '', photoBuffer: null }));
});

test('generatePackageValueAgentCardPng survives emoji in name and website', async () => {
  assertPng(await generatePackageValueAgentCardPng({
    name: EMOJI_NAME,
    phone: '628123456789',
    website: 'https://nikita.example.com/ ✨',
    photoBuffer: null,
  }));
});

test('generatePortalJamaahOgPng survives emoji in jamaah, paket and agent', async () => {
  assertPng(await generatePortalJamaahOgPng({
    jamaahName: 'Hj. Siti Aminah 🕋',
    paketName: 'Umrah Ramadhan ✨ & Turki 9 Hari',
    maskapai: 'Saudia ✈️',
    agentName: EMOJI_NAME,
    agentPhotoBuffer: null,
  }));
});

test('generateFlightShareOgPng survives emoji in agent, tour leader and airline', async () => {
  assertPng(await generateFlightShareOgPng({
    flightNumber: 'SV817',
    flightDate: '2026-08-12',
    depIata: 'CGK',
    arrIata: 'JED',
    depCity: 'Jakarta',
    arrCity: 'Jeddah 🕌',
    depTime: '09:15',
    arrTime: '15:40',
    duration: '9j 25m',
    airlineName: 'Saudia ✈️',
    groupNumber: 'Kloter 3 🎉',
    pax: 42,
    tourLeader: 'Ustadz Fulan 🤍',
    agentName: EMOJI_NAME,
    agentPhotoBuffer: null,
  }));
});
