import { clearAllData, db } from './database';

/**
 * Reihenfolge egal, aber die Liste muss vollständig sein: ein fehlender Store
 * würde beim Export still weggelassen und beim Import unbemerkt leer bleiben.
 */
const STORES = [
  'books',
  'genres',
  'book_genres',
  'series',
  'owners',
  'loans',
  'settings',
] as const;

type StoreName = (typeof STORES)[number];

export const BACKUP_VERSION = 2;

/**
 * Ältere Stände werden angenommen und beim Import ergänzt, nicht abgelehnt.
 * Ein Backup ist die letzte Rettung — es darf nicht daran scheitern, dass die
 * App seither ein Feld dazubekommen hat.
 */
const SUPPORTED_VERSIONS = [1, 2];

export interface BackupPayload {
  app: 'buechermonster';
  version: number;
  exportedAt: string;
  data: Record<StoreName, unknown[]>;
}

export async function exportBackup(): Promise<BackupPayload> {
  const data = {} as Record<StoreName, unknown[]>;

  await db.transaction('r', db.tables, async () => {
    for (const name of STORES) {
      data[name] = await db.table(name).toArray();
    }
  });

  return {
    app: 'buechermonster',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

/**
 * Ersetzt den kompletten Bestand. Wird bewusst erst validiert und dann
 * gelöscht — sonst steht bei einer kaputten Datei am Ende ein leeres Regal.
 */
export async function importBackup(payload: unknown): Promise<void> {
  const p = payload as Partial<BackupPayload> | null;

  if (!p || typeof p !== 'object') {
    throw new Error('Das ist keine gültige Backup-Datei.');
  }
  if (typeof p.version !== 'number' || !SUPPORTED_VERSIONS.includes(p.version)) {
    throw new Error(
      `Backup-Version ${String(p.version)} wird nicht unterstützt, erwartet wird ${SUPPORTED_VERSIONS.join(' oder ')}.`,
    );
  }
  for (const name of STORES) {
    if (!Array.isArray(p.data?.[name])) {
      throw new Error(`In der Backup-Datei fehlt der Bereich "${name}".`);
    }
  }

  const data = migrate(p.data as Record<StoreName, unknown[]>, p.version);

  await clearAllData();
  await db.transaction('rw', db.tables, async () => {
    for (const name of STORES) {
      const rows = data[name];
      if (rows.length > 0) await db.table(name).bulkAdd(rows);
    }
  });
}

/**
 * Hebt einen älteren Datenbestand auf den aktuellen Stand.
 *
 * Version 1 kannte die Wunschliste noch nicht. Ohne `place` wäre jedes Buch
 * aus so einer Datei nach dem Import weder im Regal noch auf der Wunschliste
 * und damit spurlos verschwunden — obwohl es in der Datenbank steht.
 */
function migrate(
  data: Record<StoreName, unknown[]>,
  version: number,
): Record<StoreName, unknown[]> {
  if (version >= 2) return data;

  return {
    ...data,
    books: data.books.map((row) => {
      const book = row as Record<string, unknown>;
      return {
        ...book,
        place: book.place ?? 'shelf',
        shelvedAt: book.shelvedAt ?? book.addedAt ?? null,
      };
    }),
  };
}

export function buildBackupFilename(now = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `buechermonster-backup-${yyyy}-${mm}-${dd}.json`;
}

export function downloadBackup(payload: BackupPayload, filename = buildBackupFilename()): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function readBackupFile(file: File): Promise<unknown> {
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Die Datei lässt sich nicht als JSON lesen.');
  }
}
