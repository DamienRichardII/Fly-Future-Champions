

const { getSupabaseServiceClient } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseServiceClient();

    // Auth: on exige un Bearer token (session Supabase de l'admin)
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing Authorization Bearer token' });

    // Vérifie que le token correspond à un user Supabase Auth
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    // Optionnel mais RECOMMANDE : limiter aux emails admin
    // Dans Vercel: ADMIN_EMAILS="email1@x.com,email2@x.com"
    const allow = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    if (allow.length) {
      const email = (userData.user.email || '').toLowerCase();
      if (!allow.includes(email)) {
        return res.status(403).json({ error: 'Forbidden (not in ADMIN_EMAILS)' });
      }
    }

    const body = req.body || {};
    const date = body.date;          // "YYYY-MM-DD"
    const scope = body.scope || 'date'; // 'date' | 'all'

    let q = supabase.from('detection_registrations').delete().select('id');

    if (scope === 'all') {
      // supprime tout (condition vraie pour toutes les lignes)
      q = q.neq('id', '00000000-0000-0000-0000-000000000000');
    } else {
      if (!date) return res.status(400).json({ error: 'Missing date' });
      q = q.eq('detection_date', date);
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true, deleted: (data || []).length });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};
