const express  = require('express');
const jwt      = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User     = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// ── Phone normaliser: accepts  9876543210  |  +919876543210  |  919876543210
function normalisePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  // Strip country code if present
  const local = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  if (local.length !== 10) return null;
  if (!/^[6-9]/.test(local)) return null;
  return '+91' + local;
}

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email')
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail({ gmail_remove_dots: false })
    .custom(val => {
      // Reject multiple dots in domain like gmail.com.com
      const domain = val.split('@')[1] || '';
      const parts  = domain.split('.');
      if (parts.length > 3) throw new Error('Please enter a valid email address');
      // Check for consecutive dots
      if (/\.\./.test(val)) throw new Error('Please enter a valid email address');
      return true;
    }),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['customer', 'owner']).withMessage('Role must be customer or owner'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array(), message: errors.array()[0].msg });
  }

  try {
    const { name, email, password, role, phones, businessName } = req.body;

    if (await User.findOne({ email })) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    // Validate and normalise phone numbers
    const normalisedPhones = [];
    if (phones && Array.isArray(phones)) {
      for (const ph of phones) {
        if (!ph.number) continue;
        const n = normalisePhone(ph.number);
        if (!n) {
          return res.status(400).json({
            success: false,
            message: `Invalid mobile number "${ph.number}". Must be a valid Indian number starting with 6–9.`,
          });
        }
        normalisedPhones.push({ number: n, label: ph.label || 'primary' });
      }
    }

    const user = await User.create({
      name, email, password, role,
      phones: normalisedPhones,
      businessName,
    });

    const token = signToken(user._id);
    res.status(201).json({
      success: true, token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, phones: user.phones },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', [
  body('email').isEmail().withMessage('Please enter a valid email address'),
  body('password').notEmpty().withMessage('Password required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    const token = signToken(user._id);
    res.json({
      success: true, token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, phones: user.phones || [] },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', protect, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ── PATCH /api/auth/me ───────────────────────────────────────────────────────
router.patch('/me', protect, async (req, res) => {
  try {
    const allowed = ['name', 'phones', 'businessName'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    // Validate phones if provided
    if (updates.phones) {
      const normalisedPhones = [];
      for (const ph of updates.phones) {
        if (!ph.number) continue;
        const n = normalisePhone(ph.number);
        if (!n) return res.status(400).json({ success: false, message: `Invalid mobile: ${ph.number}` });
        normalisedPhones.push({ number: n, label: ph.label || 'primary' });
      }
      updates.phones = normalisedPhones;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
