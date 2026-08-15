import { describe, expect, it } from 'vitest';
import { authorSortKey, compareGerman, titleSortKey } from '@/services/sortKeys';

describe('titleSortKey', () => {
  it('schneidet den führenden Artikel ab', () => {
    expect(titleSortKey('Der Herr der Ringe')).toBe('herr der ringe');
    expect(titleSortKey('Das Lied der Krähen')).toBe('lied der krähen');
    expect(titleSortKey('Die Tribute von Panem')).toBe('tribute von panem');
    expect(titleSortKey('Eine kurze Geschichte der Menschheit')).toBe(
      'kurze geschichte der menschheit',
    );
    expect(titleSortKey('The Handmaid’s Tale')).toBe('handmaid’s tale');
  });

  it('lässt Wörter in Ruhe, die nur mit einem Artikel anfangen', () => {
    expect(titleSortKey('Derrick und die Dinge')).toBe('derrick und die dinge');
    expect(titleSortKey('Einsamkeit')).toBe('einsamkeit');
  });

  it('kommt mit Rand-Leerzeichen klar', () => {
    expect(titleSortKey('  Der  Schwarm ')).toBe('schwarm');
  });
});

describe('authorSortKey', () => {
  it('dreht Vor- und Nachname um', () => {
    expect(authorSortKey('Cornelia Funke')).toBe('funke, cornelia');
    expect(authorSortKey('J. R. R. Tolkien')).toBe('tolkien, j. r. r.');
  });

  it('behält Namenszusätze beim Nachnamen', () => {
    expect(authorSortKey('Ferdinand von Schirach')).toBe('von schirach, ferdinand');
    expect(authorSortKey('Cees de Boer')).toBe('de boer, cees');
  });

  it('lässt einteilige Namen stehen', () => {
    expect(authorSortKey('Homer')).toBe('homer');
  });

  it('gibt bei fehlendem Autor einen leeren Schlüssel zurück', () => {
    expect(authorSortKey('')).toBe('');
    expect(authorSortKey(null)).toBe('');
    expect(authorSortKey(undefined)).toBe('');
  });
});

describe('compareGerman', () => {
  it('sortiert Umlaute wie im Wörterbuch, nicht hinter z', () => {
    const sorted = ['Zebra', 'Äpfel', 'Apfel', 'Öl'].sort(compareGerman);
    expect(sorted).toEqual(['Apfel', 'Äpfel', 'Öl', 'Zebra']);
  });

  it('sortiert Zahlen in Titeln der Größe nach', () => {
    const sorted = ['Band 10', 'Band 2'].sort(compareGerman);
    expect(sorted).toEqual(['Band 2', 'Band 10']);
  });
});
