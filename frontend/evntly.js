// ═══════════════════════════════════════════════════════════════
//  EVNTLY — Main JavaScript
// ═══════════════════════════════════════════════════════════════

// ─── CONFIG ──────────────────────────────────────────────────────
const _host = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:5000'
  : `${location.protocol}//${location.hostname}:5000`;
const API_BASE = _host + '/api';

let currentUser     = null;
let venuesCache     = [];
let currentVenue    = null;
let editVenueData   = null;
let avCoverFile     = null;
let avGalleryFiles  = [];
let evCoverFile     = null;
let evGalleryFiles  = [];
let evRemovedImages = [];
let avSlots         = [];
let evSlots         = [];
let pendingPaymentBooking = null;
let selectedReviewRating  = 0;

const VENUE_EMOJIS = { 'Banquet Hall':'🏛️','Conference Center':'🏢','Garden':'🌿','Rooftop':'🌆','Studio':'🎬' };

// ─── UTILS ───────────────────────────────────────────────────────
function fmt(n) { return '₹' + (n || 0).toLocaleString('en-IN'); }
function escHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function imgUrl(fn) { return fn ? `${_host}/uploads/${fn}` : ''; }

// Strict email validation — rejects mehran@gmail.com.com style
function isValidEmail(email) {
  // Must have exactly one @, TLD must be 2-6 chars, no double dots, no double TLD
  const re = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,6}$/;
  if (!re.test(email)) return false;
  const domain = email.split('@')[1];
  // Reject if domain has consecutive dots or more than one dot-TLD pair (e.g. gmail.com.com)
  if (/\.\./.test(domain)) return false;
  const parts = domain.split('.');
  // If last two parts are both well-known TLDs (e.g. com.com), reject
  const commonTLDs = ['com','net','org','edu','gov','io','co','in','uk','au','de','fr'];
  if (parts.length >= 3 && commonTLDs.includes(parts[parts.length-1]) && commonTLDs.includes(parts[parts.length-2])) return false;
  return true;
}

// Indian mobile validation: 10 digits, starts with 6-9
function isValidPhone(phone) {
  if (!phone) return true;
  const cleaned = phone.replace(/[\s\-\+]/g, "");
  const digits = cleaned.replace(/^(\+91|91)/, "");
  return /^[6-9]\d{9}$/.test(digits);
}
function phoneError(phone) {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-\+]/g, "").replace(/^(\+91|91)/, "");
  if (/^\d+$/.test(cleaned) === false) return "Phone must contain only digits";
  if (cleaned.length !== 10) return "Phone must be exactly 10 digits (got " + cleaned.length + ")";
  if (/^[6-9]/.test(cleaned) === false) return "Indian mobile must start with 6, 7, 8, or 9";
  return null;
}

