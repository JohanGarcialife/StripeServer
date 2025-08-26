const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const Stripe = require('stripe');

dotenv.config();

const app = express();
const port = process.env.SERVER_PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY is not set. Payments will fail.');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'stripe-backend', port });
});

app.post('/api/stripe/createApi', async (req, res) => {
  try {
    const { name, email, amount } = req.body || {};
    if (!name || !email || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let customer;
    const list = await stripe.customers.list({ email });
    customer = list.data[0];
    if (!customer) {
      customer = await stripe.customers.create({ name, email });
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: '2024-06-20' }
    );

    const paymentIntent = await stripe.paymentIntents.create({
      amount: parseInt(amount, 10) * 100,
      currency: 'usd',
      customer: customer.id,
      automatic_payment_methods: { enabled: true },
    });

    res.json({ paymentIntent, ephemeralKey, customer: customer.id });
  } catch (err) {
    console.error('createApi error', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/stripe/payApi', async (req, res) => {
  try {
    const { payment_method_id, payment_intent_id, customer_id } = req.body || {};
    if (!payment_method_id || !payment_intent_id || !customer_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const paymentMethod = await stripe.paymentMethods.attach(payment_method_id, { customer: customer_id });
    const result = await stripe.paymentIntents.confirm(payment_intent_id, { payment_method: paymentMethod.id });

    res.json({ success: true, client_secret: result.client_secret, result });
  } catch (err) {
    console.error('payApi error', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Stripe backend listening on http://127.0.0.1:${port}`);
  });
}

module.exports = { app };


