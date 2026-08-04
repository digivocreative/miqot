import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformSync } from 'esbuild';

const schedulePage = readFileSync(new URL('../src/components/UpcomingSchedule.tsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

async function importTsModule(path) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { code } = transformSync(source, {
    loader: 'ts',
    format: 'esm',
    sourcemap: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('calendar person formatter cleans bullet-separated mutawif names and placeholders', async () => {
  const {
    formatCalendarMeetingPoint,
    formatCalendarPeople,
    formatCalendarPrimaryPerson,
  } = await importTsModule('src/lib/calendarPeople.ts');

  assert.equal(
    formatCalendarPeople('• AIMAN ALJAIDI • AMANI ZULHARBI SALIM • AIMAN ALJAIDI'),
    'AIMAN ALJAIDI, AMANI ZULHARBI SALIM',
  );
  assert.equal(formatCalendarPeople('-'), '');
  assert.equal(formatCalendarPeople(null), '');
  assert.equal(formatCalendarPeople('. . . . .'), '');
  assert.equal(formatCalendarPrimaryPerson('• NIKESARI MARZUHENDA MARZUKI'), 'NIKESARI MARZUHENDA');
  assert.equal(formatCalendarPrimaryPerson('• HANAFI FAUZAN'), 'HANAFI FAUZAN');
  assert.equal(formatCalendarPrimaryPerson('• AIMAN ALJAIDI • AMANI ZULHARBI SALIM'), 'AIMAN ALJAIDI');
  assert.equal(formatCalendarPrimaryPerson('. . . . .'), '');
  assert.equal(
    formatCalendarMeetingPoint('Lounge Palmeera Gate, Terminal 2'),
    'Lounge Palmeera, Terminal 2',
  );
});

test('departure cards place kloter before the flight and prefix mutawif names with UST.', () => {
  assert.match(schedulePage, /const tourLeader = formatCalendarPrimaryPerson\(detail\.tour_leader\)/);
  assert.match(schedulePage, /const mutawif = formatCalendarPrimaryPerson\(detail\.mutawif\)/);
  const kloterPosition = schedulePage.indexOf('KLOTER {detail.group_number}');
  const flightPosition = schedulePage.indexOf("{detail.pesawat || '-'}");
  assert.ok(kloterPosition >= 0 && kloterPosition < flightPosition);
  assert.equal(schedulePage.match(/KLOTER \{detail\.group_number\}/g)?.length, 1);
  assert.match(schedulePage, /UST\. \{mutawif\}/);
  assert.doesNotMatch(schedulePage, />\s*MUTAWIF\s*</);
  assert.match(schedulePage, /: 'Belum ditentukan'/);
  assert.match(server, /mutawif: ev\.mutawif \|\| ev\.raw_data\?\.mutawif \|\| null/);
});

test('tour leader and mutawif share one compact metadata row', () => {
  assert.match(schedulePage, /col-span-2 mt-0\.5 flex min-w-0 items-center gap-1\.5 overflow-hidden[\s\S]*hasTourLeader[\s\S]*<User size=\{10\}[\s\S]*activeTab === 'keberangkatan'[\s\S]*<UserCheck size=\{10\}/);
  assert.match(schedulePage, /hasTourLeader && activeTab === 'keberangkatan'[\s\S]*>·<\/span>/);
  assert.match(schedulePage, /items-center gap-1 overflow-hidden/);
  assert.match(schedulePage, /truncate font-medium/);
});

test('departure detail separates meeting point from takeoff and terminal', () => {
  assert.match(schedulePage, /mt-1\.5 space-y-1[\s\S]*Kumpul[\s\S]*\{meetingPoint\}[\s\S]*<\/div>[\s\S]*<div className="flex flex-wrap items-center gap-1">[\s\S]*Take off[\s\S]*airportTerminalText/);
});
