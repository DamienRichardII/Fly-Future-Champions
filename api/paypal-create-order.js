async function getAccessToken(){
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if(!id || !secret) throw new Error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET");
  const auth = Buffer.from(`${id}:${secret}`).toString('base64');

  const resp = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method:'POST',
    headers:{
      'Authorization': `Basic ${auth}`,
      'Content-Type':'application/x-www-form-urlencoded'
    },
    body:'grant_type=client_credentials'
  });

  if(!resp.ok){
    const t = await resp.text();
    throw new Error(`PayPal token error: ${t}`);
  }
  const json = await resp.json();
  return json.access_token;
}

module.exports = async (req,res) => {
  if(req.method !== 'POST'){
    res.status(405).json({ error:'Method not allowed' }); return;
  }
  try{
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const items = Array.isArray(body.items) ? body.items : [];
    if(!items.length){ res.status(400).json({ error:'Empty cart' }); return; }

    const totalCents = items.reduce((sum,it)=> sum + Number(it.unit_amount||0)*Math.max(1,Number(it.quantity||1)), 0);
    const total = (totalCents/100).toFixed(2);

    const token = await getAccessToken();
    const resp = await fetch('https://api-m.paypal.com/v2/checkout/orders', {
      method:'POST',
      headers:{
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent:'CAPTURE',
        purchase_units:[{
          amount:{ currency_code:'EUR', value: total }
        }]
      })
    });

    const json = await resp.json();
    if(!resp.ok){
      throw new Error(`PayPal order error: ${JSON.stringify(json)}`);
    }
    res.status(200).json({ id: json.id });
  }catch(e){
    res.status(500).json({ error: e.message || String(e) });
  }
};