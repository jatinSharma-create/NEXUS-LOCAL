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
