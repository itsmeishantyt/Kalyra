require('dotenv').config();
const Razorpay = require('razorpay');

console.log("Mock mode setting:", process.env.RAZORPAY_MOCK_MODE);
console.log("Key ID:", process.env.RAZORPAY_KEY_ID);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

console.log("Attempting to create order...");
razorpay.orders.create({
  amount: 100, // 1 INR in paise
  currency: 'INR',
  receipt: 'test_receipt_123'
}).then(order => {
  console.log("Success! Order created:", order);
}).catch(err => {
  console.error("Error creating order:", err);
});
