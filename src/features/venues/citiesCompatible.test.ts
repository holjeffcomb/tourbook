import { citiesCompatible } from '@/features/venues/match';

describe('citiesCompatible', () => {
  it('matches identical cities regardless of case/whitespace', () => {
    expect(citiesCompatible('Hamburg', 'hamburg')).toBe(true);
    expect(citiesCompatible('  Hamburg ', 'Hamburg')).toBe(true);
  });

  it('matches when one city adds a country/region qualifier', () => {
    expect(citiesCompatible('Hamburg', 'Hamburg, DE')).toBe(true);
    expect(citiesCompatible('Hamburg, DE', 'Hamburg')).toBe(true);
    expect(citiesCompatible('New York', 'New York, NY')).toBe(true);
    expect(citiesCompatible('New York NY', 'New York')).toBe(true);
  });

  it('rejects different cities and partial-word collisions', () => {
    expect(citiesCompatible('Hamburg', 'Hamburgo')).toBe(false);
    expect(citiesCompatible('Hamburg', 'Berlin')).toBe(false);
    expect(citiesCompatible('Springfield', 'Springfield Gardens')).toBe(true);
    expect(citiesCompatible('', 'Hamburg')).toBe(false);
  });
});
