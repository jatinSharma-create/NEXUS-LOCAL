import { parsePhoneNumberWithError, CountryCode } from 'libphonenumber-js';

export function normalizePhone(raw: string, defaultRegion: CountryCode = 'AU'): string | null {
  try {
    const phoneNumber = parsePhoneNumberWithError(raw, defaultRegion);
    if (phoneNumber.isValid()) {
      return phoneNumber.format('E.164');
    }
  } catch {
    // Parsing failed
  }
  return null;
}

/**
 * Free-dialer input: accept +E.164, AU locals, or Indian mobiles (10-digit / 91…).
 * Indian mobiles are forced to +91 so the AU default region does not mis-parse them.
 */
export function normalizeDialerInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('+')) {
    return normalizePhone(trimmed);
  }

  const digits = trimmed.replace(/\D/g, '');

  // India mobile: 98765… (10 digits) or 9198765… (12 digits)
  if (/^[6-9]\d{9}$/.test(digits)) {
    return normalizePhone(`+91${digits}`, 'IN');
  }
  if (/^91[6-9]\d{9}$/.test(digits)) {
    return normalizePhone(`+${digits}`, 'IN');
  }

  return normalizePhone(trimmed, 'AU');
}
