import { describe, expect, it } from 'vitest';
import {
  isBookBarcode,
  isValidIsbn,
  isValidIsbn10,
  isValidIsbn13,
  normalizeIsbn,
  splitIsbn,
  toIsbn13,
} from '@/services/isbn';

describe('normalizeIsbn', () => {
  it('wirft Bindestriche und Leerzeichen weg', () => {
    expect(normalizeIsbn('978-3-7915-0465-0')).toBe('9783791504650');
    expect(normalizeIsbn(' 0 306 40615 2 ')).toBe('0306406152');
  });

  it('macht aus dem kleinen x der ISBN-10 ein großes', () => {
    expect(normalizeIsbn('80-85892-15-x')).toBe('808589215X');
  });
});

describe('isValidIsbn13', () => {
  it('erkennt eine gültige ISBN-13', () => {
    expect(isValidIsbn13('9783791504650')).toBe(true);
    expect(isValidIsbn13('978-3-7915-0465-0')).toBe(true);
  });

  it('erkennt einen Zahlendreher an der Prüfziffer', () => {
    expect(isValidIsbn13('9783791504651')).toBe(false);
  });

  it('lehnt zu kurze und zu lange Eingaben ab', () => {
    expect(isValidIsbn13('978379150465')).toBe(false);
    expect(isValidIsbn13('97837915046500')).toBe(false);
    expect(isValidIsbn13('')).toBe(false);
  });
});

describe('isValidIsbn10', () => {
  it('erkennt eine gültige ISBN-10', () => {
    expect(isValidIsbn10('0306406152')).toBe(true);
  });

  it('akzeptiert X als Prüfziffer', () => {
    expect(isValidIsbn10('080442957X')).toBe(true);
  });

  it('lehnt eine falsche Prüfziffer ab', () => {
    expect(isValidIsbn10('0306406153')).toBe(false);
  });

  it('lehnt ein X mitten in der Nummer ab', () => {
    expect(isValidIsbn10('03X6406152')).toBe(false);
  });
});

describe('toIsbn13', () => {
  it('rechnet eine ISBN-10 korrekt um', () => {
    expect(toIsbn13('0306406152')).toBe('9780306406157');
  });

  it('lässt eine ISBN-13 unverändert', () => {
    expect(toIsbn13('9783791504650')).toBe('9783791504650');
  });

  it('gibt bei Unsinn null zurück', () => {
    expect(toIsbn13('12345')).toBeNull();
    expect(toIsbn13('0306406153')).toBeNull();
  });
});

describe('splitIsbn', () => {
  it('leitet aus einer ISBN-10 beide Formen ab', () => {
    expect(splitIsbn('0-306-40615-2')).toEqual({
      isbn13: '9780306406157',
      isbn10: '0306406152',
    });
  });

  it('lässt die ISBN-10 leer, wenn nur die 13-stellige bekannt ist', () => {
    expect(splitIsbn('9783791504650')).toEqual({ isbn13: '9783791504650', isbn10: null });
  });

  it('gibt bei ungültiger Eingabe zweimal null zurück', () => {
    expect(splitIsbn('keine isbn')).toEqual({ isbn13: null, isbn10: null });
  });
});

describe('isValidIsbn', () => {
  it('akzeptiert beide Längen', () => {
    expect(isValidIsbn('0306406152')).toBe(true);
    expect(isValidIsbn('9783791504650')).toBe(true);
    expect(isValidIsbn('42')).toBe(false);
  });
});

describe('isBookBarcode', () => {
  it('erkennt Buch-Barcodes aus dem 978/979-Bereich', () => {
    expect(isBookBarcode('9783791504650')).toBe(true);
    expect(isBookBarcode('9791234567896')).toBe(true);
    expect(isBookBarcode('0306406152')).toBe(true);
  });

  it('lehnt einen Produkt-Barcode ab, obwohl die Prüfziffer stimmt', () => {
    // EAN-13 und ISBN-13 rechnen die Prüfziffer identisch. Ohne die
    // Bereichsprüfung würde eine Shampooflasche als ISBN durchgehen.
    expect(isValidIsbn13('4009900484220')).toBe(true);
    expect(isBookBarcode('4009900484220')).toBe(false);
  });
});
