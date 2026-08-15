/**
 * Sortierschlüssel werden beim Speichern berechnet und im Buch abgelegt.
 * Damit sortiert die Liste ohne Rechnerei pro Render, und ein Buch behält
 * seine Einsortierung auch dann, wenn die Regeln hier später schärfer werden.
 */

/** Führende Artikel, die beim Einsortieren wegfallen: "Der Herr der Ringe" steht unter H. */
const LEADING_ARTICLE = /^(?:der|die|das|den|dem|des|ein|eine|einen|einem|eines|the|a|an)\s+/i;

/** Namenszusätze, die zum Nachnamen gehören: "von Schirach", "van der Berg". */
const NAME_PARTICLES = new Set([
  'von', 'vom', 'van', 'de', 'del', 'della', 'di', 'da', 'dos', 'du', 'la', 'le',
  'den', 'der', 'ten', 'ter', 'zu', 'zum', 'af', 'av', 'bin', 'ibn', "o'", 'mac', 'mc',
]);

export function titleSortKey(title: string): string {
  return title.trim().replace(LEADING_ARTICLE, '').trim().toLocaleLowerCase('de');
}

/**
 * "Cornelia Funke" wird zu "funke, cornelia", damit die Autorensortierung dem
 * entspricht, was im Regal steht. In der Detailansicht überschreibbar — bei
 * Namen aus anderen Namenskulturen liegt die Automatik zwangsläufig manchmal daneben.
 */
export function authorSortKey(author: string | undefined | null): string {
  const name = (author ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return '';

  const parts = name.split(' ');
  if (parts.length === 1) return name.toLocaleLowerCase('de');

  // Vom Ende her: der Nachname wächst nach links, solange davor ein Namenszusatz steht.
  let surnameStart = parts.length - 1;
  while (surnameStart > 1 && NAME_PARTICLES.has(parts[surnameStart - 1]!.toLocaleLowerCase('de'))) {
    surnameStart -= 1;
  }

  const surname = parts.slice(surnameStart).join(' ');
  const given = parts.slice(0, surnameStart).join(' ');
  return `${surname}, ${given}`.toLocaleLowerCase('de');
}

/**
 * Deutsche Sortierung: ä steht bei a und nicht hinter z, "Band 2" vor "Band 10".
 *
 * Bewusst ohne sensitivity: 'base' — damit wären "Apfel" und "Äpfel" gleichwertig,
 * und welches der beiden Bücher oben steht, hinge an der Ladereihenfolge.
 */
export function compareGerman(a: string, b: string): number {
  return a.localeCompare(b, 'de', { numeric: true });
}
