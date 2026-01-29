const PDFDocument = require('pdfkit');
const { getSupabaseServiceClient } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabaseServiceClient();
    const { date } = req.query; // YYYY-MM-DD

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

    doc.fontSize(18).text('Fly Future Champions', { align: 'left' });
    doc.moveDown(0.2);
    doc.fontSize(12).text(`Liste des inscrits — Détection du ${date}`, { align: 'left' });
    doc.moveDown(1);

    doc.fontSize(10);
    const headers = ['Nom', 'Prénom', 'Année', 'Genre', 'Email', 'Téléphone', 'Ville', 'Poste', 'Niveau'];
    const colWidths = [70, 65, 38, 35, 120, 70, 60, 45, 45];
    const startX = doc.x;
    let y = doc.y;

    function drawRow(cells, isHeader=false){
      let x = startX;
      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica');
      for (let i=0;i<cells.length;i++){
        doc.text(String(cells[i] ?? ''), x, y, { width: colWidths[i], ellipsis: true });
        x += colWidths[i];
      }
      y += isHeader ? 16 : 14;
      doc.moveTo(startX, y-2).lineTo(startX + colWidths.reduce((a,b)=>a+b,0), y-2).strokeColor('#dddddd').lineWidth(1).stroke();
      if (y > doc.page.height - 60){
        doc.addPage();
        y = doc.y;
      }
    }

    drawRow(headers, true);

    (data || []).forEach(r => {
      drawRow([
        r.last_name,
        r.first_name,
        r.birth_year || '',
        r.gender || '',
        r.email || '',
        r.phone || '',
        r.city || '',
        r.position || '',
        r.level || ''
      ], false);
    });

    doc.moveDown(1);
    doc.font('Helvetica-Bold').text(`Total inscrits : ${(data||[]).length}`);

    doc.end();
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
};