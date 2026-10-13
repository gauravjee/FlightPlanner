// components/ui/PhoneInput.tsx — country code + number (operator, 14 Oct: default +91 India).
// The value is one string, '+<dial> <digits>' (lib/countries.ts), so the phone columns stay plain text.
'use client';

import { useState } from 'react';
import { COUNTRIES, splitPhone, joinPhone, countryForDial, dialForCountry } from '@/lib/countries';

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className: string; // the form's input class; must include w-full
}

export default function PhoneInput({ id, value, onChange, className }: Props) {
  const { dial, number } = splitPhone(value);
  // Kept as the country, not the dial code: Canada and the US share +1.
  const [country, setCountry] = useState(() => countryForDial(dial));
  return (
    <div className="flex gap-2">
      <select
        aria-label="Country code"
        value={country}
        onChange={e => { setCountry(e.target.value); onChange(joinPhone(dialForCountry(e.target.value), number)); }}
        className={className.replace('w-full', 'w-40 shrink-0')}
      >
        {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name} (+{c.dial})</option>)}
      </select>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        maxLength={20}
        value={number}
        onChange={e => {
          const raw = e.target.value;
          if (raw.trim().startsWith('+')) { // a pasted '+91 98765 43210': move the code into the selector
            const p = splitPhone('+' + raw.replace(/\D/g, ''));
            setCountry(countryForDial(p.dial));
            return onChange(joinPhone(p.dial, p.number));
          }
          onChange(joinPhone(dialForCountry(country), raw.replace(/\D/g, '')));
        }}
        className={className}
      />
    </div>
  );
}
