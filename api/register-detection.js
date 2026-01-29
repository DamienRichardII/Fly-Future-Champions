const { getSupabaseServiceClient } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabaseServiceClient();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Basic validation
    const detection_date = body.detection_date; // YYYY-MM-DD
    const first_name = (body.first_name || '').trim();
    const last_name = (body.last_name || '').trim();

    if (!detection_date || !first_name || !last_name) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const payload = {
      detection_date,
      first_name,
      last_name,
      birth_year: body.birth_year ? Number(body.birth_year) : null,
      gender: body.gender || null,
      email: body.email || null,
      phone: body.phone || null,
      city: body.city || null,
      level: body.level || null,
      position: body.position || null,
      height_cm: body.height_cm ? Number(body.height_cm) : null,
      notes: body.notes || null,
    };

    const { data, error } = await supabase
      .from('detection_registrations')
      .insert(payload)
      .select('id, created_at')
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ ok: true, id: data.id, created_at: data.created_at });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
};