// Standalone verification for matchesCuti5Hari logic.
// Replicates the helper inline — if the logic is right here and
// the copy in filter-logic.ts is identical, we're good.

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function matchesCuti5Hari(pkg) {
  const depDay = parseLocalDate(pkg.keberangkatan.tgl).getDay();
  const depHour = parseInt(pkg.keberangkatan.jam.split('.')[0], 10);
  const retDay = parseLocalDate(pkg.kepulangan.tgl).getDay();
  const retHour = parseInt(pkg.kepulangan.jam.split('.')[0], 10);
  const depOk = (depDay === 5 && depHour >= 18) || depDay === 6;
  const retOk = retDay === 6 || retDay === 0 || (retDay === 1 && retHour < 6);
  return depOk && retOk;
}

const mk = (depTgl, depJam, retTgl, retJam) => ({
  keberangkatan: { tgl: depTgl, jam: depJam },
  kepulangan: { tgl: retTgl, jam: retJam },
});

// 2026 calendar reference:
// 2026-06-05 Fri, 2026-06-06 Sat, 2026-06-07 Sun, 2026-06-08 Mon
// 2026-06-12 Fri, 2026-06-13 Sat, 2026-06-14 Sun, 2026-06-15 Mon

const cases = [
  ['Fri 18:00 -> Sat', mk('2026-06-05', '18.00', '2026-06-13', '14.00'), true],
  ['Fri 19:30 -> Sun', mk('2026-06-05', '19.30', '2026-06-14', '10.00'), true],
  ['Fri 17:59 -> Sat', mk('2026-06-05', '17.59', '2026-06-13', '14.00'), false],
  ['Fri 08:00 -> Sat', mk('2026-06-05', '08.00', '2026-06-13', '10.00'), false],
  ['Sat any -> Sat', mk('2026-06-06', '03.00', '2026-06-13', '23.00'), true],
  ['Sat any -> Sun', mk('2026-06-06', '23.00', '2026-06-14', '06.00'), true],
  ['Sat -> Mon 05:59', mk('2026-06-06', '10.00', '2026-06-15', '05.59'), true],
  ['Sat -> Mon 06:00', mk('2026-06-06', '10.00', '2026-06-15', '06.00'), false],
  ['Sat -> Mon 12:00', mk('2026-06-06', '10.00', '2026-06-15', '12.00'), false],
  ['Thu -> Sun', mk('2026-06-04', '20.00', '2026-06-14', '10.00'), false],
  ['Sat -> Fri', mk('2026-06-06', '10.00', '2026-06-12', '10.00'), false],
];

let pass = 0, fail = 0;
for (const [label, pkg, expected] of cases) {
  const got = matchesCuti5Hari(pkg);
  const ok = got === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  expected=${expected} got=${got}`);
}
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
