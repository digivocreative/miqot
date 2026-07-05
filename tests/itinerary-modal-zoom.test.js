import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/ItineraryModal.tsx', import.meta.url), 'utf8');

test('ItineraryModal supports two-finger pinch zoom for itinerary preview', () => {
  assert.match(source, /pinchRef = useRef\(\{\s*startDist: 0,\s*startScale: 1,/);
  assert.match(source, /const stageRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(source, /const zoomContentRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(source, /const applyZoomStyles = \(nextScale: number\) =>/);
  assert.match(source, /content\.style\.transform = `scale\(\$\{nextScale\}\)`/);
  assert.match(source, /scaleRafRef\.current = window\.requestAnimationFrame/);
  assert.match(source, /const handleTouchStart = \(event: TouchEvent\) =>/);
  assert.match(source, /if \(event\.cancelable\) event\.preventDefault\(\)/);
  assert.match(source, /const handleTouchMove = \(event: TouchEvent\) =>/);
  assert.match(source, /event\.touches\.length !== 2 \|\| pinchRef\.current\.startDist <= 0/);
  assert.match(source, /setViewerScale\(pinchRef\.current\.startScale \* \(dist \/ pinchRef\.current\.startDist\), center\)/);
  assert.match(source, /el\.addEventListener\('touchstart', handleTouchStart, \{ passive: false \}\)/);
  assert.match(source, /el\.addEventListener\('touchmove', handleTouchMove, \{ passive: false \}\)/);
  assert.match(source, /el\.addEventListener\('gesturechange', handleGestureChange, \{ passive: false \}\)/);
  assert.match(source, /style=\{\{ touchAction: 'manipulation', overscrollBehavior: 'contain' \}\}/);
  assert.match(source, /const pdfShellWidth = Math\.min\(Math\.max\(\(pdfWidth \|\| 400\) \+ 16, 296\), 672\)/);
  assert.match(source, /const pdfPageWidth = pdfShellWidth - 16/);
  assert.match(source, /width=\{pdfPageWidth\}/);
  assert.doesNotMatch(source, /width=\{\(pdfWidth \|\| 400\) \* scale\}/);
});

test('ItineraryModal PDF loading placeholder keeps a page-like aspect ratio', () => {
  assert.match(source, /function PdfLoadingPlaceholder\(\{ pageWidth \}: \{ pageWidth: number \}\)/);
  assert.match(source, /aspectRatio: '210 \/ 297'/);
  assert.match(source, /minHeight: 380/);
  assert.match(source, /loading=\{<PdfLoadingPlaceholder pageWidth=\{pdfPageWidth\} \/>\}/);
});
