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

  it('formats dates and the period for people', () => {
    const view = buildPublicLoanView(baseLoan, new Date('2026-08-01T10:00:00'));

    expect(view.startDate).toBe('Jul 28, 2026');
    expect(view.endDate).toBe('Aug 4, 2026');
    expect(view.period).toBe('Jul 28 – Aug 4, 2026');
  });

  it('describes time to the due date as plain text', () => {
    expect(buildPublicLoanView(baseLoan, new Date('2026-08-01T10:00:00')).dueNote).toBe(
      'Due in 3 days',
    );
    expect(buildPublicLoanView(baseLoan, new Date('2026-08-04T10:00:00')).dueNote).toBe(
      'Due today',
    );
    expect(
      buildPublicLoanView(
        { ...baseLoan, status: 'Overdue' },
        new Date('2026-12-04T10:00:00'),
      ).dueNote,
    ).toBe('4 months late');
  });

  it('notes the return date for returned loans and nothing for cancelled ones', () => {
    expect(
      buildPublicLoanView({ ...baseLoan, status: 'Returned', returnDate: '2026-08-03' })
        .dueNote,
    ).toBe('Returned Aug 3, 2026');
    expect(buildPublicLoanView({ ...baseLoan, status: 'Cancelled' }).dueNote).toBeUndefined();
  });

  it('maps branch, issuer and extension history, omitting them when absent', () => {
    const view = buildPublicLoanView({
      ...baseLoan,
      locationName: ' Battambang Branch ',
      issuedBy: 'Kosal Sophanith',
      extensionHistory: [
        {
          previousEndDate: '2026-08-04',
          newEndDate: '2026-09-04',
          updatedAt: '2026-08-01T08:00:00Z',
        },
      ],
    });

    expect(view.locationName).toBe('Battambang Branch');
    expect(view.issuedBy).toBe('Kosal Sophanith');
    expect(view.extensions).toEqual([
      { range: 'Aug 4, 2026 → Sep 4, 2026', when: 'Extended Aug 1, 2026' },
    ]);

    const bare = buildPublicLoanView(baseLoan);
    expect('locationName' in bare).toBeFalse();
    expect('issuedBy' in bare).toBeFalse();
    expect(bare.extensions).toEqual([]);
  });

  it('maps the status to a single dot tone', () => {
    expect(buildPublicLoanView({ ...baseLoan, status: 'Overdue' }).statusTone).toBe('overdue');
    expect(buildPublicLoanView({ ...baseLoan, status: 'Returned' }).statusTone).toBe('returned');
    expect(buildPublicLoanView({ ...baseLoan, status: 'Something else' }).statusTone).toBe(
      'other',
    );
  });
});
