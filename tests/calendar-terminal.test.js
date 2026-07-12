import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { transformSync } from 'esbuild';

async function importTsModule(path) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { code } = transformSync(source, {
    loader: 'ts',
    format: 'esm',
    sourcemap: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('airportTerminalLabel prefers arrival terminal for kepulangan pickup info', async () => {
  const { airportTerminalLabel } = await importTsModule('src/lib/calendarTerminal.ts');

  assert.equal(
    airportTerminalLabel({
      departure_airport_code: 'JED',
      departure_terminal: '1',
      arrival_airport_code: 'CGK',
      arrival_terminal: '3',
    }, 'kepulangan'),
    'Terminal 3 CGK',
  );
});

test('airportTerminalLabel does not show departure terminal for kepulangan', async () => {
  const { airportTerminalLabel } = await importTsModule('src/lib/calendarTerminal.ts');

  assert.equal(
    airportTerminalLabel({
      departure_airport_code: 'JED',
      departure_terminal: 'T1',
      arrival_airport_code: 'CGK',
      arrival_terminal: null,
    }, 'kepulangan'),
    null,
  );
});

test('airportTerminalLabel avoids duplicate departure terminal already in titik kumpul', async () => {
  const { airportTerminalLabel } = await importTsModule('src/lib/calendarTerminal.ts');

  assert.equal(
    airportTerminalLabel({
      titik_kumpul: 'Lounge Terminal 3 Soekarno-Hatta',
      departure_airport_code: 'CGK',
      departure_terminal: '3',
    }, 'keberangkatan'),
    null,
  );
});

test('meeting point display keeps only place name and terminal', async () => {
  const { formatCalendarMeetingPoint } = await importTsModule('src/lib/calendarPeople.ts');

  assert.equal(
    formatCalendarMeetingPoint('Café Zukavia Gate 5 Terminal 2F Bandara Internasional Soekarno-Hatta'),
    'Café Zukavia, Terminal 2F',
  );
  assert.equal(
    formatCalendarMeetingPoint('Lounge Palmerra Gate 6 Terminal 2F Bandara Soekarno-Hatta'),
    'Lounge Palmerra, Terminal 2F',
  );
  assert.equal(
    formatCalendarMeetingPoint('Gate 2 tiang A Terminal 3 Bandara Soekarno-Hatta'),
    'Terminal 3',
  );
  assert.equal(
    formatCalendarMeetingPoint('café Zukavia gate 5 Terminal 2F Bandara Soekarno-Hatta'),
    'Café Zukavia, Terminal 2F',
  );
});
