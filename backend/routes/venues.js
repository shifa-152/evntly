const express = require('express');
const Venue   = require('../models/Venue');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/venues  (public, search + filter) ────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { q, type, guests, available } = req.query;
    const filter = {};
    if (q)         filter.$text = { $search: q };
    if (type)      filter.$or  = [{ type: { $regex: type, $options: 'i' } }, { tags: { $regex: type, $options: 'i' } }];
    if (available !== undefined) filter.available = available === 'true';
    if (guests) { const n = parseInt(guests); if (!isNaN(n)) filter.capacity = { $gte: n }; }

    const venues = await Venue.find(filter).sort({ rating: -1, createdAt: -1 });
    res.json({ success: true, count: venues.length, venues });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/venues/:id  (public) ────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id).populate('owner', 'name email phones');
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });
    res.json({ success: true, venue });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/venues/:id/slots?date=YYYY-MM-DD  (public) ───────────────────────
router.get('/:id/slots', async (req, res) => {
  try {
    const Booking = require('../models/Booking');
    const { date } = req.query;
    if (!date) return res.json({ success: true, takenSlots: [] });

    const bookings = await Booking.find({
      venue: req.params.id,
      date,
      status: { $nin: ['cancelled'] },
    }).select('startTime hours');

    const takenSet = new Set();
    bookings.forEach(b => {
      const start = parseInt(b.startTime);
      for (let h = 0; h < b.hours; h++) {
        takenSet.add(`${String(start + h).padStart(2, '0')}:00`);
      }
    });
    res.json({ success: true, takenSlots: Array.from(takenSet) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/venues  (owner only) ───────────────────────────────────────────
router.post('/', protect, restrictTo('owner'), async (req, res) => {
  try {
    // images come as array of base64 data-URIs from frontend
    const { images, ...rest } = req.body;
    const venue = await Venue.create({
      ...rest,
      images: Array.isArray(images) ? images.slice(0, 10) : [],
      owner: req.user._id,
      ownerName: req.user.name,
    });
    res.status(201).json({ success: true, venue });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/venues/:id  (owner only, own venues) ───────────────────────────
router.patch('/:id', protect, restrictTo('owner'), async (req, res) => {
  try {
    const venue = await Venue.findOne({ _id: req.params.id, owner: req.user._id });
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found or not yours' });

    const allowed = ['name','type','location','description','capacity','price',
                     'tags','amenities','available','emoji','featurePricing','images'];
    allowed.forEach(f => { if (req.body[f] !== undefined) venue[f] = req.body[f]; });

    // Validate image count
    if (venue.images && venue.images.length > 10) {
      venue.images = venue.images.slice(0, 10);
    }

    await venue.save();
    res.json({ success: true, venue });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/venues/:id  (owner only) ──────────────────────────────────────
router.delete('/:id', protect, restrictTo('owner'), async (req, res) => {
  try {
    const venue = await Venue.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found or not yours' });
    res.json({ success: true, message: 'Venue deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/venues/:id/reviews  (authenticated customer who booked) ─────────
router.post('/:id/reviews', protect, async (req, res) => {
  try {
    const Booking = require('../models/Booking');
    const venue   = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ success: false, message: 'Venue not found' });

    // Must have a confirmed booking for this venue
    const booking = await Booking.findOne({
      venue: req.params.id,
      customer: req.user._id,
      status: 'confirmed',
    });
    if (!booking) {
      return res.status(403).json({ success: false, message: 'You can only review venues you have a confirmed booking for' });
    }

    const { rating, text, photos } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ success: false, message: 'Rating must be 1–5' });
    if (!text || !text.trim()) return res.status(400).json({ success: false, message: 'Review text is required' });

    venue.reviews.push({
      customer: req.user._id,
      customerName: req.user.name,
      bookingId: booking._id,
      rating: parseInt(rating),
      text: text.trim(),
      photos: Array.isArray(photos) ? photos.slice(0, 5) : [],
    });
    venue.recalcRating();
    await venue.save();

    res.status(201).json({ success: true, review: venue.reviews[venue.reviews.length - 1], venue });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── GET /api/venues/reviews/all  (public — for homepage) ─────────────────────
router.get('/reviews/all', async (req, res) => {
  try {
    const venues  = await Venue.find({}).select('name reviews').lean();
    const reviews = [];
    venues.forEach(v => {
      (v.reviews || []).forEach(r => {
        reviews.push({ ...r, venueName: v.name, venueId: v._id });
      });
    });
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, reviews: reviews.slice(0, 20) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
