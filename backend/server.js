// ─────────────────────────────────────────────────────────────────────────────
//  EVNTLY — Express + MongoDB Backend  (server.js)
//  Install: npm install express mongoose cors multer sharp bcryptjs jsonwebtoken dotenv cloudinary multer-storage-cloudinary
//  Run: node server.js
// ─────────────────────────────────────────────────────────────────────────────
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();
console.log("Key ID:", process.env.RAZORPAY_KEY_ID);

// ─── CLOUDINARY CONFIG ────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const PORT       = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'evntly_secret_key_change_in_prod';

// ─── EMAIL TRANSPORTER ───────────────────────────────────────────────────────
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const CLIENT_URL = process.env.CLIENT_URL || 'https://evntly-bf25.vercel.app';
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

// ─── BODY SIZE ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'https://evntly-production-c766.up.railway.app',
      'https://evntly-production-c766.up.railway.app/',
    ];
    if (process.env.CLIENT_URL) allowed.push(process.env.CLIENT_URL);
    if (allowed.includes(origin)) return callback(null, true);
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.options('*', cors());

// ─── STATIC FILES ─────────────────────────────────────────────────────────────
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR, { extensions: ['html'] }));

// ─── MULTER (memory storage — files go to Cloudinary) ─────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp','application/pdf'];
    ok.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only JPG, PNG, WEBP, PDF allowed'));
  },
});

// ─── CLOUDINARY HELPERS ───────────────────────────────────────────────────────
async function uploadToCloudinary(buffer, mimetype, folder = 'evntly') {
  return new Promise((resolve, reject) => {
    const resourceType = mimetype === 'application/pdf' ? 'raw' : 'image';
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        transformation: resourceType === 'image'
          ? [{ width: 2400, height: 1800, crop: 'limit' }, { quality: 'auto:good', fetch_format: 'webp' }]
          : [],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
}

async function deleteFromCloudinary(url) {
  if (!url || !url.includes('cloudinary.com')) return;
  try {
    // Extract public_id from the URL
    const parts = url.split('/');
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex === -1) return;
    // Skip version segment if present (v1234567890)
    let startIndex = uploadIndex + 1;
    if (parts[startIndex] && parts[startIndex].startsWith('v')) startIndex++;
    const publicIdWithExt = parts.slice(startIndex).join('/');
    const publicId = publicIdWithExt.replace(/\.[^/.]+$/, ''); // remove extension
    await cloudinary.uploader.destroy(publicId);
  } catch(e) {
    console.error('Cloudinary delete error:', e.message);
  }
}

// Keep backward compat alias
async function saveImage(buffer, mimetype = 'image/jpeg') {
  return uploadToCloudinary(buffer, mimetype, 'evntly/venues');
}

function deleteImageFile(urlOrFilename) {
  if (!urlOrFilename) return;
  // If it's a Cloudinary URL, delete from Cloudinary
  if (urlOrFilename.startsWith('http')) {
    deleteFromCloudinary(urlOrFilename).catch(() => {});
    return;
  }
  // Legacy: local file (ignore on Vercel, might not exist)
  try {
    const fp = path.join(__dirname, 'uploads', urlOrFilename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch(e) {}
}

// ─── MONGOOSE CONNECT ─────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/evntly')
  .then(async () => { console.log('✅ MongoDB connected'); await ensureSuperAdmin(); await seedDefaultPlans(); })
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
  plan:               { type: String,  default: 'basic' },
  planPaymentStatus:  { type: String,  default: 'unpaid' },
  planPaidAt:         { type: Date },
  planExpiresAt:      { type: Date },
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
  razorpayOrderId:   { type: String, default: '' },
  razorpayPaymentId: { type: String, default: '' },
  paymentType:      { type: String, enum: ['none','advance','full','cash_on_visit'], default: 'none' },
  advanceAmount:    { type: Number, default: 0 },
  paidAmount:       { type: Number, default: 0 },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'advance_paid', 'fully_paid', 'refunded'],
    default: 'unpaid'
  },
  paymentMethod:    { type: String, default: '' },
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

const ownerApplicationSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  email:        { type: String, required: true, unique: true, lowercase: true },
  password:     { type: String, required: true },
  phone:        { type: String, default: '' },
  venueName:    { type: String, default: '' },
  venueAddress: { type: String, default: '' },
  proofFiles:   [{ filename: String, originalName: String }],
  status:       { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  rejectReason: { type: String, default: '' },
  plan:         { type: String, default: 'basic' },
  planPaid:     { type: Boolean, default: false },
  paymentRef:   { type: String, default: '' },
  listingEnabled: { type: Boolean, default: false },
}, { timestamps: true });

const homepagePhotoSchema = new mongoose.Schema({
  title:   { type: String, required: true },
  caption: { type: String, default: '' },
  photo:   { type: String, required: true },
  order:   { type: Number, default: 0 },
  active:  { type: Boolean, default: true },
}, { timestamps: true });

const planChangeRequestSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ownerName:     { type: String, required: true },
  ownerEmail:    { type: String, required: true },
  currentPlan:   { type: String, default: 'basic' },
  requestedPlan: { type: String, required: true },
  status:        { type: String, enum: ['pending','payment_sent','completed'], default: 'pending' },
  paymentSentAt: { type: Date },
  paymentLink:   { type: String, default: '' },
}, { timestamps: true });

const Venue             = mongoose.models.Venue             || mongoose.model('Venue',             venueSchema);
const User              = mongoose.models.User              || mongoose.model('User',              userSchema);
const Booking           = mongoose.models.Booking           || mongoose.model('Booking',           bookingSchema);
const Review            = mongoose.models.Review            || mongoose.model('Review',            reviewSchema);
const OwnerApplication  = mongoose.models.OwnerApplication  || mongoose.model('OwnerApplication',  ownerApplicationSchema);
const HomepagePhoto     = mongoose.models.HomepagePhoto     || mongoose.model('HomepagePhoto',     homepagePhotoSchema);

const platformPlanSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  key:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  price:     { type: Number, required: true, min: 0 },
  maxVenues: { type: Number, default: 1 },
  features:  [{ type: String }],
  isPopular: { type: Boolean, default: false },
  isActive:  { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

const PlatformPlan      = mongoose.models.PlatformPlan      || mongoose.model('PlatformPlan',      platformPlanSchema);
const PlanChangeRequest = mongoose.models.PlanChangeRequest || mongoose.model('PlanChangeRequest', planChangeRequestSchema);
async function seedDefaultPlans() {
  try {
    if (await PlatformPlan.countDocuments() === 0) {
      await PlatformPlan.insertMany([
        { name:'Basic',    key:'basic',    price:4999,  maxVenues:1,  features:['1 venue listing','Standard support','Basic analytics'],                                   isPopular:false, sortOrder:1 },
        { name:'Standard', key:'standard', price:9999,  maxVenues:3,  features:['3 venue listings','Priority support','Advanced analytics','Featured badge'],              isPopular:true,  sortOrder:2 },
        { name:'Premium',  key:'premium',  price:19999, maxVenues:-1, features:['Unlimited venues','Dedicated support','Featured listings','Custom branding'], isPopular:false, sortOrder:3 },
      ]);
      console.log('✅ Default platform plans seeded');
    }
  } catch(e) { console.error('Plan seed error:', e.message); }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function genRef() {
  return 'EVT' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2,5).toUpperCase();
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
app.get('/api/debug/venues', async (req, res) => {
  const all = await Venue.find({}).lean();
  console.log('ALL VENUES:', JSON.stringify(all.map(v => ({
    id: v._id,
    name: v.name,
    isActive: v.isActive
  })), null, 2));
  res.json({ count: all.length, venues: all });
});

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

async function requirePlanPaid(req, res, next) {
  if (req.user.role === 'admin' || req.user.role === 'superadmin') return next();
  try {
    const application = await OwnerApplication.findOne({ email: req.user.email });
    if (!application)
      return res.status(403).json({ error: 'PLAN_NOT_PAID', message: 'No owner application found.' });
    if (!application.listingEnabled)
      return res.status(403).json({ error: 'PLAN_NOT_PAID', message: 'Your account is not yet activated. Complete payment to start listing venues.' });
    next();
  } catch(e) { res.status(500).json({ error: e.message }); }
}

app.post('/api/venues', ownerMiddleware, requirePlanPaid, upload.fields([
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

    let coverImageUrl = '';
    let imageUrls     = [];
    if (req.files?.coverImage?.[0]) {
      coverImageUrl = await uploadToCloudinary(req.files.coverImage[0].buffer, req.files.coverImage[0].mimetype, 'evntly/venues');
    }
    if (req.files?.images) {
      for (const f of req.files.images) {
        imageUrls.push(await uploadToCloudinary(f.buffer, f.mimetype, 'evntly/venues'));
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
      coverImage: coverImageUrl,
      images:    imageUrls,
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

    const errors = [];
    const cap = capacity !== undefined ? parseInt(capacity) : venue.capacity;
    const p1  = price1hr  !== undefined ? parseFloat(price1hr)  : venue.price1hr;
    const pp  = platePrice !== undefined ? parseFloat(platePrice) : venue.platePrice;
    if (name !== undefined && !name?.trim()) errors.push('Venue name cannot be empty');
    if (isNaN(cap) || cap < 1)  errors.push('Capacity must be at least 1');
    if (isNaN(p1)  || p1 < 1)   errors.push('Price (1hr) must be greater than 0');
    if (isNaN(pp)  || pp < 0)   errors.push('Plate price must be ≥ 0');
    if (errors.length) return res.status(400).json({ errors });

    if (removeImages) {
      const toRemove = JSON.parse(removeImages);
      toRemove.forEach(url => deleteImageFile(url));
      venue.images = venue.images.filter(img => !toRemove.includes(img));
    }

    if (req.files?.coverImage?.[0]) {
      deleteImageFile(venue.coverImage);
      venue.coverImage = await uploadToCloudinary(req.files.coverImage[0].buffer, req.files.coverImage[0].mimetype, 'evntly/venues');
    }

    if (req.files?.images) {
      for (const f of req.files.images) {
        venue.images.push(await uploadToCloudinary(f.buffer, f.mimetype, 'evntly/venues'));
      }
    }

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

    const errors = [];
    if (!venueId)   errors.push('Venue is required');
    if (!date)      errors.push('Date is required');
    if (!startTime) errors.push('Time slot is required');
    if (!hours)     errors.push('Duration is required');
    const g = parseInt(guests);
    if (!g || g < 1) errors.push('Number of guests must be at least 1');

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
    const revenue   = bookings.filter(b => b.status === 'confirmed').reduce((s, b) => s + b.total, 0);
    const ownerUser = await User.findById(req.user.id).select('plan planPaymentStatus planPaidAt planExpiresAt listingEnabled email');
    const ownerApp  = ownerUser ? await OwnerApplication.findOne({ email: ownerUser.email }).select('plan planPaid listingEnabled').catch(()=>null) : null;
    const planKey           = (ownerUser&&ownerUser.plan)||(ownerApp&&ownerApp.plan)||'basic';
    const planPaymentStatus = (ownerUser&&ownerUser.planPaymentStatus)||((ownerApp&&ownerApp.planPaid)?'paid':'unpaid');
    res.json({ venues, totalBookings: bookings.length, revenue, bookings,
      plan: planKey, planPaymentStatus,
      planPaidAt:    (ownerUser&&ownerUser.planPaidAt)||null,
      planExpiresAt: (ownerUser&&ownerUser.planExpiresAt)||null,
      listingEnabled:(ownerUser&&ownerUser.listingEnabled)||(ownerApp&&ownerApp.listingEnabled)||false });
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

app.post('/api/owner/plan-change-request', ownerMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan) return res.status(400).json({ error: 'Plan key is required' });
    const ownerUser = await User.findById(req.user.id);
    if (!ownerUser) return res.status(404).json({ error: 'User not found' });
    let planDoc = null;
    try { planDoc = await PlatformPlan.findOne({ key: plan }); } catch(e) {}
    const planLabel    = planDoc ? planDoc.name  : (plan.charAt(0).toUpperCase()+plan.slice(1));
    const planPrice    = planDoc ? planDoc.price : 0;
    const planPriceStr = 'Rs.'+Number(planPrice).toLocaleString('en-IN');
    const pcr = await PlanChangeRequest.create({ userId:ownerUser._id, ownerName:ownerUser.name, ownerEmail:ownerUser.email, currentPlan:ownerUser.plan||'basic', requestedPlan:plan });
    const admins = await User.find({ role:'superadmin' });
    for (const admin of admins) {
      await sendMail({ to:admin.email, subject:'Plan Upgrade Request: '+ownerUser.name+' wants '+planLabel,
        html:emailHtml({ title:'Plan Upgrade Request', body:'<p><strong>'+ownerUser.name+'</strong> ('+ownerUser.email+') wants <strong>'+planLabel+'</strong> ('+planPriceStr+'). Go to Admin Panel → Plan Upgrade Requests.</p>', btnText:'Open Admin Panel', btnUrl:CLIENT_URL+'/admin.html', footer:'EVNTLY notification.' }) });
    }
    await sendMail({ to:ownerUser.email, subject:'Plan Change Request: '+planLabel,
      html:emailHtml({ title:'Request Received', body:'<p>Hi '+ownerUser.name+', your request for <strong>'+planLabel+'</strong> ('+planPriceStr+') received. We will send a payment link within 1-2 business days.</p>', footer:'If not you, ignore this.' }) });
    res.json({ ok:true, requestId:pcr._id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/bookings/:id/status', ownerMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['confirmed','rejected','cancelled'].includes(status))
      return res.status(400).json({ error: 'Invalid status value' });

    const existing = await Booking.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Booking not found' });

    const b = await Booking.findByIdAndUpdate(req.params.id, { status }, { new: true });

    if (status === 'confirmed' && existing.venueId && existing.date && existing.startTime) {
      const venue = await Venue.findById(existing.venueId);
      if (venue) {
        // Legacy slot blocking
        const slot = venue.slots.find(s => s.time === existing.startTime);
        if (slot && !slot.blockedDates.includes(existing.date)) {
          slot.blockedDates.push(existing.date);
        }
        // Block all duration ranges for this startTime on this date
        if (!venue.blockedRanges) venue.blockedRanges = [];
        const tMins = (t) => { const [h,m] = t.split(':').map(Number); return h*60+m; };
        const mTime = (m) => String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
        for (let h = 1; h <= 7; h++) {
          const endTime = mTime(tMins(existing.startTime) + h * 60);
          const key = `${existing.date}|${existing.startTime}-${endTime}`;
          if (!venue.blockedRanges.includes(key)) venue.blockedRanges.push(key);
        }
        venue.markModified('blockedRanges');
        await venue.save();
      }
    }

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

// ═════════════════════════════════════════════════════════════════════════════
//  RAZORPAY
// ═════════════════════════════════════════════════════════════════════════════
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

function verifyRazorpaySignature(orderId, paymentId, signature) {
  const body     = orderId + '|' + paymentId;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');
  return expected === signature;
}

function verifyWebhookSignature(rawBody, signature) {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return expected === signature;
}

function scriptPaymentToken(entityId) {
  return crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(entityId.toString())
    .digest('hex');
}

function verifyPaymentToken(entityId, token) {
  const expected = scriptPaymentToken(entityId);
  return expected === token;
}

app.post('/api/payments/create-order', authMiddleware, async (req, res) => {
  try {
    const { bookingId, paymentType, advanceAmount } = req.body;
    if (!bookingId) return res.status(400).json({ error: 'bookingId is required' });
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (String(booking.userId) !== String(req.user.id)) return res.status(403).json({ error: 'Not your booking' });
    if (booking.status !== 'confirmed') return res.status(400).json({ error: 'Booking must be confirmed before payment' });
    if (booking.paymentStatus === 'fully_paid') return res.status(400).json({ error: 'This booking is already fully paid' });

    const alreadyPaid = booking.paidAmount || 0;
    const remaining   = booking.total - alreadyPaid;
    let amountToPay;
    if (paymentType === 'advance') {
      const adv = parseFloat(advanceAmount || 0);
      if (adv <= 0 || adv >= remaining) return res.status(400).json({ error: 'Advance must be between ₹1 and remaining balance' });
      amountToPay = adv;
    } else {
      amountToPay = remaining;
    }
    if (amountToPay < 1) return res.status(400).json({ error: 'Payment amount must be at least ₹1' });

    const order = await razorpay.orders.create({
      amount:   Math.round(amountToPay * 100),
      currency: 'INR',
      receipt:  booking.ref || booking._id.toString(),
      notes: { bookingId: booking._id.toString(), venueName: booking.venueName || '', customerName: booking.userName || '', paymentType: paymentType || 'full' },
    });

    res.json({ key: process.env.RAZORPAY_KEY_ID, orderId: order.id, amount: order.amount, amountRupees: amountToPay, currency: order.currency, bookingRef: booking.ref, venueName: booking.venueName, paymentType: paymentType || 'full' });
  } catch (e) {
    console.error('Razorpay create-order error:', e);
    res.status(500).json({ error: e.message || 'Failed to create payment order' });
  }
});

app.post('/api/payments/verify', authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId, paymentType, advanceAmount } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !bookingId)
      return res.status(400).json({ error: 'Missing payment verification fields' });
    const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) return res.status(400).json({ error: 'Payment verification failed — invalid signature' });

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (String(booking.userId) !== String(req.user.id)) return res.status(403).json({ error: 'Not your booking' });

    let paidAmountRupees = 0;
    try {
      const payment = await razorpay.payments.fetch(razorpay_payment_id);
      paidAmountRupees = payment.amount / 100;
    } catch (e) {
      paidAmountRupees = parseFloat(advanceAmount || booking.total);
    }

    const alreadyPaid  = booking.paidAmount || 0;
    const newPaidTotal = alreadyPaid + paidAmountRupees;
    const isFullyPaid  = newPaidTotal >= booking.total - 0.01;

    booking.razorpayOrderId   = razorpay_order_id;
    booking.razorpayPaymentId = razorpay_payment_id;
    booking.paymentMethod     = 'razorpay';
    booking.paidAmount        = newPaidTotal;

    if (paymentType === 'advance' && !isFullyPaid) {
      booking.paymentType   = 'advance';
      booking.advanceAmount = paidAmountRupees;
      booking.paymentStatus = 'advance_paid';
    } else {
      booking.paymentType   = 'full';
      booking.paymentStatus = 'fully_paid';
      booking.status        = 'paid';
    }
    await booking.save();

    const user = await User.findById(req.user.id);
    if (user) {
      await sendMail({
        to: user.email,
        subject: `Payment ${isFullyPaid ? 'Confirmed' : 'Advance Received'} — ${booking.venueName}`,
        html: emailHtml({
          title: isFullyPaid ? 'Payment Confirmed!' : 'Advance Payment Received!',
          body: `<p>Hi <strong>${user.name}</strong>,</p><p>Your payment for <strong>${booking.venueName}</strong> has been received.</p>
                 <table style="background:#f9f5ee;border-radius:8px;padding:16px;width:100%;margin:16px 0;border-collapse:collapse">
                   <tr><td style="color:#888;font-size:0.82rem;padding:6px 0">Booking Ref</td><td style="font-weight:700">${booking.ref}</td></tr>
                   <tr><td style="color:#888;font-size:0.82rem;padding:6px 0">Venue</td><td style="font-weight:700">${booking.venueName}</td></tr>
                   <tr><td style="color:#888;font-size:0.82rem;padding:6px 0">Date</td><td style="font-weight:700">${booking.date}</td></tr>
                   <tr><td style="color:#888;font-size:0.82rem;padding:6px 0">Amount Paid</td><td style="font-weight:800;color:#c8a96e;font-size:1.1rem">₹${paidAmountRupees.toLocaleString('en-IN')}</td></tr>
                   ${!isFullyPaid ? `<tr><td style="color:#888;font-size:0.82rem;padding:6px 0">Remaining</td><td style="font-weight:700;color:#8b3a2a">₹${(booking.total - newPaidTotal).toLocaleString('en-IN')}</td></tr>` : ''}
                   <tr><td style="color:#888;font-size:0.82rem;padding:6px 0">Payment ID</td><td style="font-family:monospace;font-size:0.82rem;color:#555">${razorpay_payment_id}</td></tr>
                 </table>
                 <p>${isFullyPaid ? 'Your booking is fully confirmed!' : 'Bring the remaining balance on the day of your event.'}</p>`,
          btnText: 'View Booking →', btnUrl: CLIENT_URL,
          footer: `Keep this as your receipt. Payment ID: ${razorpay_payment_id}`,
        }),
      });
    }
    res.json({ ok: true, booking, paidAmount: paidAmountRupees, paymentId: razorpay_payment_id });
  } catch (e) {
    console.error('Razorpay verify error:', e);
    res.status(500).json({ error: e.message || 'Payment verification failed' });
  }
});

app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) return res.status(400).json({ error: 'Missing signature' });
    if (!verifyWebhookSignature(req.body, signature)) {
      console.warn('⚠️  Razorpay webhook: invalid signature');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }
    const event = JSON.parse(req.body.toString());
    console.log('📣 Razorpay webhook event:', event.event);

    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const bookingId = (payment.notes || {}).bookingId;
      if (bookingId) {
        const booking = await Booking.findById(bookingId);
        if (booking && booking.paymentStatus !== 'fully_paid') {
          const paidRupees = payment.amount / 100;
          const newTotal   = (booking.paidAmount || 0) + paidRupees;
          const isFullyPaid = newTotal >= booking.total - 0.01;
          booking.razorpayPaymentId = payment.id;
          booking.paidAmount        = newTotal;
          booking.paymentMethod     = 'razorpay';
          if (isFullyPaid) { booking.paymentStatus = 'fully_paid'; booking.status = 'paid'; }
          else booking.paymentStatus = 'advance_paid';
          await booking.save();
        }
      }
    }
    if (event.event === 'payment.failed') {
      console.warn('❌ Razorpay payment failed:', event.payload.payment.entity.id);
    }
    if (event.event === 'refund.processed') {
      const bookingId = (event.payload.payment?.entity?.notes || {}).bookingId;
      if (bookingId) await Booking.findByIdAndUpdate(bookingId, { paymentStatus: 'refunded', status: 'cancelled' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('Razorpay webhook error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/payments/refund/:bookingId', ownerMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!booking.razorpayPaymentId) return res.status(400).json({ error: 'No Razorpay payment found for this booking' });
    if (booking.paymentStatus === 'refunded') return res.status(400).json({ error: 'Already refunded' });

    const venue = await Venue.findOne({ _id: booking.venueId, ownerId: req.user.id });
    if (!venue && req.user.role !== 'superadmin') return res.status(403).json({ error: 'Not your booking' });

    const refundAmount = Math.round((booking.paidAmount || 0) * 100);
    if (refundAmount < 100) return res.status(400).json({ error: 'Refund amount too small' });

    const refund = await razorpay.payments.refund(booking.razorpayPaymentId, {
      amount: refundAmount,
      notes:  { reason: req.body.reason || 'Booking cancelled', bookingRef: booking.ref },
    });

    booking.paymentStatus = 'refunded';
    booking.status        = 'cancelled';
    await booking.save();

    const customer = await User.findById(booking.userId);
    if (customer) {
      await sendMail({
        to: customer.email,
        subject: `Refund Processed — ${booking.venueName}`,
        html: emailHtml({
          title: 'Refund Processed',
          body: `<p>Hi <strong>${customer.name}</strong>,</p>
                 <p>Your refund of <strong>₹${(refundAmount / 100).toLocaleString('en-IN')}</strong> for <strong>${booking.venueName}</strong> (Ref: ${booking.ref}) has been processed.</p>
                 <p>Amount will be credited within 5–7 business days.</p>`,
          footer: `Refund ID: ${refund.id}`,
        }),
      });
    }
    res.json({ ok: true, refundId: refund.id, amount: refundAmount / 100 });
  } catch (e) {
    console.error('Razorpay refund error:', e);
    res.status(500).json({ error: e.message || 'Refund failed' });
  }
});

app.post('/api/admin/owner-applications/:id/create-razorpay-order', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || !verifyPaymentToken(req.params.id, token)) return res.status(403).json({ error: 'Invalid or expired payment link' });
    const application = await OwnerApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (application.planPaid) return res.status(400).json({ error: 'This application has already been paid' });
    if (application.status !== 'approved') return res.status(400).json({ error: 'Application has not been approved yet' });
    const planDoc = await PlatformPlan.findOne({ key: application.plan || 'basic' });
    const amount  = planDoc ? planDoc.price : 4999;
    const order = await razorpay.orders.create({ amount: Math.round(amount * 100), currency: 'INR', receipt: application._id.toString(), notes: { applicationId: application._id.toString(), applicantName: application.name, plan: application.plan || 'basic', type: 'owner_activation' } });
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/owner-applications/:id/confirm-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, token, paymentRef } = req.body;
    if (razorpay_order_id && razorpay_payment_id && razorpay_signature) {
      if (!token || !verifyPaymentToken(req.params.id, token)) return res.status(403).json({ error: 'Invalid payment token' });
      const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
      if (!isValid) return res.status(400).json({ error: 'Payment signature verification failed' });
    }
    const application = await OwnerApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (application.planPaid) return res.json({ ok: true, already: true, message: 'Already paid' });
    if (application.status !== 'approved') return res.status(400).json({ error: 'Application has not been approved yet.' });

    application.planPaid       = true;
    application.listingEnabled = true;
    application.paymentRef     = razorpay_payment_id || paymentRef || 'TXN_' + Date.now();
    await application.save();

    let user = await User.findOne({ email: application.email });
    if (!user) user = await User.create({ name: application.name, email: application.email, password: application.password, phone: application.phone, role: 'owner' });

    const paidNow = new Date();
    const expiryDate = new Date(paidNow);
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    await User.findByIdAndUpdate(user._id, { plan: application.plan || 'basic', planPaymentStatus: 'paid', planPaidAt: paidNow, planExpiresAt: expiryDate, listingEnabled: true });

    const planDoc = await PlatformPlan.findOne({ key: application.plan || 'basic' });
    await sendMail({
      to: application.email,
      subject: `🎉 Welcome to EVNTLY — Your account is now active!`,
      html: emailHtml({
        title: 'Payment Confirmed — Account Activated!',
        body: `<p>Hi <strong>${application.name}</strong>,</p><p>Your EVNTLY venue owner account is now <strong style="color:#22c55e">fully activated</strong>!</p>
               <table style="background:#f9f5ee;border-radius:8px;padding:16px;width:100%;margin:16px 0;border-collapse:collapse">
                 <tr><td style="color:#888;font-size:0.82rem;padding:6px 0">Login Email</td><td style="font-weight:700;color:#1a1a1a">${application.email}</td></tr>
                 <tr><td style="color:#888;font-size:0.82rem;padding:6px 0">Plan</td><td style="font-weight:700;color:#c8a96e">${planDoc?.name || application.plan}</td></tr>
                 <tr><td style="color:#888;font-size:0.82rem;padding:6px 0">Payment Ref</td><td style="font-family:monospace;color:#555;font-size:0.82rem">${application.paymentRef}</td></tr>
               </table>`,
        btnText: 'Sign In & List Your Venue →', btnUrl: CLIENT_URL,
        footer: 'Keep this email as your payment receipt. Ref: ' + application.paymentRef,
      }),
    });
    res.json({ ok: true, message: 'Payment confirmed — login credentials sent to your email' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/plan-change-requests/:id/create-razorpay-order', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || !verifyPaymentToken(req.params.id, token)) return res.status(403).json({ error: 'Invalid or expired payment link' });
    const pcr = await PlanChangeRequest.findById(req.params.id);
    if (!pcr) return res.status(404).json({ error: 'Plan change request not found' });
    if (pcr.status === 'completed') return res.status(400).json({ error: 'This plan upgrade has already been paid' });
    const planDoc = await PlatformPlan.findOne({ key: pcr.requestedPlan }).catch(() => null);
    const amount  = planDoc ? planDoc.price : 0;
    if (amount < 1) return res.status(400).json({ error: 'Invalid plan amount' });
    const order = await razorpay.orders.create({ amount: Math.round(amount * 100), currency: 'INR', receipt: pcr._id.toString(), notes: { pcrId: pcr._id.toString(), userId: pcr.userId.toString(), plan: pcr.requestedPlan, type: 'plan_upgrade' } });
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/plan-change-requests/:id/confirm-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, token, paymentRef } = req.body;
    if (razorpay_order_id && razorpay_payment_id && razorpay_signature) {
      if (!token || !verifyPaymentToken(req.params.id, token)) return res.status(403).json({ error: 'Invalid payment token' });
      const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
      if (!isValid) return res.status(400).json({ error: 'Payment signature verification failed' });
    }
    const pcr = await PlanChangeRequest.findById(req.params.id);
    if (!pcr) return res.status(404).json({ error: 'Plan change request not found' });
    if (pcr.status === 'completed') return res.json({ ok: true, already: true });
    pcr.status = 'completed'; await pcr.save();
    const ref = razorpay_payment_id || paymentRef || 'TXN_' + Date.now();
    const paidNow = new Date(), expiry = new Date(paidNow);
    expiry.setFullYear(expiry.getFullYear() + 1);
    await User.findByIdAndUpdate(pcr.userId, { plan: pcr.requestedPlan, planPaymentStatus: 'paid', planPaidAt: paidNow, planExpiresAt: expiry });
    const planDoc  = await PlatformPlan.findOne({ key: pcr.requestedPlan }).catch(() => null);
    const planName = planDoc ? planDoc.name : pcr.requestedPlan;
    const planPrice = planDoc ? planDoc.price : 0;
    const expStr   = expiry.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    await sendMail({
      to: pcr.ownerEmail, subject: `Plan Upgraded: ${planName}`,
      html: emailHtml({ title: 'Plan Upgrade Confirmed!', body: `<p>Hi <strong>${pcr.ownerName}</strong>, your plan is now <strong style="color:#c8a96e">${planName}</strong>!</p>
               <table style="background:#f9f5ee;border-radius:8px;padding:16px;width:100%;margin:16px 0">
                 <tr><td style="color:#888">Plan</td><td style="font-weight:700;color:#c8a96e">${planName}</td></tr>
                 <tr><td style="color:#888">Amount</td><td>₹${Number(planPrice).toLocaleString('en-IN')}</td></tr>
                 <tr><td style="color:#888">Valid Until</td><td style="font-weight:700">${expStr}</td></tr>
                 <tr><td style="color:#888">Ref</td><td style="font-family:monospace">${ref}</td></tr>
               </table>`, btnText: 'Go to Dashboard', btnUrl: CLIENT_URL, footer: `Receipt ref: ${ref}` }),
    });
    res.json({ ok: true, planName, planExpiresAt: expiry });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ── OWNER: MARK BOOKING AS MANUALLY PAID ─────────────────────────────────────
app.patch('/api/bookings/:id/mark-paid', ownerMiddleware, async (req, res) => {
  try {
    const b = await Booking.findById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    const venue = await Venue.findOne({ _id: b.venueId, ownerId: req.user.id });
    if (!venue && req.user.role !== 'superadmin')
      return res.status(403).json({ error: 'Not your venue' });
    b.paymentType   = 'full';
    b.paymentMethod = req.body.paymentMethod || 'cash';
    b.paidAmount    = b.total;
    b.paymentStatus = 'fully_paid';
    b.status        = 'paid';
    await b.save();
    res.json(b);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.patch('/api/bookings/:id/payment', authMiddleware, async (req, res) => {
  try {
    const { paymentType, paymentMethod, advanceAmount } = req.body;
    const b = await Booking.findById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (String(b.userId) !== String(req.user.id)) return res.status(403).json({ error: 'Not your booking' });
    if (b.status !== 'confirmed') return res.status(400).json({ error: 'Booking must be confirmed before payment' });

    if (paymentType === 'cash_on_visit') {
      const bookingDate = new Date(b.date), today = new Date(); today.setHours(0,0,0,0);
      const diff = Math.floor((bookingDate - today) / (1000*60*60*24));
      if (diff < 1) return res.status(400).json({ error: 'Cash on Visit must be selected at least 1 day before the booking date' });
      b.paymentType = 'cash_on_visit'; b.paymentMethod = 'cash'; b.paymentStatus = 'unpaid'; b.cashOnVisitApproved = true; b.status = 'confirmed';
    } else if (paymentType === 'advance') {
      const adv = parseFloat(advanceAmount || 0);
      if (adv <= 0 || adv >= b.total) return res.status(400).json({ error: 'Advance must be between ₹1 and total amount' });
      b.paymentType = 'advance'; b.paymentMethod = paymentMethod || ''; b.advanceAmount = adv; b.paidAmount = adv; b.paymentStatus = 'advance_paid';
    } else if (paymentType === 'full') {
      b.paymentType = 'full'; b.paymentMethod = paymentMethod || ''; b.paidAmount = b.total; b.paymentStatus = 'fully_paid'; b.status = 'paid';
    }
    await b.save();
    res.json(b);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/venues/:id/block', ownerMiddleware, async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    if (String(venue.ownerId) !== String(req.user.id) && req.user.role !== 'admin') return res.status(403).json({ error: 'Not your venue' });
    venue.blocked = !!req.body.blocked;
    await venue.save();
    res.json({ ok: true, blocked: venue.blocked });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/venues/:id/block-range', ownerMiddleware, async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    if (String(venue.ownerId) !== String(req.user.id) && req.user.role !== 'admin') return res.status(403).json({ error: 'Not your venue' });
    const { date, timeRange, blocked } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });
    const key = timeRange ? date + '|' + timeRange : date;
    if (!venue.blockedRanges) venue.blockedRanges = [];
    if (blocked) { if (!venue.blockedRanges.includes(key)) venue.blockedRanges.push(key); }
    else venue.blockedRanges = venue.blockedRanges.filter(r => r !== key);
    venue.markModified('blockedRanges');
    await venue.save();
    res.json({ ok: true, blockedRanges: venue.blockedRanges });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

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
    let photoUrl = '';
    if (req.file) photoUrl = await uploadToCloudinary(req.file.buffer, req.file.mimetype, 'evntly/reviews');
    const review = await Review.create({ venueId, userId: req.user.id, userName: user?.name, rating, comment, photo: photoUrl });
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
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
    if (await User.findOne({ email: email.toLowerCase() })) return res.status(400).json({ error: 'Email already registered' });
    if (await OwnerApplication.findOne({ email: email.toLowerCase() })) return res.status(400).json({ error: 'An application with this email already exists' });

    const hash = await bcrypt.hash(password, 10);
    const proofFiles = [];
    for (const f of (req.files || [])) {
      const url = await uploadToCloudinary(f.buffer, f.mimetype, 'evntly/proof-files');
      proofFiles.push({ filename: url, originalName: f.originalname });
    }

    const plan = req.body.plan || 'basic';
    await OwnerApplication.create({ name, email: email.toLowerCase(), password: hash, phone, proofFiles, plan, venueName: req.body.venueName || '', venueAddress: req.body.venueAddress || '' });
    res.status(201).json({ ok: true, message: 'Application submitted for review' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
//  SUPER ADMIN ROUTES
// ═════════════════════════════════════════════════════════════════════════════
app.get('/api/admin/owner-applications', superadminMiddleware, async (req, res) => {
  try { res.json(await OwnerApplication.find().sort({ createdAt: -1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/admin/owner-applications/:id/approve', superadminMiddleware, async (req, res) => {
  try {
    const application = await OwnerApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (application.status === 'approved') return res.status(400).json({ error: 'Already approved' });
    application.status = 'approved';
    await application.save();
    await sendMail({
      to: application.email, subject: `✅ Your EVNTLY application is approved — complete payment to activate`,
      html: emailHtml({ title: "Application Approved!", body: `<p>Hi <strong>${application.name}</strong>,</p><p>🎉 Your EVNTLY venue owner application has been <strong style="color:#22c55e">approved</strong>! The admin will send you a payment link shortly.</p>`, btnText: 'Visit EVNTLY →', btnUrl: CLIENT_URL, footer: 'If you do not receive a payment link within 24 hours, please contact us.' }),
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/admin/owner-applications/:id/reject', superadminMiddleware, async (req, res) => {
  try {
    const application = await OwnerApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    application.status = 'rejected'; application.rejectReason = req.body.reason || '';
    await application.save();
    await sendMail({
      to: application.email, subject: `Update on your ${BRAND} venue owner application`,
      html: emailHtml({ title: 'Application Status Update', body: `<p>Hi <strong>${application.name}</strong>,</p><p>Thank you for applying. After reviewing your application, we were <strong>unable to approve</strong> it at this time.</p>${req.body.reason ? `<div style="background:#fff5f5;border-left:4px solid #ef4444;padding:12px 16px;border-radius:0 8px 8px 0;margin:16px 0"><strong>Reason:</strong><br>${req.body.reason}</div>` : ''}<p>You're welcome to resubmit with updated documents.</p>`, btnText: 'Reapply →', btnUrl: CLIENT_URL + '/#owner-section', footer: 'If you believe this is a mistake, please reply to this email.' }),
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/venues', superadminMiddleware, async (req, res) => {
  try { res.json(await Venue.find().sort({ createdAt: -1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/venues/:id', superadminMiddleware, async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    [...(venue.images || []), venue.coverImage].filter(Boolean).forEach(deleteImageFile);
    await venue.deleteOne();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', superadminMiddleware, async (req, res) => {
  try { res.json(await User.find().select('-password').sort({ createdAt: -1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id', superadminMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'superadmin') return res.status(403).json({ error: 'Cannot delete super admin' });
    await user.deleteOne(); res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/bookings', superadminMiddleware, async (req, res) => {
  try { res.json(await Booking.find().sort({ createdAt: -1 }).limit(200)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/homepage-photos', superadminMiddleware, async (req, res) => {
  try { res.json(await HomepagePhoto.find().sort({ order: 1, createdAt: -1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/homepage-photos', superadminMiddleware, upload.single('photo'), async (req, res) => {
  try {
    const { title, caption, order } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    if (!req.file) return res.status(400).json({ error: 'Photo required' });
    const photoUrl = await uploadToCloudinary(req.file.buffer, req.file.mimetype, 'evntly/homepage');
    const photo = await HomepagePhoto.create({ title, caption: caption||'', photo: photoUrl, order: parseInt(order||0), active: true });
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
//  FORGOT / RESET PASSWORD
// ═════════════════════════════════════════════════════════════════════════════
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ ok: true, message: 'If that email exists, a reset link has been sent.' });
    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExp   = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const resetUrl = `${CLIENT_URL}/reset-password.html?token=${token}&email=${encodeURIComponent(user.email)}`;
    await sendMail({
      to: user.email, subject: `Reset your ${BRAND} password`,
      html: emailHtml({ title: 'Password Reset Request', body: `<p>Hi <strong>${user.name}</strong>,</p><p>Click below to reset your password. This link expires in <strong>1 hour</strong>.</p>`, btnText: 'Reset My Password →', btnUrl: resetUrl, footer: `This link will expire in 1 hour. Copy if button fails: <a href="${resetUrl}" style="color:#c8a96e">${resetUrl}</a>` }),
    });
    res.json({ ok: true, message: 'If that email exists, a reset link has been sent.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, token, password } = req.body;
    if (!email || !token || !password) return res.status(400).json({ error: 'Email, token and new password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const user = await User.findOne({ email: email.toLowerCase(), resetPasswordToken: token, resetPasswordExp: { $gt: new Date() } });
    if (!user) return res.status(400).json({ error: 'Reset link is invalid or has expired. Please request a new one.' });
    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = ''; user.resetPasswordExp = null;
    await user.save();
    await sendMail({
      to: user.email, subject: `Your ${BRAND} password has been changed`,
      html: emailHtml({ title: 'Password Changed Successfully', body: `<p>Hi <strong>${user.name}</strong>,</p><p>Your EVNTLY password was successfully reset.</p>`, btnText: 'Sign In to EVNTLY →', btnUrl: CLIENT_URL }),
    });
    res.json({ ok: true, message: 'Password reset successfully. You can now sign in.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/owner-applications/:id/message', superadminMiddleware, async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });
    const application = await OwnerApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    await sendMail({ to: application.email, subject: subject || `Message from ${BRAND} regarding your application`, html: emailHtml({ title: subject || `Message from ${BRAND}`, body: `<p>Hi <strong>${application.name}</strong>,</p><p>${message.replace(/\n/g, '<br>')}</p>`, btnText: 'Update My Application →', btnUrl: CLIENT_URL + '/#owner-section', footer: `Sent by the EVNTLY admin team.` }) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/owner-applications/:id/send-payment-link', superadminMiddleware, async (req, res) => {
  try {
    const application = await OwnerApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (application.status !== 'approved') return res.status(400).json({ error: 'Application must be approved first' });
    const planKey = application.plan || 'basic';
    const planDoc = await PlatformPlan.findOne({ key: planKey }) || { name: planKey.charAt(0).toUpperCase()+planKey.slice(1), price: 4999, maxVenues: 1 };
    const token = scriptPaymentToken(application._id);
    const paymentLink = `${CLIENT_URL}/payment-confirm.html?appId=${application._id}&token=${token}&plan=${encodeURIComponent(planDoc.name)}&amount=${planDoc.price}&email=${encodeURIComponent(application.email)}`;
    const maxVLabel = planDoc.maxVenues === -1 ? 'Unlimited venues' : planDoc.maxVenues + ' venue listing(s)';
    await sendMail({
      to: application.email, subject: `💳 Complete your EVNTLY ${planDoc.name} Plan payment`,
      html: emailHtml({ title: 'Complete Your Platform Fee Payment', body: `<p>Hi <strong>${application.name}</strong>,</p><p>🎉 Your application has been <strong style="color:#22c55e">approved</strong>! Complete the one-time platform fee to activate your account.</p>
               <table style="background:#f9f5ee;border-radius:8px;padding:16px;width:100%;margin:16px 0">
                 <tr><td style="color:#888;font-size:0.82rem;padding:6px 0">Plan</td><td style="font-weight:700;color:#1a1a1a">${planDoc.name}</td></tr>
                 <tr><td style="color:#888;font-size:0.82rem;padding:6px 0">Amount</td><td style="font-weight:800;color:#c8a96e;font-size:1.2rem">₹${planDoc.price.toLocaleString('en-IN')}</td></tr>
                 <tr><td style="color:#888;font-size:0.82rem;padding:6px 0">Access</td><td style="font-weight:700;color:#22c55e">${maxVLabel}</td></tr>
               </table>`, btnText: `Pay ₹${planDoc.price.toLocaleString('en-IN')} & Activate Account →`, btnUrl: paymentLink, footer: 'This payment link is valid for 48 hours.' }),
    });
    res.json({ ok: true, message: 'Payment link sent to ' + application.email, paymentLink });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/owner-applications/:id', superadminMiddleware, async (req, res) => {
  try {
    const application = await OwnerApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ error: 'Not found' });
    res.json(application);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/admin/owner-applications/:id/mark-paid', superadminMiddleware, async (req, res) => {
  try {
    const application = await OwnerApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ error: 'Not found' });
    application.planPaid = true; application.listingEnabled = true;
    application.paymentRef = req.body.paymentRef || 'MANUAL_' + Date.now();
    await application.save();
    let user = await User.findOne({ email: application.email });
    if (!user) user = await User.create({ name: application.name, email: application.email, password: application.password, phone: application.phone, role: 'owner' });
    await sendMail({
      to: application.email, subject: `✅ Your EVNTLY account is now active!`,
      html: emailHtml({ title: 'Account Activated!', body: `<p>Hi <strong>${application.name}</strong>,</p><p>Your EVNTLY venue owner account is now <strong style="color:#22c55e">fully activated</strong>. Sign in with your registered email and password to start listing venues.</p>
               <table style="background:#f9f5ee;border-radius:8px;padding:16px;width:100%;margin:16px 0;border-collapse:collapse">
                 <tr><td style="color:#888;font-size:0.82rem;padding:6px 0">Email</td><td style="font-weight:700;color:#1a1a1a">${application.email}</td></tr>
                 <tr><td style="color:#888;font-size:0.82rem;padding:6px 0">Plan</td><td style="font-weight:700;color:#c8a96e">${(application.plan||'basic').toUpperCase()}</td></tr>
                 <tr><td style="color:#888;font-size:0.82rem;padding:6px 0">Payment Ref</td><td style="font-family:monospace;color:#555">${application.paymentRef}</td></tr>
               </table>`, btnText: 'Sign In to EVNTLY →', btnUrl: CLIENT_URL }),
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
//  PLATFORM PLAN ROUTES
// ═════════════════════════════════════════════════════════════════════════════
app.get('/api/plans', async (req, res) => {
  try { res.json(await PlatformPlan.find({ isActive: true }).sort({ sortOrder: 1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/plans', superadminMiddleware, async (req, res) => {
  try { res.json(await PlatformPlan.find().sort({ sortOrder: 1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/plans', superadminMiddleware, async (req, res) => {
  try {
    const { name, key, price, maxVenues, features, isPopular, sortOrder } = req.body;
    if (!name || !key) return res.status(400).json({ error: 'Name and key are required' });
    if (await PlatformPlan.findOne({ key: key.toLowerCase() })) return res.status(400).json({ error: 'A plan with this key already exists' });
    const plan = await PlatformPlan.create({ name, key: key.toLowerCase().replace(/\s+/g,'_'), price: parseFloat(price)||0, maxVenues: parseInt(maxVenues)||1, features: Array.isArray(features)?features:String(features||'').split('\n').map(f=>f.trim()).filter(Boolean), isPopular: !!isPopular, sortOrder: parseInt(sortOrder)||0, isActive: true });
    res.status(201).json(plan);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/plans/:id', superadminMiddleware, async (req, res) => {
  try {
    const { name, price, maxVenues, features, isPopular, sortOrder, isActive } = req.body;
    const upd = {};
    if (name      !== undefined) upd.name      = name;
    if (price     !== undefined) upd.price     = parseFloat(price)||0;
    if (maxVenues !== undefined) upd.maxVenues = parseInt(maxVenues)||1;
    if (isPopular !== undefined) upd.isPopular = !!isPopular;
    if (sortOrder !== undefined) upd.sortOrder = parseInt(sortOrder)||0;
    if (isActive  !== undefined) upd.isActive  = !!isActive;
    if (features  !== undefined) upd.features  = Array.isArray(features)?features:String(features).split('\n').map(f=>f.trim()).filter(Boolean);
    const plan = await PlatformPlan.findByIdAndUpdate(req.params.id, upd, { new: true });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json(plan);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/plans/:id', superadminMiddleware, async (req, res) => {
  try {
    const plan = await PlatformPlan.findByIdAndDelete(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/plan-change-requests', superadminMiddleware, async (req,res) => {
  try { res.json(await PlanChangeRequest.find().sort({createdAt:-1})); } catch(e){ res.status(500).json({error:e.message}); }
});

app.post('/api/admin/plan-change-requests/:id/send-payment-link', superadminMiddleware, async (req,res) => {
  try {
    const pcr = await PlanChangeRequest.findById(req.params.id);
    if (!pcr) return res.status(404).json({error:'Not found'});
    const planDoc = await PlatformPlan.findOne({key:pcr.requestedPlan}).catch(()=>null) || {name:pcr.requestedPlan, price:0, maxVenues:1};
    const token = scriptPaymentToken(pcr._id);
    const paymentLink = `${CLIENT_URL}/payment-confirm.html?pcrId=${pcr._id}&token=${token}&plan=${encodeURIComponent(planDoc.name)}&amount=${planDoc.price}&email=${encodeURIComponent(pcr.ownerEmail)}`;
    await sendMail({ to:pcr.ownerEmail, subject:'Plan Upgrade Payment Link: '+planDoc.name, html:emailHtml({ title:'Complete Your Plan Upgrade', body:'<p>Hi <strong>'+pcr.ownerName+'</strong>, your upgrade to <strong>'+planDoc.name+'</strong> has been approved. Click below to pay and activate.</p>', btnText:'Pay & Upgrade', btnUrl:paymentLink, footer:'Link valid 48 hours.' }) });
    pcr.status='payment_sent'; pcr.paymentSentAt=new Date(); pcr.paymentLink=paymentLink; await pcr.save();
    res.json({ok:true, paymentLink});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.patch('/api/admin/plan-change-requests/:id/complete', superadminMiddleware, async (req,res) => {
  try {
    const pcr = await PlanChangeRequest.findById(req.params.id);
    if (!pcr) return res.status(404).json({error:'Not found'});
    pcr.status='completed'; await pcr.save();
    const paidNow=new Date(), expiry=new Date(paidNow); expiry.setFullYear(expiry.getFullYear()+1);
    await User.findByIdAndUpdate(pcr.userId,{plan:pcr.requestedPlan,planPaymentStatus:'paid',planPaidAt:paidNow,planExpiresAt:expiry}).catch(()=>{});
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.delete('/api/admin/plan-change-requests/:id', superadminMiddleware, async (req,res) => {
  try { await PlanChangeRequest.findByIdAndDelete(req.params.id); res.json({ok:true}); }
  catch(e){ res.status(500).json({error:e.message}); }
});

// ─── OWNER REPORTS ────────────────────────────────────────────────────────────
async function getOwnerBookings(ownerId, { from, to, venueId, status }={}) {
  const venues = await Venue.find({ ownerId });
  const ids    = venueId ? [venueId] : venues.map(v=>v._id);
  const q = { venueId:{ $in:ids } };
  if (from||to) { q.date={}; if(from) q.date.$gte=from; if(to) q.date.$lte=to; }
  if (status&&status!=='all') q.status=status;
  return { venues, bookings: await Booking.find(q).sort({date:1,createdAt:1}) };
}

app.get('/api/owner/reports/summary', ownerMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;
    const { venues } = await getOwnerBookings(req.user.id, {});
    const venueIds = venues.map(v => v._id);

    const all = await Booking.find({ venueId: { $in: venueIds } });

    // Push the date filter into MongoDB itself — works for both Date objects and strings
    const query = { venueId: { $in: venueIds } };
    if (from || to) {
      query.$or = [
        // If stored as Date object
        {
          date: {
            ...(from ? { $gte: new Date(from) } : {}),
            ...(to   ? { $lte: new Date(to + 'T23:59:59.999Z') } : {}),
          }
        },
        // If stored as YYYY-MM-DD string
        {
          date: {
            ...(from ? { $gte: from } : {}),
            ...(to   ? { $lte: to }   : {}),
          }
        }
      ];
    }

    const bookings = await Booking.find(query);

    const paid = bookings.filter(b => ['confirmed', 'paid'].includes(b.status));
    const revenue = paid.reduce((s, b) => s + (b.total || 0), 0);

    // Month-over-month always uses full unfiltered set
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const thisMonth = all.filter(b => {
      const d = new Date(b.date);
      return d >= thisMonthStart && ['confirmed', 'paid'].includes(b.status);
    });

    const lastMonth = all.filter(b => {
      const d = new Date(b.date);
      return d >= lastMonthStart && d <= lastMonthEnd && ['confirmed', 'paid'].includes(b.status);
    });

    const thisRev = thisMonth.reduce((s, b) => s + (b.total || 0), 0);
    const lastRev = lastMonth.reduce((s, b) => s + (b.total || 0), 0);
    const growth  = lastRev > 0
      ? Math.round((thisRev - lastRev) / lastRev * 100)
      : (thisRev > 0 ? 100 : 0);

    const venueRevMap = {};
    paid.forEach(b => {
      const key = String(b.venueId);
      venueRevMap[key] = (venueRevMap[key] || 0) + (b.total || 0);
    });
    const topVenue = [...venues].sort(
      (a, b) => (venueRevMap[String(b._id)] || 0) - (venueRevMap[String(a._id)] || 0)
    )[0];

    res.json({
      totalRevenue:      revenue,
      totalBookings:     bookings.length,
      confirmedBookings: paid.length,
      pendingBookings:   bookings.filter(b => b.status === 'pending').length,
      cancelledBookings: bookings.filter(b => ['rejected', 'cancelled'].includes(b.status)).length,
      venueCount:        venues.length,
      avgBookingValue:   paid.length ? Math.round(revenue / paid.length) : 0,
      conversionRate:    bookings.length ? Math.round(paid.length / bookings.length * 100) : 0,
      thisMonthRevenue:  thisRev,
      lastMonthRevenue:  lastRev,
      revenueGrowth:     growth,
      topVenue:          topVenue ? topVenue.name : '',
    });

  } catch (e) {
    console.error('Summary error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/owner/reports/revenue', ownerMiddleware, async (req,res) => {
  try {
    const {from,to,venueId,groupBy='month'} = req.query;
    const {venues,bookings} = await getOwnerBookings(req.user.id,{from,to,venueId});
    const paid=bookings.filter(b=>['confirmed','paid'].includes(b.status));
    const groups={};
    paid.forEach(b=>{ const d=new Date(b.date); let key; if(groupBy==='day') key=b.date; else if(groupBy==='year') key=String(d.getFullYear()); else key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); if(!groups[key]) groups[key]={period:key,revenue:0,bookings:0,avgBookingValue:0}; groups[key].revenue+=(b.total||0); groups[key].bookings+=1; });
    Object.values(groups).forEach(g=>{g.avgBookingValue=g.bookings?Math.round(g.revenue/g.bookings):0;});
    const series=Object.values(groups).sort((a,b)=>a.period.localeCompare(b.period));
    const totalRev=paid.reduce((s,b)=>s+(b.total||0),0);
    const byVenue={};
    paid.forEach(b=>{ if(!byVenue[b.venueName]) byVenue[b.venueName]={venue:b.venueName,revenue:0,bookings:0}; byVenue[b.venueName].revenue+=(b.total||0); byVenue[b.venueName].bookings+=1; });
    res.json({ series, totalRevenue:totalRev, totalBookings:paid.length, avgBookingValue:paid.length?Math.round(totalRev/paid.length):0, byVenue:Object.values(byVenue).sort((a,b)=>b.revenue-a.revenue), venueCount:venues.length });
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/owner/reports/bookings', ownerMiddleware, async (req,res) => {
  try {
    const {from,to,venueId,status='all'} = req.query;
    const {venues,bookings} = await getOwnerBookings(req.user.id,{from,to,venueId,status});
    const byStatus={}, byEventType={}, byVenue={}, byDay={};
    const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    venues.forEach(v=>{byVenue[String(v._id)]={venue:v.name,bookings:0,revenue:0};});
    bookings.forEach(b=>{ byStatus[b.status]=(byStatus[b.status]||0)+1; byEventType[b.eventType||'Other']=(byEventType[b.eventType||'Other']||0)+1; if(byVenue[String(b.venueId)]){byVenue[String(b.venueId)].bookings+=1;byVenue[String(b.venueId)].revenue+=(b.total||0);} if(b.date){const d=days[new Date(b.date).getDay()];byDay[d]=(byDay[d]||0)+1;} });
    res.json({ bookings, total:bookings.length, byStatus, byEventType, byVenue:Object.values(byVenue).sort((a,b)=>b.bookings-a.bookings), byDay:days.map(d=>({day:d,count:byDay[d]||0})) });
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/owner/reports/venues', ownerMiddleware, async (req,res) => {
  try {
    const {from,to} = req.query;
    const venues=await Venue.find({ownerId:req.user.id});
    const venueIds=venues.map(v=>v._id);
    const q={venueId:{$in:venueIds}};
    if(from||to){q.date={};if(from)q.date.$gte=from;if(to)q.date.$lte=to;}
    const bookings=await Booking.find(q);
    const reviews =await Review.find({venueId:{$in:venueIds}});
    const report=venues.map(v=>{ const vb=bookings.filter(b=>String(b.venueId)===String(v._id)); const vr=reviews.filter(r=>String(r.venueId)===String(v._id)); const paid=vb.filter(b=>['confirmed','paid'].includes(b.status)); const revSum=paid.reduce((s,b)=>s+(b.total||0),0); return { id:v._id, name:v.name, type:v.type, location:v.location, capacity:v.capacity, price1hr:v.price1hr, totalBookings:vb.length, confirmedBookings:paid.length, revenue:revSum, avgBookingValue:paid.length?Math.round(revSum/paid.length):0, conversionRate:vb.length?Math.round(paid.length/vb.length*100):0, reviewCount:vr.length, avgRating:vr.length?(vr.reduce((s,r)=>s+(r.rating||0),0)/vr.length).toFixed(1):null, pendingBookings:vb.filter(b=>b.status==='pending').length, cancelledBookings:vb.filter(b=>['rejected','cancelled'].includes(b.status)).length }; });
    res.json({venues:report.sort((a,b)=>b.revenue-a.revenue)});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/owner/reports/customers', ownerMiddleware, async (req,res) => {
  try {
    const {from,to} = req.query;
    const {bookings} = await getOwnerBookings(req.user.id,{from,to});
    const map={};
    bookings.forEach(b=>{ const k=b.userEmail||b.userName||'Unknown'; if(!map[k]) map[k]={name:b.userName||'Unknown',email:b.userEmail||'',bookings:0,revenue:0,lastBooking:''}; map[k].bookings+=1; if(['confirmed','paid'].includes(b.status)) map[k].revenue+=(b.total||0); if(!map[k].lastBooking||b.date>map[k].lastBooking) map[k].lastBooking=b.date; });
    const customers=Object.values(map).sort((a,b)=>b.revenue-a.revenue);
    const repeat=customers.filter(c=>c.bookings>1).length;
    res.json({customers,total:customers.length,repeatCustomers:repeat,repeatRate:customers.length?Math.round(repeat/customers.length*100):0});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/owner/reports/payments', ownerMiddleware, async (req,res) => {
  try {
    const {from,to} = req.query;
    const {bookings} = await getOwnerBookings(req.user.id,{from,to});
    const confirmed=bookings.filter(b=>['confirmed','paid'].includes(b.status));
    const fullyPaid  =confirmed.filter(b=>b.paymentStatus==='fully_paid'||b.status==='paid');
    const advancePaid=confirmed.filter(b=>b.paymentStatus==='advance_paid');
    const cashVisit  =confirmed.filter(b=>b.cashOnVisitApproved);
    const unpaid     =confirmed.filter(b=>b.paymentStatus==='unpaid'&&!b.cashOnVisitApproved);
    const collected  =fullyPaid.reduce((s,b)=>s+(b.total||0),0)+advancePaid.reduce((s,b)=>s+(b.paidAmount||0),0);
    const pending    =unpaid.reduce((s,b)=>s+(b.total||0),0)+advancePaid.reduce((s,b)=>s+((b.total||0)-(b.paidAmount||0)),0);
    res.json({ bookings:confirmed, summary:{ totalRevenue:confirmed.reduce((s,b)=>s+(b.total||0),0), totalCollected:collected, totalPending:pending, fullyPaidCount:fullyPaid.length, advancePaidCount:advancePaid.length, cashOnVisitCount:cashVisit.length, unpaidCount:unpaid.length }, byPaymentMethod:{ upi:confirmed.filter(b=>b.paymentMethod==='upi').length, card:confirmed.filter(b=>b.paymentMethod==='card').length, netbanking:confirmed.filter(b=>b.paymentMethod==='netbanking').length, cash:cashVisit.length, other:confirmed.filter(b=>!['upi','card','netbanking'].includes(b.paymentMethod)&&!b.cashOnVisitApproved).length } });
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/owner/reports/export/bookings-csv', ownerMiddleware, async (req,res) => {
  try {
    const {from,to,status='all'} = req.query;
    const {bookings} = await getOwnerBookings(req.user.id,{from,to,status});
    const hdr=['Ref','Venue','Customer','Email','Date','Start Time','Hours','Guests','Event Type','Status','Payment Status','Base Price','Add-ons','Plate Charges','Total'];
    const rows=bookings.map(b=>[b.ref||b._id,b.venueName||'',b.userName||'',b.userEmail||'',b.date||'',b.startTime||'',b.hours||'',b.guests||'',b.eventType||'',b.status,b.paymentStatus||'unpaid',b.basePrice||0,b.addonPrice||0,b.plateCharges||0,b.total||0].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(','));
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="evntly-bookings.csv"');
    res.send([hdr.join(','),...rows].join('\r\n'));
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/owner/reports/export/revenue-csv', ownerMiddleware, async (req,res) => {
  try {
    const {from,to} = req.query;
    const {bookings} = await getOwnerBookings(req.user.id,{from,to});
    const paid=bookings.filter(b=>['confirmed','paid'].includes(b.status));
    const hdr=['Date','Venue','Customer','Event Type','Hours','Base Price','Add-ons','Plate Charges','Total','Payment Status'];
    const rows=paid.map(b=>[b.date||'',b.venueName||'',b.userName||'',b.eventType||'',b.hours||1,b.basePrice||0,b.addonPrice||0,b.plateCharges||0,b.total||0,b.paymentStatus||''].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(','));
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="evntly-revenue.csv"');
    res.send([hdr.join(','),...rows].join('\r\n'));
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ─── 404 HANDLER ──────────────────────────────────────────────────────────────
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

// For local development only
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`🚀 EVNTLY running on http://localhost:${PORT}`));
}

module.exports = app;