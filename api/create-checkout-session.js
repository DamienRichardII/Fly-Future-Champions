// api/create-checkout-session.js
const Stripe = require("stripe");
const { getSupabaseServiceClient } = require("./_supabase");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function getOrigin(req) {
  const origin = req.headers.origin;
  if (origin) return origin;

  const referer = req.headers.referer || "";
  try {
    const u = new URL(referer);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "https://flyfuturechampions.com";
  }
}

async function getStripeConnectedAccountId() {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "stripe_account_id")
    .single();

  if (error || !data?.value) {
    throw new Error(
      "Stripe Connect non configuré : clé 'stripe_account_id' introuvable dans app_settings."
    );
  }

  return data.value; // ex: acct_123...
}

function sanitizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  return items
    .map((it) => {
      const name = String(it?.name || "").trim();
      const unit_amount = Number(it?.unit_amount);
      const quantity = Number(it?.quantity);

      if (!name) return null;
      if (!Number.isFinite(unit_amount) || unit_amount <= 0) return null;
      if (!Number.isFinite(quantity) || quantity <= 0) return null;

      // Stripe demande des entiers (centimes)
      const ua = Math.round(unit_amount);
      const q = Math.round(quantity);

      return { name, unit_amount: ua, quantity: q };
    })
    .filter(Boolean)
    .slice(0, 30);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const items = sanitizeItems(req.body?.items);
    if (!items.length) {
      return res.status(400).json({ error: "Panier vide ou invalide." });
    }

    const connectedAccountId = await getStripeConnectedAccountId();
    const origin = getOrigin(req);

    // ✅ Destination charge -> transfert vers ton compte Connect (0% commission plateforme)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: items.map((it) => ({
        price_data: {
          currency: "eur",
          product_data: { name: it.name },
          unit_amount: it.unit_amount, // en centimes
        },
        quantity: it.quantity,
      })),

      // Pages retour (adapte si tu as une page success dédiée)
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/programmes.html#pricing`,

      // ✅ Le point clé :
      payment_intent_data: {
        transfer_data: { destination: connectedAccountId },
        on_behalf_of: connectedAccountId,

        // (optionnel) pour suivi côté Stripe
        metadata: {
          app: "flyfuturechampions",
          source: "programmes",
        },
      },

      metadata: {
        app: "flyfuturechampions",
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
};
