import type { LookupResult } from '@/types';
import { splitIsbn } from './isbn';

/**
 * Auswertung der SRU-Schnittstelle der Deutschen Nationalbibliothek.
 *
 * Warum die als erste Quelle: sie kennt praktisch jedes in Deutschland
 * erschienene Buch, braucht keinen Schlüssel und schickt
 * "Access-Control-Allow-Origin: *", ist also direkt aus dem Browser
 * abfragbar. Google Books ist ohne API-Schlüssel dagegen unbrauchbar
 * geworden — dort ist das gemeinsame Tageskontingent regelmäßig erschöpft.
 *
 * Das Parsen steckt bewusst in einer eigenen Datei ohne Netzzugriff,
 * damit es sich gegen aufgezeichnete Antworten testen lässt.
 */

/** Rollen, die nicht als Autor gelten. */
const NON_AUTHOR_ROLES = /\[(Übersetzer|Illustrator|Buchgestalter|Herausgeber|Mitwirkender|Erzähler|Komponist|Fotograf|Sprecher|Bearbeiter|Verfasser eines Vorworts|Verfasser eines Nachworts)\]/i;

export function buildDnbUrl(isbn13: string): string {
  const query = encodeURIComponent(`NUM=${isbn13}`);
  return `https://services.dnb.de/sru/dnb?version=1.1&operation=searchRetrieve&query=${query}&recordSchema=oai_dc&maximumRecords=1`;
}

export function parseDnbResponse(xml: string, isbn13: string): LookupResult | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) return null;

  const rawTitle = text(doc, 'title');
  if (!rawTitle) return null;

  const { title, subtitle } = splitTitle(rawTitle);
  const fallback = splitIsbn(isbn13);

  return {
    title,
    subtitle,
    authors: readAuthors(doc),
    isbn13: fallback.isbn13 ?? isbn13,
    isbn10: fallback.isbn10 ?? readIsbn10(doc),
    publisher: readPublisher(doc),
    publishedYear: readYear(doc),
    pageCount: readPageCount(doc),
    language: readLanguage(doc),
    // Die DNB liefert keine Titelbilder; das Cover holt bookLookup separat.
    coverUrl: null,
    // Der Untertitel trägt bei deutschen Büchern oft die Gattung
    // ("Psychothriller", "Kriminalroman") und ist damit fürs Genre
    // aussagekräftiger als die Sachgruppen.
    categories: [...readSubjects(doc), ...(subtitle ? [subtitle] : [])],
    source: 'dnb',
  };
}

/** "Ich beschütze dich : Psychothriller / Penny Hancock. Aus dem Engl. von …" */
function splitTitle(raw: string): { title: string; subtitle: string | null } {
  // Alles ab " / " ist die Verantwortlichkeitsangabe — die Autoren stehen
  // sauberer in den creator-Feldern.
  const withoutResponsibility = raw.split(' / ')[0]!.trim();

  const separator = withoutResponsibility.indexOf(' : ');
  if (separator === -1) return { title: withoutResponsibility, subtitle: null };

  return {
    title: withoutResponsibility.slice(0, separator).trim(),
    subtitle: withoutResponsibility.slice(separator + 3).trim() || null,
  };
}

function readAuthors(doc: Document): string[] {
  const all = list(doc, 'creator');
  const authors = all.filter((c) => !NON_AUTHOR_ROLES.test(c));

  return (authors.length ? authors : all)
    .map((entry) => flipName(entry.replace(/\s*\[[^\]]*\]\s*/g, '').trim()))
    .filter(Boolean);
}

/** Die DNB schreibt "Funke, Cornelia"; angezeigt wird "Cornelia Funke". */
function flipName(name: string): string {
  const comma = name.indexOf(',');
  if (comma === -1) return name;
  const surname = name.slice(0, comma).trim();
  const given = name.slice(comma + 1).trim();
  return given ? `${given} ${surname}` : surname;
}

/** "München : Goldmann" — interessant ist der Verlag, nicht der Ort. */
function readPublisher(doc: Document): string | null {
  const raw = text(doc, 'publisher');
  if (!raw) return null;
  const separator = raw.lastIndexOf(' : ');
  return (separator === -1 ? raw : raw.slice(separator + 3)).trim() || null;
}

function readYear(doc: Document): number | null {
  const hit = /(\d{4})/.exec(text(doc, 'date') ?? '');
  return hit ? Number(hit[1]) : null;
}

/** "382 S." oder "573 Seiten" */
function readPageCount(doc: Document): number | null {
  const hit = /(\d+)\s*(?:S\.|Seiten)/.exec(text(doc, 'format') ?? '');
  return hit ? Number(hit[1]) : null;
}

function readLanguage(doc: Document): string | null {
  const raw = text(doc, 'language');
  if (!raw) return null;
  const map: Record<string, string> = { ger: 'de', eng: 'en', fre: 'fr', spa: 'es', ita: 'it' };
  return map[raw.toLowerCase()] ?? raw;
}

/**
 * Sachgruppen kommen mit vorangestelltem Schlüssel: "820 Englische Literatur",
 * "B Belletristik". Der Schlüssel hilft bei der Genre-Zuordnung nicht.
 */
function readSubjects(doc: Document): string[] {
  return list(doc, 'subject')
    .map((s) => s.replace(/^[0-9]{1,3}[A-Za-z]?\s+|^[A-Z]{1,3}\s+/, '').trim())
    .filter(Boolean);
}

/** "3-442-31315-5" steht als zweiter ISBN-Eintrag drin, mit Preisangaben davor oder dahinter. */
function readIsbn10(doc: Document): string | null {
  for (const raw of list(doc, 'identifier')) {
    const candidate = raw.trim().split(/\s+/)[0]?.replace(/-/g, '') ?? '';
    if (/^\d{9}[\dX]$/i.test(candidate)) return candidate.toUpperCase();
  }
  return null;
}

function text(doc: Document, tag: string): string | null {
  return list(doc, tag)[0] ?? null;
}

/**
 * Gesucht wird über den Namensteil hinter dem Präfix, nicht über den
 * Namensraum. Parser gehen damit unterschiedlich um: ein Browser liefert
 * localName "title" im dc-Namensraum, happy-dom in den Tests dagegen
 * "dc:title" in Großschreibung. Die SRU-Hülle enthält kein Element, das mit
 * einem der Dublin-Core-Felder kollidiert, deshalb ist der Vergleich sicher.
 */
function list(doc: Document, tag: string): string[] {
  const wanted = tag.toLowerCase();
  return [...doc.getElementsByTagName('*')]
    .filter((node) => localPart(node) === wanted)
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean);
}

function localPart(node: Element): string {
  const name = node.localName || node.nodeName;
  const colon = name.indexOf(':');
  return (colon === -1 ? name : name.slice(colon + 1)).toLowerCase();
}
