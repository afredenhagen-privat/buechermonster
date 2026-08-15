/**
 * Google Books liefert Kategorien wie "Juvenile Fiction / Fantasy & Magic".
 * Hier werden die geläufigen davon auf die eigenen Genres übersetzt.
 *
 * Was nicht zugeordnet werden kann, kommt als Vorschlag zurück und wird nicht
 * still verworfen — die Benutzerin entscheidet, ob daraus ein neues Genre wird.
 */

interface Rule {
  keywords: string[];
  genre: string;
}

/** Spezifische Regeln zuerst; greift eine davon, bleiben die schwachen außen vor. */
const STRONG_RULES: Rule[] = [
  { genre: 'Fantasy', keywords: ['fantasy', 'magic', 'wizard', 'dragon', 'märchen', 'fairy tale'] },
  { genre: 'Science-Fiction', keywords: ['science fiction', 'sci-fi', 'dystopian', 'space opera'] },
  // "Psychothriller", "Kriminalroman" und Ähnliches stehen bei deutschen
  // Büchern meist im Untertitel — der wird deshalb mit ausgewertet.
  { genre: 'Krimi & Thriller', keywords: ['mystery', 'detective', 'crime', 'thriller', 'suspense', 'krimi'] },
  { genre: 'Horror', keywords: ['horror', 'ghost', 'occult', 'gruselroman'] },
  { genre: 'Liebesroman', keywords: ['romance', 'love stories', 'liebesroman'] },
  { genre: 'Historisches', keywords: ['historical fiction', 'historical', 'historisch'] },
  {
    genre: 'Kinder- & Jugendbuch',
    keywords: [
      'juvenile', 'young adult', 'children', 'kinderbuch', 'jugendbuch',
      // Schreibweisen der DNB-Sachgruppen
      'kinder- und jugend', 'jugendliteratur', 'kinderliteratur', 'bilderbuch',
    ],
  },
  { genre: 'Comic & Graphic Novel', keywords: ['comics', 'graphic novel', 'manga', 'comic'] },
  { genre: 'Klassiker', keywords: ['classics', 'klassiker'] },
  { genre: 'Biografie', keywords: ['biography', 'autobiography', 'memoir', 'biografie'] },
  { genre: 'Kochbuch', keywords: ['cooking', 'cookbook', 'kochen', 'kochbuch'] },
  { genre: 'Reise', keywords: ['travel', 'reise'] },
  { genre: 'Ratgeber', keywords: ['self-help', 'self help', 'ratgeber', 'health & fitness', 'family & relationships'] },
  {
    genre: 'Sachbuch',
    keywords: [
      'history', 'science', 'philosophy', 'psychology', 'business', 'economics',
      'political', 'social science', 'religion', 'nature', 'computers', 'technology',
      'mathematics', 'medical', 'education', 'sachbuch', 'true crime',
    ],
  },
];

/** Greift nur, wenn oben nichts passte — "Fiction" allein sagt fast nichts. */
const WEAK_RULES: Rule[] = [
  { genre: 'Roman & Belletristik', keywords: ['fiction', 'literary', 'roman', 'belletristik', 'literatur'] },
];

export interface GenreMappingResult {
  /** Namen aus der Genre-Liste, ohne Dubletten, in der Reihenfolge der Regeln. */
  matched: string[];
  /** Kategorien, für die es keine Regel gibt — Material für "als neues Genre anlegen?". */
  unmatched: string[];
}

export function mapCategories(categories: readonly string[]): GenreMappingResult {
  // "Juvenile Fiction / Fantasy & Magic" zerfällt in zwei eigenständige Teile.
  const parts = categories
    .flatMap((c) => c.split(/[/>|]/))
    .map((c) => c.trim())
    .filter(Boolean);

  const matched: string[] = [];
  const unmatched: string[] = [];

  for (const part of parts) {
    const lower = part.toLocaleLowerCase('de');
    const strong = STRONG_RULES.find((r) => r.keywords.some((k) => lower.includes(k)));
    if (strong) {
      if (!matched.includes(strong.genre)) matched.push(strong.genre);
      continue;
    }
    const weak = WEAK_RULES.find((r) => r.keywords.some((k) => lower.includes(k)));
    if (weak) continue; // erst am Ende auswerten
    if (!unmatched.includes(part)) unmatched.push(part);
  }

  if (matched.length === 0) {
    const anyWeak = parts.some((p) => {
      const lower = p.toLocaleLowerCase('de');
      return WEAK_RULES.some((r) => r.keywords.some((k) => lower.includes(k)));
    });
    if (anyWeak) matched.push('Roman & Belletristik');
  }

  return { matched, unmatched };
}
