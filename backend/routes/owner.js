const express = require('express');
const Venue   = require('../models/Venue');
const Booking = require('../models/Booking');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();
router.use(protect, restrictTo('owner'));

// ── GET /api/owner/stats ───────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const myVenues  = await Venue.find({ owner: req.user._id });
    const venueIds  = myVenues.map(v => v._id);
    const bookings  = await Booking.find({ venue: { $in: venueIds } }).sort({ createdAt: -1 });

    const revenue      = bookings.filter(b => b.status === 'confirmed').reduce((s, b) => s + b.total, 0);
    const confirmed    = bookings.filter(b => b.status === 'confirmed').length;
    const approved     = bookings.filter(b => b.status === 'approved').length;
    const activeVenues = myVenues.filter(v => v.available).length;

    res.json({
      success: true,
      stats: {
        totalVenues: myVenues.length,
        activeVenues,
        totalBookings: bookings.length,
        confirmedBookings: confirmed,
        approvedBookings: approved,
        totalRevenue: revenue,
      },
      venues: myVenues,
      bookings,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/owner/bookings/:id  (approve / cancel with optional reason) ────
router.patch('/bookings/:id', async (req, res) => {
  try {
    const { status, declineReason } = req.body;
    if (!['approved', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be approved or cancelled' });
    }

    const myVenues = await Venue.find({ owner: req.user._id }).select('_id');
    const venueIds = myVenues.map(v => v._id.toString());

    const booking = await Booking.findById(req.params.id);
    if (!booking || !venueIds.includes(booking.venue.toString())) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (booking.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Booking is already ${booking.status}` });
    }

    booking.status = status;
    if (status === 'cancelled' && declineReason) booking.declineReason = declineReason;
    await booking.save();
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
