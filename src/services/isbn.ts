/**
 * ISBN-Prüfziffern werden lokal gerechnet, bevor irgendeine Abfrage rausgeht.
 * Ein Zahlendreher beim Abtippen fällt damit sofort auf und nicht erst als
 * "nichts gefunden".
 */

/** Entfernt Bindestriche, Leerzeichen und Ähnliches; das X der ISBN-10 bleibt groß. */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[^0-9xX]/g, '').toUpperCase();
}

export function isValidIsbn10(raw: string): boolean {
  const isbn = normalizeIsbn(raw);
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;

  // Gewichte 10..1, X an letzter Stelle zählt als 10, Summe muss durch 11 teilbar sein.
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const char = isbn[i]!;
    sum += (char === 'X' ? 10 : Number(char)) * (10 - i);
  }
  return sum % 11 === 0;
}

export function isValidIsbn13(raw: string): boolean {
  const isbn = normalizeIsbn(raw);
  if (!/^\d{13}$/.test(isbn)) return false;
  return computeIsbn13Check(isbn.slice(0, 12)) === Number(isbn[12]);
}

export function isValidIsbn(raw: string): boolean {
  return isValidIsbn10(raw) || isValidIsbn13(raw);
}

/**
 * Bücher tragen einen EAN-13 aus dem Bereich 978/979 ("Bookland"). Eine
 * Shampooflasche hat einen genauso gültigen EAN-13 mit derselben Prüfziffer-
 * rechnung — ohne diese Prüfung würde die App den anstandslos als ISBN
 * durchwinken und dann nur nichts finden.
 */
export function isBookBarcode(raw: string): boolean {
  const isbn = normalizeIsbn(raw);
  if (isValidIsbn10(isbn)) return true;
  return isValidIsbn13(isbn) && (isbn.startsWith('978') || isbn.startsWith('979'));
}

/** Rechnet eine gültige ISBN-10 in die ISBN-13 um; bei ungültiger Eingabe null. */
export function toIsbn13(raw: string): string | null {
  const isbn = normalizeIsbn(raw);
  if (isValidIsbn13(isbn)) return isbn;
  if (!isValidIsbn10(isbn)) return null;

  const body = `978${isbn.slice(0, 9)}`;
  return `${body}${computeIsbn13Check(body)}`;
}

/** Beide Schreibweisen, sofern ableitbar — für die Anzeige und die Dublettenprüfung. */
export function splitIsbn(raw: string): { isbn13: string | null; isbn10: string | null } {
  const isbn = normalizeIsbn(raw);
  if (isValidIsbn10(isbn)) return { isbn13: toIsbn13(isbn), isbn10: isbn };
  if (isValidIsbn13(isbn)) return { isbn13: isbn, isbn10: null };
  return { isbn13: null, isbn10: null };
}

function computeIsbn13Check(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}
