import type { PublicLoanData } from '../models/public-loan.models';
import {
  buildPublicLoanView,
  formatPublicLoanTimestamp,
} from './public-loan-view.util';

describe('public loan view formatting', () => {
  const baseLoan: PublicLoanData = {
    reference: 'LN-23623',
    status: 'Active',
    borrowerName: 'Borrower BTBR 00012',
    startDate: '2026-07-28',
    endDate: '2026-08-04',
    items: [],
  };

  it('formats an ISO last-updated timestamp for people instead of exposing API syntax', () => {
    const view = buildPublicLoanView({
      ...baseLoan,
      updatedAt: '2026-07-31T08:12:15.369354+00:00',
    });

    expect(view.updatedAt).toContain('2026');
    expect(view.updatedAt).toMatch(/\d{1,2}:\d{2}\s(?:AM|PM)$/);
    expect(view.updatedAt).not.toContain('T');
    expect(view.updatedAt).not.toContain('+00:00');
  });

  it('preserves a non-standard legacy timestamp rather than dropping it', () => {
    expect(formatPublicLoanTimestamp('Updated recently')).toBe(
      'Updated recently',
    );
  });
});
