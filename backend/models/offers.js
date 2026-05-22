const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  venueId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true },
  ownerId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User'  },
  title:         { type: String, required: true, maxlength: 80 },
  description:   { type: String, default: '' },
  discountType:  { type: String, enum: ['percent','flat','free_amenity','custom'], default: 'percent' },
  discountValue: { type: Number, default: 0 },
  validFrom:     { type: String, default: null },  // stored as YYYY-MM-DD string
  validTill:     { type: String, default: null },
  image:         { type: String, default: null },
  active:        { type: Boolean, default: true },
}, { timestamps: true });

// Virtual to attach venueName when querying (optional — populate instead if preferred)
module.exports = mongoose.model('Offer', offerSchema);