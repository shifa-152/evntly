// routes/offers.js  — Express router
const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const Offer    = require('../models/Offer');   // see model below
const auth     = require('../middleware/auth');

// ── multer storage (reuse your existing uploads folder) ──────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/offers  — public (supports ?active=true&venueId=xxx)
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.active === 'true') filter.active = true;
    if (req.query.venueId)           filter.venueId = req.query.venueId;
    const offers = await Offer.find(filter).sort({ createdAt: -1 });
    res.json(offers);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/offers  — owner only
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    if (!['owner','admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Only venue owners can create offers' });
    const { venueId, title, description, discountType, discountValue, validFrom, validTill } = req.body;
    if (!venueId) return res.status(400).json({ error: 'venueId is required' });
    if (!title)   return res.status(400).json({ error: 'title is required' });
    const offer = await Offer.create({
      venueId, title, description,
      discountType:  discountType  || 'percent',
      discountValue: parseFloat(discountValue) || 0,
      validFrom:  validFrom  || null,
      validTill:  validTill  || null,
      active:     req.body.active !== 'false',
      image:      req.file ? req.file.filename : null,
      ownerId:    req.user._id || req.user.id,
    });
    res.status(201).json(offer);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/offers/:id  — toggle active / update fields
router.patch('/:id', auth, async (req, res) => {
  try {
    const offer = await Offer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    res.json(offer);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/offers/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await Offer.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;