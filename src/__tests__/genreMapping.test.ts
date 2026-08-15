import { describe, expect, it } from 'vitest';
import { mapCategories } from '@/services/genreMapping';
import { DEFAULT_GENRES } from '@/db/seed';

const SEEDED = new Set(DEFAULT_GENRES.map((g) => g.name));

describe('mapCategories', () => {
  it('zerlegt zusammengesetzte Kategorien und trifft beide Teile', () => {
    expect(mapCategories(['Juvenile Fiction / Fantasy & Magic'])).toEqual({
      matched: ['Kinder- & Jugendbuch', 'Fantasy'],
      unmatched: [],
    });
  });

  it('ordnet nur Namen zu, die es als Genre wirklich gibt', () => {
    const result = mapCategories([
      'Fiction / Science Fiction',
      'Cooking',
      'Biography & Autobiography',
    ]);
    for (const name of result.matched) {
      expect(SEEDED.has(name)).toBe(true);
    }
  });

  it('nimmt "Fiction" nur, wenn nichts Genaueres passt', () => {
    expect(mapCategories(['Fiction / Fantasy']).matched).toEqual(['Fantasy']);
    expect(mapCategories(['Fiction']).matched).toEqual(['Roman & Belletristik']);
  });

  it('gibt Unbekanntes als Vorschlag zurück, statt es wegzuwerfen', () => {
    const result = mapCategories(['Cooking / Regional & Ethnic']);
    expect(result.matched).toEqual(['Kochbuch']);
    expect(result.unmatched).toEqual(['Regional & Ethnic']);
  });

  it('meldet gar keinen Treffer, wenn nichts passt', () => {
    expect(mapCategories(['Korbflechten in Oberbayern'])).toEqual({
      matched: [],
      unmatched: ['Korbflechten in Oberbayern'],
    });
  });

  it('kommt mit leerer Eingabe klar', () => {
    expect(mapCategories([])).toEqual({ matched: [], unmatched: [] });
    expect(mapCategories(['  ', ''])).toEqual({ matched: [], unmatched: [] });
  });

  it('führt dieselbe Zuordnung nur einmal auf', () => {
    expect(mapCategories(['Fantasy', 'Fantasy / Epic']).matched).toEqual(['Fantasy']);
  });

  it('versteht auch deutsche Kategorien', () => {
    expect(mapCategories(['Krimi']).matched).toEqual(['Krimi & Thriller']);
    expect(mapCategories(['Jugendbuch']).matched).toEqual(['Kinder- & Jugendbuch']);
  });
});
