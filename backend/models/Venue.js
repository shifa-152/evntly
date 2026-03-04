const mongoose = require('mongoose');

// ── Review sub-schema ────────────────────────────────────────────────────────
const reviewSchema = new mongoose.Schema({
  customer:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customerName: { type: String },
  bookingId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  rating:       { type: Number, required: true, min: 1, max: 5 },
  text:         { type: String, required: true, maxlength: 1000 },
  photos:       [{ type: String }],   // base64 data-URIs
  createdAt:    { type: Date, default: Date.now },
});

// ── Venue schema ─────────────────────────────────────────────────────────────
const venueSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  owner:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ownerName: { type: String },           // denormalised for fast reads
  type:      { type: String, required: true },
  location:  { type: String, required: true },
  description: { type: String },
  capacity:  { type: Number, required: true },
  price:     { type: Number, required: true },     // ₹ per hour (base)

  // Images — stored as base64 data-URIs (for self-hosted; swap to URLs for cloud storage)
  images: [{ type: String }],

  rating:       { type: Number, default: 0, min: 0, max: 5 },
  totalRatings: { type: Number, default: 0 },
  reviews:      [reviewSchema],

  tags:         [String],
  amenities:    [String],

  // Feature add-on pricing map  { '🎤 Sound System': 500, '🍽️ Catering': 800, ... }
  featurePricing: { type: Map, of: Number, default: {} },

  available:  { type: Boolean, default: true },
  emoji:      { type: String, default: '🏛️' },
  colorIndex: { type: Number, default: 0 },
  createdAt:  { type: Date, default: Date.now },
});

// Text search index
venueSchema.index({ name: 'text', location: 'text', type: 'text' });

// Recompute average rating after each save
venueSchema.methods.recalcRating = function () {
  if (!this.reviews.length) { this.rating = 0; this.totalRatings = 0; return; }
  this.totalRatings = this.reviews.length;
  this.rating = +(this.reviews.reduce((s, r) => s + r.rating, 0) / this.reviews.length).toFixed(1);
};

module.exports = mongoose.model('Venue', venueSchema);
