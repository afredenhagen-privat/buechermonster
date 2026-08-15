import { describe, expect, it } from 'vitest';
import { buildDnbUrl, parseDnbResponse } from '@/services/dnb';

/** Echte Antworten der DNB-SRU-Schnittstelle, aufgezeichnet am 2026-08-15. */
function envelope(inner: string, records = 1): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/"><version>1.1</version><numberOfRecords>${records}</numberOfRecords><records><record><recordSchema>oai_dc</recordSchema><recordPacking>xml</recordPacking><recordData><dc xmlns:dnb="http://d-nb.de/standards/dnbterms" xmlns="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
${inner}
</dc></recordData><recordPosition>1</recordPosition></record></records></searchRetrieveResponse>`;
}

const TINTENHERZ = envelope(`  <dc:title>Tintenherz / Cornelia Funke. Mit Ill. der Autorin</dc:title>
  <dc:creator>Funke, Cornelia [Verfasser]</dc:creator>
  <dc:creator>Petersen, Martina [Buchgestalter]</dc:creator>
  <dc:publisher>Hamburg : Dressler</dc:publisher>
  <dc:date>2003</dc:date>
  <dc:language>ger</dc:language>
  <dc:identifier xsi:type="tel:ISBN">978-3-7915-0465-0 Pp. : EUR 19.90</dc:identifier>
  <dc:subject>K Kinder- und Jugendliteratur</dc:subject>
  <dc:format>573 S.</dc:format>`);

const PSYCHOTHRILLER = envelope(`  <dc:title>Ich beschütze dich : Psychothriller / Penny Hancock. Aus dem Engl. von Eva Kemper</dc:title>
  <dc:creator>Hancock, Penny [Verfasser]</dc:creator>
  <dc:creator>Kemper, Eva [Übersetzer]</dc:creator>
  <dc:publisher>München : Goldmann</dc:publisher>
  <dc:date>2013</dc:date>
  <dc:language>ger</dc:language>
  <dc:identifier xsi:type="tel:ISBN">978-3-442-31315-0 kart. : EUR 14.99 (DE)</dc:identifier>
  <dc:identifier xsi:type="tel:ISBN">3-442-31315-5</dc:identifier>
  <dc:identifier xsi:type="dnb:IDN">1025358783</dc:identifier>
  <dc:subject>820 Englische Literatur</dc:subject>
  <dc:subject>B Belletristik</dc:subject>
  <dc:format>382 S.</dc:format>`);

const EMPTY = `<?xml version="1.0" encoding="UTF-8"?>
<searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/"><version>1.1</version><numberOfRecords>0</numberOfRecords><records/></searchRetrieveResponse>`;

describe('buildDnbUrl', () => {
  it('fragt über den Nummernindex ab', () => {
    const url = buildDnbUrl('9783791504650');
    expect(url).toContain('NUM%3D9783791504650');
    expect(url).toContain('recordSchema=oai_dc');
  });
});

describe('parseDnbResponse', () => {
  it('liest einen Datensatz vollständig aus', () => {
    expect(parseDnbResponse(TINTENHERZ, '9783791504650')).toMatchObject({
      title: 'Tintenherz',
      subtitle: null,
      authors: ['Cornelia Funke'],
      publisher: 'Dressler',
      publishedYear: 2003,
      pageCount: 573,
      language: 'de',
      isbn13: '9783791504650',
      source: 'dnb',
    });
  });

  it('trennt Titel und Untertitel und wirft die Verantwortlichkeitsangabe weg', () => {
    const result = parseDnbResponse(PSYCHOTHRILLER, '9783442313150');
    expect(result?.title).toBe('Ich beschütze dich');
    expect(result?.subtitle).toBe('Psychothriller');
  });

  it('nimmt nur Verfasser als Autoren, keine Übersetzer und Gestalter', () => {
    expect(parseDnbResponse(PSYCHOTHRILLER, '9783442313150')?.authors).toEqual(['Penny Hancock']);
    expect(parseDnbResponse(TINTENHERZ, '9783791504650')?.authors).toEqual(['Cornelia Funke']);
  });

  it('gibt den Untertitel als Kategorie mit, weil dort die Gattung steht', () => {
    // "Psychothriller" ist die brauchbarste Genre-Angabe im ganzen Datensatz.
    expect(parseDnbResponse(PSYCHOTHRILLER, '9783442313150')?.categories).toContain(
      'Psychothriller',
    );
  });

  it('schneidet die Schlüssel von den Sachgruppen ab', () => {
    expect(parseDnbResponse(PSYCHOTHRILLER, '9783442313150')?.categories).toEqual(
      expect.arrayContaining(['Englische Literatur', 'Belletristik']),
    );
    expect(parseDnbResponse(TINTENHERZ, '9783791504650')?.categories).toContain(
      'Kinder- und Jugendliteratur',
    );
  });

  it('findet die ISBN-10 zwischen den Preisangaben', () => {
    expect(parseDnbResponse(PSYCHOTHRILLER, '9783442313150')?.isbn10).toBe('3442313155');
  });

  it('liefert kein Cover — die DNB gibt keine Bilder heraus', () => {
    expect(parseDnbResponse(TINTENHERZ, '9783791504650')?.coverUrl).toBeNull();
  });

  it('gibt bei null Treffern null zurück', () => {
    expect(parseDnbResponse(EMPTY, '9999999999999')).toBeNull();
  });

  it('verschluckt sich nicht an kaputtem XML', () => {
    expect(parseDnbResponse('<kein', '9783791504650')).toBeNull();
    expect(parseDnbResponse('', '9783791504650')).toBeNull();
  });

  it('kommt mit einem Datensatz ohne Zusatzangaben klar', () => {
    const minimal = envelope('  <dc:title>Nur ein Titel</dc:title>');
    expect(parseDnbResponse(minimal, '9783791504650')).toMatchObject({
      title: 'Nur ein Titel',
      subtitle: null,
      authors: [],
      publisher: null,
      publishedYear: null,
      pageCount: null,
    });
  });
});
