// ─────────────────────────────────────────────────────────────────────────────
//  EVNTLY — Express + MongoDB Backend  (server.js)
//  Install: npm install express mongoose cors multer sharp bcryptjs jsonwebtoken dotenv
//  Run: node server.js
// ─────────────────────────────────────────────────────────────────────────────
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');  // FIX 1: moved from inline require to top-level
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const sharp      = require('sharp');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT       = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'evntly_secret_key_change_in_prod';

// ─── EMAIL TRANSPORTER ───────────────────────────────────────────────────────
// Resolve smtp.gmail.com to an IPv4 address at startup to avoid
// ECONNREFUSED on networks that block IPv6 (Windows + many ISPs)
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,       // 587 + STARTTLS is more firewall/proxy-friendly than 465
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // local dev/Windows with SSL-inspecting antivirus
  },
});

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const BRAND = 'EVNTLY';

async function sendMail({ to, subject, html }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('📧 [Email skipped — no EMAIL_USER/EMAIL_PASS in .env]');
    console.log('   To:', to, '| Subject:', subject);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"${BRAND}" <${process.env.EMAIL_USER}>`,
      to, subject, html,
    });
    console.log('📧 Email sent to', to);
  } catch(e) {
    console.error('📧 Email error:', e.message);
  }
}

function emailHtml({ title, body, btnText, btnUrl, footer }) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1eb;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:#1a1a1a;padding:24px 32px;text-align:center">
      <div style="font-family:Georgia,serif;font-size:1.6rem;font-weight:900;color:#c8a96e;letter-spacing:1px">EVNTLY<span style="color:#fff">.</span></div>
    </div>
    <div style="padding:32px">
      <h2 style="font-size:1.2rem;color:#1a1a1a;margin:0 0 16px">${title}</h2>
      <div style="font-size:0.9rem;color:#555;line-height:1.7">${body}</div>
      ${btnText && btnUrl ? `<div style="margin:28px 0;text-align:center"><a href="${btnUrl}" style="background:#c8a96e;color:#1a1a1a;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:700;font-size:0.9rem;display:inline-block">${btnText}</a></div>` : ''}
      ${footer ? `<p style="font-size:0.78rem;color:#aaa;margin-top:24px;border-top:1px solid #eee;padding-top:16px">${footer}</p>` : ''}
    </div>
  </div></body></html>`;
}

// ─── BODY SIZE — FIX "Payload Too Large" ─────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    const allowed = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://localhost:5000',
    ];
    if (process.env.CLIENT_URL) allowed.push(process.env.CLIENT_URL);
    if (allowed.includes(origin)) return callback(null, true);
    return callback(null, true); // allow all for dev
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.options('*', cors());
// ─── STATIC FILES ─────────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));


// ─── MULTER — Memory Storage + Sharp Compression ──────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10MB raw input
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp','application/pdf'];
    ok.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only JPG, PNG, WEBP, PDF allowed'));
  },
});

// ─── MONGOOSE CONNECT ─────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/evntly')
  .then(async () => { console.log('✅ MongoDB connected'); await ensureSuperAdmin(); })
  .catch(err => console.error('❌ MongoDB error:', err));

// ═════════════════════════════════════════════════════════════════════════════
//  SCHEMAS
// ═════════════════════════════════════════════════════════════════════════════
const slotSchema = new mongoose.Schema({
  time:         { type: String, required: true },
  endTime:      { type: String, default: '' },
  available:    { type: Boolean, default: true },
  blockedDates: [{ type: String }],
});

const venueSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  type:           { type: String, default: 'Banquet Hall' },
  location:       { type: String, required: true },
  description:    { type: String, default: '' },
  capacity:       { type: Number, required: true, min: [1, 'Capacity must be at least 1'] },
  price1hr:       { type: Number, required: true, min: [1, 'Price/1hr must be greater than 0'] },
  price2hr:       { type: Number, default: 0, min: [0, 'Price must be ≥ 0'] },
  price3hr:       { type: Number, default: 0 },
  price4hr:       { type: Number, default: 0 },
  price5hr:       { type: Number, default: 0 },
  price6hr:       { type: Number, default: 0 },
  price7hr:       { type: Number, default: 0 },
  venueSize:      { type: String, default: '' },
  platePrice:     { type: Number, default: 0, min: [0, 'Plate price must be ≥ 0'] },
  cateringHotels: [{ type: String }],
  coverImage:     { type: String, default: '' },
  images:         [{ type: String }],
  slots:          [slotSchema],
  openTime:       { type: String, default: '09:00' },
  closeTime:      { type: String, default: '22:00' },
  blocked:        { type: Boolean, default: false },
  blockedRanges:  [{ type: String }],
  amenities:      [{ key: String, label: String, price: Number }],
  ownerId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  address:        { type: String, default: '' },
  city:           { type: String, default: '' },
  state:          { type: String, default: '' },
  pincode:        { type: String, default: '' },
  venueEmail:     { type: String, default: '' },
  venuePhone:     { type: String, default: '' },
  ownerName:      { type: String },
  isActive:       { type: Boolean, default: true },
  rating:         { type: Number, default: 0 },
  reviewCount:    { type: Number, default: 0 },
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true, lowercase: true },
  password:  { type: String, required: true },
  role:      { type: String, enum: ['customer','owner','admin','superadmin'], default: 'customer' },
  phone:              { type: String, default: '' },
  resetPasswordToken: { type: String, default: '' },
  resetPasswordExp:   { type: Date },
}, { timestamps: true });

