import { describe, expect, it } from 'vitest';
import { parseSeries } from '@/services/seriesParser';

describe('parseSeries', () => {
  it('erkennt eine nackte Zahl am Titelende', () => {
    expect(parseSeries('Die Tribute von Panem 2')).toEqual({
      seriesName: 'Die Tribute von Panem',
      seriesIndex: 2,
      cleanTitle: 'Die Tribute von Panem',
    });
  });

  it('erkennt ein ausgeschriebenes Bandwort', () => {
    expect(parseSeries('Der dunkle Turm, Band 3')).toMatchObject({
      seriesName: 'Der dunkle Turm',
      seriesIndex: 3,
    });
    expect(parseSeries('Die Säulen der Erde - Teil 2')).toMatchObject({
      seriesName: 'Die Säulen der Erde',
      seriesIndex: 2,
    });
  });

  it('erkennt die Klammerform und behält den eigentlichen Titel', () => {
    expect(parseSeries('Der Auftrag des Drachen (Eragon, Bd. 1)')).toEqual({
      seriesName: 'Eragon',
      seriesIndex: 1,
      cleanTitle: 'Der Auftrag des Drachen',
    });
  });

  it('erkennt die Raute-Schreibweise', () => {
    expect(parseSeries('Discworld #5')).toMatchObject({
      seriesName: 'Discworld',
      seriesIndex: 5,
    });
  });

  it('nimmt die Bandangabe aus dem Untertitel', () => {
    expect(parseSeries('Der dunkle Turm', 'Band 3')).toMatchObject({
      seriesName: 'Der dunkle Turm',
      seriesIndex: 3,
    });
  });

  it('hält sich bei Titeln zurück, die nur zufällig eine Zahl enthalten', () => {
    expect(parseSeries('Fahrenheit 451')).toBeNull();
    expect(parseSeries('1984')).toBeNull();
    expect(parseSeries('Kim Jiyoung, geboren 1982')).toBeNull();
    expect(parseSeries('22 Bahnen')).toBeNull();
  });

  it('erkennt in gewöhnlichen Titeln keine Reihe', () => {
    expect(parseSeries('Das Café am Rande der Welt')).toBeNull();
    expect(parseSeries('Harry Potter und der Stein der Weisen')).toBeNull();
    expect(parseSeries('')).toBeNull();
  });

  it('verwirft Band 0 und Unsinn', () => {
    expect(parseSeries('Irgendwas Band 0')).toBeNull();
  });
});