function toast(msg, type = "info") {
  const tc = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${type==='success'?'✅':type==='error'?'❌':'ℹ️'}</span> ${escHtml(msg)}`;
  tc.appendChild(el);
  setTimeout(() => { el.style.animation = 'slideOut 0.3s ease forwards'; setTimeout(()=>el.remove(), 300); }, 3500);
}

function openModal(id)  { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function showErrors(boxId, listId, errors) {
  const box  = document.getElementById(boxId);
  const list = document.getElementById(listId);
  if (!box || !list) return;
  list.innerHTML = errors.map(e => `<li>${escHtml(e)}</li>`).join('');
  box.classList.add('show');
}
function clearErrors(boxId) { document.getElementById(boxId)?.classList.remove('show'); }

function validateField(inputId, errId, condition, msg) {
  const el = document.getElementById(inputId);
  const er = document.getElementById(errId);
  if (!condition) {
    el?.classList.add('invalid');
    if (er) { er.textContent = msg; er.classList.add('show'); }
    return false;
  }
  el?.classList.remove('invalid');
  if (er) er.classList.remove('show');
  return true;
}

// ─── API HELPER ──────────────────────────────────────────────────
async function api(path, { method='GET', body, formData } = {}) {
  const headers = {};
  const token = localStorage.getItem('evntly_token');
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const opts = { method, headers };
  if (formData) { opts.body = formData; }
  else if (body) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(API_BASE + path, opts);
  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    if (!res.ok) throw { error: `Server error ${res.status}: ${text.substring(0, 120)}` };
    throw { error: `Unexpected response from server (status ${res.status})` };
  }
  if (!res.ok) throw data;
  return data;
}

// ─── CONNECTION CHECK ─────────────────────────────────────────────
async function checkConnection() {
  const el = document.getElementById('api-status');
  try {
    await fetch(API_BASE + '/ping', { signal: AbortSignal.timeout(4000) });
    el.className = 'api-status online';
    el.innerHTML = '<div class="api-dot"></div><span>Live</span>';
  } catch {
    el.className = 'api-status offline';
    el.innerHTML = '<div class="api-dot"></div><span>Offline</span>';
  }
}

// ─── SESSION ─────────────────────────────────────────────────────
async function restoreSession() {
  const token = localStorage.getItem('evntly_token');
  const saved = localStorage.getItem('evntly_user');
  if (!token || !saved) return;
  currentUser = JSON.parse(saved);
  updateNavForUser();
}

function updateNavForUser() {
  document.getElementById('nav-login-btn').style.display = currentUser ? 'none' : '';
  document.getElementById('nav-dash-btn').style.display  = currentUser ? ''     : 'none';
}

// ─── AUTH ─────────────────────────────────────────────────────────
function switchAuthTab(tab) {
  document.getElementById('auth-login').style.display    = tab === 'login'    ? '' : 'none';
  document.getElementById('auth-register').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('tab-login').classList.toggle('active',    tab==='login');
  document.getElementById('tab-register').classList.toggle('active', tab==='register');
}

async function login() {
  clearErrors('login-errors');
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errors   = [];
  if (!email)                errors.push('Email is required');
  else if (!isValidEmail(email)) errors.push('Please enter a valid email address');
  if (!password)             errors.push('Password is required');
  if (errors.length) return showErrors('login-errors','login-errors-list', errors);
  try {
    const data = await api('/auth/login', { method:'POST', body:{ email, password } });
    localStorage.setItem('evntly_token', data.token);
    localStorage.setItem('evntly_user',  JSON.stringify(data.user));
    currentUser = data.user;
    updateNavForUser();
    closeModal('auth-modal');
    toast(`Welcome back, ${data.user.name}! 👋`, 'success');
    showDashboard();
  } catch(e) {
    // Show friendly "not registered" message
    const raw = e.errors?.[0] || e.error || '';
    const msg = raw.toLowerCase().includes('invalid email or password')
      ? '❌ Email not registered or incorrect password. Please register first or check your credentials.'
      : (raw || 'Login failed');
    showErrors('login-errors','login-errors-list', [msg]);
  }
}

async function register() {
  clearErrors('reg-errors');
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const phone    = document.getElementById('reg-phone').value.trim();
  const role     = document.getElementById('reg-role').value;
  const errors   = [];
  if (!name)                    errors.push('Name is required');
  if (!email)                   errors.push('Email is required');
  else if (!isValidEmail(email)) errors.push('Invalid email — e.g. mehran@gmail.com.com is not allowed. Use a real email like you@example.com');
  if (!password)                errors.push('Password is required');
  else if (password.length < 6) errors.push('Password must be at least 6 characters');
  const phoneErr = phoneError(phone);
  if (phoneErr) errors.push(phoneErr);
  if (errors.length) return showErrors('reg-errors','reg-errors-list', errors);
  try {
    const data = await api('/auth/register', { method:'POST', body:{ name, email, password, phone, role } });
    localStorage.setItem('evntly_token', data.token);
    localStorage.setItem('evntly_user',  JSON.stringify(data.user));
    currentUser = data.user;
    updateNavForUser();
    closeModal('auth-modal');
    toast(`Welcome to EVNTLY, ${data.user.name}! 🎉`, 'success');
    showDashboard();
  } catch(e) {
    const errs = e.errors || [e.error || 'Registration failed'];
    showErrors('reg-errors','reg-errors-list', errs);
  }
}

async function registerOwner() {
  const name     = document.getElementById('ow-name').value.trim();
  const email    = document.getElementById('ow-email').value.trim();
  const password = document.getElementById('ow-password').value;
  const phone    = document.getElementById('ow-phone').value.trim();
  if (!name || !email || !password) return toast('Please fill all required fields','error');
  if (!isValidEmail(email)) return toast('Please enter a valid email address','error');
  if (password.length < 6)  return toast('Password must be at least 6 characters','error');
  const owPhoneErr = phoneError(phone);
  if (owPhoneErr) return toast(owPhoneErr, 'error');
  try {
    const data = await api('/auth/register', { method:'POST', body:{ name, email, password, phone, role:'owner' } });
    localStorage.setItem('evntly_token', data.token);
    localStorage.setItem('evntly_user',  JSON.stringify(data.user));
    currentUser = data.user;
    updateNavForUser();
    toast('Owner account created! 🎉', 'success');
    showDashboard();
  } catch(e) { toast(e.error || 'Registration failed','error'); }
}

function logout() {
  localStorage.removeItem('evntly_token');
  localStorage.removeItem('evntly_user');
  currentUser = null;
  updateNavForUser();
  hideDashboard();
  toast('Signed out successfully','info');
}

// ─── NAVIGATION ──────────────────────────────────────────────────
function scrollToTop()        { hideDashboard(); document.getElementById('hero').scrollIntoView({ behavior:'smooth' }); }
function scrollToVenues()     { hideDashboard(); setTimeout(()=>document.getElementById('venues-section').scrollIntoView({ behavior:'smooth' }), 50); }
function scrollToFacilities() { hideDashboard(); setTimeout(()=>document.getElementById('facilities-section').scrollIntoView({ behavior:'smooth' }), 50); }
function scrollToOwner()      { hideDashboard(); setTimeout(()=>document.getElementById('owner-section').scrollIntoView({ behavior:'smooth' }), 50); }
function scrollToReviews()    { hideDashboard(); setTimeout(()=>document.getElementById('reviews-section').scrollIntoView({ behavior:'smooth' }), 50); }

function toggleMobileMenu() {
  document.getElementById('nav-mobile-menu').classList.toggle('open');
}
function closeMobileMenu() {
  document.getElementById('nav-mobile-menu')?.classList.remove('open');
}

function showDashboard() {
  closeMobileMenu();
  document.querySelectorAll('.hero,.search-section,.section,footer,.owner-section').forEach(el => el.style.display = 'none');
  document.getElementById('dashboard').style.display = 'flex';
  const isOwner = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  document.getElementById('owner-nav').style.display   = isOwner ? 'block' : 'none';
  document.getElementById('sidebar-role-label').textContent = isOwner ? '👑 Owner Dashboard' : '👤 Customer Dashboard';
  // Hide My Bookings / My Reviews for owners — they use Booking Requests instead
  document.querySelectorAll('.customer-only').forEach(el => {
    el.style.display = isOwner ? 'none' : '';
  });
  loadDashboard();
}

function hideDashboard() {
  document.querySelectorAll('.hero,.search-section,.section,footer,.owner-section').forEach(el => el.style.display = '');
  document.getElementById('dashboard').style.display = 'none';
}

function switchPanel(id, el) {
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
  document.getElementById('panel-' + id)?.classList.add('active');
  if (el) el.classList.add('active');
  if (id === 'venues')       loadOwnerVenues();
  if (id === 'bookings')     loadMyBookings();
  if (id === 'requests')     loadRequests();
  if (id === 'slot-manager') loadSlotManager();
  if (id === 'overview')     loadOverview();
  if (id === 'my-reviews')   loadMyReviews();
}

// ─── VENUES — PUBLIC ──────────────────────────────────────────────
async function loadVenues() {
  try {
    const venues = await api('/venues');
    venuesCache = venues;
    renderVenues(venues);
    document.getElementById('stat-venues').textContent = venues.length + '+';
  } catch(e) {
    document.getElementById('venues-grid').innerHTML = `
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Could not load venues</h3>
        <p>Make sure the backend server is running on port 5000.</p>
        <button class="btn-ghost" onclick="loadVenues()">Retry</button>
      </div>`;
  }
}

async function searchVenues() {
  const params = new URLSearchParams();
  const name   = document.getElementById('search-name').value.trim();
  const loc    = document.getElementById('search-loc').value.trim();
  const date   = document.getElementById('search-date').value;
  const guests = document.getElementById('search-guests').value;
  if (name)   params.set('search',   name);
  if (loc)    params.set('location', loc);
  if (date)   params.set('date',     date);
  if (guests) params.set('guests',   guests);
  scrollToVenues();
  try {
    const venues = await api('/venues?' + params);
    // If date filter is active, filter client-side by checking no fully-blocked venue
    // (server returns all; we mark venues where ALL slots are blocked on that date)
    if (date) {
      renderVenuesWithDate(venues, date);
    } else {
      renderVenues(venues);
    }
  } catch(e) { toast('Search failed: ' + (e.error||''), 'error'); }
}

function renderVenuesWithDate(venues, date) {
  const grid = document.getElementById('venues-grid');
  if (!venues.length) {
    grid.innerHTML = `<div class="error-state"><div class="error-icon">🔍</div><h3>No venues found</h3><p>Try different search criteria.</p></div>`;
    return;
  }
  // Sort: venues with available slots for the date come first
  const withAvail = venues.map(v => {
    const slots = (v.slots || []).filter(s => s.available);
    const allBlocked = slots.length > 0 && slots.every(s => (s.blockedDates||[]).includes(date));
    return { ...v, _allBlocked: allBlocked };
  }).sort((a, b) => a._allBlocked - b._allBlocked);

  grid.innerHTML = withAvail.map(v => {
    const cover = v.coverImage
      ? `<img src="${imgUrl(v.coverImage)}" alt="${escHtml(v.name)}" onerror="this.style.display='none'" />`
      : `<div class="venue-emoji">${VENUE_EMOJIS[v.type]||'🏛️'}</div>`;
    const badge = v._allBlocked
      ? `<div class="venue-badge badge-booked">🔒 Booked on ${date}</div>`
      : `<div class="venue-badge badge-available">Available</div>`;
    return `
    <div class="venue-card" onclick="${v._allBlocked ? "toast('This venue is fully booked on ' + '" + date + "'. Try another date.','info')" : "openBookingModal('" + v._id + "')"}">
      <div class="venue-img">
        ${cover}
        ${badge}
        ${v.rating ? `<div class="venue-rating">★ ${v.rating}</div>` : ''}
      </div>
      <div class="venue-info">
        <div class="venue-name">${escHtml(v.name)}</div>
        <div class="venue-owner">${escHtml(v.location)} · by ${escHtml(v.ownerName||'Owner')}</div>
        <div class="venue-tags">
          <span class="tag">${escHtml(v.type)}</span>
          <span class="tag">👥 ${v.capacity}</span>
          ${v.platePrice > 0 ? `<span class="tag">🍽️ ₹${v.platePrice}/plate</span>` : ''}
        </div>
        <div class="venue-footer">
          <div class="venue-price">${fmt(v.price1hr)} <span>/hr</span></div>
          ${v._allBlocked
            ? `<button class="btn-book" style="background:var(--brick);color:white;cursor:not-allowed" disabled>Fully Booked</button>`
            : `<button class="btn-book" onclick="event.stopPropagation();openBookingModal('${v._id}')">Book Now</button>`}
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderVenues(venues) {
  const grid = document.getElementById('venues-grid');
  if (!venues.length) {
    grid.innerHTML = `<div class="error-state"><div class="error-icon">🔍</div><h3>No venues found</h3><p>Try different search criteria.</p></div>`;
    return;
  }
  grid.innerHTML = venues.map(v => {
    const cover = v.coverImage
      ? `<img src="${imgUrl(v.coverImage)}" alt="${escHtml(v.name)}" onerror="this.style.display='none'" />`
      : `<div class="venue-emoji">${VENUE_EMOJIS[v.type]||'🏛️'}</div>`;
    return `
    <div class="venue-card" onclick="openBookingModal('${v._id}')">
      <div class="venue-img">
        ${cover}
        <div class="venue-badge badge-available">Available</div>
        ${v.rating ? `<div class="venue-rating">★ ${v.rating}</div>` : ''}
      </div>
      <div class="venue-info">
        <div class="venue-name">${escHtml(v.name)}</div>
        <div class="venue-owner">${escHtml(v.location)} · by ${escHtml(v.ownerName||'Owner')}</div>
        <div class="venue-tags">
          <span class="tag">${escHtml(v.type)}</span>
          <span class="tag">👥 ${v.capacity}</span>
          ${v.platePrice > 0 ? `<span class="tag">🍽️ ₹${v.platePrice}/plate</span>` : ''}
        </div>
        <div class="venue-footer">
          <div class="venue-price">${fmt(v.price1hr)} <span>/hr</span></div>
          <button class="btn-book" onclick="event.stopPropagation();openBookingModal('${v._id}')">Book Now</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── VENUE DETAIL MODAL (images + booking form) ──────────────────
async function openBookingModal(venueId) {
  if (!currentUser) { openModal('auth-modal'); toast('Please sign in to book a venue','info'); return; }
  if (currentUser.role === 'owner') { toast('Owners cannot book venues. Please use a customer account.','info'); return; }
  let v;
  try {
    v = await api('/venues/' + venueId + '?_=' + Date.now());
  } catch(e) {
    console.error('API error fetching venue:', e);
    toast('Could not load venue — server error: ' + (e?.error || e?.message || String(e)), 'error');
    return;
  }
  currentVenue = v;
  try {
    const titleEl = document.getElementById('booking-modal-title');
    if (titleEl) titleEl.textContent = v.name;
    renderVenueDetailModal(v);
    openModal('booking-modal');
  } catch(e) {
    console.error('renderVenueDetailModal crash:', e);
    toast('UI error rendering venue: ' + (e?.message || String(e)), 'error');
  }
}

function renderVenueDetailModal(v) {
  const allImages = [];
  if (v.coverImage) allImages.push(v.coverImage);
  (v.images || []).forEach(function(img) { if (img && !allImages.includes(img)) allImages.push(img); });

  // Gallery
  let galleryHtml = '';
  if (allImages.length) {
    let thumbsHtml = '';
    if (allImages.length > 1) {
      let tInner = '';
      allImages.forEach(function(img, i) {
        var u = imgUrl(img);
        tInner += '<img src="' + u + '" class="vd-thumb' + (i===0?' active':'') + '" onclick="setMainPhoto(\'' + u + '\',this)" onerror="this.style.display=\'none\'" />';
      });
      thumbsHtml = '<div class="vd-thumbs">' + tInner + '</div>';
    }
    galleryHtml = '<div class="vd-gallery"><div class="vd-main-img" id="vd-main-img"><img src="' + imgUrl(allImages[0]) + '" alt="' + escHtml(v.name) + '" onerror="this.src=\'\'" id="vd-main-photo" /></div>' + thumbsHtml + '</div>';
  } else {
    galleryHtml = '<div class="vd-gallery-placeholder">' + (VENUE_EMOJIS[v.type] || '🏛️') + '</div>';
  }

  const amenities = v.amenities || [];
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  // Venue info
  let ratingTag = v.rating ? '<span class="tag">★ ' + v.rating + ' (' + (v.reviewCount||0) + ' reviews)</span>' : '';
  let descHtml  = v.description ? '<p class="vd-desc">' + escHtml(v.description) + '</p>' : '';
  let price2Html = v.price2hr ? '<div class="vd-price-item"><span class="vd-price-val">' + fmt(v.price2hr) + '</span><span class="vd-price-label">/2hr</span></div>' : '';
  let plateHtml  = v.platePrice > 0 ? '<div class="vd-price-item"><span class="vd-price-val">₹' + v.platePrice + '</span><span class="vd-price-label">/plate</span></div>' : '';

  let amenityInfoHtml = '';
  if (amenities.length) {
    let tags = amenities.map(function(a) {
      return '<span class="vd-amenity-tag">' + escHtml(a.label) + (a.price > 0 ? ' (' + fmt(a.price) + '/hr)' : '') + '</span>';
    }).join('');
    amenityInfoHtml = '<div class="vd-amenities"><div class="vd-section-title">✨ Facilities</div><div class="vd-amenity-tags">' + tags + '</div></div>';
  }

  // Booking add-ons
  let addonHtml = '';
  if (amenities.length) {
    let btns = amenities.map(function(a) {
      return '<button class="slot-btn light-toggle" data-price="' + (a.price||0) + '" data-key="' + escHtml(a.key) + '" onclick="toggleFacility(this);calcBookingPrice()">' + escHtml(a.label) + (a.price ? ' (' + fmt(a.price) + '/hr)' : '') + '</button>';
    }).join('');
    addonHtml = '<div class="form-field"><label class="form-label">Add-on Facilities</label><div style="display:flex;flex-wrap:wrap;gap:8px">' + btns + '</div></div>';
  }

  let plateCheckHtml = v.platePrice > 0
    ? '<div class="form-field"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.88rem"><input type="checkbox" id="bk-plate-check" onchange="calcBookingPrice()" />Include plate charges (₹' + v.platePrice + ' × guests)</label></div>'
    : '';

  let hotelHtml = '';
  if ((v.cateringHotels||[]).length) {
    let opts = v.cateringHotels.map(function(h) { return '<option>' + escHtml(h) + '</option>'; }).join('');
    hotelHtml = '<div class="form-field"><label class="form-label">Catering Hotel Preference</label><select class="form-input" id="bk-catering-hotel"><option value="">No preference</option>' + opts + '</select></div>';
  }

  document.getElementById('booking-body').innerHTML =
    galleryHtml +
    '<div class="vd-info">' +
      '<div class="vd-meta">' +
        '<span class="tag">' + escHtml(v.type) + '</span>' +
        '<span class="tag">📍 ' + escHtml(v.location) + '</span>' +
        '<span class="tag">👥 Up to ' + v.capacity + ' guests</span>' +
        ratingTag +
      '</div>' +
      descHtml +
      '<div class="vd-pricing">' +
        '<div class="vd-price-item"><span class="vd-price-val">' + fmt(v.price1hr) + '</span><span class="vd-price-label">/hr</span></div>' +
        price2Html + plateHtml +
      '</div>' +
      amenityInfoHtml +
    '</div>' +
    '<div class="vd-book-section">' +
      '<div class="vd-section-title">📅 Book This Venue</div>' +
      '<div class="form-errors-box" id="bk-errors"><ul id="bk-errors-list"></ul></div>' +
      '<div style="background:rgba(139,58,42,0.07);border:1px solid rgba(139,58,42,0.2);border-radius:6px;padding:8px 14px;font-size:0.8rem;color:var(--brick);margin-bottom:12px">📅 <strong>Note:</strong> Same-day bookings are not allowed. Please select a future date.</div>' +
      '<div class="booking-grid">' +
        '<div class="form-field"><label class="form-label">Event Date *</label><input class="form-input" type="date" id="bk-date" min="' + minDate + '" onchange="refreshSlots()" /></div>' +
        '<div class="form-field"><label class="form-label">Duration *</label><select class="form-input" id="bk-hours" onchange="calcBookingPrice();refreshSlots()"><option value="1">1 Hour</option><option value="2">2 Hours</option><option value="3">3 Hours</option><option value="4">4 Hours</option><option value="5">5 Hours</option><option value="6">6 Hours</option><option value="7">7 Hours</option></select></div>' +
      '</div>' +
      '<div style="background:rgba(74,94,79,0.08);border:1px solid rgba(74,94,79,0.25);border-radius:6px;padding:9px 14px;font-size:0.82rem;color:#4a5e4f;margin-bottom:10px">🕐 <strong>Open:</strong> ' + (v.openTime||'09:00') + ' – ' + (v.closeTime||'22:00') + ' · Slots auto-generate based on duration</div>' +
      '<div class="form-field"><label class="form-label">Select Start Time * <span style="font-size:0.75rem;color:var(--muted)">(end time auto-set)</span></label><div class="slot-options" id="bk-slots"><span style="color:var(--muted);font-size:0.85rem">Select a date to see available slots</span></div><div id="bk-end-display" style="margin-top:5px;min-height:18px"></div><input type="text" id="bk-slot-val" style="display:none" /></div>' +
      '<div class="booking-grid">' +
        '<div class="form-field"><label class="form-label">Number of Guests *</label><input class="form-input" type="number" id="bk-guests" placeholder="' + v.capacity + '" min="1" max="' + v.capacity + '" onchange="calcBookingPrice()" /></div>' +
        '<div class="form-field"><label class="form-label">Event Type</label><select class="form-input" id="bk-event"><option>Wedding</option><option>Corporate</option><option>Birthday</option><option>Anniversary</option><option>Exhibition</option><option>Other</option></select></div>' +
      '</div>' +
      addonHtml +
      plateCheckHtml +
      hotelHtml +
      '<div class="form-field"><label class="form-label">Catering Type</label><select class="form-input" id="bk-catering"><option value="none">No Catering</option><option value="onsite">On-Site Catering</option><option value="zomato">Zomato</option><option value="swiggy">Swiggy</option></select></div>' +
      '<div class="price-breakdown" id="bk-breakdown"><div class="pb-row"><span>Venue (1 hr)</span><span>' + fmt(v.price1hr) + '</span></div><div class="pb-total"><span>Total</span><span id="bk-total-display">' + fmt(v.price1hr) + '</span></div></div>' +
      '<button class="btn-confirm" style="width:100%;margin-top:16px" onclick="confirmBooking()">Send Booking Request →</button>' +
    '</div>';
}

function setMainPhoto(src, thumb) {
  document.getElementById('vd-main-photo').src = src;
  document.querySelectorAll('.vd-thumb').forEach(t => t.classList.remove('active'));
  thumb.classList.add('active');
}



// ── TIME HELPERS ───────────────────────────────────────────────
function timeToMins(t) {
  if (!t) return 0;
  const [h,m] = t.split(':').map(Number);
  return h*60+m;
}
function minsToTime(m) {
  return String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
}
function getStartTimes(openTime, closeTime, durationHrs) {
  const openM  = timeToMins(openTime  || '09:00');
  const closeM = timeToMins(closeTime || '22:00');
  const durM   = durationHrs * 60;
  const out = [];
  for (let m = openM; m + durM <= closeM; m += 60) out.push(minsToTime(m));
  return out;
}
function updateHoursPreview(prefix) {
  const open  = document.getElementById(prefix+'-open-time')?.value;
  const close = document.getElementById(prefix+'-close-time')?.value;
  const el    = document.getElementById(prefix+'-hours-preview');
  if (!el) return;
  if (open && close && timeToMins(close) > timeToMins(open)) {
    const hrs = (timeToMins(close)-timeToMins(open))/60;
    el.innerHTML = '🕐 Open <strong>'+open+'–'+close+'</strong> · <strong>'+hrs+' hrs</strong> window';
    el.style.color = '#4a5e4f';
  } else if (open && close) {
    el.textContent = '⚠️ Closing time must be after opening time';
    el.style.color = '#ef4444';
  } else { el.textContent = ''; }
}

function refreshSlots() {
  const v = currentVenue;
  if (!v) return;
  const date = document.getElementById('bk-date')?.value;
  const sc   = document.getElementById('bk-slots');
  const endD = document.getElementById('bk-end-display');
  document.getElementById('bk-slot-val').value = '';
  if (endD) endD.innerHTML = '';

  if (!date) {
    sc.innerHTML = '<span style="color:var(--muted);font-size:0.85rem">Select a date to see available slots</span>';
    return;
  }
  const today = new Date().toISOString().split('T')[0];
  if (date === today) {
    sc.innerHTML = '<div class="slot-blocked-msg">⚠️ Same-day bookings not allowed. Select a future date.</div>';
    return;
  }

  const hours     = parseInt(document.getElementById('bk-hours')?.value || 1);
  const openTime  = v.openTime  || '09:00';
  const closeTime = v.closeTime || '22:00';
  const starts    = getStartTimes(openTime, closeTime, hours);

  if (!starts.length) {
    sc.innerHTML = '<div class="slot-blocked-msg">⚠️ No '+hours+'-hr slots fit within '+openTime+'–'+closeTime+'. Try shorter duration.</div>';
    return;
  }

  const blocked    = new Set(v.blockedRanges || []);
  const dayBlocked = blocked.has(date);
  const legacyBlk  = new Set();
  (v.slots||[]).forEach(s => { if ((s.blockedDates||[]).includes(date)) legacyBlk.add(s.time); });

  sc.innerHTML = starts.map(function(start) {
    const end   = minsToTime(timeToMins(start) + hours*60);
    const key   = date+'|'+start+'-'+end;
    const label = start+' – '+end;
    const isBlk = dayBlocked || blocked.has(key) || legacyBlk.has(start);
    if (isBlk) return '<button class="slot-btn blocked" disabled>🔒 '+label+'</button>';
    return '<button class="slot-btn" onclick="selectSlot(this,\''+start+'\',\''+end+'\')">'+label+'</button>';
  }).join('');
}

function selectSlot(btn, startTime, endTime) {
  document.querySelectorAll('#bk-slots .slot-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('bk-slot-val').value = startTime;
  const d = document.getElementById('bk-end-display');
  if (d) d.innerHTML = '<span style="color:#4a5e4f;font-weight:600;font-size:0.84rem">✅ '+startTime+' – '+endTime+'</span>';
  calcBookingPrice();
}

function toggleFacility(btn) { btn.classList.toggle('selected'); }

function calcBookingPrice() {
  if (!currentVenue) return;
  const v     = currentVenue;
  const hours = parseInt(document.getElementById('bk-hours')?.value || 1);
  let base    = hours >= 2 && v.price2hr ? v.price2hr : v.price1hr * hours;
  let addon   = 0;
  document.querySelectorAll('#booking-body .slot-btn.selected[data-price]').forEach(b => {
    addon += parseFloat(b.dataset.price || 0) * hours;
  });
  const guests     = parseInt(document.getElementById('bk-guests')?.value || 0);
  const plateCheck = document.getElementById('bk-plate-check')?.checked;
  const plates     = (plateCheck && v.platePrice > 0 && guests > 0) ? v.platePrice * guests : 0;
  const total      = base + addon + plates;
  const bd = document.getElementById('bk-breakdown');
  if (bd) bd.innerHTML = `
    <div class="pb-row"><span>Venue (${hours} hr${hours>1?'s':''})</span><span>${fmt(base)}</span></div>
    ${addon > 0 ? `<div class="pb-row"><span>Add-ons</span><span>${fmt(addon)}</span></div>` : ''}
    ${plates > 0 ? `<div class="pb-row"><span>Plate charges (${guests} guests)</span><span>${fmt(plates)}</span></div>` : ''}
    <div class="pb-total"><span>Total</span><span>${fmt(total)}</span></div>
  `;
}

async function confirmBooking() {
  clearErrors('bk-errors');
  const v        = currentVenue;
  const date     = document.getElementById('bk-date')?.value;
  const slotVal  = document.getElementById('bk-slot-val')?.value || 'Flexible';
  const hours    = parseInt(document.getElementById('bk-hours')?.value || 1);
  const guests   = parseInt(document.getElementById('bk-guests')?.value || 0);
  const eventType= document.getElementById('bk-event')?.value;
  const catering = document.getElementById('bk-catering')?.value;
  const errors   = [];

  // Block today
  const today = new Date().toISOString().split('T')[0];
  if (!date)             errors.push('Please select a date');
  else if (date === today) errors.push('Same-day bookings are not allowed. Please select a future date.');
  if (guests < 1) errors.push('Number of guests must be at least 1');
  if (guests > v.capacity) errors.push(`Venue capacity is ${v.capacity} guests`);
  if (errors.length) return showErrors('bk-errors','bk-errors-list', errors);

  const facilities = [];
  document.querySelectorAll('#booking-body .slot-btn.selected[data-key]').forEach(b => facilities.push(b.dataset.key));
  const base     = hours >= 2 && v.price2hr ? v.price2hr : v.price1hr * hours;
  let addon      = 0;
  document.querySelectorAll('#booking-body .slot-btn.selected[data-price]').forEach(b => {
    addon += parseFloat(b.dataset.price || 0) * hours;
  });
  const plateCheck = document.getElementById('bk-plate-check')?.checked;
  const plateChg   = (plateCheck && v.platePrice > 0 && guests > 0) ? v.platePrice * guests : 0;
  const total      = base + addon + plateChg;

  try {
    const booking = await api('/bookings', { method:'POST', body:{
      venueId: v._id, date, startTime: slotVal, hours, guests, eventType,
      facilities, cateringType: catering,
      basePrice: base, addonPrice: addon, plateCharges: plateChg, total,
    }});
    closeModal('booking-modal');
    showBookingPendingNotice(booking, v);
  } catch(e) {
    const errs = e.errors || [e.error || 'Booking failed'];
    showErrors('bk-errors','bk-errors-list', errs);
  }
}

// ─── BOOKING PENDING NOTICE ───────────────────────────────────────
function showBookingPendingNotice(booking, venue) {
  document.getElementById('receipt-content').innerHTML = `
    <div class="receipt-wrap">
      <div class="receipt-header">
        <div>
          <div class="receipt-logo">EVNTLY<span>.</span></div>
          <div class="receipt-logo-sub">Booking Request Submitted</div>
        </div>
        <div style="text-align:right;font-size:0.78rem;color:rgba(255,255,255,0.5)">
          ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
        </div>
      </div>
      <div class="receipt-body">
        <div class="booking-pending-box">
          <div class="booking-pending-icon">⏳</div>
          <div class="booking-pending-title">Booking Request Sent!</div>
          <div class="booking-pending-msg">
            Your booking request has been submitted successfully.<br>
            <strong>Please wait for the owner's approval.</strong><br>
            We will contact you shortly once your booking is confirmed.
          </div>
          <div class="booking-pending-ref">${escHtml(booking.ref || booking._id)}</div>
          <div class="booking-pending-steps">
            <div class="pending-step"><div class="pending-step-icon" style="background:var(--gold)">📋</div><div class="pending-step-label">Request Sent</div></div>
            <div class="pending-step-arrow">→</div>
            <div class="pending-step"><div class="pending-step-icon" style="background:#ccc">✅</div><div class="pending-step-label">Owner Approves</div></div>
            <div class="pending-step-arrow">→</div>
            <div class="pending-step"><div class="pending-step-icon" style="background:#ccc">💳</div><div class="pending-step-label">Pay Online</div></div>
            <div class="pending-step-arrow">→</div>
            <div class="pending-step"><div class="pending-step-icon" style="background:#ccc">🎉</div><div class="pending-step-label">Booking Confirmed</div></div>
          </div>
        </div>
        <div class="receipt-section-title">📋 Booking Details</div>
        <div class="receipt-row"><span class="rlabel">Reference ID</span><span class="rvalue" style="font-family:monospace">${escHtml(booking.ref||booking._id)}</span></div>
        <div class="receipt-row"><span class="rlabel">Venue</span><span class="rvalue">${escHtml(booking.venueName||venue?.name||'—')}</span></div>
        <div class="receipt-row"><span class="rlabel">Date</span><span class="rvalue">${escHtml(booking.date)}</span></div>
        <div class="receipt-row"><span class="rlabel">Time Slot</span><span class="rvalue">${escHtml(booking.startTime)} (${booking.hours} hr${booking.hours>1?'s':''})</span></div>
        <div class="receipt-row"><span class="rlabel">Guests</span><span class="rvalue">${booking.guests}</span></div>
        <div class="receipt-row"><span class="rlabel">Amount</span><span class="rvalue">${fmt(booking.total)}</span></div>
        <div class="receipt-row"><span class="rlabel">Status</span><span class="rvalue"><span class="status-pill pill-pending">Pending Approval</span></span></div>
      </div>
      <div class="receipt-actions">
        <button class="btn-confirm" style="background:var(--gold);color:var(--dark)" onclick="closeModal('receipt-modal');showDashboard();switchPanel('bookings',document.getElementById('nav-bookings'))">📅 Track My Bookings →</button>
        <button class="btn-sm btn-sm-ghost" onclick="closeModal('receipt-modal')">✕ Close</button>
      </div>
    </div>`;
  openModal('receipt-modal');
}

// ─── PAYMENT FLOW ─────────────────────────────────────────────────
function openPaymentModal(booking) {
  pendingPaymentBooking = booking;
  const total = booking.total || 0;
  const paidSoFar = booking.paidAmount || 0;
  const remaining = total - paidSoFar;
  const bookingDate = new Date(booking.date);
  const today = new Date(); today.setHours(0,0,0,0);
  const daysLeft = Math.floor((bookingDate - today) / (1000*60*60*24));
  const cashAllowed = daysLeft >= 1;

  document.getElementById('payment-body').innerHTML = `
    <div class="payment-amount-box">
      <div class="payment-amount-label">${paidSoFar > 0 ? 'Remaining Balance' : 'Total Amount'}</div>
      <div class="payment-amount-value">${fmt(remaining)}</div>
      <div style="font-size:0.75rem;color:rgba(255,255,255,0.4);margin-top:6px">${escHtml(booking.venueName)} · ${escHtml(booking.date)} · ${escHtml(booking.startTime)}</div>
      ${paidSoFar > 0 ? `<div style="font-size:0.75rem;color:rgba(200,169,110,0.8);margin-top:4px">Advance paid: ${fmt(paidSoFar)}</div>` : ''}
    </div>
    <div style="font-size:0.82rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Select Payment Option</div>
    <div class="payment-type-grid">
      <div class="payment-type-btn" id="pt-advance" onclick="selectPaymentType('advance',${remaining},${total})">
        <div class="pt-icon">⚡</div><div class="pt-label">Advance Payment</div>
        <div class="pt-sub">Pay a portion now, rest on visit</div>
      </div>
      <div class="payment-type-btn" id="pt-full" onclick="selectPaymentType('full',${remaining},${total})">
        <div class="pt-icon">💯</div><div class="pt-label">Full Payment</div>
        <div class="pt-sub">Pay ${fmt(remaining)} now & confirm booking</div>
      </div>
      <div class="payment-type-btn cash-type ${cashAllowed?'':'cash-unavail'}" id="pt-cash" ${cashAllowed?`onclick="selectPaymentType('cash',${remaining},${total})"`:''}>
        <div class="pt-icon">🏠</div><div class="pt-label">Cash on Visit</div>
        <div class="pt-sub">${cashAllowed ? 'Pay the full amount at the venue' : `Must select ≥1 day before`}</div>
      </div>
      <div class="payment-type-btn" id="pt-upi" style="display:none"></div>
    </div>
    <div id="payment-type-details"></div>
    <div class="upi-mock-notice">🔒 <strong>Secure Payment:</strong> This is a demo payment flow. No real transaction will occur.</div>
    <button class="btn-submit" id="pay-btn" onclick="processPayment()" style="margin-top:16px" disabled>Select payment option above</button>
  `;
  openModal('payment-modal');
}

let selectedPaymentType = null;
function selectPaymentType(type, remaining, total) {
  selectedPaymentType = type;
  document.querySelectorAll('.payment-type-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('pt-' + (type==='cash'?'cash':type==='full'?'full':'advance'))?.classList.add('selected');
  const details = document.getElementById('payment-type-details');
  const payBtn  = document.getElementById('pay-btn');

  if (type === 'cash') {
    details.innerHTML = `<div style="background:rgba(74,94,79,0.07);border:1.5px solid var(--sage);border-radius:8px;padding:16px 18px;margin:14px 0">
      <div style="font-weight:700;color:var(--sage);margin-bottom:6px">🏠 Cash on Visit Selected</div>
      <div style="font-size:0.82rem;color:var(--muted);line-height:1.7">Your booking will be held confirmed. Please bring <strong>${fmt(remaining)}</strong> in cash on the day of the event.</div></div>`;
    payBtn.disabled = false; payBtn.textContent = 'Confirm Cash on Visit →';
    payBtn.style.background = 'var(--sage)'; payBtn.style.color = 'white';
  } else if (type === 'full') {
    details.innerHTML = `<div style="font-size:0.82rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin:14px 0 10px">Choose Payment Method</div>
      <div class="payment-methods">
        <div class="payment-method-btn" onclick="selectPaymentMethod(this,'upi')"><div class="pm-icon">📱</div><div class="pm-label">UPI</div></div>
        <div class="payment-method-btn" onclick="selectPaymentMethod(this,'card')"><div class="pm-icon">💳</div><div class="pm-label">Card</div></div>
        <div class="payment-method-btn" onclick="selectPaymentMethod(this,'netbanking')"><div class="pm-icon">🏦</div><div class="pm-label">Net Banking</div></div>
        <div class="payment-method-btn" onclick="selectPaymentMethod(this,'wallet')"><div class="pm-icon">👛</div><div class="pm-label">Wallet</div></div>
      </div>
      <div id="payment-method-details"></div>`;
    payBtn.disabled = true; payBtn.textContent = `Pay ${fmt(remaining)} →`;
    payBtn.style.background = ''; payBtn.style.color = '';
  } else if (type === 'advance') {
    const minAdv = Math.ceil(remaining * 0.2);
    details.innerHTML = `<div style="margin:14px 0">
      <label class="form-label">Advance Amount (min. 20% = ${fmt(minAdv)})</label>
      <div class="advance-input-row">
        <input class="form-input" type="number" id="advance-amt" placeholder="${minAdv}" min="${minAdv}" max="${remaining-1}" value="${minAdv}" oninput="updateAdvanceSplit(${remaining})" />
        <button class="btn-sm btn-sm-ghost" onclick="document.getElementById('advance-amt').value=Math.round(${remaining}*0.5);updateAdvanceSplit(${remaining})">50%</button>
      </div>
      <div class="payment-split-box" id="advance-split">
        <div class="payment-split-row"><span>Paying now</span><span style="color:var(--success)">${fmt(minAdv)}</span></div>
        <div class="payment-split-row"><span>Remaining on visit</span><span style="color:var(--brick)">${fmt(remaining-minAdv)}</span></div>
      </div></div>
      <div style="font-size:0.82rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Payment Method</div>
      <div class="payment-methods">
        <div class="payment-method-btn" onclick="selectPaymentMethod(this,'upi')"><div class="pm-icon">📱</div><div class="pm-label">UPI</div></div>
        <div class="payment-method-btn" onclick="selectPaymentMethod(this,'card')"><div class="pm-icon">💳</div><div class="pm-label">Card</div></div>
        <div class="payment-method-btn" onclick="selectPaymentMethod(this,'netbanking')"><div class="pm-icon">🏦</div><div class="pm-label">Net Banking</div></div>
        <div class="payment-method-btn" onclick="selectPaymentMethod(this,'wallet')"><div class="pm-icon">👛</div><div class="pm-label">Wallet</div></div>
      </div>
      <div id="payment-method-details"></div>`;
    payBtn.disabled = true; payBtn.textContent = `Pay Advance →`;
    payBtn.style.background = ''; payBtn.style.color = '';
  }
}

function updateAdvanceSplit(remaining) {
  const adv = parseInt(document.getElementById('advance-amt')?.value || 0);
  const rem = remaining - (isNaN(adv) ? 0 : adv);
  const box = document.getElementById('advance-split');
  if (box) box.innerHTML = `
    <div class="payment-split-row"><span>Paying now</span><span style="color:var(--success)">${fmt(Math.max(0,adv))}</span></div>
    <div class="payment-split-row"><span>Remaining on visit</span><span style="color:var(--brick)">${fmt(Math.max(0,rem))}</span></div>`;
}

function selectPaymentMethod(btn, method) {
  document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const details = document.getElementById('payment-method-details');
  if (method === 'upi') {
    details.innerHTML = `<div class="upi-input-group"><div class="form-field"><label class="form-label">UPI ID</label>
      <input class="form-input" type="text" id="upi-id" placeholder="yourname@upi" oninput="document.getElementById('pay-btn').disabled=!this.value.trim()" /></div></div>`;
  } else if (method === 'card') {
    details.innerHTML = `<div style="display:grid;gap:12px;margin-top:12px">
      <div class="form-field"><label class="form-label">Card Number</label><input class="form-input" type="text" placeholder="4242 4242 4242 4242" maxlength="19" oninput="this.value=this.value.replace(/[^0-9 ]/g,'');document.getElementById('pay-btn').disabled=this.value.replace(/\\s/g,'').length<16" /></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-field"><label class="form-label">Expiry</label><input class="form-input" type="text" placeholder="MM/YY" maxlength="5" /></div>
        <div class="form-field"><label class="form-label">CVV</label><input class="form-input" type="text" placeholder="123" maxlength="3" /></div>
      </div>
      <div class="form-field"><label class="form-label">Name on Card</label><input class="form-input" type="text" placeholder="Your Name" oninput="document.getElementById('pay-btn').disabled=!this.value.trim()" /></div>
    </div>`;
  } else {
    details.innerHTML = `<div style="padding:14px;text-align:center;color:var(--muted);font-size:0.88rem;margin-top:8px">You will be redirected to your ${method==='netbanking'?'bank':'wallet'} to complete payment.</div>`;
    document.getElementById('pay-btn').disabled = false;
  }
}

async function processPayment() {
  const btn = document.getElementById('pay-btn');
  btn.disabled = true;
  const origText = btn.textContent;
  btn.textContent = 'Processing…';
  const b = pendingPaymentBooking;
  const remaining = (b.total||0) - (b.paidAmount||0);
  try {
    if (selectedPaymentType === 'cash') {
      const updated = await api(`/bookings/${b._id}/payment`, { method:'PATCH', body:{ paymentType:'cash_on_visit', paymentMethod:'cash' }});
      document.getElementById('payment-body').innerHTML = `<div class="payment-success-anim"><div class="payment-success-icon">🏠</div><div class="payment-success-title">Cash on Visit Confirmed!</div><div class="payment-success-msg">Your slot is locked. Bring <strong>${fmt(remaining)}</strong> in cash on the booking day.</div></div>`;
      setTimeout(async () => { closeModal('payment-modal'); await loadMyBookings(); showPaymentReceipt({ ...b, ...updated }); pendingPaymentBooking = null; }, 1500);
    } else if (selectedPaymentType === 'full') {
      await new Promise(r => setTimeout(r, 1800));
      const updated = await api(`/bookings/${b._id}/payment`, { method:'PATCH', body:{ paymentType:'full', paymentMethod: getSelectedMethod() }});
      document.getElementById('payment-body').innerHTML = `<div class="payment-success-anim"><div class="payment-success-icon">✅</div><div class="payment-success-title">Payment Successful!</div><div class="payment-success-msg">Your payment of <strong>${fmt(remaining)}</strong> has been received. Booking fully confirmed!</div></div>`;
      setTimeout(async () => { closeModal('payment-modal'); await loadMyBookings(); showPaymentReceipt({ ...b, ...updated }); pendingPaymentBooking = null; }, 1500);
    } else if (selectedPaymentType === 'advance') {
      const advAmt = parseInt(document.getElementById('advance-amt')?.value || 0);
      if (!advAmt || advAmt <= 0) { btn.disabled=false; btn.textContent=origText; return toast('Enter advance amount','error'); }
      await new Promise(r => setTimeout(r, 1800));
      const updated = await api(`/bookings/${b._id}/payment`, { method:'PATCH', body:{ paymentType:'advance', paymentMethod: getSelectedMethod(), advanceAmount: advAmt }});
      document.getElementById('payment-body').innerHTML = `<div class="payment-success-anim"><div class="payment-success-icon">⚡</div><div class="payment-success-title">Advance Paid!</div><div class="payment-success-msg">Advance of <strong>${fmt(advAmt)}</strong> received. Remaining <strong>${fmt(remaining-advAmt)}</strong> to be paid on visit.</div></div>`;
      setTimeout(async () => { closeModal('payment-modal'); await loadMyBookings(); showPaymentReceipt({ ...b, ...updated }); pendingPaymentBooking = null; }, 1500);
    }
  } catch(e) { btn.disabled = false; btn.textContent = origText; toast(e.error || 'Payment failed', 'error'); }
}

function getSelectedMethod() {
  const sel = document.querySelector('.payment-method-btn.selected .pm-label');
  return sel ? sel.textContent.toLowerCase().replace(' ','') : 'online';
}

function showPaymentReceipt(b) {
  const paymentStatus = b.paymentStatus || (b.status==='paid' ? 'fully_paid' : 'unpaid');
  const paidAmt   = b.paidAmount || 0;
  const remaining = (b.total||0) - paidAmt;
  let paymentStatusBlock = '';
  if (b.cashOnVisitApproved && paymentStatus !== 'fully_paid') {
    paymentStatusBlock = `<div class="receipt-payment-status rps-cash"><div class="rps-icon">🏠</div><div><div class="rps-title" style="color:var(--sage)">Cash on Visit — Confirmed</div><div class="rps-sub">Bring <strong>${fmt(b.total)}</strong> in cash on the booking day.</div></div></div>`;
  } else if (paymentStatus === 'fully_paid' || b.status === 'paid') {
    paymentStatusBlock = `<div class="receipt-payment-status rps-full"><div class="rps-icon">✅</div><div><div class="rps-title" style="color:var(--success)">Fully Paid — Booking Confirmed!</div><div class="rps-sub">Your entire payment of ${fmt(b.total)} has been received.</div></div></div>`;
  } else if (paymentStatus === 'advance_paid') {
    paymentStatusBlock = `<div class="receipt-payment-status rps-advance"><div class="rps-icon">⚡</div><div><div class="rps-title" style="color:#8B6914">Advance Paid — Balance Due on Visit</div><div class="rps-sub">Advance of ${fmt(paidAmt)} received. Remaining <strong style="color:var(--brick)">${fmt(remaining)}</strong> at the venue.</div></div></div>`;
  }
  document.getElementById('receipt-content').innerHTML = `
    <div class="receipt-wrap">
      <div class="receipt-header">
        <div><div class="receipt-logo">EVNTLY<span>.</span></div>
          <div class="receipt-logo-sub">${b.cashOnVisitApproved && paymentStatus!=='fully_paid' ? 'Booking Confirmation' : paymentStatus==='advance_paid' ? 'Advance Payment Receipt' : 'Payment Receipt'}</div>
        </div>
        <div style="text-align:right;font-size:0.78rem;color:rgba(255,255,255,0.5)">${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div>
      </div>
      <div class="receipt-body">
        ${paymentStatusBlock}
        <div class="receipt-ref-label" style="margin-top:16px">Booking Reference ID</div>
        <div class="receipt-ref-box">${escHtml(b.ref || b._id || '—')}</div>
        <div class="receipt-section-title">📋 Booking Details</div>
        <div class="receipt-row"><span class="rlabel">Customer</span><span class="rvalue">${escHtml(b.userName||currentUser?.name||'Guest')}</span></div>
        <div class="receipt-row"><span class="rlabel">Venue</span><span class="rvalue">${escHtml(b.venueName||'—')}</span></div>
        <div class="receipt-row"><span class="rlabel">Date</span><span class="rvalue">${escHtml(b.date||'—')}</span></div>
        <div class="receipt-row"><span class="rlabel">Time Slot</span><span class="rvalue">${escHtml(b.startTime||'—')} (${b.hours} hr${b.hours>1?'s':''})</span></div>
        <div class="receipt-row"><span class="rlabel">Guests</span><span class="rvalue">${b.guests}</span></div>
        <div class="receipt-section-title">💰 Bill Breakdown</div>
        <div class="receipt-row"><span class="rlabel">Venue Charges (${b.hours} hr${b.hours>1?'s':''})</span><span class="rvalue">${fmt(b.basePrice)}</span></div>
        ${(b.addonPrice||0)>0?`<div class="receipt-row"><span class="rlabel">Add-on Facilities</span><span class="rvalue">${fmt(b.addonPrice)}</span></div>`:''}
        ${(b.plateCharges||0)>0?`<div class="receipt-row"><span class="rlabel">Plate Charges</span><span class="rvalue">${fmt(b.plateCharges)}</span></div>`:''}
        <div class="receipt-total-bar"><div><div class="rt-label">Grand Total</div></div><div class="rt-amount">${fmt(b.total)}</div></div>
        <div class="receipt-show-box">
          <div class="receipt-show-title">📱 Show This on Visit</div>
          <div class="receipt-show-ref">${escHtml(b.ref||b._id||'—')}</div>
          <div class="receipt-show-sub">Present this reference ID at the venue entrance</div>
        </div>
      </div>
      <div class="receipt-actions">
        <button class="btn-confirm" style="background:var(--dark)" onclick="window.print()">🖨️ Print Receipt</button>
        <button class="btn-confirm" style="background:var(--gold);color:var(--dark)" onclick="closeModal('receipt-modal')">Done ✓</button>
      </div>
    </div>`;
  openModal('receipt-modal');
}

function showReceiptFromBooking(b) { showPaymentReceipt(b); }

// ─── DASHBOARD DATA ───────────────────────────────────────────────
async function loadDashboard() {
  await loadOverview();
  await loadMyBookings();
  if (currentUser?.role === 'owner' || currentUser?.role === 'admin') {
    loadRequests();
    loadOwnerVenues();
  }
  document.getElementById('prof-name').value  = currentUser?.name  || '';
  document.getElementById('prof-email').value = currentUser?.email || '';
  document.getElementById('prof-phone').value = currentUser?.phone || '';
  document.getElementById('prof-role').value  = currentUser?.role  || '';
}

async function loadOverview() {
  const isOwner = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  const container = document.getElementById('overview-content');
  try {
    if (isOwner) {
      const stats = await api('/owner/stats');
      const pending   = (stats.bookings||[]).filter(b => b.status === 'pending').length;
      const confirmed = (stats.bookings||[]).filter(b => b.status === 'confirmed').length;
      container.innerHTML = `
        <div class="owner-welcome">
          <div class="owner-welcome-text"><h2>Welcome back, ${escHtml(currentUser?.name||'Owner')} 👑</h2><p>Here's your venue performance at a glance.</p></div>
          <div style="font-size:3rem;opacity:0.5">🏛️</div>
        </div>
        <div class="stats-row">
          <div class="stat-card"><div class="s-num">${stats.venues?.length || 0}</div><div class="s-label">My Venues</div></div>
          <div class="stat-card"><div class="s-num">${stats.totalBookings || 0}</div><div class="s-label">Total Bookings</div></div>
          <div class="stat-card"><div class="s-num">${confirmed}</div><div class="s-label">Confirmed</div></div>
          <div class="stat-card"><div class="s-num" style="color:${pending>0?'var(--brick)':'var(--dark)'}">${pending}</div><div class="s-label">Pending Approval${pending>0?'<span class="notif-dot"></span>':''}</div></div>
          <div class="stat-card"><div class="s-num">${fmt(stats.revenue || 0)}</div><div class="s-label">Revenue</div></div>
        </div>
        <div class="section-label">Recent Booking Requests</div>
        <table class="data-table">
          <thead><tr><th>Customer</th><th>Venue</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            ${(stats.bookings||[]).slice(0,6).map(b=>`
              <tr>
                <td><strong>${escHtml(b.userName||'—')}</strong></td>
                <td>${escHtml(b.venueName||'—')}</td>
                <td>${escHtml(b.date||'—')}</td>
                <td>${fmt(b.total)}</td>
                <td><span class="status-pill pill-${b.status}">${b.status}</span></td>
              </tr>`).join('') || '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--muted)">No bookings yet</td></tr>'}
          </tbody>
        </table>`;
    } else {
      const bookings  = await api('/bookings/me');
      const pending   = bookings.filter(b => b.status === 'pending').length;
      const confirmed = bookings.filter(b => b.status === 'confirmed').length;
      const totalSpent= bookings.filter(b => ['confirmed','paid'].includes(b.status)).reduce((s,b)=>s+b.total,0);
      container.innerHTML = `
        <div class="customer-welcome">
          <div class="customer-welcome-text"><h2>Hello, ${escHtml(currentUser?.name||'Guest')} 👋</h2><p>Ready to book your next extraordinary event?</p></div>
          <div class="customer-welcome-icon">🎉</div>
        </div>
        <div class="stats-row">
          <div class="stat-card"><div class="s-num">${bookings.length}</div><div class="s-label">Total Bookings</div></div>
          <div class="stat-card"><div class="s-num" style="color:${pending>0?'var(--brick)':'var(--dark)'}">${pending}</div><div class="s-label">Awaiting Approval</div></div>
          <div class="stat-card"><div class="s-num" style="color:var(--sage)">${confirmed}</div><div class="s-label">Confirmed</div></div>
          <div class="stat-card"><div class="s-num">${fmt(totalSpent)}</div><div class="s-label">Total Spent</div></div>
        </div>
        <div class="customer-quick-actions">
          <div class="cqa-btn" onclick="scrollToVenues()"><div class="cqa-icon">🔍</div><div class="cqa-label">Browse Venues</div></div>
          <div class="cqa-btn" onclick="switchPanel('bookings',document.getElementById('nav-bookings'))"><div class="cqa-icon">📅</div><div class="cqa-label">My Bookings</div></div>
          <div class="cqa-btn" onclick="switchPanel('my-reviews',document.getElementById('nav-reviews'))"><div class="cqa-icon">⭐</div><div class="cqa-label">My Reviews</div></div>
        </div>
        ${pending > 0 ? `<div class="pending-approval-banner"><div class="pab-icon">⏳</div><div class="pab-text"><div class="pab-title">You have ${pending} pending booking${pending>1?'s':''} awaiting owner approval</div><div class="pab-sub">Once approved, you'll see a "Pay Now" button in My Bookings.</div></div></div>` : ''}
        <div class="section-label">Recent Bookings</div>
        <table class="data-table">
          <thead><tr><th>Venue</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            ${bookings.slice(0,5).map(b=>`
              <tr>
                <td><strong>${escHtml(b.venueName||'—')}</strong></td>
                <td>${escHtml(b.date||'—')}</td>
                <td>${fmt(b.total)}</td>
                <td><span class="status-pill pill-${b.status}">${b.status}</span></td>
              </tr>`).join('') || '<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--muted)">No bookings yet. <a style="color:var(--gold);cursor:pointer" onclick="scrollToVenues()">Browse venues →</a></td></tr>'}
          </tbody>
        </table>`;
    }
  } catch(e) {
    container.innerHTML = `<div class="error-state"><div class="error-icon">⚠️</div><h3>Failed to load overview</h3><button class="btn-ghost" onclick="loadOverview()">Retry</button></div>`;
  }
}

async function loadMyBookings() {
  const container = document.getElementById('bookings-list');
  try {
    const bookings = await api('/bookings/me');
    if (!bookings.length) {
      container.innerHTML = `<div class="error-state"><div class="error-icon">📅</div><h3>No bookings yet</h3><p>Browse our venues and book your first event!</p><button class="btn-cta" style="margin-top:16px;padding:12px 28px" onclick="scrollToVenues()">Browse Venues →</button></div>`;
      return;
    }
    container.innerHTML = bookings.map(b => {
      const isPending   = b.status === 'pending';
      const isConfirmed = b.status === 'confirmed';
      const isPaid      = b.status === 'paid';
      const isAdvance   = b.paymentStatus === 'advance_paid';
      const isCashVisit = b.cashOnVisitApproved;
      const paidAmt     = b.paidAmount || 0;
      const remaining   = (b.total||0) - paidAmt;
      let pillLabel = b.status;
      if (isAdvance && isConfirmed) pillLabel = 'advance paid';
      let statusBanner = '';
      if (isPending) {
        statusBanner = `<div style="background:rgba(200,169,110,0.1);border:1px solid rgba(200,169,110,0.3);border-radius:6px;padding:10px 14px;font-size:0.82rem;color:var(--muted);margin-bottom:10px">⏳ <strong>Awaiting owner approval.</strong> Your slot will be blocked once approved.</div>`;
      } else if (isConfirmed && !isAdvance && !isCashVisit) {
        statusBanner = `<div style="background:rgba(39,174,96,0.08);border:1px solid rgba(39,174,96,0.3);border-radius:6px;padding:10px 14px;font-size:0.82rem;color:#1a7a40;margin-bottom:10px">✅ <strong>Booking Approved!</strong> 🔒 Slot blocked. Please complete payment to confirm your event.</div>`;
      } else if (isAdvance && isConfirmed) {
        statusBanner = `<div class="payment-remaining-bar"><div><div class="prb-label">⚡ Advance payment received</div></div><div class="prb-amounts"><span class="prb-paid">Paid: ${fmt(paidAmt)}</span><span class="prb-rem">Remaining: ${fmt(remaining)}</span></div></div>`;
      } else if (isCashVisit && isConfirmed) {
        statusBanner = `<div style="background:rgba(74,94,79,0.07);border:1px solid var(--sage);border-radius:6px;padding:10px 14px;font-size:0.82rem;color:var(--sage);margin-bottom:10px">🏠 <strong>Cash on Visit confirmed.</strong> Slot locked. Bring <strong>${fmt(b.total)}</strong> cash on visit day.</div>`;
      } else if (isPaid) {
        statusBanner = `<div style="background:rgba(39,174,96,0.06);border:1px solid rgba(39,174,96,0.25);border-radius:6px;padding:10px 14px;font-size:0.82rem;color:var(--success);margin-bottom:10px">🎉 <strong>Booking & Payment Complete!</strong> Enjoy your event.</div>`;
      }
      return `
        <div class="booking-status-card">
          <div class="bsc-header">
            <div><div class="bsc-venue">${escHtml(b.venueName||'—')}</div><div class="bsc-ref">#${escHtml(b.ref||b._id)}</div></div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <span class="status-pill pill-${isAdvance&&isConfirmed?'advance':b.status}">${pillLabel}</span>
              ${isConfirmed||isPaid ? `<span style="font-size:0.7rem;color:var(--brick);font-weight:600">🔒 Slot Blocked</span>` : ''}
            </div>
          </div>
          <div class="bsc-details">
            <div class="bsc-detail">📅 ${escHtml(b.date||'—')}</div>
            <div class="bsc-detail">🕐 ${escHtml(b.startTime||'—')} (${b.hours}hr)</div>
            <div class="bsc-detail">👥 ${b.guests} guests</div>
            <div class="bsc-detail">💰 ${fmt(b.total)}</div>
            ${b.eventType?`<div class="bsc-detail">🎪 ${escHtml(b.eventType)}</div>`:''}
          </div>
          ${statusBanner}
          <div class="bsc-actions">
            ${isConfirmed && !isAdvance && !isCashVisit ? `<button class="pay-now-btn" onclick='openPaymentModal(${JSON.stringify(b)})'>💳 Pay Now — ${fmt(b.total)}</button>` : ''}
            ${isAdvance && isConfirmed && remaining > 0 ? `<button class="btn-sm btn-sm-success" onclick='openPaymentModal(${JSON.stringify(b)})'>💳 Pay Remaining — ${fmt(remaining)}</button>` : ''}
            ${isPaid ? `<span style="color:var(--success);font-weight:600;font-size:0.88rem">✅ Payment Complete</span>` : ''}
            ${isCashVisit && isConfirmed ? `<span class="cash-visit-badge">🏠 Cash on Visit</span>` : ''}
            <button class="btn-sm btn-sm-ghost" onclick='showReceiptFromBooking(${JSON.stringify(b)})'>🧾 View Bill</button>
          </div>
        </div>`;
    }).join('');
  } catch(e) {
    container.innerHTML = `<div class="error-state"><div class="error-icon">⚠️</div><h3>Failed to load bookings</h3><button class="btn-ghost" onclick="loadMyBookings()">Retry</button></div>`;
  }
}

// ─── OWNER: BOOKING REQUESTS ──────────────────────────────────────
async function loadRequests() {
  const container = document.getElementById('requests-list');
  try {
    const requests = await api('/owner/requests');
    if (!requests.length) {
      container.innerHTML = `<div class="error-state"><div class="error-icon">📬</div><h3>No booking requests yet</h3><p>Requests will appear here when customers book your venues.</p></div>`;
      return;
    }
    function paymentBadge(r) {
      if (r.status !== 'confirmed' && r.status !== 'paid') return '';
      if (r.paymentStatus === 'fully_paid' || r.status === 'paid') return `<span class="req-payment-badge rpb-full">✅ Fully Paid</span>`;
      if (r.paymentStatus === 'advance_paid') return `<span class="req-payment-badge rpb-advance">⚡ Advance Paid</span>`;
      if (r.cashOnVisitApproved) return `<span class="req-payment-badge rpb-cash">🏠 Cash on Visit</span>`;
      return `<span class="req-payment-badge rpb-unpaid">⏳ Payment Pending</span>`;
    }
    container.innerHTML = requests.map(r => `
      <div class="req-card">
        <div class="req-card-header">
          <div>
            <div class="req-card-name">${escHtml(r.userName||'—')} <small style="font-family:'DM Sans',sans-serif;font-weight:400;color:var(--muted);font-size:0.82rem">· ${escHtml(r.eventType||'Event')}</small></div>
            <div class="req-card-ref">#${escHtml(r.ref||r._id)}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="status-pill pill-${r.status}">${r.status}</span>
            ${paymentBadge(r)}
            ${(r.status==='confirmed'||r.status==='paid') ? `<span style="font-size:0.72rem;color:var(--brick);font-weight:600">🔒 Slot Blocked</span>` : ''}
          </div>
        </div>
        <div class="req-card-meta">
          <span>🏛️ ${escHtml(r.venueName||'—')}</span><span>📅 ${escHtml(r.date||'—')}</span>
          <span>🕐 ${escHtml(r.startTime||'—')}</span><span>👥 ${r.guests} guests</span>
          <span>⏱️ ${r.hours} hr${r.hours>1?'s':''}</span>
          ${r.cateringType && r.cateringType !== 'none' ? `<span>🍽️ ${escHtml(r.cateringType)}</span>` : ''}
        </div>
        <div class="req-card-footer">
          <div class="req-price-big">${fmt(r.total)}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${r.status==='pending' ? `
              <button class="btn-sm btn-sm-success" onclick="updateBookingStatus('${r._id}','confirmed')">✓ Approve & Block Slot</button>
              <button class="btn-sm btn-sm-danger"  onclick="updateBookingStatus('${r._id}','rejected')">✕ Reject</button>
            ` : ''}
            ${r.status==='confirmed' && r.paymentStatus!=='fully_paid' && !r.cashOnVisitApproved ? `<span style="font-size:0.78rem;color:var(--muted)">Awaiting customer payment</span>` : ''}
            ${r.status==='paid' || r.paymentStatus==='fully_paid' ? `<span style="color:var(--success);font-weight:600;font-size:0.88rem">🎉 Booking & Payment Complete</span>` : ''}
            ${r.cashOnVisitApproved && r.status==='confirmed' ? `<span class="cash-visit-badge">🏠 Cash on Visit</span>` : ''}
          </div>
        </div>
      </div>`).join('');
  } catch(e) { container.innerHTML = `<div class="error-state"><div class="error-icon">⚠️</div><h3>Failed to load requests</h3></div>`; }
}

async function updateBookingStatus(id, status) {
  try {
    await api(`/bookings/${id}/status`, { method:'PATCH', body: { status } });
    toast(`Booking ${status}! ${status === 'confirmed' ? '✅ Slot is now blocked for this date.' : ''}`, status === 'confirmed' ? 'success' : 'info');
    loadRequests();
    loadOverview();
    loadVenues(); // refresh public cache so other customers see updated slot state
    const slotManagerPanel = document.getElementById('panel-slot-manager');
    if (slotManagerPanel?.classList.contains('active')) loadSlotManager();
  } catch(e) { toast('Update failed','error'); }
}

async function loadSlotManager() {
  const container = document.getElementById('slot-manager-content');
  try {
    const stats  = await api('/owner/stats');
    const venues = stats.venues || [];
    if (!venues.length) {
      container.innerHTML = `<div class="error-state"><div class="error-icon">🏛️</div><h3>No venues yet</h3><button class="btn-ghost" onclick="switchPanel('add-venue')">Add Venue →</button></div>`;
      return;
    }
    window._smVenues = venues;
    const today = new Date().toISOString().split('T')[0];
    container.innerHTML = venues.map(venue => {
      const vid   = venue._id;
      const open  = venue.openTime  || '09:00';
      const close = venue.closeTime || '22:00';
      const isBlocked = venue.blocked;
      return `<div class="slot-manager-card">
        <div class="slot-manager-name">🏛️ ${escHtml(venue.name)}</div>
        <div class="slot-manager-meta" style="margin-bottom:12px">${escHtml(venue.location)} · 🕐 ${open}–${close} · ${venue.capacity} guests</div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px;background:${isBlocked?'#fee2e2':'rgba(74,94,79,0.06)'};border-radius:8px;margin-bottom:14px;border:1px solid ${isBlocked?'#fca5a5':'rgba(74,94,79,0.2)'}">
          <span style="font-weight:700;font-size:0.88rem">${isBlocked?'🔴 Venue Blocked — Out of Service':'🟢 Venue Open for Booking'}</span>
          ${isBlocked
            ? `<button class="btn-sm btn-sm-success" onclick="toggleVenueBlock('${vid}',false)">✅ Unblock Venue</button>`
            : `<button class="btn-sm btn-sm-danger"  onclick="toggleVenueBlock('${vid}',true)">🚫 Block Entire Venue</button>`}
        </div>
        <div style="background:var(--card-bg,#fff);border:1px solid var(--border,#e5e5e5);border-radius:8px;padding:14px">
          <div style="font-weight:600;font-size:0.88rem;margin-bottom:10px">🗓️ Block / Unblock slots by date</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
            <input type="date" id="sm-date-${vid}" min="${today}"
              style="border:1px solid var(--border,#d1c4b0);border-radius:6px;padding:6px 10px;font-size:0.83rem;background:var(--card-bg,#fff);height:36px"
              onchange="renderSmGrid('${vid}')" />
            <select id="sm-dur-${vid}"
              style="border:1px solid var(--border,#d1c4b0);border-radius:6px;padding:5px 10px;font-size:0.83rem;background:var(--card-bg,#fff);height:36px"
              onchange="renderSmGrid('${vid}')">
              <option value="1">1 hr</option><option value="2">2 hr</option><option value="3">3 hr</option>
              <option value="4">4 hr</option><option value="5">5 hr</option><option value="6">6 hr</option><option value="7">7 hr</option>
            </select>
          </div>
          <div id="sm-grid-${vid}" style="display:flex;flex-wrap:wrap;gap:8px">
            <span style="color:var(--muted);font-size:0.82rem">Select a date above to see slots</span>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    container.innerHTML = `<div class="error-state"><div class="error-icon">⚠️</div><h3>Failed to load</h3><button class="btn-ghost" onclick="loadSlotManager()">Retry</button></div>`;
  }
}

function renderSmGrid(venueId) {
  const venue = (window._smVenues||[]).find(v => String(v._id)===String(venueId));
  if (!venue) return;
  const date   = document.getElementById('sm-date-'+venueId)?.value;
  const dur    = parseInt(document.getElementById('sm-dur-'+venueId)?.value||1);
  const grid   = document.getElementById('sm-grid-'+venueId);
  if (!date) { grid.innerHTML='<span style="color:var(--muted);font-size:0.82rem">Select a date first</span>'; return; }
  const starts = getStartTimes(venue.openTime||'09:00', venue.closeTime||'22:00', dur);
  if (!starts.length) { grid.innerHTML='<span style="color:#ef4444;font-size:0.82rem">No '+dur+'-hr slots fit in '+(venue.openTime||'09:00')+'–'+(venue.closeTime||'22:00')+'</span>'; return; }
  const blocked    = new Set(venue.blockedRanges||[]);
  const dayBlocked = blocked.has(date);
  grid.innerHTML = starts.map(start => {
    const end   = minsToTime(timeToMins(start)+dur*60);
    const key   = date+'|'+start+'-'+end;
    const label = start+'–'+end;
    const isBlk = dayBlocked || blocked.has(key);
    if (isBlk) return `<button class="slot-toggle-btn slot-off" style="font-size:0.82rem;padding:5px 12px" onclick="smToggle('${venueId}','${date}','${start}','${end}',false,this)">🔒 ${label}</button>`;
    return `<button class="slot-toggle-btn slot-on" style="font-size:0.82rem;padding:5px 12px" onclick="smToggle('${venueId}','${date}','${start}','${end}',true,this)">✅ ${label}</button>`;
  }).join('');
}

async function smToggle(venueId, date, start, end, currentlyOpen, btn) {
  const block = currentlyOpen;
  btn.disabled = true;
  try {
    await api('/venues/'+venueId+'/block-range', { method:'PATCH', body:{ date, timeRange:start+'-'+end, blocked:block } });
    const v = (window._smVenues||[]).find(x=>String(x._id)===String(venueId));
    if (v) {
      if (!v.blockedRanges) v.blockedRanges=[];
      const key=date+'|'+start+'-'+end;
      if (block) { if(!v.blockedRanges.includes(key)) v.blockedRanges.push(key); }
      else v.blockedRanges=v.blockedRanges.filter(r=>r!==key);
    }
    toast(block?'🔒 '+start+'–'+end+' blocked':'🔓 '+start+'–'+end+' unblocked', block?'info':'success');
    renderSmGrid(venueId);
  } catch(e) { btn.disabled=false; toast('Error: '+(e.error||e.message||''), 'error'); }
}

async function toggleVenueBlock(venueId, block) {
  try {
    await api('/venues/'+venueId+'/block', { method:'PATCH', body:{ blocked:block } });
    const v=(window._smVenues||[]).find(x=>String(x._id)===String(venueId));
    if(v) v.blocked=block;
    toast(block?'🚫 Venue blocked':'✅ Venue unblocked', block?'info':'success');
    loadSlotManager(); loadVenues();
  } catch(e) { toast('Error: '+(e.error||e.message||''), 'error'); }
}

// ─── OWNER: VENUES ────────────────────────────────────────────────
async function loadOwnerVenues() {
  try {
    const data   = await api('/owner/stats');
    const venues = data.venues || [];
    document.getElementById('owner-venues-list').innerHTML = venues.length
      ? venues.map(v => `
          <div class="owner-venue-card">
            <div class="ovc-img">${v.coverImage ? `<img src="${imgUrl(v.coverImage)}" alt="${escHtml(v.name)}" />` : (VENUE_EMOJIS[v.type]||'🏛️')}</div>
            <div class="ovc-info">
              <div class="ovc-name">${escHtml(v.name)}</div>
              <div class="ovc-meta">${escHtml(v.location)} · ${v.capacity} guests · ${fmt(v.price1hr)}/hr · ${v.slots?.length||0} slots</div>
            </div>
            <div class="ovc-actions">
              <button class="btn-sm btn-sm-ghost" onclick="openEditVenue('${v._id}')">✏️ Edit</button>
              <button class="btn-sm btn-sm-danger" onclick="deleteVenue('${v._id}','${escHtml(v.name)}')">🗑️ Delete</button>
            </div>
          </div>`).join('')
      : `<div style="padding:40px;text-align:center;color:var(--muted)">No venues listed yet. <button class="btn-ghost" style="margin-left:8px" onclick="switchPanel('add-venue')">Add one →</button></div>`;
  } catch(e) { console.error('Owner venues error:', e); }
}

// ─── IMAGE UPLOAD HELPERS ─────────────────────────────────────────
function onDragOver(e, id) { e.preventDefault(); document.getElementById(id+'-area')?.classList.add('drag-over'); }
function onCoverSelect(e, prefix) {
  const file = e.target.files[0]; if (!file) return;
  if (prefix === 'av') avCoverFile = file; else evCoverFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById(prefix + '-cover-preview').innerHTML = `
      <div class="img-preview-item is-cover" style="width:120px;height:90px">
        <img src="${ev.target.result}" /><div class="img-preview-cover-badge">COVER</div>
        <button class="img-preview-remove" onclick="removeCoverPreview('${prefix}')">✕</button>
      </div>`;
  };
  reader.readAsDataURL(file);
}
function removeCoverPreview(prefix) {
  if (prefix === 'av') avCoverFile = null; else evCoverFile = null;
  document.getElementById(prefix + '-cover-preview').innerHTML = '';
}
function onGallerySelect(e, prefix) {
  Array.from(e.target.files).forEach(file => {
    if (prefix === 'av') avGalleryFiles.push(file); else evGalleryFiles.push(file);
    const reader = new FileReader();
    reader.onload = ev => {
      const idx = (prefix === 'av' ? avGalleryFiles : evGalleryFiles).length - 1;
      const container = document.getElementById(prefix + '-gallery-previews');
      const item = document.createElement('div');
      item.className = 'img-preview-item'; item.dataset.idx = idx;
      item.innerHTML = `<img src="${ev.target.result}" /><button class="img-preview-remove" onclick="removeGalleryPreview(this,'${prefix}',${idx})">✕</button>`;
      container.appendChild(item);
    };
    reader.readAsDataURL(file);
  });
}
function removeGalleryPreview(btn, prefix, idx) {
  if (prefix === 'av') avGalleryFiles[idx] = null; else evGalleryFiles[idx] = null;
  btn.closest('.img-preview-item').remove();
}

// ─── SLOT MANAGER (add/edit venue) ───────────────────────────────
function renderSlots(prefix, slots) {
  const grid = document.getElementById(prefix + '-slots-grid');
  if (!grid) return;
  grid.innerHTML = slots.map((s, i) => `
    <div class="slot-chip ${s.available ? 'active' : 'inactive'}" onclick="toggleSlot('${prefix}',${i})" title="${s.available ? 'Click to deactivate' : 'Click to activate'}">
      ${s.time}<span onclick="event.stopPropagation();removeSlot('${prefix}',${i})" style="margin-left:6px;opacity:0.7">✕</span>
    </div>`).join('');
}
function addSlot(prefix) {
  const timeInput = document.getElementById(prefix + '-slot-time');
  if (!timeInput) return;
  const time = timeInput.value; if (!time) return;
  const slots = prefix === 'av' ? avSlots : evSlots;
  if (slots.find(s => s.time === time)) { toast('Slot already added','info'); return; }
  slots.push({ time, available: true, blockedDates: [] });
  renderSlots(prefix, slots);
}
function toggleSlot(prefix, idx) {
  const slots = prefix === 'av' ? avSlots : evSlots;
  slots[idx].available = !slots[idx].available;
  renderSlots(prefix, slots);
}
function removeSlot(prefix, idx) {
  if (prefix === 'av') avSlots.splice(idx, 1); else evSlots.splice(idx, 1);
  renderSlots(prefix, prefix === 'av' ? avSlots : evSlots);
}

// ─── HOTEL / AMENITY ─────────────────────────────────────────────
function addHotelField(prefix, value = '') {
  const list = document.getElementById(prefix + '-hotels');
  const row  = document.createElement('div'); row.className = 'hotel-item';
  row.innerHTML = `<input type="text" placeholder="Hotel name" value="${escHtml(value)}" /><button onclick="this.closest('.hotel-item').remove()">✕</button>`;
  list.appendChild(row);
}
function getHotelList(prefix) {
  return Array.from(document.querySelectorAll(`#${prefix}-hotels input`)).map(i => i.value.trim()).filter(Boolean);
}
function removeAmenityRow(btn) { btn.closest('tr').remove(); }
function addCustomAmenityRow(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  const tr = document.createElement('tr'); tr.dataset.key = 'custom_' + Date.now();
  tr.innerHTML = `<td><input class="price-field" style="width:140px" type="text" placeholder="Amenity name" /></td><td><input class="price-field" type="number" value="0" min="0" /></td><td><button class="remove-amenity-btn" onclick="removeAmenityRow(this)">✕</button></td>`;
  tbody.appendChild(tr);
}
function getAmenities(tbodyId) {
  return Array.from(document.querySelectorAll('#' + tbodyId + ' tr')).map(tr => {
    const inputs = tr.querySelectorAll('input');
    const key    = tr.dataset.key;
    const label  = tr.querySelector('td:first-child')?.textContent.trim() || inputs[0]?.value?.trim() || '';
    const price  = parseFloat(inputs[inputs.length > 1 ? inputs.length - 2 : 0]?.value || 0);
    return { key, label, price };
  }).filter(a => a.label);
}

// ─── VENUE FORM VALIDATION ────────────────────────────────────────
function validateVenueForm(prefix) {
  const name = document.getElementById(prefix + '-name').value.trim();
  const loc  = document.getElementById(prefix + '-location').value.trim();
  const cap  = parseInt(document.getElementById(prefix + '-capacity').value);
  const p1   = parseFloat(document.getElementById(prefix + '-price1').value);
  const pp   = parseFloat(document.getElementById(prefix + '-plate')?.value || 0);
  let ok = true;
  ok = validateField(prefix+'-name',     prefix+'-name-err',  !!name,   'Venue name is required')      && ok;
  ok = validateField(prefix+'-location', prefix+'-loc-err',   !!loc,    'Location is required')         && ok;
  ok = validateField(prefix+'-capacity', prefix+'-cap-err',   cap >= 1, 'Capacity must be at least 1')  && ok;
  ok = validateField(prefix+'-price1',   prefix+'-p1-err',    p1 > 0,   'Price must be greater than 0') && ok;
  ok = validateField(prefix+'-plate',    prefix+'-plate-err', pp >= 0,  'Plate price must be ≥ 0')      && ok;
  return ok;
}

// ─── ADD VENUE ────────────────────────────────────────────────────
async function submitAddVenue() {
  clearErrors('av-errors');
  if (!validateVenueForm('av')) { showErrors('av-errors','av-errors-list', ['Please fix the errors below']); return; }
  const btn = document.getElementById('av-submit-btn');
  btn.disabled = true; btn.textContent = 'Uploading…';
  try {
    const fd = new FormData();
    fd.append('name',        document.getElementById('av-name').value.trim());
    fd.append('type',        document.getElementById('av-type').value);
    fd.append('location',    document.getElementById('av-location').value.trim());
    fd.append('description', document.getElementById('av-desc').value);
    fd.append('capacity',    document.getElementById('av-capacity').value);
    fd.append('price1hr',    document.getElementById('av-price1').value);
    fd.append('price2hr',    document.getElementById('av-price2').value || '0');
    fd.append('platePrice',  document.getElementById('av-plate').value || '0');
    fd.append('slots',       JSON.stringify([]));
    fd.append('openTime',    document.getElementById('av-open-time')?.value || '09:00');
    fd.append('closeTime',   document.getElementById('av-close-time')?.value || '22:00');
    fd.append('cateringHotels', JSON.stringify(getHotelList('av')));
    fd.append('amenities',   JSON.stringify(getAmenities('av-amenity-tbody')));
    if (avCoverFile) fd.append('coverImage', avCoverFile);
    avGalleryFiles.filter(Boolean).forEach(f => fd.append('images', f));
    await api('/venues', { method:'POST', formData: fd });
    toast('Venue listed successfully! 🎉', 'success');
    resetAddVenueForm();
    switchPanel('venues');
    loadOwnerVenues();
    loadVenues();
  } catch(e) {
    showErrors('av-errors','av-errors-list', e.errors || [e.error || 'Failed to add venue']);
  } finally { btn.disabled = false; btn.textContent = 'List This Venue →'; }
}

function resetAddVenueForm() {
  ['av-name','av-location','av-desc','av-price2','av-plate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('av-capacity').value = '';
  document.getElementById('av-price1').value = '';
  avCoverFile = null; avGalleryFiles = []; avSlots = [];
  document.getElementById('av-cover-preview').innerHTML = '';
  document.getElementById('av-gallery-previews').innerHTML = '';
  const _sg=document.getElementById('av-slots-grid'); if(_sg)_sg.innerHTML='';
  document.getElementById('av-hotels').innerHTML = '';
  clearErrors('av-errors');
}

// ─── EDIT VENUE ───────────────────────────────────────────────────
async function openEditVenue(venueId) {
  try {
    const v = await api('/venues/' + venueId);
    editVenueData = v;
    evCoverFile = null; evGalleryFiles = []; evRemovedImages = [];
    document.getElementById('ev-id').value       = v._id;
    document.getElementById('ev-name').value     = v.name || '';
    document.getElementById('ev-type').value     = v.type || 'Banquet Hall';
    document.getElementById('ev-location').value = v.location || '';
    document.getElementById('ev-capacity').value = v.capacity || '';
    document.getElementById('ev-price1').value   = v.price1hr || '';
    document.getElementById('ev-price2').value   = v.price2hr || '';
    document.getElementById('ev-plate').value    = v.platePrice || 0;
    document.getElementById('ev-desc').value     = v.description || '';
    const coverDiv = document.getElementById('ev-current-cover');
    coverDiv.innerHTML = v.coverImage
      ? `<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--cream);border-radius:6px;border:1px solid var(--border)"><img src="${imgUrl(v.coverImage)}" style="width:80px;height:60px;object-fit:cover;border-radius:4px" onerror="this.style.display='none'" /><div><div style="font-size:0.82rem;font-weight:600">Current Cover</div><div style="font-size:0.72rem;color:var(--muted)">${v.coverImage}</div></div></div>`
      : `<div style="font-size:0.82rem;color:var(--muted)">No cover image set</div>`;
    document.getElementById('ev-cover-preview').innerHTML = '';
    const existingGallery = document.getElementById('ev-existing-gallery');
    existingGallery.innerHTML = (v.images || []).length
      ? v.images.map(fn => `<div class="gallery-item" id="eg-${fn.replace(/\./g,'_')}"><img src="${imgUrl(fn)}" alt="venue image" onerror="this.style.display='none'" /><button class="remove-img-btn" onclick="removeExistingImage('${fn}',this)">✕ Remove</button></div>`).join('')
      : `<div style="color:var(--muted);font-size:0.85rem">No gallery images yet</div>`;
    document.getElementById('ev-gallery-previews').innerHTML = '';
    evSlots = JSON.parse(JSON.stringify(v.slots || []));
    renderSlots('ev', evSlots);
    const _ot=document.getElementById('ev-open-time'); if(_ot)_ot.value=v.openTime||'09:00';
    const _ct=document.getElementById('ev-close-time'); if(_ct)_ct.value=v.closeTime||'22:00';
    updateHoursPreview('ev');
    document.getElementById('ev-hotels').innerHTML = '';
    (v.cateringHotels || []).forEach(h => addHotelField('ev', h));
    const tbody = document.getElementById('ev-amenity-tbody');
    tbody.innerHTML = '';
    (v.amenities || []).forEach(a => {
      const tr = document.createElement('tr'); tr.dataset.key = a.key || 'am_' + Date.now();
      tr.innerHTML = `<td>${escHtml(a.label)}</td><td><input class="price-field" type="number" value="${a.price||0}" min="0" /></td><td><button class="remove-amenity-btn" onclick="removeAmenityRow(this)">✕</button></td>`;
      tbody.appendChild(tr);
    });
    document.getElementById('edit-venue-nav').style.display = '';
    clearErrors('ev-errors');
    switchPanel('edit-venue', document.getElementById('edit-venue-nav'));
  } catch(e) { toast('Failed to load venue: ' + (e.error || e.message || ''), 'error'); }
}

function removeExistingImage(filename, btn) {
  evRemovedImages.push(filename);
  btn.closest('.gallery-item').remove();
  toast('Image marked for removal. Save to apply.', 'info');
}

async function submitEditVenue() {
  clearErrors('ev-errors');
  if (!validateVenueForm('ev')) { showErrors('ev-errors','ev-errors-list', ['Please fix the errors below']); return; }
  const venueId = document.getElementById('ev-id').value;
  if (!venueId) { toast('No venue selected','error'); return; }
  const btn = document.getElementById('ev-submit-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const fd = new FormData();
    fd.append('name',        document.getElementById('ev-name').value.trim());
    fd.append('type',        document.getElementById('ev-type').value);
    fd.append('location',    document.getElementById('ev-location').value.trim());
    fd.append('description', document.getElementById('ev-desc').value);
    fd.append('capacity',    document.getElementById('ev-capacity').value);
    fd.append('price1hr',    document.getElementById('ev-price1').value);
    fd.append('price2hr',    document.getElementById('ev-price2').value || '0');
    fd.append('platePrice',  document.getElementById('ev-plate').value || '0');
    fd.append('slots',       JSON.stringify(evSlots));
    fd.append('openTime',    document.getElementById('ev-open-time')?.value || '09:00');
    fd.append('closeTime',   document.getElementById('ev-close-time')?.value || '22:00');
    fd.append('cateringHotels', JSON.stringify(getHotelList('ev')));
    fd.append('amenities',   JSON.stringify(getAmenities('ev-amenity-tbody')));
    if (evRemovedImages.length) fd.append('removeImages', JSON.stringify(evRemovedImages));
    if (evCoverFile)  fd.append('coverImage', evCoverFile);
    evGalleryFiles.filter(Boolean).forEach(f => fd.append('images', f));
    const updated = await api('/venues/' + venueId, { method:'PUT', formData: fd });
    toast('Venue updated successfully! ✅', 'success');
    editVenueData = updated;
    document.getElementById('edit-venue-nav').style.display = 'none';
    switchPanel('venues');
    loadOwnerVenues();
    loadVenues();
  } catch(e) {
    showErrors('ev-errors','ev-errors-list', e.errors || [e.error || 'Failed to update venue']);
  } finally { btn.disabled = false; btn.textContent = 'Save Changes →'; }
}

async function deleteVenue(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    await api('/venues/' + id, { method:'DELETE' });
    toast('Venue deleted', 'info');
    loadOwnerVenues();
    loadVenues();
  } catch(e) { toast(e.error || 'Delete failed','error'); }
}

// ─── REVIEWS — PUBLIC LOAD ────────────────────────────────────────
async function loadReviews() {
  try {
    const reviews = await api('/reviews');
    if (!reviews.length) return;
    const grid = document.getElementById('reviews-grid');
    const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
    // Replace static cards with DB reviews appended after static ones
    grid.innerHTML += reviews.map(r => `
      <div class="testimonial-card">
        <div class="stars">${stars(r.rating)}</div>
        ${r.photo ? `<img src="${imgUrl(r.photo)}" style="width:100%;height:160px;object-fit:cover;border-radius:6px;margin-bottom:12px" onerror="this.style.display='none'" />` : ''}
        <p class="testimonial-text">${escHtml(r.comment || 'Great venue!')}</p>
        <div class="testimonial-author">
          <div class="author-avatar">👤</div>
          <div><div class="author-name">${escHtml(r.userName||'Guest')}</div><div class="author-role">EVNTLY Customer</div></div>
        </div>
      </div>`).join('');
  } catch(e) { /* silently fail */ }
}

// ─── REVIEWS — MY REVIEWS (customer dashboard) ────────────────────
async function loadMyReviews() {
  const container = document.getElementById('my-reviews-content');
  if (!container) return;
  try {
    // Load venues the customer has booked (paid/confirmed) so they can review them
    const bookings = await api('/bookings/me');
    const eligible = bookings.filter(b => b.status === 'confirmed' || b.status === 'paid');
    const uniqueVenues = [...new Map(eligible.map(b => [b.venueId, { id: b.venueId, name: b.venueName }])).values()];

    container.innerHTML = `
      <div class="review-submit-section">
        <h4>⭐ Write a Review</h4>
        ${!eligible.length ? `<p style="color:var(--muted);font-size:0.88rem">You need at least one confirmed booking to leave a review.</p>` : `
        <div class="form-errors-box" id="rv-errors"><ul id="rv-errors-list"></ul></div>
        <label class="dash-label">Select Venue</label>
        <select class="review-venue-select" id="rv-venue-id">
          <option value="">— Choose a venue you've booked —</option>
          ${uniqueVenues.map(v => `<option value="${v.id}">${escHtml(v.name)}</option>`).join('')}
        </select>
        <label class="dash-label">Your Rating</label>
        <div class="star-rating-input" id="rv-stars">
          ${[1,2,3,4,5].map(n => `<span data-val="${n}" onclick="setReviewRating(${n})">★</span>`).join('')}
        </div>
        <label class="dash-label">Your Review</label>
        <textarea class="review-comment-input" id="rv-comment" placeholder="Tell others about your experience…"></textarea>
        <label class="dash-label" style="margin-top:12px">Attach Photo (optional)</label>
        <div class="img-upload-area" style="padding:16px;margin-bottom:10px" onclick="document.getElementById('rv-photo-input').click()">
          <input type="file" id="rv-photo-input" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="previewReviewPhoto(event)" />
          <div class="img-upload-icon" style="font-size:1.4rem">📷</div>
          <div class="img-upload-text" style="font-size:0.8rem">Click to attach a photo</div>
        </div>
        <div id="rv-photo-preview" style="margin-bottom:10px"></div>
        <button class="btn-submit" style="margin-top:0" onclick="submitReview()">Submit Review →</button>`}
      </div>
      <div style="margin-top:32px">
        <div class="section-label">My Past Reviews</div>
        <div id="my-reviews-list"><p style="color:var(--muted);font-size:0.88rem">Loading…</p></div>
      </div>`;

    // Load existing reviews by this user
    const allReviews = await api('/reviews?userId=' + currentUser._id);
    const myReviews  = allReviews.filter(r => String(r.userId) === String(currentUser._id));
    const listEl = document.getElementById('my-reviews-list');
    if (!myReviews.length) {
      listEl.innerHTML = `<p style="color:var(--muted);font-size:0.88rem">You haven't written any reviews yet.</p>`;
    } else {
      const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
      listEl.innerHTML = myReviews.map(r => `
        <div class="testimonial-card" style="margin-bottom:12px">
          <div class="stars">${stars(r.rating)}</div>
          <p class="testimonial-text">${escHtml(r.comment||'—')}</p>
          <div style="font-size:0.75rem;color:var(--muted);margin-top:8px">${new Date(r.createdAt).toLocaleDateString('en-IN')}</div>
        </div>`).join('');
    }
    selectedReviewRating = 0;
  } catch(e) {
    if (container) container.innerHTML = `<div class="error-state"><div class="error-icon">⚠️</div><h3>Failed to load reviews</h3></div>`;
  }
}

let reviewPhotoFile = null;
function setReviewRating(val) {
  selectedReviewRating = val;
  document.querySelectorAll('#rv-stars span').forEach((s, i) => {
    s.classList.toggle('active', i < val);
  });
}

function previewReviewPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  reviewPhotoFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('rv-photo-preview').innerHTML = `
      <div class="img-preview-item" style="position:relative;display:inline-block">
        <img src="${ev.target.result}" style="width:120px;height:90px;object-fit:cover;border-radius:6px;border:2px solid var(--gold)" />
        <button class="img-preview-remove" onclick="reviewPhotoFile=null;document.getElementById('rv-photo-preview').innerHTML='';document.getElementById('rv-photo-input').value=''">✕</button>
      </div>`;
  };
  reader.readAsDataURL(file);
}

async function submitReview() {
  clearErrors('rv-errors');
  const venueId = document.getElementById('rv-venue-id')?.value;
  const comment = document.getElementById('rv-comment')?.value.trim();
  const errors  = [];
  if (!venueId)              errors.push('Please select a venue');
  if (!selectedReviewRating) errors.push('Please select a rating (1–5 stars)');
  if (!comment)              errors.push('Please write a review comment');
  if (errors.length) return showErrors('rv-errors','rv-errors-list', errors);
  try {
    if (reviewPhotoFile) {
      const fd = new FormData();
      fd.append('venueId', venueId);
      fd.append('rating', selectedReviewRating);
      fd.append('comment', comment);
      fd.append('photo', reviewPhotoFile);
      await api('/reviews', { method:'POST', formData: fd });
    } else {
      await api('/reviews', { method:'POST', body: { venueId, rating: selectedReviewRating, comment } });
    }
    toast('Review submitted! Thank you 🌟', 'success');
    selectedReviewRating = 0;
    reviewPhotoFile = null;
    await loadMyReviews();
    await loadReviews();
  } catch(e) { showErrors('rv-errors','rv-errors-list', [e.error || 'Failed to submit review']); }
}

// ─── INIT ─────────────────────────────────────────────────────────
(async () => {
  const searchDate = document.getElementById('search-date');
  if (searchDate) searchDate.min = new Date().toISOString().split('T')[0];
  await checkConnection();
  await restoreSession();
  await loadVenues();
  loadReviews();
  if (currentUser) showDashboard();
})();
