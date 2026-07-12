import { cityMatches, citySearchTerms } from '@/lib/cityMatch';

describe('cityMatches', () => {
  it('accepts when the city appears in Mapbox context', () => {
    expect(
      cityMatches('Philadelphia, PA', 'Philadelphia', 'The Fillmore, Philadelphia, Pennsylvania'),
    ).toBe(true);
  });

  it('rejects a different city (Fillmore Philly vs Las Vegas)', () => {
    expect(
      cityMatches('Philadelphia', 'Las Vegas', 'The Fillmore, Las Vegas, Nevada'),
    ).toBe(false);
  });

  it('accepts Morrison, CO against Morrison, Colorado', () => {
    expect(cityMatches('Morrison, CO', 'Morrison', 'Red Rocks, Morrison, Colorado')).toBe(true);
  });

  it('returns true when no city constraint is given', () => {
    expect(cityMatches('', 'Las Vegas')).toBe(true);
  });

  it('matches Montreal against Mapbox Montréal (accents)', () => {
    expect(
      cityMatches('Montreal', 'Montréal', 'MTELUS, Montréal, Quebec, Canada'),
    ).toBe(true);
  });

  it('matches St Petersburg against St. Petersburg', () => {
    expect(
      cityMatches('St Petersburg, FL', 'St. Petersburg', 'Jannus Live, St. Petersburg, Florida'),
    ).toBe(true);
  });
});

describe('citySearchTerms', () => {
  it('returns accented and ASCII forms for Montréal', () => {
    expect(citySearchTerms('Montréal, Canada')).toEqual(['Montréal', 'Montreal']);
  });

  it('returns a single term when there are no accents', () => {
    expect(citySearchTerms('Denver, CO')).toEqual(['Denver']);
  });
});
