const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  venue:        { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true },
  venueName:    { type: String },
  customer:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customerName: { type: String },
  customerEmail:{ type: String },

  date:      { type: String, required: true },   // "YYYY-MM-DD"
  startTime: { type: String, default: '10:00' },
  hours:     { type: Number, required: true, min: 1 },
  guests:    { type: Number, required: true, min: 1 },
  eventType: { type: String, required: true },
  facilities:[String],
  notes:     { type: String },

  // Pricing
  basePrice:   { type: Number },
  addonPrice:  { type: Number },
  platformFee: { type: Number },
  total:       { type: Number, required: true },
  cateringType:{ type: String },
  plates:      { type: Number },

  // Status flow: pending → approved → confirmed (after payment)
  //              pending → cancelled (owner declined)
  status: {
    type: String,
    enum: ['pending', 'approved', 'confirmed', 'cancelled'],
    default: 'pending',
  },
  declineReason: { type: String },   // set when owner cancels

  // Payment
  paid:        { type: Boolean, default: false },
  paymentMethod: { type: String },
  paidAt:      { type: Date },

  ref:       { type: String, unique: true },
  editedAt:  { type: Date },
  createdAt: { type: Date, default: Date.now },
});

// Auto-generate booking reference
bookingSchema.pre('save', async function (next) {
  if (!this.ref) {
    const count = await mongoose.model('Booking').countDocuments();
    this.ref = 'EVT' + String(count + 1).padStart(5, '0');
  }
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);
