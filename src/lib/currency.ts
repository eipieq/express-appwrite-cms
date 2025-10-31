export type CurrencyCode = keyof typeof currencyCatalog;

type CurrencyEntry = {
  code: string;
  label: string;
  symbol: string;
  locale: string;
};

const currencyCatalog = {
  INR: {
    code: 'INR',
    label: 'Indian Rupee (INR)',
    symbol: '₹',
    locale: 'en-IN',
  },
  USD: {
    code: 'USD',
    label: 'US Dollar (USD)',
    symbol: '$',
    locale: 'en-US',
  },
  EUR: {
    code: 'EUR',
    label: 'Euro (EUR)',
    symbol: '€',
    locale: 'de-DE',
  },
  GBP: {
    code: 'GBP',
    label: 'British Pound (GBP)',
    symbol: '£',
    locale: 'en-GB',
  },
  AUD: {
    code: 'AUD',
    label: 'Australian Dollar (AUD)',
    symbol: 'A$',
    locale: 'en-AU',
  },
} as const satisfies Record<string, CurrencyEntry>;

export const DEFAULT_CURRENCY: CurrencyCode = 'INR';

export type CurrencyConfig = typeof currencyCatalog[CurrencyCode];

export const CURRENCY_OPTIONS = Object.values(currencyCatalog).map((entry) => ({
  value: entry.code,
  label: entry.label,
  symbol: entry.symbol,
}));

export function getCurrencyConfig(code?: string | null): CurrencyConfig {
  if (code && code in currencyCatalog) {
    return currencyCatalog[code as CurrencyCode];
  }
  return currencyCatalog[DEFAULT_CURRENCY];
}

export function getCurrencySymbol(code?: string | null): string {
  return getCurrencyConfig(code).symbol;
}

export function formatCurrencyAmount(amount: number, code?: string | null): string {
  const config = getCurrencyConfig(code);
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  try {
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    return `${config.symbol}${safeAmount.toLocaleString(config.locale)}`;
  }
}

