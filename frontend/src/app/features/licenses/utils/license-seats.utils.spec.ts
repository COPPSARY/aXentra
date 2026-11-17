import { formatLicenseSeats } from './license-seats.utils';

describe('formatLicenseSeats', () => {
  it('formats multi-seat licenses as used / total', () => {
    expect(
      formatLicenseSeats({
        allocationType: 'multi',
        allocationLimit: 10,
        available: 7,
      }),
    ).toBe('3 / 10');
  });

  it('formats single-seat licenses using a total of 1', () => {
    expect(
      formatLicenseSeats({
        allocationType: 'single',
        allocationLimit: 1,
        available: 0,
      }),
    ).toBe('1 / 1');

    expect(
      formatLicenseSeats({
        allocationType: 'single',
        allocationLimit: null,
        available: 1,
      }),
    ).toBe('0 / 1');
  });

  it('falls back to Unlimited when total and available are unknown', () => {
    expect(
      formatLicenseSeats({
        allocationType: 'multi',
        allocationLimit: null,
        available: null,
      }),
    ).toBe('Unlimited');
  });

  it('shows available count when total is unknown but available is known', () => {
    expect(
      formatLicenseSeats({
        allocationType: 'multi',
        allocationLimit: null,
        available: 5,
      }),
    ).toBe('5 available');
  });

  it('treats missing available as full when total is known', () => {
    expect(
      formatLicenseSeats({
        allocationType: 'multi',
        allocationLimit: 4,
        available: null,
      }),
    ).toBe('0 / 4');
  });
});
