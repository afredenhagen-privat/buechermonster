import { buildExportFilename, type ExportRow } from './rows';

export type ExportVariant = 'shelf' | 'wish';

/**
 * Die Wunschliste liest jemand anderes, und zwar mit der Frage „was soll ich
 * kaufen". Deshalb andere Spalten: die ISBN muss drauf, sonst kauft jemand
 * die falsche Ausgabe. Lesestatus und Bewertung stehen bei einem Buch, das
 * man nicht hat, ohnehin auf Anfangswerten.
 */
const LAYOUTS: Record<
  ExportVariant,
  { heading: string; file: string; head: string[]; cell: (r: ExportRow) => string[]; widths: number[] }
> = {
  shelf: {
    heading: 'Bücherregal',
    file: 'buecherregal',
    head: ['Titel', 'Autor', 'Reihe', 'Genre', 'Status', 'Bew.'],
    // Nicht r.rating: die Sterne fallen in den WinAnsi-Standardschriften weg.
    cell: (r) => [
      r.title,
      r.authors,
      r.volume ? `${r.series} ${r.volume}` : r.series,
      r.genres,
      r.status,
      r.ratingValue ? `${r.ratingValue}/5` : '',
    ],
    widths: [150, 95, 80, 85, 55, 45],
  },
  wish: {
    heading: 'Wunschliste',
    file: 'wunschliste',
    head: ['Titel', 'Autor', 'Reihe', 'Genre', 'Jahr', 'ISBN'],
    cell: (r) => [
      r.title,
      r.authors,
      r.volume ? `${r.series} ${r.volume}` : r.series,
      r.genres,
      r.year,
      r.isbn,
    ],
    widths: [135, 90, 70, 70, 35, 110],
  },
};

/**
 * jsPDF und autotable sind zusammen rund 400 KB und werden deshalb erst beim
 * ersten Export geladen. Der Service Worker legt den Brocken danach ab, damit
 * es beim zweiten Mal auch offline geht.
 */
export async function exportPdf(
  rows: ExportRow[],
  subtitle: string,
  variant: ExportVariant = 'shelf',
): Promise<void> {
  const layout = LAYOUTS[variant];
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(layout.heading, 40, 46);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(subtitle, 40, 62);

  autoTable(doc, {
    startY: 78,
    head: [layout.head],
    body: rows.map(layout.cell),
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [180, 85, 45], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 247, 242] },
    columnStyles: Object.fromEntries(layout.widths.map((cellWidth, i) => [i, { cellWidth }])),
    didDrawPage: (data) => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Seite ${page}`,
        data.settings.margin.left,
        doc.internal.pageSize.getHeight() - 20,
      );
    },
  });

  doc.save(buildExportFilename('pdf', layout.file));
}
