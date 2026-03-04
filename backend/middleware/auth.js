// const express  = require('express');
// const jwt      = require('jsonwebtoken');
// const { body, validationResult } = require('express-validator');
// const User     = require('../models/User');
// const { protect } = require('../middleware/auth');

// const router = express.Router();

// const signToken = (id) =>
//   jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// // ─── POST /api/auth/register ──────────────────────────────────────────────────
// router.post('/register', [
//   body('name').trim().notEmpty().withMessage('Name is required'),
//   body('email').isEmail().withMessage('Valid email required'),
//   body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
//   body('role').isIn(['customer', 'owner']).withMessage('Role must be customer or owner'),
// ], async (req, res) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

//   try {
//     const { name, email, password, role, phone, businessName } = req.body;

//     if (await User.findOne({ email })) {
//       return res.status(409).json({ success: false, message: 'Email already registered' });
//     }

//     const user = await User.create({ name, email, password, role, phone, businessName });
//     const token = signToken(user._id);

//     res.status(201).json({
//       success: true,
//       token,
//       user: { id: user._id, name: user.name, email: user.email, role: user.role },
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// });

// // ─── POST /api/auth/login ─────────────────────────────────────────────────────
// router.post('/login', [
//   body('email').isEmail().withMessage('Valid email required'),
//   body('password').notEmpty().withMessage('Password required'),
// ], async (req, res) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

//   try {
//     const { email, password } = req.body;
//     const user = await User.findOne({ email }).select('+password');

//     if (!user || !(await user.comparePassword(password))) {
//       return res.status(401).json({ success: false, message: 'Invalid email or password' });
//     }

//     const token = signToken(user._id);
//     res.json({
//       success: true,
//       token,
//       user: { id: user._id, name: user.name, email: user.email, role: user.role },
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// });

// // ─── GET /api/auth/me ─────────────────────────────────────────────────────────
// router.get('/me', protect, (req, res) => {
//   res.json({ success: true, user: req.user });
// });

// // ─── PATCH /api/auth/me ───────────────────────────────────────────────────────
// router.patch('/me', protect, async (req, res) => {
//   try {
//     const allowed = ['name', 'phone', 'businessName'];
//     const updates = {};
//     allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
//     const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
//     res.json({ success: true, user });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// });

// module.exports = router;
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Protect middleware
const protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id).select("-password");

    next();
  } catch (err) {
    return res.status(401).json({ message: "Token invalid" });
  }
};

// 🔥 ADD THIS FUNCTION
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You do not have permission to perform this action",
      });
    }
    next();
  };
};

module.exports = { protect, restrictTo };