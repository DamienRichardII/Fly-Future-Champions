const Stripe = require('stripe');
const { getSupabaseServiceClient } = require('./_supabase');

function getSiteUrl(req){
  return process.env.SITE_URL || `https://${req.headers.host}`;
}

async function getOrCreateConnectAccount(stripe, supabase){
  // Try env first
  if (process.env.STRIPE_CONNECT_ACCOUNT_ID) return process.env.STRIPE_CONNECT_ACCOUNT_ID;

  // Try DB setting
  const { data } = await supabase.from('app_settings').select('value').eq('key','stripe_account_id').maybeSingle();
  if (data && data.value) return data.value;

  // Create new account (Standard)
  const account = await stripe.accounts.create({ type: 'standard' });
  await supabase.from('app_settings').upsert({ key:'stripe_account_id', value: account.id });
  return account.id;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if(!stripeKey) throw new Error("Missing STRIPE_SECRET_KEY");
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const supabase = getSupabaseServiceClient();

    const siteUrl = getSiteUrl(req);
    const accountId = await getOrCreateConnectAccount(stripe, supabase);

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${siteUrl}/admin.html?payments=retry`,
      return_url: `${siteUrl}/admin.html?payments=ok`,
      type: 'account_onboarding'
    });

    res.status(200).json({ url: link.url, accountId });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
};