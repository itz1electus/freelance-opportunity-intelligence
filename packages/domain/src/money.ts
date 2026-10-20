import { z } from 'zod';

/**
 * ISO 4217 minor-unit exponents for the currencies FOI is likely to see (SPEC-08).
 * A code missing from this table is rejected rather than guessed.
 */
export const CURRENCY_EXPONENTS = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CHF: 2,
  CAD: 2,
  AUD: 2,
  NZD: 2,
  SEK: 2,
  NOK: 2,
  DKK: 2,
  PLN: 2,
  CZK: 2,
  AED: 2,
  SAR: 2,
  QAR: 2,
  INR: 2,
  PKR: 2,
  SGD: 2,
  HKD: 2,
  ZAR: 2,
  BRL: 2,
  MXN: 2,
  JPY: 0,
  KRW: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  JOD: 3,
} as const satisfies Record<string, 0 | 2 | 3>;

export type CurrencyCode = keyof typeof CURRENCY_EXPONENTS;

const CURRENCY_CODES = Object.keys(CURRENCY_EXPONENTS) as [CurrencyCode, ...CurrencyCode[]];

export const CurrencyCodeSchema = z.enum(CURRENCY_CODES);

/** Nonnegative integer as a decimal string, at most 18 digits (ADR-006). */
const MINOR_UNITS_PATTERN = /^(0|[1-9]\d{0,17})$/;

export const MoneySchema = z
  .object({
    currency: CurrencyCodeSchema,
    minorUnits: z.string().regex(MINOR_UNITS_PATTERN, 'minorUnits must be a nonnegative integer string'),
  })
  .strict();

export type Money = z.infer<typeof MoneySchema>;

export const MoneyRangeSchema = z
  .object({
    min: MoneySchema.nullable(),
    max: MoneySchema.nullable(),
    basis: z.enum(['project', 'hour', 'month', 'unknown']),
  })
  .strict()
  .refine((r) => r.min === null || r.max === null || r.min.currency === r.max.currency, {
    message: 'min and max must share a currency',
  })
  .refine((r) => r.min === null || r.max === null || toBigInt(r.min) <= toBigInt(r.max), {
    message: 'min must not exceed max',
  });

export type MoneyRange = z.infer<typeof MoneyRangeSchema>;

export function currencyExponent(currency: CurrencyCode): number {
  return CURRENCY_EXPONENTS[currency];
}

export function money(currency: CurrencyCode, minorUnits: bigint | string): Money {
  return MoneySchema.parse({ currency, minorUnits: String(minorUnits) });
}

export function toBigInt(m: Money): bigint {
  return BigInt(m.minorUnits);
}

export class CurrencyMismatchError extends Error {
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(`Cannot compare ${a} with ${b} without a documented exchange rate`);
    this.name = 'CurrencyMismatchError';
  }
}

/** Compares two amounts in the same currency. Never converts (D-028). */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
  const x = toBigInt(a);
  const y = toBigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Parses a decimal string such as "300" or "300.50" into exact minor units. */
export function fromDecimal(currency: CurrencyCode, decimal: string): Money {
  const exp = currencyExponent(currency);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(decimal.trim());
  if (!match) throw new Error(`Not a nonnegative decimal amount: ${decimal}`);
  const whole = match[1] ?? '0';
  const frac = match[2] ?? '';
  if (frac.length > exp) throw new Error(`${currency} allows at most ${exp} decimal places`);
  const minor = BigInt(whole) * 10n ** BigInt(exp) + BigInt(frac.padEnd(exp, '0') || '0');
  return money(currency, minor);
}

/** Exact decimal string for an amount, e.g. "300.00". */
export function toDecimalString(m: Money): string {
  const exp = currencyExponent(m.currency);
  if (exp === 0) return m.minorUnits;
  const padded = m.minorUnits.padStart(exp + 1, '0');
  return `${padded.slice(0, -exp)}.${padded.slice(-exp)}`;
}

/** Locale-aware display. Intl formats the decimal string exactly, without floating point. */
export function formatMoney(m: Money, locale = 'en-US'): string {
  const exp = currencyExponent(m.currency);
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  });
  return formatter.format(toDecimalString(m) as unknown as number);
}
