import test from 'node:test';
import assert from 'node:assert/strict';

import { inferSaudiJourneyOrderFromItinerary } from '../lib/journey-order.js';

test('inferSaudiJourneyOrderFromItinerary: Jeddah landing can still mean Madinah first', () => {
  const content = {
    days: [
      { dayNumber: 'Hari 1', title: 'Jakarta - Jeddah - Madinah', location: 'Jakarta - Jeddah - Madinah' },
      { dayNumber: 'Hari 2', title: 'Madinah', location: 'Madinah' },
      { dayNumber: 'Hari 4', title: 'Medinah - Mekah', location: 'Medinah - Mekah' },
      { dayNumber: 'Hari 5', title: 'Mekkah', location: 'Mekkah' },
    ],
  };

  assert.deepEqual(inferSaudiJourneyOrderFromItinerary(content), ['Madinah', 'Umroh']);
});

test('inferSaudiJourneyOrderFromItinerary: detects Umroh first when Mekkah appears before Madinah', () => {
  const content = {
    days: [
      { dayNumber: 'Hari 1', title: 'Jakarta - Jeddah - Mekkah', location: 'Jakarta - Jeddah - Mekkah' },
      { dayNumber: 'Hari 2', title: 'Mekkah', location: 'Mekkah' },
      { dayNumber: 'Hari 6', title: 'Mekkah - Madinah', location: 'Mekkah - Madinah' },
      { dayNumber: 'Hari 7', title: 'Madinah', location: 'Madinah' },
    ],
  };

  assert.deepEqual(inferSaudiJourneyOrderFromItinerary(content), ['Umroh', 'Madinah']);
});

test('inferSaudiJourneyOrderFromItinerary: ignores generic manasik umroh before Mekkah phase', () => {
  const content = {
    days: [
      {
        dayNumber: 'Hari 1',
        title: 'Jakarta - Jeddah - Madinah',
        location: 'Jakarta - Jeddah - Madinah',
        activities: [{ text: 'Manasik dan pembekalan umroh di Madinah' }],
      },
      { dayNumber: 'Hari 4', title: 'Medinah - Mekah', location: 'Medinah - Mekah' },
    ],
  };

  assert.deepEqual(inferSaudiJourneyOrderFromItinerary(content), ['Madinah', 'Umroh']);
});
