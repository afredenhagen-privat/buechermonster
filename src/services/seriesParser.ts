/**
 * Reihe und Bandnummer aus dem Titel raten.
 *
 * Die Buch-APIs geben Reiheninformationen nur unzuverlässig heraus, deshalb
 * diese Heuristik über die Schreibweisen, die in der Praxis vorkommen. Das
 * Ergebnis ist immer nur eine Vorbelegung fürs Formular — was hier danebenliegt,
 * korrigiert die Benutzerin vor dem Speichern.
 */

export interface SeriesGuess {
  seriesName: string;
  seriesIndex: number;
  /** Titel ohne den Reihenteil, falls dieser in Klammern stand. */
  cleanTitle: string;
}

const BAND_WORD = String.raw`(?:bd\.?|band|teil|folge|vol\.?|volume|book)`;

/** "Eragon, Bd. 1" oder "Eragon 1" oder "Eragon #1" — der Inhalt einer Klammer. */
const INNER_WITH_WORD = new RegExp(String.raw`^(.+?)[,\s]+${BAND_WORD}\s*(\d{1,3})$`, 'i');
const INNER_WITH_HASH = /^(.+?)\s*#\s*(\d{1,3})$/;
const INNER_BARE = /^(.+?)[,\s]+(\d{1,3})$/;

/** "Der dunkle Turm, Band 3" — Bandwort direkt im Titel. */
const TITLE_WITH_WORD = new RegExp(String.raw`^(.+?)[,\s]*[–—-]?[,\s]*${BAND_WORD}\s*(\d{1,3})$`, 'i');
const TITLE_WITH_HASH = /^(.+?)\s*#\s*(\d{1,3})$/;
/** "Die Tribute von Panem 2" — nackte Zahl am Ende, siehe Sicherungen unten. */
const TITLE_BARE_NUMBER = /^(.+?)\s+(\d{1,2})$/;

/** Ein Untertitel, der nur aus der Bandangabe besteht: Titel ist dann die Reihe. */
const SUBTITLE_ONLY_BAND = new RegExp(String.raw`^${BAND_WORD}\s*(\d{1,3})$`, 'i');

export function parseSeries(title: string, subtitle?: string | null): SeriesGuess | null {
  const raw = title.trim();
  if (!raw) return null;

  // 1. Klammerform: "Eragon (Eragon, Bd. 1)"
  const paren = /^(.+?)\s*[(［[]([^)］\]]+)[)］\]]\s*$/.exec(raw);
  if (paren) {
    const outer = paren[1]!.trim();
    const inner = paren[2]!.trim();
    for (const pattern of [INNER_WITH_WORD, INNER_WITH_HASH, INNER_BARE]) {
      const hit = pattern.exec(inner);
      if (hit) {
        const guess = build(hit[1]!, hit[2]!, outer);
        if (guess) return guess;
      }
    }
  }

  // 2. Bandwort oder Raute direkt im Titel
  for (const pattern of [TITLE_WITH_WORD, TITLE_WITH_HASH]) {
    const hit = pattern.exec(raw);
    if (hit) {
      const guess = build(hit[1]!, hit[2]!, hit[1]!);
      if (guess) return guess;
    }
  }

  // 3. Untertitel trägt die Bandangabe: "Der dunkle Turm" + "Band 3"
  const sub = (subtitle ?? '').trim();
  if (sub) {
    const hit = SUBTITLE_ONLY_BAND.exec(sub);
    if (hit) {
      const guess = build(raw, hit[1]!, raw);
      if (guess) return guess;
    }
  }

  // 4. Nackte Zahl am Ende — nur mit Sicherungen, sonst wird aus
  //    "Fahrenheit 451" eine Reihe und aus "1984" erst recht.
  const bare = TITLE_BARE_NUMBER.exec(raw);
  if (bare) {
    const name = bare[1]!.trim();
    const index = Number(bare[2]);
    const looksLikeSeries = index >= 1 && index <= 30 && /\p{L}/u.test(name) && name.length >= 4;
    if (looksLikeSeries) return build(name, bare[2]!, name);
  }

  return null;
}

function build(name: string, index: string, cleanTitle: string): SeriesGuess | null {
  const seriesName = name.replace(/[,\s–—-]+$/, '').trim();
  const seriesIndex = Number(index);
  if (!seriesName || !Number.isFinite(seriesIndex) || seriesIndex < 1) return null;
  return {
    seriesName,
    seriesIndex,
    cleanTitle: cleanTitle.replace(/[,\s–—-]+$/, '').trim() || seriesName,
  };
}
