/** Kleine Formathelfer für die Anzeige. Keine Datenlogik, nur Darstellung. */

/**
 * Ohne Cover bekommt jedes Buch eine eigene Farbkachel, abgeleitet aus dem
 * Titel. Dasselbe Buch sieht damit immer gleich aus, und ein Regal voller
 * coverloser Bücher wird trotzdem unterscheidbar.
 */
export function coverGradient(title: string): string {
  const seed = (title.charCodeAt(0) || 65) * 7 + title.length * 13;
  const hue = seed % 360;
  return `linear-gradient(150deg, hsl(${hue} 42% 42%), hsl(${(hue + 34) % 360} 46% 26%))`;
}

export function coverInitial(title: string): string {
  return title.trim().charAt(0).toLocaleUpperCase('de') || '?';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Für Datumsfelder im Formular: ISO-Zeitstempel zu "2026-09-30". */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** Umgekehrt: "2026-09-30" aus einem Datumsfeld zu einem ISO-Zeitstempel. */
export function fromDateInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function pluralBooks(count: number): string {
  return count === 1 ? '1 Buch' : `${count} Bücher`;
}
