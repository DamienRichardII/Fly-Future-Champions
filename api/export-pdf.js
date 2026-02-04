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

    const { data, error } = await supabase
      .from("detection_registrations")
      .select("created_at,detection_date,last_name,first_name,birth_year,email,phone,city,level")
      .eq("detection_date", date)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("export-pdf supabase error:", error);
      return res.status(500).json({ error: error.message || "Supabase error" });
    }

    const rows = data || [];

    // ---- PDF stream -> buffer ----
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
      res.setHeader(
        "Content-Disposition",
        `inline; filename="inscriptions_${date}.pdf"`
      );
      res.status(200).send(pdf);
    });

    // ---- Layout constants ----
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const left = doc.page.margins.left;
    const right = doc.page.margins.right;
    const top = doc.page.margins.top;
    const bottom = doc.page.margins.bottom;

    const usableW = pageW - left - right;

    const headerH = 70;
    const tableTop = top + headerH;
    const rowH = 22;
    const tableBottomLimit = pageH - bottom;

    // Column widths (sum <= usableW)
    const cols = [
      { key: "created_at", label: "Créé", w: 85 },
      { key: "last_name",  label: "Nom",  w: 85 },
      { key: "first_name", label: "Prénom", w: 75 },
      { key: "birth_year", label: "Année", w: 45 },
      { key: "email",      label: "Email", w: 150 },
      { key: "phone",      label: "Tél.",  w: 80 },
      { key: "city",       label: "Ville", w: 80 },
      { key: "level",      label: "Niveau", w: usableW - (85+85+75+45+150+80+80) }, // reste
    ];

    function drawHeader() {
      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor("#0B2F55")
        .text("Fly Future Champions", left, top);

      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#111827")
        .text(`Liste des inscrits — Détection du ${date}`, left, top + 26);

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#374151")
        .text(`Total : ${rows.length}`, left, top + 44);

      // line
      doc
        .moveTo(left, top + 62)
        .lineTo(pageW - right, top + 62)
        .lineWidth(1)
        .strokeColor("#E5E7EB")
        .stroke();
    }

    function drawTableHeader(y) {
      // background header
      doc
        .save()
        .rect(left, y, usableW, rowH)
        .fill("#F3F4F6")
        .restore();

      // column titles
      let x = left;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827");
      for (const c of cols) {
        doc.text(c.label, x + 6, y + 6, { width: c.w - 10, ellipsis: true });
        x += c.w;
      }

      // bottom border
      doc
        .moveTo(left, y + rowH)
        .lineTo(pageW - right, y + rowH)
        .lineWidth(1)
        .strokeColor("#E5E7EB")
        .stroke();
    }

    function drawRow(r, y, idx) {
      // zebra background
      if (idx % 2 === 0) {
        doc.save().rect(left, y, usableW, rowH).fill("#FFFFFF").restore();
      } else {
        doc.save().rect(left, y, usableW, rowH).fill("#FAFAFA").restore();
      }

      const mapped = {
        created_at: formatDateTimeFR(r.created_at),
        last_name: safe(r.last_name).toUpperCase(),
        first_name: safe(r.first_name),
        birth_year: safe(r.birth_year),
        email: safe(r.email),
        phone: safe(r.phone),
        city: safe(r.city),
        level: safe(r.level),
      };

      let x = left;
      doc.font("Helvetica").fontSize(9).fillColor("#111827");

      for (const c of cols) {
        doc.text(mapped[c.key] || "", x + 6, y + 6, {
          width: c.w - 10,
          ellipsis: true,
        });
        x += c.w;
      }

      // row border
      doc
        .moveTo(left, y + rowH)
        .lineTo(pageW - right, y + rowH)
        .lineWidth(1)
        .strokeColor("#F1F5F9")
        .stroke();
    }

    // ---- Render ----
    drawHeader();
    let y = tableTop;

    drawTableHeader(y);
    y += rowH;

    if (rows.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(12)
        .fillColor("#374151")
        .text("Aucune inscription pour cette date.", left, y + 14);
      doc.end();
      return;
    }

    rows.forEach((r, i) => {
      // New page if needed
      if (y + rowH > tableBottomLimit) {
        doc.addPage();
        drawHeader();
        y = tableTop;
        drawTableHeader(y);
        y += rowH;
      }
      drawRow(r, y, i);
      y += rowH;
    });

    doc.end();
  } catch (err) {
    console.error("export-pdf error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
};

