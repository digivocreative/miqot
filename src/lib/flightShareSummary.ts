export type FlightShareKloter = {
  group?: string | null;
  pax?: number | null;
  tourLeader?: string | null;
};

export type FlightShareSummary = {
  group_number: string | null;
  pax: number | null;
  tour_leader: string | null;
};

function cleanText(value?: string | null): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniqueOrdered(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toUpperCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function leaderNames(value?: string | null): string[] {
  const raw = cleanText(value);
  if (!raw || raw === '-') return [];
  const parts = raw.includes('•') || raw.includes('·')
    ? raw.split(/[•·]/)
    : [raw];
  return parts
    .map(part => cleanText(part))
    .filter(part => part && part !== '-');
}

export function summarizeFlightShareGroup(group: FlightShareKloter[]): FlightShareSummary {
  const groupNumbers = uniqueOrdered(
    group.map(kloter => cleanText(kloter.group)).filter(Boolean)
  );

  const pax = group.reduce((sum, kloter) => {
    const value = Number(kloter.pax);
    return Number.isFinite(value) && value > 0 ? sum + value : sum;
  }, 0);

  const leaders = uniqueOrdered(group.flatMap(kloter => leaderNames(kloter.tourLeader)));

  return {
    group_number: groupNumbers.length > 0 ? groupNumbers.join(', ') : null,
    pax: pax > 0 ? pax : null,
    tour_leader: leaders.length > 0 ? leaders.join(', ') : null,
  };
}