const bookingSchema = new mongoose.Schema({
  ref:              { type: String, unique: true },
  venueId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Venue' },
  venueName:        { type: String },
  userId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName:         { type: String },
  userEmail:        { type: String },
  userPhone:        { type: String },
  date:             { type: String, required: true },
  startTime:        { type: String, required: true },
  hours:            { type: Number, required: true, min: 1 },
  guests:           { type: Number, required: true, min: [1, 'Guests must be at least 1'] },
  eventType:        { type: String, default: '' },
  facilities:       [{ type: String }],
  cateringType:     { type: String, default: 'none' },
  basePrice:        { type: Number, default: 0 },
  addonPrice:       { type: Number, default: 0 },
  plateCharges:     { type: Number, default: 0 },
  total:            { type: Number, default: 0 },
  status:           { type: String, enum: ['pending','confirmed','rejected','cancelled','paid'], default: 'pending' },
  // Payment fields
  paymentType:      { type: String, enum: ['none','advance','full','cash_on_visit'], default: 'none' },
  advanceAmount:    { type: Number, default: 0 },   // amount paid as advance
  paidAmount:       { type: Number, default: 0 },   // total paid so far
  paymentStatus:    { type: String, enum: ['unpaid','advance_paid','fully_paid'], default: 'unpaid' },
  paymentMethod:    { type: String, default: '' },  // upi/card/netbanking/wallet/cash
  cashOnVisitApproved: { type: Boolean, default: false },
}, { timestamps: true });

const reviewSchema = new mongoose.Schema({
  venueId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Venue' },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: { type: String },
  rating:   { type: Number, min: 1, max: 5 },
  comment:  { type: String },
  photo:    { type: String, default: '' },
}, { timestamps: true });

// ── OWNER APPLICATION SCHEMA ─────────────────────────────────────
const ownerApplicationSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  email:       { type: String, required: true, unique: true, lowercase: true },
  password:    { type: String, required: true },
  phone:       { type: String, default: '' },
  proofFiles:  [{ filename: String, originalName: String }],
  status:      { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  rejectReason:{ type: String, default: '' },
}, { timestamps: true });

// ── HOMEPAGE PHOTO SCHEMA ─────────────────────────────────────────
const homepagePhotoSchema = new mongoose.Schema({
  title:   { type: String, required: true },
  caption: { type: String, default: '' },
  photo:   { type: String, required: true },
  order:   { type: Number, default: 0 },
  active:  { type: Boolean, default: true },
}, { timestamps: true });

const Venue   = mongoose.model('Venue',   venueSchema);
const User    = mongoose.model('User',    userSchema);
const Booking = mongoose.model('Booking', bookingSchema);
const Review  = mongoose.model('Review',  reviewSchema);
const OwnerApplication = mongoose.model('OwnerApplication', ownerApplicationSchema);
const HomepagePhoto    = mongoose.model('HomepagePhoto',    homepagePhotoSchema);

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function genRef() {
  return 'EVT' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2,5).toUpperCase();
}

