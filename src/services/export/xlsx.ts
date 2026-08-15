import { buildExportFilename, type ExportRow } from './rows';

/**
 * Spaltenaufbau der Tabelle. Reihenfolge ist die Anzeigereihenfolge.
 * Die Breiten sind grob an den erwarteten Inhalten ausgerichtet, damit
 * niemand in Excel erst 15 Spalten breitziehen muss.
 */
const COLUMNS: { header: string; width: number; value: (row: ExportRow) => string }[] = [
  { header: 'Titel', width: 38, value: (r) => r.title },
  { header: 'Untertitel', width: 26, value: (r) => r.subtitle },
  { header: 'Autor', width: 24, value: (r) => r.authors },
  { header: 'Reihe', width: 20, value: (r) => r.series },
  { header: 'Band', width: 7, value: (r) => r.volume },
  { header: 'Genre', width: 24, value: (r) => r.genres },
  { header: 'Status', width: 13, value: (r) => r.status },
  { header: 'Bewertung', width: 11, value: (r) => r.rating },
  { header: 'Gehört', width: 12, value: (r) => r.owner },
  { header: 'ISBN', width: 16, value: (r) => r.isbn },
  { header: 'Verlag', width: 22, value: (r) => r.publisher },
  { header: 'Jahr', width: 7, value: (r) => r.year },
  { header: 'Seiten', width: 8, value: (r) => r.pages },
  { header: 'Ausleihe', width: 32, value: (r) => r.loan },
  { header: 'Notizen', width: 50, value: (r) => r.notes },
];

/** Wie beim PDF: erst beim ersten Export laden, danach liegt es im Cache. */
export async function exportXlsx(rows: ExportRow[]): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/browser');

  await writeExcelFile(rows, {
    columns: COLUMNS.map((column) => ({
      header: { value: column.header, fontWeight: 'bold' as const },
      width: column.width,
      cell: (row: ExportRow) => column.value(row),
    })),
    sheet: 'Bücherregal',
  }).toFile(buildExportFilename('xlsx'));
}
