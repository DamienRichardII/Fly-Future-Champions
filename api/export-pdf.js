// api/export-pdf.js
const PDFDocument = require("pdfkit");
const { getSupabaseServiceClient } = require("./_supabase");

function pad2(n) { return String(n).padStart(2, "0"); }

function formatDateTimeFR(isoLike) {
  if (!isoLike) return "";
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function safe(v) {
  return (v === null || v === undefined) ? "" : String(v);
}

function parseNotes(notesRaw){
  const raw = safe(notesRaw);
  const out = { club:'', objectif:'', message:'', naissance:'' };
  if(!raw) return out;

  const parts = raw.includes('\n') ? raw.split('\n') : raw.split('—').map(s=>String(s||'').trim());
  for (const p of parts){
    const line = String(p||'').trim();
    if(!line) continue;
    const m = line.match(/^([^:]+)\s*:\s*(.*)$/);
    if(!m) continue;
    const k = m[1].trim().toLowerCase();
    const v = m[2].trim();
    if(k.startsWith('club')) out.club = v;
    else if(k.startsWith('objectif') || k.startsWith('goal')) out.objectif = v;
    else if(k.startsWith('message') || k.startsWith('notes')) out.message = v;
    else if(k.startsWith('naissance') || k.startsWith('birth')) out.naissance = v;
  }
  return out;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const date = String(req.query?.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Paramètre date invalide (YYYY-MM-DD)" });
    }

    const supabase = getSupabaseServiceClient();

    // ✅ on récupère tout ce qui est utile pour la “fiche joueur”
    const { data, error } = await supabase
      .from("detection_registrations")
      .select("created_at,detection_date,last_name,first_name,birth_year,gender,email,phone,city,level,position,height_cm,notes")
      .eq("detection_date", date)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("export-pdf supabase error:", error);
      return res.status(500).json({ error: error.message || "Supabase error" });
    }

    const rows = data || [];

    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      info: {
        Title: `Inscriptions ${date} — Fly Future Champions`,
        Author: "Fly Future Champions",
      },
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => {
      const pdf = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="inscriptions_${date}.pdf"`);
      res.status(200).send(pdf);
    });

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const left = doc.page.margins.left;
    const right = doc.page.margins.right;
    const top = doc.page.margins.top;
    const bottom = doc.page.margins.bottom;
    const usableW = pageW - left - right;
    const bottomLimit = pageH - bottom;

    function drawHeader(subtitle){
      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor("#0B2F55")
        .text("Fly Future Champions", left, top);

      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#111827")
        .text(subtitle || `Inscriptions — Détection du ${date}`, left, top + 26);

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#374151")
        .text(`Total : ${rows.length}`, left, top + 44);

      doc
        .moveTo(left, top + 62)
        .lineTo(pageW - right, top + 62)
        .lineWidth(1)
        .strokeColor("#E5E7EB")
        .stroke();
    }

    function ensureSpace(h){
      if (doc.y + h > bottomLimit) {
        doc.addPage();
        drawHeader(`Inscriptions — Détection du ${date}`);
        doc.moveDown(0.6);
      }
    }

    // ---------- Cas vide ----------
    drawHeader(`Inscriptions — Détection du ${date}`);
    doc.moveDown(1.2);

    if (rows.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(12)
        .fillColor("#374151")
        .text("Aucune inscription pour cette date.", left, doc.y + 10);
      doc.end();
      return;
    }

    // ---------- 1) Tableau rapide (résumé) ----------
    const rowH = 20;
    const cols = [
      { key: "created_at", label: "Créé", w: 85 },
      { key: "name", label: "Nom / Prénom", w: 150 },
      { key: "email", label: "Email", w: 170 },
      { key: "phone", label: "Tél.", w: 80 },
      { key: "city", label: "Ville", w: usableW - (85+150+170+80) },
    ];

    function drawTableHeader(y){
      doc.save().rect(left, y, usableW, rowH).fill("#F3F4F6").restore();
      let x = left;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827");
      for (const c of cols) {
        doc.text(c.label, x + 6, y + 6, { width: c.w - 10, ellipsis: true });
        x += c.w;
      }
      doc.moveTo(left, y + rowH).lineTo(pageW - right, y + rowH).lineWidth(1).strokeColor("#E5E7EB").stroke();
    }

    function drawTableRow(r, y, idx){
      doc.save().rect(left, y, usableW, rowH).fill(idx % 2 === 0 ? "#FFFFFF" : "#FAFAFA").restore();
      const mapped = {
        created_at: formatDateTimeFR(r.created_at),
        name: `${safe(r.last_name).toUpperCase()} ${safe(r.first_name)}`.trim(),
        email: safe(r.email),
        phone: safe(r.phone),
        city: safe(r.city),
      };
      let x = left;
      doc.font("Helvetica").fontSize(9).fillColor("#111827");
      for (const c of cols){
        doc.text(mapped[c.key] || "", x + 6, y + 6, { width: c.w - 10, ellipsis: true });
        x += c.w;
      }
      doc.moveTo(left, y + rowH).lineTo(pageW - right, y + rowH).lineWidth(1).strokeColor("#F1F5F9").stroke();
    }

    let y = doc.y;
    drawTableHeader(y);
    y += rowH;

    for (let i=0;i<rows.length;i++){
      if (y + rowH > bottomLimit){
        doc.addPage();
        drawHeader(`Inscriptions — Détection du ${date}`);
        doc.moveDown(1.2);
        y = doc.y;
        drawTableHeader(y);
        y += rowH;
      }
      drawTableRow(rows[i], y, i);
      y += rowH;
    }

    // ---------- 2) Fiches complètes ----------
    doc.addPage();
    drawHeader(`Fiches complètes — Détection du ${date}`);
    doc.moveDown(1.2);

    const labelW = 120;
    const valueW = usableW - labelW;

    function lineKV(label, value){
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#0B2F55").text(label, left, doc.y, { width: labelW });
      doc.font("Helvetica").fontSize(10).fillColor("#111827").text(value || "—", left + labelW, doc.y, { width: valueW });
      doc.moveDown(0.25);
    }

    function card(r, idx){
      const parsed = parseNotes(r.notes);
      const fullName = `${safe(r.first_name)} ${safe(r.last_name)}`.trim() || `Joueur #${idx+1}`;

      const message = parsed.message || safe(r.notes);
      const club = parsed.club || "";
      const objectif = parsed.objectif || "";
      const naissance = parsed.naissance || "";

      const blockText = [
        `Message: ${message || "—"}`,
      ].join("\n");

      // hauteur estimée (wrap)
      doc.font("Helvetica").fontSize(10);
      const msgH = doc.heightOfString(blockText, { width: usableW - 20 });
      const estimated = 18 + 10 + (10*10) + msgH + 42;

      ensureSpace(estimated);

      // cadre
      const startY = doc.y;
      doc.save()
        .rect(left, startY, usableW, estimated - 10)
        .fill("#FFFFFF")
        .restore();
      doc.save()
        .rect(left, startY, usableW, estimated - 10)
        .lineWidth(1)
        .strokeColor("#E5E7EB")
        .stroke()
        .restore();

      doc.y = startY + 10;

      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0B2F55").text(`${idx+1}. ${fullName}`, left + 10, doc.y, { width: usableW - 20 });
      doc.moveDown(0.5);

      doc.x = left + 10;

      lineKV("Détection", safe(r.detection_date));
      lineKV("Créé le", formatDateTimeFR(r.created_at));
      lineKV("Email", safe(r.email));
      lineKV("Téléphone", safe(r.phone));
      lineKV("Ville", safe(r.city));
      lineKV("Niveau", safe(r.level));

      lineKV("Naissance (année)", safe(r.birth_year));
      lineKV("Naissance (date)", naissance);

      lineKV("Sexe", safe(r.gender));
      lineKV("Poste", safe(r.position));
      lineKV("Taille (cm)", safe(r.height_cm));

      lineKV("Club", club);
      lineKV("Objectif", objectif);

      doc.moveDown(0.2);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#0B2F55").text("Message", left + 10, doc.y);
      doc.moveDown(0.25);
      doc.font("Helvetica").fontSize(10).fillColor("#111827").text(message || "—", left + 10, doc.y, { width: usableW - 20 });

      doc.y = startY + (estimated - 10) + 14;
    }

    rows.forEach((r, i)=> card(r, i));

    doc.end();
  } catch (err) {
    console.error("export-pdf error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
};

