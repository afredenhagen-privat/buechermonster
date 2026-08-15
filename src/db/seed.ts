import { db } from './database';
import type { Genre, Owner } from '@/types';

export const DEFAULT_GENRES: readonly Omit<Genre, 'id'>[] = [
  { name: 'Roman & Belletristik', color: '#8d6e63', isDefault: true },
  { name: 'Krimi & Thriller', color: '#37474f', isDefault: true },
  { name: 'Fantasy', color: '#6a4c93', isDefault: true },
  { name: 'Science-Fiction', color: '#00695c', isDefault: true },
  { name: 'Historisches', color: '#795548', isDefault: true },
  { name: 'Horror', color: '#4a148c', isDefault: true },
  { name: 'Liebesroman', color: '#ad1457', isDefault: true },
  { name: 'Klassiker', color: '#5d4037', isDefault: true },
  { name: 'Kinder- & Jugendbuch', color: '#ef6c00', isDefault: true },
  { name: 'Comic & Graphic Novel', color: '#f9a825', isDefault: true },
  { name: 'Sachbuch', color: '#1565c0', isDefault: true },
  { name: 'Biografie', color: '#0277bd', isDefault: true },
  { name: 'Ratgeber', color: '#558b2f', isDefault: true },
  { name: 'Kochbuch', color: '#c62828', isDefault: true },
  { name: 'Reise', color: '#00838f', isDefault: true },
] as const;

/**
 * "Mir" ist aus Sicht der Benutzerin geschrieben, "Adi" ist der zweite Regal-
 * bewohner. Beide Namen sind in den Einstellungen umbenennbar, weitere lassen
 * sich ergänzen.
 */
export const DEFAULT_OWNERS: readonly Omit<Owner, 'id'>[] = [
  { name: 'Mir', isDefault: true },
  { name: 'Adi', isDefault: false },
] as const;

/**
 * Läuft bei jedem Start und tut nur etwas, wenn die jeweilige Tabelle leer ist.
 * Gibt zurück, wie viele Zeilen tatsächlich angelegt wurden.
 */
export async function seedDefaults(): Promise<{ genres: number; owners: number }> {
  const result = { genres: 0, owners: 0 };

  if ((await db.genres.count()) === 0) {
    await db.genres.bulkAdd(DEFAULT_GENRES.map((g) => ({ ...g })));
    result.genres = DEFAULT_GENRES.length;
  }

  if ((await db.owners.count()) === 0) {
    await db.owners.bulkAdd(DEFAULT_OWNERS.map((o) => ({ ...o })));
    result.owners = DEFAULT_OWNERS.length;
  }

  return result;
}
