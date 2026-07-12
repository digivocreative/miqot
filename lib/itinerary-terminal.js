const TERMINAL_RE = /\bterminal\s*([0-9]+[A-Z]?|[A-Z]\d+|internasional|international|haji|umrah)\b/i;

const ARRIVAL_CONTEXT_RE = /\b(tiba|setibanya|kedatangan|mendarat|landing|sampai|kembali)\b/i;
const INDONESIA_AIRPORT_RE = /\b(cgk|soekarno|hatta|cengkareng|jakarta|indonesia|tanah air)\b/i;
const SAUDI_AIRPORT_RE = /\b(jed|jeddah|jedah|king abdul|med|madinah|madina|mohammad bin abdulaziz|amir muhammad)\b/i;

function normalizeTerminal(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .replace(/^INTERNATIONAL$/, 'Internasional')
    .replace(/^INTERNASIONAL$/, 'Internasional')
    .replace(/^HAJI$/, 'Haji')
    .replace(/^UMRAH$/, 'Umrah');
}

function extractTerminal(text) {
  const match = String(text || '').match(TERMINAL_RE);
  return match ? normalizeTerminal(match[1]) : null;
}

function collectItineraryBlocks(content) {
  const days = Array.isArray(content?.days) ? content.days : [];
  const blocks = [];

  days.forEach((day, dayIndex) => {
    const dayTexts = [day?.dayNumber, day?.title, day?.location].filter(Boolean);
    if (dayTexts.length) {
      blocks.push({ dayIndex, dayCount: days.length, text: dayTexts.join(' ') });
    }

    const activities = Array.isArray(day?.activities) ? day.activities : [];
    activities.forEach((activity) => {
      const text = [activity?.time, activity?.text].filter(Boolean).join(' ');
      if (text) blocks.push({ dayIndex, dayCount: days.length, text });
    });
  });

  return blocks;
}

function collectTextBlocks(text) {
  const lines = String(text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => ({
    dayIndex: index,
    dayCount: lines.length,
    text: [lines[index - 1], line, lines[index + 1]].filter(Boolean).join(' '),
  }));
}

function isLateTripBlock(block) {
  if (!block?.dayCount || block.dayCount <= 1) return true;
  return block.dayIndex >= Math.floor(block.dayCount * 0.55);
}

function extractReturnTerminalFromBlocks(blocks) {
  if (blocks.length === 0) return { arrivalTerminal: null, departureTerminal: null };

  let departureTerminal = null;
  for (const block of [...blocks].reverse()) {
    const terminal = extractTerminal(block.text);
    if (!terminal) continue;

    if (
      isLateTripBlock(block)
      && INDONESIA_AIRPORT_RE.test(block.text)
      && ARRIVAL_CONTEXT_RE.test(block.text)
    ) {
      return { arrivalTerminal: terminal, departureTerminal };
    }

    if (!departureTerminal && isLateTripBlock(block) && SAUDI_AIRPORT_RE.test(block.text)) {
      departureTerminal = terminal;
    }
  }

  return { arrivalTerminal: null, departureTerminal };
}

export function extractReturnTerminalFromItinerary(content) {
  return extractReturnTerminalFromBlocks(collectItineraryBlocks(content));
}

export function extractReturnTerminalFromText(text) {
  return extractReturnTerminalFromBlocks(collectTextBlocks(text));
}

export function resolveCalendarArrivalTerminal(
  eventType,
  itineraryTerminal,
  providerTerminal,
  routeTerminal,
) {
  if (eventType === 'kepulangan') return itineraryTerminal || null;
  return providerTerminal || routeTerminal || null;
}
