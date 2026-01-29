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
    const orderId = body.orderId;
    if(!orderId){ res.status(400).json({ error:'Missing orderId' }); return; }

    const token = await getAccessToken();
    const resp = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderId}/capture`, {
      method:'POST',
      headers:{
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    const json = await resp.json();
    if(!resp.ok){
      throw new Error(`PayPal capture error: ${JSON.stringify(json)}`);
    }
    res.status(200).json({ ok:true, details: json });
  }catch(e){
    res.status(500).json({ error: e.message || String(e) });
  }
};