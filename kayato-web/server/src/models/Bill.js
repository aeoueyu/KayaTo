import mongoose from 'mongoose';

const billSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, default: 'other' },
  amount: { type: mongoose.Schema.Types.Decimal128, required: true },
  currency: { type: String, required: true, uppercase: true, default: 'PHP' },
  dueDate: { type: Date, required: true },
  billingCycle: { type: String, enum: ['one_time', 'weekly', 'monthly', 'quarterly', 'yearly'], default: 'monthly' },
  reminderDaysBefore: { type: [Number], default: [3, 1] },
  status: { type: String, enum: ['unpaid', 'paid', 'overdue', 'skipped'], default: 'unpaid' },
  officialPaymentUrl: { type: String, validate: { validator: (value) => !value || /^https:\/\//i.test(value), message: 'Payment URL must use HTTPS.' } },
  transactionReference: String,
  receiptUrl: String,
  paidAt: Date,
}, { timestamps: true });

export default mongoose.model('Bill', billSchema);
