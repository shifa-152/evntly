const express = require('express');
const Booking = require('../models/Booking');
const Venue   = require('../models/Venue');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/bookings/me ──────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  try {
    const bookings = await Booking.find({ customer: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, bookings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/bookings  ───────────────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const { venueId, date, startTime, hours, guests, eventType,
            facilities, notes, basePrice, addonPrice, platformFee, total,
            cateringType, plates } = req.body;

    // Backend validation
    if (!venueId || !date || !startTime || !hours || !guests || !eventType) {
      return res.status(400).json({ success: false, message: 'Missing required booking fields' });
    }

    const venue = await Venue.findById(venueId);
    if (!venue)           return res.status(404).json({ success: false, message: 'Venue not found' });
    if (!venue.available) return res.status(400).json({ success: false, message: 'Venue is currently unavailable' });

    // Check capacity
    if (parseInt(guests) > venue.capacity) {
      return res.status(400).json({ success: false, message: `Guest count exceeds venue capacity of ${venue.capacity}` });
    }

    // Check for slot conflict
    const startH = parseInt(startTime);
    const endH   = startH + parseInt(hours);
    if (endH > 23) return res.status(400).json({ success: false, message: 'Booking would extend past midnight' });

    const conflicting = await Booking.findOne({
      venue: venueId,
      date,
      status: { $nin: ['cancelled'] },
    });

    if (conflicting) {
      // Check hour overlap
      const cStart = parseInt(conflicting.startTime);
      const cEnd   = cStart + conflicting.hours;
      if (startH < cEnd && endH > cStart) {
        return res.status(409).json({ success: false, message: 'This time slot is already booked' });
      }
    }

    // Recalculate price server-side (trusted source)
    const fp = venue.featurePricing ? Object.fromEntries(venue.featurePricing) : {};
    let serverAddon = 0;
    (facilities || []).forEach(f => {
      const baseLabel = f.split(' (')[0];
      const price = fp[baseLabel] || 0;
      if (!baseLabel.toLowerCase().includes('catering')) serverAddon += price * parseInt(hours);
    });

    // Catering
    let cateringCost = 0;
    if ((facilities || []).some(f => f.toLowerCase().includes('catering'))) {
      if (cateringType === 'zomato') cateringCost = (parseInt(plates) || 0) * 250;
      else if (cateringType === 'swiggy') cateringCost = (parseInt(plates) || 0) * 220;
      else {
        const catPrice = Object.entries(fp).find(([k]) => k.toLowerCase().includes('catering'));
        cateringCost = catPrice ? catPrice[1] * parseInt(hours) : 800 * parseInt(hours);
      }
    }

    const serverBase = venue.price * parseInt(hours);
    const serverFee  = Math.round((serverBase + serverAddon + cateringCost) * 0.05);
    const serverTotal = serverBase + serverAddon + cateringCost + serverFee;

    const booking = await Booking.create({
      venue: venue._id,
      venueName: venue.name,
      customer: req.user._id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      date, startTime,
      hours: parseInt(hours),
      guests: parseInt(guests),
      eventType,
      facilities: facilities || [],
      notes,
      cateringType: cateringType || null,
      plates: plates ? parseInt(plates) : null,
      basePrice: serverBase,
      addonPrice: serverAddon + cateringCost,
      platformFee: serverFee,
      total: serverTotal,
      status: 'pending',   // always starts pending — owner must approve
    });

    res.status(201).json({ success: true, booking });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/bookings/:id  (customer edits own PENDING booking) ──────────────
router.patch('/:id', protect, async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, customer: req.user._id });
    if (!booking)                    return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== 'pending') return res.status(400).json({ success: false, message: 'Only pending bookings can be edited' });

    const allowed = ['date','startTime','hours','guests','eventType','facilities','notes','cateringType','plates'];
    allowed.forEach(f => { if (req.body[f] !== undefined) booking[f] = req.body[f]; });
    booking.editedAt = new Date();
    await booking.save();
    res.json({ success: true, booking });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/bookings/:id/cancel  (customer cancels own booking) ─────────────
router.patch('/:id/cancel', protect, async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, customer: req.user._id });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status === 'cancelled') return res.status(400).json({ success: false, message: 'Already cancelled' });
    booking.status = 'cancelled';
    await booking.save();
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/bookings/:id/pay  (customer pays after owner approval) ───────────
router.post('/:id/pay', protect, async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, customer: req.user._id });
    if (!booking)                    return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== 'approved') return res.status(400).json({ success: false, message: 'Booking is not approved for payment' });
    if (booking.paid)                  return res.status(400).json({ success: false, message: 'Already paid' });

    const { paymentMethod } = req.body;
    if (!['upi', 'card', 'netbanking', 'wallet'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method' });
    }

    booking.paid          = true;
    booking.paymentMethod = paymentMethod;
    booking.paidAt        = new Date();
    booking.status        = 'confirmed';
    await booking.save();

    res.json({ success: true, booking });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
