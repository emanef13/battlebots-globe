const COUNTRY_ISO: Record<string, string> = {
  USA: 'US',
  'United States': 'US',
  UK: 'GB',
  'United Kingdom': 'GB',
  Canada: 'CA',
  Brazil: 'BR',
  India: 'IN',
  China: 'CN',
  Netherlands: 'NL',
  Australia: 'AU',
  'New Zealand': 'NZ',
  'South Korea': 'KR',
  France: 'FR',
  Russia: 'RU',
  Germany: 'DE',
  Japan: 'JP',
  Mexico: 'MX',
  Spain: 'ES',
  Switzerland: 'CH',
};

/** Country name -> flag emoji (empty string when unknown). */
export function flagEmoji(country: string | null): string {
  if (!country) return '';
  const iso = COUNTRY_ISO[country];
  if (!iso) return '';
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
