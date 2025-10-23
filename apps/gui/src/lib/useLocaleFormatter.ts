import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

type NumberOptions = Intl.NumberFormatOptions;

type DateOptions = Intl.DateTimeFormatOptions;

export const useLocaleFormatter = () => {
  const { i18n } = useTranslation();

  const locale = i18n.language || i18n.resolvedLanguage || 'en';

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
    [locale],
  );

  const percentFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }),
    [locale],
  );

  const dateTimeFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );

  const formatNumber = (value: number, options?: NumberOptions) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1, ...options }).format(value);

  const formatPercent = (value: number, options?: NumberOptions) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0, ...options }).format(value / 100);

  const formatDateTime = (value: Date | number | string, options?: DateOptions) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', ...options }).format(
      value instanceof Date ? value : new Date(value),
    );

  return {
    locale,
    numberFormatter,
    percentFormatter,
    dateTimeFormatter,
    formatNumber,
    formatPercent,
    formatDateTime,
  };
};
