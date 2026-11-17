export interface LoanRecipientProfile {
  profileId: number;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  note?: string | null;
  createdAt: string;
}

export const LOAN_PROFILE_REMARK_PREFIX = '[Loan Profile]';

export function buildLoanProfileRemarkLine(
  profile: LoanRecipientProfile,
): string {
  const segments = [`Name: ${profile.fullName.trim()}`];

  if (profile.email?.trim()) {
    segments.push(`Email: ${profile.email.trim()}`);
  }

  if (profile.phone?.trim()) {
    segments.push(`Phone: ${profile.phone.trim()}`);
  }

  if (profile.note?.trim()) {
    segments.push(`Note: ${profile.note.trim()}`);
  }

  return `${LOAN_PROFILE_REMARK_PREFIX} ${segments.join('; ')}`;
}

export function stripLoanProfileRemark(value: string): string {
  return value
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith(LOAN_PROFILE_REMARK_PREFIX))
    .join('\n')
    .trim();
}

export function mergeLoanProfileRemark(
  currentRemark: string,
  profile: LoanRecipientProfile | null,
): string {
  const cleanedRemark = stripLoanProfileRemark(currentRemark);
  if (!profile) {
    return cleanedRemark;
  }

  const loanProfileLine = buildLoanProfileRemarkLine(profile);
  return cleanedRemark ? `${cleanedRemark}\n${loanProfileLine}` : loanProfileLine;
}

export function readLoanProfileNameFromRemark(
  remark: string | null | undefined,
): string | null {
  if (!remark) {
    return null;
  }

  const match = remark.match(
    /\[Loan Profile\]\s*Name:\s*([^;\r\n]+)/i,
  );

  return match?.[1]?.trim() || null;
}
