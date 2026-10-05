import { DateTime, type DateTimeFormatOptions } from 'luxon';

import { APP_I18N_OPTIONS } from '../constants/i18n';

/**
 * Solveris-Fassung: Zeitangaben im Unterzeichnungszertifikat und Prüfprotokoll.
 *
 * Ist die Dokumentsprache Deutsch, stehen die Zeiten in deutscher Zeit
 * (Europe/Berlin, MEZ/MESZ) im 24-Stunden-Format. Für alle anderen Sprachen
 * bleibt das Verhalten von Documenso unverändert (Serverzeitzone, 12 Stunden).
 */
const istDeutsch = (locale?: string | null) => Boolean(locale && locale.toLowerCase().startsWith('de'));

export const formatPdfDateTime = (date: Date, locale?: string | null) => {
  if (istDeutsch(locale)) {
    return DateTime.fromJSDate(date).setZone('Europe/Berlin').setLocale('de').toFormat('dd.MM.yyyy HH:mm:ss (ZZZZ)');
  }

  return DateTime.fromJSDate(date).setLocale(APP_I18N_OPTIONS.defaultLocale).toFormat('yyyy-MM-dd hh:mm:ss a (ZZZZ)');
};

const kurzesFormat12h: DateTimeFormatOptions = {
  ...DateTime.DATETIME_SHORT,
  hourCycle: 'h12',
};

const kurzesFormat24h: DateTimeFormatOptions = {
  ...DateTime.DATETIME_SHORT,
  hourCycle: 'h23',
  timeZoneName: 'short',
};

export const formatPdfDateTimeShort = (date: Date, locale?: string | null) => {
  if (istDeutsch(locale)) {
    return DateTime.fromJSDate(date).setZone('Europe/Berlin').setLocale('de').toLocaleString(kurzesFormat24h);
  }

  return DateTime.fromJSDate(date).setLocale(APP_I18N_OPTIONS.defaultLocale).toLocaleString(kurzesFormat12h);
};
