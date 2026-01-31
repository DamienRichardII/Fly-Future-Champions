const PDFDocument = require('pdfkit');
const { getSupabaseServiceClient } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabaseServiceClient();
    const { date } = req.query;

    if (!date) {
      res.status(400).json({ error: 'Missing date query param (YYYY-MM-DD)' });
      return;
    }

    const { data, error } = await supabase
      .from('detection_registrations')
      .select('*')
      .eq('detection_date', date)
      .order('created_at', { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="inscriptions_${date}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    doc.pipe(res);

    const pageBottom = () => doc.page.height - doc.page.margins.bottom;
    const tableWidth = 523; // ~ A4 width minus margins
    const startX = doc.page.margins.left;

    doc.fontSize(18).text('Fly Future Champions', { align: 'left' });
    doc.moveDown(0.2);
    doc.fontSize(12).text(`Liste des inscrits — Détection du ${date}`, { align: 'left' });
    doc.moveDown(1);

    doc.fontSize(9);

    const headers = ['Nom', 'Prénom', 'Année', 'Genre', 'Email', 'Téléphone', 'Ville', 'Poste', 'Niveau'];
    const colWidths = [70, 60, 38, 38, 140, 70, 60, 55, 55]; // total ~ 586 -> trop large
    // Ajustement A4 (523): on réduit un peu
    const cw = [62, 54, 34, 34, 118, 62, 54, 50, 55]; // total = 523

    let y = doc.y;

    function drawHeader() {
      doc.font('Helvetica-Bold');
      let x = startX;

      const h = 18;
      // fond léger
      doc.save();
      doc.rect(startX, y, tableWidth, h).fillOpacity(0.06).fill('#000');
      doc.restore();

      for (let i = 0; i < headers.length; i++) {
        doc.fillColor('#000').fillOpacity(0); // reset safe
        doc.fillColor('black'); // pdfkit ok
        doc.text(headers[i], x + 4, y + 4, { width: cw[i] - 8 });
        x += cw[i];
      }
      y += h;
      doc.moveTo(startX, y).lineTo(startX + tableWidth, y).strokeColor('#dddddd').lineWidth(1).stroke();
    }

    function rowHeight(cells) {
      doc.font('Helvetica');
      let maxH = 0;
      for (let i = 0; i < cells.length; i++) {
        const txt = String(cells[i] ?? '');
        const h = doc.heightOfString(txt, { width: cw[i] - 8 });
        if (h > maxH) maxH = h;
      }
      return Math.max(16, maxH + 8); // padding
    }

    function ensureSpace(hNeeded) {
      if (y + hNeeded > pageBottom() - 10) {
        doc.addPage();
        y = doc.y;
        drawHeader();
      }
    }

    function drawRow(cells, zebra = false) {
      const h = rowHeight(cells);
      ensureSpace(h);

      // zebra background
      if (zebra) {
        doc.save();
        doc.rect(startX, y, tableWidth, h).fillOpacity(0.03).fill('#000');
        doc.restore();
      }

      doc.font('Helvetica');
      let x = startX;

      for (let i = 0; i < cells.length; i++) {
        const txt = String(cells[i] ?? '');
        doc.fillColor('black');
        doc.text(txt, x + 4, y + 4, { width: cw[i] - 8 });
        x += cw[i];
      }

      y += h;
      doc.moveTo(startX, y).lineTo(startX + tableWidth, y).strokeColor('#eeeeee').lineWidth(1).stroke();
    }

    drawHeader();

    (data || []).forEach((r, idx) => {
      drawRow([
        (r.last_name || '').toUpperCase(),
        r.first_name || '',
        r.birth_year || '',
        r.gender || '',
        r.email || '',
        r.phone || '',
        r.city || '',
        r.position || '',
        r.level || '',
      ], idx % 2 === 1);
    });

    ensureSpace(40);
    y += 10;
    doc.font('Helvetica-Bold').fontSize(11).text(`Total inscrits : ${(data || []).length}`, startX, y);

    doc.end();
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
};
