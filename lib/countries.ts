// lib/countries.ts — country names and phone dial codes (operator, 14 Oct: phone country code, default +91 India;
// nationality as a full world list, default India). Names come from the browser / Node (Intl.DisplayNames).
// ISO code + dial code; the first entry for a shared dial code (+1 US, +7 RU, +44 GB…) is the one a stored number maps back to.
const DATA = [
  'IN91 US1 GB44 RU7 FI358 IT39 NO47 MA212 RE262 GP590 CW599 AF93 AX358 AL355 DZ213 AS1684 AD376 AO244',
  'AI1264 AG1268 AR54 AM374 AW297 AU61 AT43 AZ994 BS1242 BH973 BD880 BB1246 BY375 BE32 BZ501 BJ229',
  'BM1441 BT975 BO591 BA387 BW267 BR55 IO246 VG1284 BN673 BG359 BF226 BI257 KH855 CM237 CA1 CV238',
  'KY1345 CF236 TD235 CL56 CN86 CO57 KM269 CG242 CD243 CK682 CR506 CI225 HR385 CU53 CY357 CZ420 DK45',
  'DJ253 DM1767 DO1809 EC593 EG20 SV503 GQ240 ER291 EE372 SZ268 ET251 FK500 FO298 FJ679 FR33 GF594',
  'PF689 GA241 GM220 GE995 DE49 GH233 GI350 GR30 GL299 GD1473 GU1671 GT502 GG44 GN224 GW245 GY592 HT509',
  'HN504 HK852 HU36 IS354 ID62 IR98 IQ964 IE353 IM44 IL972 JM1876 JP81 JE44 JO962 KZ7 KE254 KI686 XK383',
  'KW965 KG996 LA856 LV371 LB961 LS266 LR231 LY218 LI423 LT370 LU352 MO853 MG261 MW265 MY60 MV960 ML223',
  'MT356 MH692 MQ596 MR222 MU230 YT262 MX52 FM691 MD373 MC377 MN976 ME382 MS1664 MZ258 MM95 NA264 NR674',
  'NP977 NL31 NC687 NZ64 NI505 NE227 NG234 NU683 NF672 KP850 MK389 MP1670 OM968 PK92 PW680 PS970 PA507',
  'PG675 PY595 PE51 PH63 PL48 PT351 PR1787 QA974 RO40 RW250 BL590 SH290 KN1869 LC1758 MF590 PM508',
  'VC1784 WS685 SM378 ST239 SA966 SN221 RS381 SC248 SL232 SG65 SX1721 SK421 SI386 SB677 SO252 ZA27 KR82',
  'SS211 ES34 LK94 SD249 SR597 SJ47 SE46 CH41 SY963 TW886 TJ992 TZ255 TH66 TL670 TG228 TK690 TO676',
  'TT1868 TN216 TR90 TM993 TC1649 TV688 UG256 UA380 AE971 UY598 VI1340 UZ998 VU678 VA39 VE58 VN84 WF681',
  'EH212 YE967 ZM260 ZW263',
].join(' ').split(' ');

const names = new Intl.DisplayNames(['en'], { type: 'region' });

export type Country = { code: string; name: string; dial: string };
const LIST: Country[] = DATA.map(t => ({ code: t.slice(0, 2), dial: t.slice(2), name: names.of(t.slice(0, 2)) ?? t.slice(0, 2) }));

/** Every country, A–Z by name. */
export const COUNTRIES: Country[] = [...LIST].sort((a, b) => a.name.localeCompare(b.name));
export const DEFAULT_COUNTRY = 'India';
export const DEFAULT_DIAL = '91';

/** '+91 98765 43210' → { dial: '91', number: '98765 43210' }. A number saved before the selector existed has no '+': it's taken as +91. */
export function splitPhone(value: string | null | undefined): { dial: string; number: string } {
  const v = (value ?? '').trim();
  if (!v.startsWith('+')) return { dial: DEFAULT_DIAL, number: v };
  const digits = v.slice(1);
  const dial = LIST.map(c => c.dial).filter(d => digits.startsWith(d)).sort((a, b) => b.length - a.length)[0];
  return dial ? { dial, number: digits.slice(dial.length).trim() } : { dial: DEFAULT_DIAL, number: v };
}

/** The stored form: '+<dial> <number>', or '' when there's no number. */
export const joinPhone = (dial: string, number: string) => (number.trim() ? `+${dial} ${number.trim()}` : '');

/** The country a dial code maps back to (first in DATA). */
export const countryForDial = (dial: string) => LIST.find(c => c.dial === dial)?.code ?? 'IN';
export const dialForCountry = (code: string) => LIST.find(c => c.code === code)?.dial ?? DEFAULT_DIAL;
