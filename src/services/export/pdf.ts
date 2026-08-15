import { buildExportFilename, type ExportRow } from './rows';

/**
 * jsPDF und autotable sind zusammen rund 400 KB und werden deshalb erst beim
 * ersten Export geladen. Der Service Worker legt den Brocken danach ab, damit
 * es beim zweiten Mal auch offline geht.
 */
export async function exportPdf(rows: ExportRow[], subtitle: string): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Bücherregal', 40, 46);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(subtitle, 40, 62);

  autoTable(doc, {
    startY: 78,
    head: [['Titel', 'Autor', 'Reihe', 'Genre', 'Status', 'Bew.']],
    body: rows.map((r) => [
      r.title,
      r.authors,
      r.volume ? `${r.series} ${r.volume}` : r.series,
      r.genres,
      r.status,
      // Nicht r.rating: die Sterne fallen in den WinAnsi-Standardschriften weg.
      r.ratingValue ? `${r.ratingValue}/5` : '',
    ]),
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [180, 85, 45], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 247, 242] },
    columnStyles: {
      0: { cellWidth: 150 },
      1: { cellWidth: 95 },
      2: { cellWidth: 80 },
      3: { cellWidth: 85 },
      4: { cellWidth: 55 },
      5: { cellWidth: 45 },
    },
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

  doc.save(buildExportFilename('pdf'));
}