async function saveImage(buffer) {
  const filename = Date.now() + '_' + Math.random().toString(36).slice(2) + '.webp';
  await sharp(buffer)
    .resize({ width: 1200, height: 900, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(path.join(UPLOADS_DIR, filename));
  return filename;
}

function deleteImageFile(filename) {
  if (!filename) return;
  const fp = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}
function ownerMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'owner' && req.user.role !== 'admin' && req.user.role !== 'superadmin')
      return res.status(403).json({ error: 'Owner access required' });
    next();
  });
}
function superadminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'superadmin')
      return res.status(403).json({ error: 'Super admin access required' });
    next();
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═════════════════════════════════════════════════════════════════════════════
app.get('/api/ping', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are required' });
    if (await User.findOne({ email }))
      return res.status(400).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hash, role: role || 'customer', phone });
    const token = jwt.sign({ id: user._id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.status(400).json({ error: 'This email is not registered. Please register first.' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(400).json({ error: 'Incorrect password. Please try again.' });
    const token = jwt.sign({ id: user._id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
//  VENUE ROUTES
// ═════════════════════════════════════════════════════════════════════════════
app.get('/api/venues', async (req, res) => {
  try {
    const { search, location, date, guests } = req.query;
    const filter = { isActive: true };
    if (search)   filter.name     = { $regex: search, $options: 'i' };
    if (location) filter.location = { $regex: location, $options: 'i' };
    if (guests)   filter.capacity = { $gte: parseInt(guests) };
    const venues = await Venue.find(filter).sort({ createdAt: -1 });
    res.json(venues);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/venues/:id', async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    res.json(venue);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/venues — Create
app.post('/api/venues', ownerMiddleware, upload.fields([
  { name: 'coverImage', maxCount: 1 },
  { name: 'images', maxCount: 15 }
]), async (req, res) => {
  try {
    const { name, type, location, description, capacity, price1hr, price2hr, price3hr, price4hr, price5hr, price6hr, price7hr, platePrice, venueSize,
            cateringHotels, slots, amenities, openTime, closeTime } = req.body;

    const errors = [];
    if (!name?.trim())      errors.push('Venue name is required');
    if (!location?.trim())  errors.push('Location is required');
    const cap = parseInt(capacity);
    if (isNaN(cap) || cap < 1) errors.push('Capacity must be at least 1');
    const p1  = parseFloat(price1hr);
    if (isNaN(p1) || p1 < 1)  errors.push('Price (1hr) must be greater than 0');
    const pp  = parseFloat(platePrice || 0);
    if (pp < 0)                errors.push('Plate price must be ≥ 0');
    if (errors.length) return res.status(400).json({ errors });

    let coverImageFile = '';
    let imageFiles     = [];
    if (req.files?.coverImage?.[0]) {
      coverImageFile = await saveImage(req.files.coverImage[0].buffer);
    }
    if (req.files?.images) {
      for (const f of req.files.images) {
        imageFiles.push(await saveImage(f.buffer));
      }
    }

    const owner = await User.findById(req.user.id);
    const venue = await Venue.create({
      name: name.trim(), type, location: location.trim(), description,
      capacity: cap, price1hr: p1,
      price2hr: parseFloat(price2hr || 0),
      price3hr: parseFloat(price3hr || 0),
      price4hr: parseFloat(price4hr || 0),
      price5hr: parseFloat(price5hr || 0),
      price6hr: parseFloat(price6hr || 0),
      price7hr: parseFloat(price7hr || 0),
      venueSize: venueSize || '',
      address:   req.body.address   || '',
      city:      req.body.city      || '',
      state:     req.body.state     || '',
      pincode:   req.body.pincode   || '',
      venueEmail:req.body.venueEmail|| '',
      venuePhone:req.body.venuePhone|| '',
      platePrice: pp,
      cateringHotels: cateringHotels ? JSON.parse(cateringHotels) : [],
      coverImage: coverImageFile,
      images:    imageFiles,
      slots:     slots     ? JSON.parse(slots)     : [],
      openTime:  openTime  || '',
      closeTime: closeTime || '',
      amenities: amenities ? JSON.parse(amenities) : [],
      ownerId:   req.user.id,
      ownerName: owner?.name || req.user.name,
    });
    res.status(201).json(venue);
  } catch(e) {
    if (e.name === 'ValidationError')
      return res.status(400).json({ errors: Object.values(e.errors).map(v => v.message) });
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PUT /api/venues/:id — EDIT VENUE (FULLY FUNCTIONAL)
// ─────────────────────────────────────────────────────────────────────────────
app.put('/api/venues/:id', ownerMiddleware, upload.fields([
  { name: 'coverImage', maxCount: 1 },
  { name: 'images', maxCount: 15 }
]), async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    if (String(venue.ownerId) !== String(req.user.id) && req.user.role !== 'admin')
      return res.status(403).json({ error: 'You do not own this venue' });

    const { name, type, location, description, capacity, price1hr, price2hr, price3hr, price4hr, price5hr, price6hr, price7hr, platePrice, venueSize,
            cateringHotels, slots, amenities, removeImages, openTime, closeTime } = req.body;

    // Validation
    const errors = [];
    const cap = capacity !== undefined ? parseInt(capacity) : venue.capacity;
    const p1  = price1hr  !== undefined ? parseFloat(price1hr)  : venue.price1hr;
    const pp  = platePrice !== undefined ? parseFloat(platePrice) : venue.platePrice;
    if (name !== undefined && !name?.trim()) errors.push('Venue name cannot be empty');
    if (isNaN(cap) || cap < 1)  errors.push('Capacity must be at least 1');
    if (isNaN(p1)  || p1 < 1)   errors.push('Price (1hr) must be greater than 0');
    if (isNaN(pp)  || pp < 0)   errors.push('Plate price must be ≥ 0');
    if (errors.length) return res.status(400).json({ errors });

    // Remove individually deleted gallery images
    if (removeImages) {
      const toRemove = JSON.parse(removeImages);
      toRemove.forEach(fn => deleteImageFile(fn));
      venue.images = venue.images.filter(img => !toRemove.includes(img));
    }

    // Replace cover image
    if (req.files?.coverImage?.[0]) {
      deleteImageFile(venue.coverImage);
      venue.coverImage = await saveImage(req.files.coverImage[0].buffer);
    }

    // Add new gallery images
    if (req.files?.images) {
      for (const f of req.files.images) {
        venue.images.push(await saveImage(f.buffer));
      }
    }

    // Update all text/number fields
    if (name        !== undefined) venue.name        = name.trim();
    if (type        !== undefined) venue.type        = type;
    if (location    !== undefined) venue.location    = location.trim();
    if (description !== undefined) venue.description = description;
    if (venueSize   !== undefined) venue.venueSize   = venueSize;
    if (req.body.address    !== undefined) venue.address    = req.body.address;
    if (req.body.city       !== undefined) venue.city       = req.body.city;
    if (req.body.state      !== undefined) venue.state      = req.body.state;
    if (req.body.pincode    !== undefined) venue.pincode    = req.body.pincode;
    if (req.body.venueEmail !== undefined) venue.venueEmail = req.body.venueEmail;
    if (req.body.venuePhone !== undefined) venue.venuePhone = req.body.venuePhone;
    venue.capacity   = cap;
    venue.price1hr   = p1;
    if (price2hr    !== undefined) venue.price2hr   = parseFloat(price2hr) || 0;
    if (price3hr    !== undefined) venue.price3hr   = parseFloat(price3hr) || 0;
    if (price4hr    !== undefined) venue.price4hr   = parseFloat(price4hr) || 0;
    if (price5hr    !== undefined) venue.price5hr   = parseFloat(price5hr) || 0;
    if (price6hr    !== undefined) venue.price6hr   = parseFloat(price6hr) || 0;
    if (price7hr    !== undefined) venue.price7hr   = parseFloat(price7hr) || 0;
    venue.platePrice = pp;
    if (cateringHotels !== undefined) venue.cateringHotels = JSON.parse(cateringHotels);
    if (slots          !== undefined) venue.slots           = JSON.parse(slots);
    if (openTime       !== undefined) venue.openTime        = openTime;
    if (closeTime      !== undefined) venue.closeTime       = closeTime;
    if (amenities      !== undefined) venue.amenities       = JSON.parse(amenities);

    await venue.save();
    res.json(venue);
  } catch(e) {
    if (e.name === 'ValidationError')
      return res.status(400).json({ errors: Object.values(e.errors).map(v => v.message) });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/venues/:id', ownerMiddleware, async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    if (String(venue.ownerId) !== String(req.user.id) && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Not your venue' });
    [...(venue.images || []), venue.coverImage].filter(Boolean).forEach(deleteImageFile);
    await venue.deleteOne();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Patch slot availability
app.patch('/api/venues/:id/slots/:slotId', ownerMiddleware, async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    const slot = venue.slots.id(req.params.slotId);
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    if (req.body.available !== undefined)    slot.available    = req.body.available;
    if (req.body.blockedDates !== undefined) slot.blockedDates = req.body.blockedDates;
    await venue.save();
    res.json(venue);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
//  BOOKING ROUTES
// ═════════════════════════════════════════════════════════════════════════════
app.post('/api/bookings', authMiddleware, async (req, res) => {
  try {
    const { venueId, date, startTime, hours, guests, eventType, facilities,
            cateringType, basePrice, addonPrice, plateCharges, total } = req.body;

    // Validation
    const errors = [];
    if (!venueId)   errors.push('Venue is required');
    if (!date)      errors.push('Date is required');
    if (!startTime) errors.push('Time slot is required');
    if (!hours)     errors.push('Duration is required');
    const g = parseInt(guests);
    if (!g || g < 1) errors.push('Number of guests must be at least 1');

    // Block same-day bookings
    const today = new Date().toISOString().split('T')[0];
    if (date && date === today) errors.push('Same-day bookings are not allowed. Please select a future date.');

    if (errors.length) return res.status(400).json({ errors });

    const venue = await Venue.findById(venueId);
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    const user = await User.findById(req.user.id);

    const booking = await Booking.create({
      ref: genRef(),
      venueId, venueName: venue.name,
      userId: req.user.id,
      userName:  user?.name  || req.user.name,
      userEmail: user?.email || req.user.email,
      userPhone: user?.phone || '',
      date, startTime,
      hours:        parseInt(hours),
      guests:       g,
      eventType:    eventType || '',
      facilities:   facilities || [],
      cateringType: cateringType || 'none',
      basePrice:    parseFloat(basePrice  || 0),
      addonPrice:   parseFloat(addonPrice || 0),
      plateCharges: parseFloat(plateCharges || 0),
      total:        parseFloat(total || 0),
    });
    res.status(201).json(booking);
  } catch(e) {
    if (e.name === 'ValidationError')
      return res.status(400).json({ errors: Object.values(e.errors).map(v => v.message) });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bookings/me', authMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(bookings);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const b = await Booking.findById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    res.json(b);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
//  OWNER ROUTES
// ═════════════════════════════════════════════════════════════════════════════
app.get('/api/owner/stats', ownerMiddleware, async (req, res) => {
  try {
    const venues   = await Venue.find({ ownerId: req.user.id });
    const venueIds = venues.map(v => v._id);
    const bookings = await Booking.find({ venueId: { $in: venueIds } }).sort({ createdAt: -1 });
    const revenue  = bookings.filter(b => b.status === 'confirmed').reduce((s, b) => s + b.total, 0);
    res.json({ venues, totalBookings: bookings.length, revenue, bookings });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/owner/requests', ownerMiddleware, async (req, res) => {
  try {
    const venues   = await Venue.find({ ownerId: req.user.id });
    const venueIds = venues.map(v => v._id);
    const requests = await Booking.find({ venueId: { $in: venueIds } }).sort({ createdAt: -1 });
    res.json(requests);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/bookings/:id/status', ownerMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['confirmed','rejected','cancelled'].includes(status))
      return res.status(400).json({ error: 'Invalid status value' });

    // Fetch BEFORE update so we always have the original date/startTime
    const existing = await Booking.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Booking not found' });

    const b = await Booking.findByIdAndUpdate(req.params.id, { status }, { new: true });

    // When confirmed: block the slot date on the venue
    if (status === 'confirmed' && existing.venueId && existing.date && existing.startTime) {
      const venue = await Venue.findById(existing.venueId);
      if (venue) {
        const slot = venue.slots.find(s => s.time === existing.startTime);
        if (slot && !slot.blockedDates.includes(existing.date)) {
          slot.blockedDates.push(existing.date);
        }
        await venue.save();
      }
    }

    // When rejected or cancelled: UNBLOCK the slot so other customers can book
    if ((status === 'rejected' || status === 'cancelled') && existing.venueId && existing.date && existing.startTime) {
      const venue = await Venue.findById(existing.venueId);
      if (venue) {
        const slot = venue.slots.find(s => s.time === existing.startTime);
        if (slot) slot.blockedDates = slot.blockedDates.filter(d => d !== existing.date);
        await venue.save();
      }
    }

    res.json(b);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PAYMENT ROUTE ─────────────────────────────────────────────────────────────
app.patch('/api/bookings/:id/payment', authMiddleware, async (req, res) => {
  try {
    const { paymentType, paymentMethod, advanceAmount } = req.body;
    const b = await Booking.findById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (String(b.userId) !== String(req.user.id))
      return res.status(403).json({ error: 'Not your booking' });
    if (b.status !== 'confirmed')
      return res.status(400).json({ error: 'Booking must be confirmed before payment' });

    if (paymentType === 'cash_on_visit') {
      // Validate: must be done at least 1 day before booking date
      const bookingDate = new Date(b.date);
      const today = new Date(); today.setHours(0,0,0,0);
      const diff = Math.floor((bookingDate - today) / (1000*60*60*24));
      if (diff < 1) return res.status(400).json({ error: 'Cash on Visit must be selected at least 1 day before the booking date' });
      b.paymentType   = 'cash_on_visit';
      b.paymentMethod = 'cash';
      b.paymentStatus = 'unpaid';
      b.cashOnVisitApproved = true;
      b.status        = 'confirmed'; // stays confirmed, paid on visit
    } else if (paymentType === 'advance') {
      const adv = parseFloat(advanceAmount || 0);
      if (adv <= 0 || adv >= b.total) return res.status(400).json({ error: 'Advance must be between ₹1 and total amount' });
      b.paymentType   = 'advance';
      b.paymentMethod = paymentMethod || '';
      b.advanceAmount = adv;
      b.paidAmount    = adv;
      b.paymentStatus = 'advance_paid';
    } else if (paymentType === 'full') {
      b.paymentType   = 'full';
      b.paymentMethod = paymentMethod || '';
      b.paidAmount    = b.total;
      b.paymentStatus = 'fully_paid';
      b.status        = 'paid';
    }
    await b.save();
    res.json(b);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── BLOCK ENTIRE VENUE ───────────────────────────────────────────────────────
app.patch('/api/venues/:id/block', ownerMiddleware, async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    if (String(venue.ownerId) !== String(req.user.id) && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Not your venue' });
    venue.blocked = !!req.body.blocked;
    await venue.save();
    res.json({ ok: true, blocked: venue.blocked });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── BLOCK / UNBLOCK A DATE+TIME-RANGE ────────────────────────────────────────
// body: { date: "YYYY-MM-DD", timeRange: "HH:MM-HH:MM", blocked: true/false }
app.patch('/api/venues/:id/block-range', ownerMiddleware, async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    if (String(venue.ownerId) !== String(req.user.id) && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Not your venue' });
    const { date, timeRange, blocked } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });
    const key = timeRange ? date + '|' + timeRange : date;
    if (!venue.blockedRanges) venue.blockedRanges = [];
    if (blocked) {
      if (!venue.blockedRanges.includes(key)) venue.blockedRanges.push(key);
    } else {
      venue.blockedRanges = venue.blockedRanges.filter(r => r !== key);
    }
    venue.markModified('blockedRanges');
    await venue.save();
    res.json({ ok: true, blockedRanges: venue.blockedRanges });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SUGGEST ALTERNATE SLOT ────────────────────────────────────────────────────
app.patch('/api/bookings/:id/suggest', ownerMiddleware, async (req, res) => {
  try {
    const { suggestedSlot } = req.body;
    const b = await Booking.findByIdAndUpdate(req.params.id, { suggestedSlot }, { new: true });
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    res.json(b);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
//  REVIEW ROUTES
// ═════════════════════════════════════════════════════════════════════════════
app.get('/api/reviews', async (req, res) => {
  try {
    const filter = req.query.venueId ? { venueId: req.query.venueId } : {};
    const reviews = await Review.find(filter).sort({ createdAt: -1 }).limit(20);
    res.json(reviews);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reviews', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    const { venueId, rating, comment } = req.body;
    if (!venueId || !rating) return res.status(400).json({ error: 'Venue and rating required' });
    const user   = await User.findById(req.user.id);
    let photoFile = '';
    if (req.file) photoFile = await saveImage(req.file.buffer);
    const review = await Review.create({ venueId, userId: req.user.id, userName: user?.name, rating, comment, photo: photoFile });
    const allRev = await Review.find({ venueId });
    const avg    = allRev.reduce((s, r) => s + r.rating, 0) / allRev.length;
    await Venue.findByIdAndUpdate(venueId, { rating: Math.round(avg * 10) / 10, reviewCount: allRev.length });
    res.status(201).json(review);
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ═════════════════════════════════════════════════════════════════════════════
//  PUBLIC — HOMEPAGE PHOTOS
// ═════════════════════════════════════════════════════════════════════════════
app.get('/api/homepage-photos', async (req, res) => {
  try {
    const photos = await HomepagePhoto.find({ active: true }).sort({ order: 1, createdAt: -1 });
    res.json(photos);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
//  OWNER APPLICATION (public submit)
// ═════════════════════════════════════════════════════════════════════════════
app.post('/api/owner/apply', upload.array('proofFiles', 10), async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are required' });
    if (await User.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ error: 'Email already registered' });
    if (await OwnerApplication.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ error: 'An application with this email already exists' });

    const hash = await bcrypt.hash(password, 10);

    // Save proof files — images compressed, PDFs saved as-is
    const proofFiles = [];
    for (const f of (req.files || [])) {
      if (f.mimetype === 'application/pdf') {
        const filename = Date.now() + '_' + Math.random().toString(36).slice(2) + '.pdf';
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), f.buffer);
        proofFiles.push({ filename, originalName: f.originalname });
      } else {
        const filename = await saveImage(f.buffer);
        proofFiles.push({ filename, originalName: f.originalname });
      }
    }

    // FIX 2: renamed from `app_` — was shadowing the Express `app` variable
    const ownerApp = await OwnerApplication.create({ name, email: email.toLowerCase(), password: hash, phone, proofFiles });
    res.status(201).json({ ok: true, message: 'Application submitted for review' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
//  SUPER ADMIN ROUTES
// ═════════════════════════════════════════════════════════════════════════════

// GET all owner applications
app.get('/api/admin/owner-applications', superadminMiddleware, async (req, res) => {
  try {
    const apps = await OwnerApplication.find().sort({ createdAt: -1 });
    res.json(apps);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// APPROVE owner application
app.patch('/api/admin/owner-applications/:id/approve', superadminMiddleware, async (req, res) => {
  try {
    const application = await OwnerApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (application.status === 'approved') return res.status(400).json({ error: 'Already approved' });

    // Create the actual user account
    const user = await User.create({
      name:     application.name,
      email:    application.email,
      password: application.password, // already hashed
      phone:    application.phone,
      role:     'owner',
    });
    application.status = 'approved';
    await application.save();

    // Send approval email with login credentials
    await sendMail({
      to: application.email,
      subject: `🎉 Your EVNTLY venue owner application is approved!`,
      html: emailHtml({
        title: "Congratulations — You're Approved!",
        body: `<p>Hi <strong>${application.name}</strong>,</p>
               <p>Great news! Your EVNTLY venue owner application has been <strong style="color:#22c55e">approved</strong>. You can now log in and start listing your venues.</p>
               <table style="background:#f9f5ee;border-radius:8px;padding:16px;width:100%;margin:16px 0">
                 <tr><td style="color:#888;font-size:0.82rem;padding:4px 0">Email</td><td style="font-weight:700;color:#1a1a1a">${application.email}</td></tr>
                 <tr><td style="color:#888;font-size:0.82rem;padding:4px 0">Your password</td><td style="font-weight:700;color:#1a1a1a">The password you set during registration</td></tr>
               </table>
               <p>Head to EVNTLY and click <strong>Sign In</strong> to access your owner dashboard.</p>`,
        btnText: 'Go to EVNTLY →',
        btnUrl: CLIENT_URL,
        footer: 'You can reset your password anytime using the Forgot Password link on the sign-in page.',
      }),
    });

    const token = jwt.sign({ id: user._id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ ok: true, user, token });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// REJECT owner application
app.patch('/api/admin/owner-applications/:id/reject', superadminMiddleware, async (req, res) => {
  try {
    const application = await OwnerApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    application.status = 'rejected';
    application.rejectReason = req.body.reason || '';
    await application.save();

    await sendMail({
      to: application.email,
      subject: `Update on your ${BRAND} venue owner application`,
      html: emailHtml({
        title: 'Application Status Update',
        body: `<p>Hi <strong>${application.name}</strong>,</p>
               <p>Thank you for applying to become a venue owner on EVNTLY. After reviewing your application and the documents you submitted, we were <strong>unable to approve</strong> your application at this time.</p>
               ${req.body.reason ? `<div style="background:#fff5f5;border-left:4px solid #ef4444;padding:12px 16px;border-radius:0 8px 8px 0;margin:16px 0"><strong>Reason:</strong><br>${req.body.reason}</div>` : ''}
               <p>You're welcome to resubmit your application with updated documents or contact us if you have questions.</p>`,
        btnText: 'Reapply →',
        btnUrl: CLIENT_URL + '/#owner-section',
        footer: 'If you believe this is a mistake, please reply to this email.',
      }),
    });

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET all venues (admin)
app.get('/api/admin/venues', superadminMiddleware, async (req, res) => {
  try {
    const venues = await Venue.find().sort({ createdAt: -1 });
    res.json(venues);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE any venue (admin)
app.delete('/api/admin/venues/:id', superadminMiddleware, async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    [...(venue.images || []), venue.coverImage].filter(Boolean).forEach(deleteImageFile);
    await venue.deleteOne();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET all users (admin)
app.get('/api/admin/users', superadminMiddleware, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE any user (admin)
app.delete('/api/admin/users/:id', superadminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'superadmin') return res.status(403).json({ error: 'Cannot delete super admin' });
    await user.deleteOne();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET all bookings (admin)
app.get('/api/admin/bookings', superadminMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 }).limit(200);
    res.json(bookings);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// HOMEPAGE PHOTOS (admin CRUD)
app.get('/api/admin/homepage-photos', superadminMiddleware, async (req, res) => {
  try {
    const photos = await HomepagePhoto.find().sort({ order: 1, createdAt: -1 });
    res.json(photos);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/homepage-photos', superadminMiddleware, upload.single('photo'), async (req, res) => {
  try {
    const { title, caption, order } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    if (!req.file) return res.status(400).json({ error: 'Photo required' });
    const filename = await saveImage(req.file.buffer);
    const photo = await HomepagePhoto.create({ title, caption: caption||'', photo: filename, order: parseInt(order||0), active: true });
    res.status(201).json(photo);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/admin/homepage-photos/:id', superadminMiddleware, async (req, res) => {
  try {
    const photo = await HomepagePhoto.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!photo) return res.status(404).json({ error: 'Not found' });
    res.json(photo);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/homepage-photos/:id', superadminMiddleware, async (req, res) => {
  try {
    const photo = await HomepagePhoto.findById(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Not found' });
    deleteImageFile(photo.photo);
    await photo.deleteOne();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── AUTO-CREATE SUPER ADMIN ON FIRST RUN ────────────────────────
async function ensureSuperAdmin() {
  try {
    const existing = await User.findOne({ role: 'superadmin' });
    if (!existing) {
      const email    = process.env.SUPERADMIN_EMAIL    || 'superadmin@evntly.com';
      const password = process.env.SUPERADMIN_PASSWORD || 'Evntly@SuperAdmin2025';
      const hash     = await bcrypt.hash(password, 10);
      await User.create({ name: 'Super Admin', email, password: hash, role: 'superadmin' });
      console.log('✅ Super Admin created:', email, '| Password:', password);
      console.log('⚠️  Change this password immediately after first login!');
    }
  } catch(e) { console.error('Super admin init error:', e.message); }
}


// ═════════════════════════════════════════════════════════════════════════════
//  FORGOT PASSWORD ROUTES (all users including superadmin)
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/auth/forgot-password
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const user = await User.findOne({ email: email.toLowerCase() });
    // Always return success to prevent email enumeration
    if (!user) return res.json({ ok: true, message: 'If that email exists, a reset link has been sent.' });

    // FIX 3: use top-level crypto instead of inline require('crypto')
    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExp   = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const resetUrl = `${CLIENT_URL}/reset-password.html?token=${token}&email=${encodeURIComponent(user.email)}`;

    await sendMail({
      to: user.email,
      subject: `Reset your ${BRAND} password`,
      html: emailHtml({
        title: 'Password Reset Request',
        body: `<p>Hi <strong>${user.name}</strong>,</p>
               <p>We received a request to reset your EVNTLY password. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
               <p>If you didn't request this, you can safely ignore this email.</p>`,
        btnText: 'Reset My Password →',
        btnUrl: resetUrl,
        footer: `This link will expire in 1 hour. If the button doesn't work, copy this URL: <a href="${resetUrl}" style="color:#c8a96e">${resetUrl}</a>`,
      }),
    });

    res.json({ ok: true, message: 'If that email exists, a reset link has been sent.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/reset-password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, token, password } = req.body;
    if (!email || !token || !password)
      return res.status(400).json({ error: 'Email, token and new password are required' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const user = await User.findOne({
      email:              email.toLowerCase(),
      resetPasswordToken: token,
      resetPasswordExp:   { $gt: new Date() },
    });
    if (!user) return res.status(400).json({ error: 'Reset link is invalid or has expired. Please request a new one.' });

    user.password           = await bcrypt.hash(password, 10);
    user.resetPasswordToken = '';
    user.resetPasswordExp   = null;
    await user.save();

    await sendMail({
      to: user.email,
      subject: `Your ${BRAND} password has been changed`,
      html: emailHtml({
        title: 'Password Changed Successfully',
        body: `<p>Hi <strong>${user.name}</strong>,</p>
               <p>Your EVNTLY password was successfully reset. You can now sign in with your new password.</p>
               <p>If you did not make this change, please contact us immediately.</p>`,
        btnText: 'Sign In to EVNTLY →',
        btnUrl: CLIENT_URL,
      }),
    });

    res.json({ ok: true, message: 'Password reset successfully. You can now sign in.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
//  ADMIN — SEND MESSAGE TO APPLICANT
// ═════════════════════════════════════════════════════════════════════════════
app.post('/api/admin/owner-applications/:id/message', superadminMiddleware, async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });
    const application = await OwnerApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });

    await sendMail({
      to: application.email,
      subject: subject || `Message from ${BRAND} regarding your application`,
      html: emailHtml({
        title: subject || `Message from ${BRAND}`,
        // FIX 4: was a literal newline inside the regex — corrected to \n escape sequence
        body: `<p>Hi <strong>${application.name}</strong>,</p>
               <p>${message.replace(/\n/g, '<br>')}</p>
               <p>If you have questions, please reply to this email.</p>`,
        btnText: 'Update My Application →',
        btnUrl: CLIENT_URL + '/#owner-section',
        footer: `This message was sent by the EVNTLY admin team regarding your venue owner registration application.`,
      }),
    });

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── 404 HANDLER — always return JSON, never HTML ─────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/api/'))
    return res.status(404).json({ error: `No route: ${req.method} ${req.path}` });
  next();
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ error: 'Image too large. Maximum 10MB per file.' });
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// FIX 5: log message now correctly reflects the configured PORT variable
app.listen(PORT, () => console.log(`🚀 EVNTLY running on http://localhost:${PORT}`));
