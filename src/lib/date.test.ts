import { dateToISO, formatDateRange, formatShowDate, isoToDate } from '@/lib/date';

describe('formatShowDate', () => {
  it('formats an ISO date as a readable string', () => {
    expect(formatShowDate('2024-01-05')).toBe('Jan 5, 2024');
    expect(formatShowDate('2019-12-31')).toBe('Dec 31, 2019');
  });

  it('does not shift the day regardless of local timezone', () => {
    // A naive `new Date('2024-01-01')` parses as UTC midnight and can render as
    // Dec 31 in negative offsets; this helper must always keep Jan 1.
    expect(formatShowDate('2024-01-01')).toBe('Jan 1, 2024');
  });

  it('returns the input unchanged when it is not a valid ISO date', () => {
    expect(formatShowDate('not-a-date')).toBe('not-a-date');
    expect(formatShowDate('2024-13-01')).toBe('2024-13-01');
  });
});

describe('dateToISO', () => {
  it('serializes a local Date using its local calendar parts', () => {
    expect(dateToISO(new Date(2024, 0, 5))).toBe('2024-01-05');
    expect(dateToISO(new Date(2019, 11, 31))).toBe('2019-12-31');
  });

  it('zero-pads month and day', () => {
    expect(dateToISO(new Date(2024, 8, 9))).toBe('2024-09-09');
  });
});

describe('isoToDate', () => {
  it('parses an ISO date into a local midnight Date', () => {
    const date = isoToDate('2024-01-05');
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(5);
  });

  it('round-trips with dateToISO', () => {
    expect(dateToISO(isoToDate('2022-07-04'))).toBe('2022-07-04');
  });
});

describe('formatDateRange', () => {
  it('formats a full start/end range', () => {
    expect(formatDateRange('2024-01-05', '2024-01-10')).toBe('Jan 5, 2024 – Jan 10, 2024');
  });

  it('formats an open-ended start', () => {
    expect(formatDateRange('2024-01-05', null)).toBe('From Jan 5, 2024');
  });

  it('formats an open-ended finish', () => {
    expect(formatDateRange(null, '2024-01-10')).toBe('Until Jan 10, 2024');
  });

  it('returns null when neither date is set', () => {
    expect(formatDateRange(null, null)).toBeNull();
  });
});
