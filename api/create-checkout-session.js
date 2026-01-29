const Stripe = require('stripe');

function getSiteUrl(req){
  return process.env.SITE_URL || `https://${req.headers.host}`;
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

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const items = Array.isArray(body.items) ? body.items : [];

    if (!items.length) {
      res.status(400).json({ error: 'Empty cart' });
      return;
    }

    // Map items to line items
    const line_items = items.map(it => {
      const name = String(it.name || 'Programme');
      const unit_amount = Number(it.unit_amount); // cents
      const quantity = Math.max(1, Number(it.quantity || 1));

      if (!unit_amount || unit_amount < 50) throw new Error("Invalid unit_amount");
      return {
        quantity,
        price_data: {
          currency: 'eur',
          unit_amount,
          product_data: { name }
        }
      };
    });

    const siteUrl = getSiteUrl(req);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'], // Apple Pay will appear automatically when available
      line_items,
      success_url: `${siteUrl}/programmes.html?paid=1`,
      cancel_url: `${siteUrl}/programmes.html?canceled=1`,
      automatic_tax: { enabled: false }
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
};