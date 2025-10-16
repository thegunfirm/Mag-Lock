// Temporary storage for payment intents
// In production, this should be stored in a database table
const paymentIntents = new Map<string, {
  userId: string;
  targetTier: string;
  billingCycle: string;
  amount: number;
  timestamp: number;
}>();

// Store a payment intent
export function storePaymentIntent(invoiceNum: string, intent: {
  userId: string;
  targetTier: string;
  billingCycle: string;
  amount: number;
}) {
  paymentIntents.set(invoiceNum, {
    ...intent,
    timestamp: Date.now()
  });
  
  // Clean up old intents (older than 1 hour)
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [key, value] of paymentIntents.entries()) {
    if (value.timestamp < oneHourAgo) {
      paymentIntents.delete(key);
    }
  }
}

// Retrieve a payment intent
export function getPaymentIntent(invoiceNum: string) {
  return paymentIntents.get(invoiceNum);
}

// Clear a payment intent
export function clearPaymentIntent(invoiceNum: string) {
  paymentIntents.delete(invoiceNum);
}