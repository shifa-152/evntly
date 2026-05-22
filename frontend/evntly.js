// ═══════════════════════════════════════════════════════════════
//  EVNTLY — Main JavaScript
// ═══════════════════════════════════════════════════════════════

// ─── CONFIG ──────────────────────────────────────────────────────
// const _host = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
//   ? 'https://evntly-28mf.vercel.app'
//   : 'https://evntly-28mf.vercel.app';
// const API_BASE = _host + '/api';
const _host = 'https://evntly-production-c766.up.railway.app';
const API_BASE = _host + '/api';
// Debug: uncomment to verify API endpoint
// console.log('API_BASE:', API_BASE);

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
function toggleCustomType(prefix) {
  const sel = document.getElementById(prefix + '-type');
  const custom = document.getElementById(prefix + '-type-custom');
  if (!custom) return;
  custom.style.display = sel.value === '__custom__' ? '' : 'none';
  if (sel.value !== '__custom__') custom.value = '';
}

// ─── UTILS ───────────────────────────────────────────────────────
function fmt(n) { return '₹' + (n || 0).toLocaleString('en-IN'); }
function escHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function imgUrl(fn) { if (!fn) return ''; if (fn.startsWith('http')) return fn; return `${_host}/uploads/${fn}`; }
// Strict email validation — rejects mehran@gmail.com.com style
// ─── STRICT VALIDATORS ───────────────────────────────────────────
function isValidEmail(email) { return emailError(email) === null; }

// Returns null if valid, or an exact error string if invalid
// ─── LIVE INLINE VALIDATORS ──────────────────────────────────────
function clearFieldErr(id) {
  const el = document.getElementById(id);
  if (el) el.textContent = '';
}
function clearFE(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}
function setFieldErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = '#ef4444';
}
function setFieldOk(inputId, errId) {
  const input = document.getElementById(inputId);
  const err   = document.getElementById(errId);
  if (input) { input.classList.remove('input-error'); input.classList.add('input-ok'); }
  if (err)   err.textContent = '';
}
function liveEmailValidate(inputId, errId) {
  const val = document.getElementById(inputId)?.value.trim() || '';
  const input = document.getElementById(inputId);
  const err   = document.getElementById(errId);
  if (!val) { if (input) input.classList.remove('input-ok','input-error'); if(err) err.textContent = ''; return; }
  const msg = emailError(val);
  if (msg) {
    if (input) { input.classList.add('input-error'); input.classList.remove('input-ok'); }
    if (err)   err.textContent = msg;
  } else {
    if (input) { input.classList.remove('input-error'); input.classList.add('input-ok'); }
    if (err)   err.textContent = '';
  }
}
function livePasswordValidate(inputId, errId) {
  const val = document.getElementById(inputId)?.value || '';
  const input = document.getElementById(inputId);
  const err   = document.getElementById(errId);
  if (!val) { if(input) input.classList.remove('input-ok','input-error'); if(err) err.textContent=''; return; }
  if (!isValidPassword(val)) {
    if(input) { input.classList.add('input-error'); input.classList.remove('input-ok'); }
    if(err)   err.textContent = 'Password must be 6–128 characters';
  } else {
    if(input) { input.classList.remove('input-error'); input.classList.add('input-ok'); }
    if(err)   err.textContent = '';
  }
}
function livePhoneValidate(inputId, errId) {
  const val = document.getElementById(inputId)?.value.trim() || '';
  const input = document.getElementById(inputId);
  const err   = document.getElementById(errId);
  if (!val) { if(input) input.classList.remove('input-ok','input-error'); if(err) err.textContent=''; return; }
  const msg = phoneError(val);
  if (msg) {
    if(input) { input.classList.add('input-error'); input.classList.remove('input-ok'); }
    if(err)   err.textContent = msg;
  } else {
    if(input) { input.classList.remove('input-error'); input.classList.add('input-ok'); }
    if(err)   err.textContent = '';
  }
}
function owLiveEmailValidate() {
  const val = document.getElementById('ow-email')?.value.trim() || '';
  if (!val) { owFieldError('ow-email',''); return; }
  const msg = emailError(val);
  owFieldError('ow-email', msg || '');
}

function emailError(email) {
  if (!email) return 'Email is required';

  // No spaces allowed anywhere
  if (/\s/.test(email)) return 'Email cannot contain spaces';

  // Must have exactly one @
  const atCount = (email.match(/@/g) || []).length;
  if (atCount === 0) return 'Email must contain @  — e.g. you@example.com';
  if (atCount > 1)   return 'Email cannot contain more than one @';

  const [local, domain] = email.split('@');

  // ── LOCAL PART (before @) ──────────────────────────────────────
  if (!local)                           return 'Email must have a username before @ — e.g. you@example.com';
  if (local.length > 64)                return 'Username part before @ is too long (max 64 characters)';
  if (local.startsWith('.'))            return 'Email username cannot start with a dot';
  if (local.endsWith('.'))              return 'Email username cannot end with a dot';
  if (/\.\./.test(local))              return 'Email username cannot have consecutive dots';
  if (!/^[a-zA-Z0-9._%+\-]+$/.test(local))
    return 'Email username contains invalid characters — only letters, digits, dots, _, %, +, - are allowed';

  // ── DOMAIN PART (after @) ──────────────────────────────────────
  if (!domain)                          return 'Email must have a domain after @ — e.g. you@gmail.com';
  if (domain.length > 255)              return 'Email domain is too long';
  if (!domain.includes('.'))            return 'Email domain must include a dot — e.g. gmail.com';
  if (domain.startsWith('.'))           return 'Email domain cannot start with a dot';
  if (domain.endsWith('.'))             return 'Email domain cannot end with a dot';
  if (/\.\./.test(domain))             return 'Email domain cannot have consecutive dots';
  if (domain.startsWith('-'))           return 'Email domain cannot start with a hyphen';
  if (domain.endsWith('-'))             return 'Email domain cannot end with a hyphen';
  if (!/^[a-zA-Z0-9.\-]+$/.test(domain))
    return 'Email domain contains invalid characters';

  const parts = domain.split('.');
  const tld   = parts[parts.length - 1];
  const sld   = parts[parts.length - 2]; // second-level domain e.g. "gmail"

  // TLD must be 2–6 letters only
  if (!/^[a-zA-Z]{2,6}$/.test(tld))
    return `".${tld}" is not a valid domain ending — use something like .com, .in, .org`;

  // Detect repeated TLDs: com.com, com.com.com, net.net etc.
  const knownTLDs = ['com','net','org','edu','gov','io','co','in','uk','au','de','fr','us','ca','nz','sg','ae','me','app','dev'];
  const tldParts  = parts.filter(p => knownTLDs.includes(p.toLowerCase()));
  if (tldParts.length >= 2)
    return `Domain "${domain}" has repeated extensions — did you mean @${parts[0]}.${tld}?`;

  // Catch common domain typos using known popular domains
  const popularDomains = {
    'gmail': ['gmai','gmial','gmali','gmal','gmil','gamil','gmaill','gmaol','gnail','gmaio','gmai1'],
    'yahoo': ['yaho','yahooo','yahho','yaho0','yhoo','yhaoo'],
    'hotmail': ['hotmai','hotmial','hotmali','hotmal','hotmil'],
    'outlook': ['outook','outlok','outllok','otlook'],
  };
  const sldLower = sld.toLowerCase();
  for (const [correct, typos] of Object.entries(popularDomains)) {
    if (typos.includes(sldLower)) {
      return `Did you mean @${correct}.${tld}? "${sld}" looks like a typo`;
    }
  }

  // SLD must be at least 1 char
  if (!sld || sld.length < 1)
    return `Email domain "${domain}" is too short — please check it`;

  return null; // all good
}

function isStrictEmail(email) { return emailError(email) === null; }
function isValidName(name) {
  // Letters (incl accented), spaces, apostrophes, hyphens only — no digits or symbols
  return name.length >= 2 && /^[a-zA-Z\u00C0-\u024F' \-]+$/.test(name);
}
function isValidVenueName(name) {
  // Venue names can have letters, digits, spaces and basic punctuation but no special chars
  return name.length >= 2 && name.length <= 100 && /^[a-zA-Z0-9 ',\.\-&()]+$/.test(name);
}
function isValidLocation(loc) {
  return loc.length >= 2 && loc.length <= 150;
}
function isValidPrice(val) {
  const n = parseFloat(val);
  return !isNaN(n) && n > 0 && n <= 10000000;
}
function isValidCapacity(val) {
  const n = parseInt(val);
  return !isNaN(n) && n >= 1 && n <= 100000;
}
function isValidPassword(pw) {
  return pw.length >= 6 && pw.length <= 128;
}
function isValidComment(text) {
  return text.length >= 5 && text.length <= 1000;
}
function isValidGuests(n, capacity) {
  return n >= 1 && n <= capacity;
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

function liveNameValidate(inputId, errId) {
  const val   = document.getElementById(inputId)?.value.trim() || '';
  const input = document.getElementById(inputId);
  const err   = document.getElementById(errId);
  if (!val) { if(input) input.classList.remove('input-ok','input-error'); if(err) err.textContent=''; return; }
  if (!isValidName(val)) {
    if(input) { input.classList.add('input-error'); input.classList.remove('input-ok'); }
    if(err)   err.textContent = 'Name can only contain letters, spaces, apostrophes or hyphens — no numbers or symbols';
  } else {
    if(input) { input.classList.remove('input-error'); input.classList.add('input-ok'); }
    if(err)   err.textContent = '';
  }
}
function liveConfirmValidate(pwId, confirmId, errId) {
  const pw      = document.getElementById(pwId)?.value || '';
  const confirm = document.getElementById(confirmId)?.value || '';
  const input   = document.getElementById(confirmId);
  const err     = document.getElementById(errId);
  if (!confirm) { if(input) input.classList.remove('input-ok','input-error'); if(err) err.textContent=''; return; }
  if (pw !== confirm) {
    if(input) { input.classList.add('input-error'); input.classList.remove('input-ok'); }
    if(err)   err.textContent = 'Passwords do not match';
  } else {
    if(input) { input.classList.remove('input-error'); input.classList.add('input-ok'); }
    if(err)   err.textContent = '';
  }
}
function regStrength() {
  const pw   = document.getElementById('reg-password')?.value || '';
  const fill = document.getElementById('reg-strength-fill');
  const text = document.getElementById('reg-strength-text');
  if (!fill || !text) return;
  let score = 0;
  if (pw.length >= 6)              score++;
  if (pw.length >= 10)             score++;
  if (/[A-Z]/.test(pw))           score++;
  if (/[0-9]/.test(pw))           score++;
  if (/[^A-Za-z0-9]/.test(pw))   score++;
  const levels = [
    { w:'0%',   c:'#ef4444', t:'' },
    { w:'25%',  c:'#ef4444', t:'Weak — too short' },
    { w:'45%',  c:'#f59e0b', t:'Fair — add numbers or symbols' },
    { w:'65%',  c:'#3b82f6', t:'Good' },
    { w:'85%',  c:'#22c55e', t:'Strong' },
    { w:'100%', c:'#16a34a', t:'Very Strong ✓' },
  ];
  const l = levels[Math.min(score, 5)];
  fill.style.width      = l.w;
  fill.style.background = l.c;
  text.textContent      = l.t;
  text.style.color      = l.c;
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
  const opts = { method, headers, cache: 'no-store' }; // ← add cache: 'no-store'
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
    if (el) { el.className = 'api-status online'; el.innerHTML = '<div class="api-dot"></div><span>Live</span>'; }
  } catch {
    if (el) { el.className = 'api-status offline'; el.innerHTML = '<div class="api-dot"></div><span>Offline</span>'; }
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
  if (!email)                   errors.push('Email is required');
  else { const _ee = emailError(email); if (_ee) errors.push(_ee); }
  if (!password)                errors.push('Password is required');
  else if (password.length < 6) errors.push('Password must be at least 6 characters');
  else if (password.length > 128) errors.push('Password is too long');
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
  const confirm  = document.getElementById('reg-confirm').value;
  const phone    = document.getElementById('reg-phone').value.trim();
  const role     = document.getElementById('reg-role').value;
  const errors   = [];

  // Name
  if (!name) {
    errors.push('Full name is required');
    setFieldErr('reg-name-err', 'Full name is required');
    document.getElementById('reg-name')?.classList.add('input-error');
  } else if (!isValidName(name)) {
    const msg = 'Name can only contain letters, spaces, apostrophes or hyphens';
    errors.push(msg); setFieldErr('reg-name-err', msg);
    document.getElementById('reg-name')?.classList.add('input-error');
  }

  // Email
  if (!email) {
    errors.push('Email is required');
    setFieldErr('reg-email-err', 'Email is required');
    document.getElementById('reg-email')?.classList.add('input-error');
  } else {
    const _ee = emailError(email);
    if (_ee) {
      errors.push(_ee); setFieldErr('reg-email-err', _ee);
      document.getElementById('reg-email')?.classList.add('input-error');
    }
  }

  // Password
  if (!password) {
    errors.push('Password is required');
    setFieldErr('reg-pw-err', 'Password is required');
    document.getElementById('reg-password')?.classList.add('input-error');
  } else if (!isValidPassword(password)) {
    const msg = 'Password must be 6–128 characters';
    errors.push(msg); setFieldErr('reg-pw-err', msg);
    document.getElementById('reg-password')?.classList.add('input-error');
  }

  // Confirm password
  if (!confirm) {
    errors.push('Please confirm your password');
    setFieldErr('reg-confirm-err', 'Please confirm your password');
    document.getElementById('reg-confirm')?.classList.add('input-error');
  } else if (password !== confirm) {
    errors.push('Passwords do not match');
    setFieldErr('reg-confirm-err', 'Passwords do not match');
    document.getElementById('reg-confirm')?.classList.add('input-error');
  }

  // Phone (optional but validated if provided)
  const phoneErr = phoneError(phone);
  if (phoneErr) {
    errors.push(phoneErr); setFieldErr('reg-phone-err', phoneErr);
    document.getElementById('reg-phone')?.classList.add('input-error');
  }

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

function owFieldError(id, msg) {
  const el = document.getElementById(id + '-err');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
  document.getElementById(id)?.classList.toggle('ow-invalid', !!msg);
}
function owClearErrors() {
  ['ow-name','ow-email','ow-password','ow-phone','ow-proof'].forEach(id => owFieldError(id, ''));
}


// ─── OWNER PLAN SELECTION ────────────────────────────────
function selectOwnerPlan(card, planKey) {
  document.querySelectorAll('.ow-plan-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  document.getElementById('ow-plan').value = planKey;
}

// Load plans dynamically from API, render cards
async function loadOwnerPlans() {
  const container = document.getElementById('ow-plan-cards');
  if (!container) return;

  // Static fallback plans shown immediately
  const fallback = [
    { key:'basic',    name:'Basic',    price:4999,  maxVenues:1,  features:['1 venue listing','Standard support','Basic analytics'],          isPopular:false },
    { key:'standard', name:'Standard', price:9999,  maxVenues:3,  features:['3 venue listings','Priority support','Advanced analytics'],       isPopular:true  },
    { key:'premium',  name:'Premium',  price:19999, maxVenues:-1, features:['Unlimited venues','Dedicated support','Featured listings'],        isPopular:false },
  ];

  function renderPlans(plans) {
    const firstKey = plans[0]?.key || 'basic';
    // Respect already-selected plan if user switched before API returned
    const currentSel = document.getElementById('ow-plan').value || firstKey;
    const selKey = plans.find(p => p.key === currentSel) ? currentSel : firstKey;
    document.getElementById('ow-plan').value = selKey;

    container.innerHTML = plans.map(p => {
      const maxLabel = p.maxVenues === -1 ? 'Unlimited venues' : p.maxVenues + ' venue listing' + (p.maxVenues > 1 ? 's' : '');
      const feats = (p.features || [maxLabel]).join('<br>');
      return `
        <div class="ow-plan-card ${p.key===selKey?'selected':''}" onclick="selectOwnerPlan(this,'${p.key}')">
          ${p.isPopular ? '<div class="ow-plan-badge">Popular</div>' : ''}
          <div class="ow-plan-name">${p.name}</div>
          <div class="ow-plan-price">₹${Number(p.price).toLocaleString('en-IN')}</div>
          <div class="ow-plan-feat">${feats}</div>
        </div>`;
    }).join('');
  }

  // Show fallback first
  renderPlans(fallback);

  // Then try to load from API and re-render with live data
  try {
    const host = (location.hostname==='localhost'||location.hostname==='127.0.0.1')
      ? 'https://evntly-production-c766.up.railway.app' : 'https://evntly-production-c766.up.railway.app';
    const res  = await fetch(host + '/api/plans');
    if (res.ok) {
      const plans = await res.json();
      if (Array.isArray(plans) && plans.length) renderPlans(plans);
    }
  } catch(e) {
    // Keep fallback — no visible error to user
    console.warn('Could not load plans from API, using defaults');
  }
}


let owProofFiles = [];
function previewOwnerProofs(e) {
  Array.from(e.target.files).forEach(file => {
    owProofFiles.push(file);
    const preview = document.getElementById('ow-proof-preview');
    const div = document.createElement('div');
    div.style.cssText = 'background:rgba(200,169,110,0.1);border:1px solid rgba(200,169,110,0.25);border-radius:6px;padding:6px 12px;font-size:0.78rem;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:8px';
    div.innerHTML = `<span>${file.name.endsWith('.pdf') ? '📄' : '🖼️'}</span><span>${file.name}</span>`;
    preview.appendChild(div);
  });
}

async function registerOwner() {
  owClearErrors();
  const name         = document.getElementById('ow-name').value.trim();
  const email        = document.getElementById('ow-email').value.trim();
  const password     = document.getElementById('ow-password').value;
  const phone        = document.getElementById('ow-phone').value.trim();

  let hasError = false;
  if (!name) {
    owFieldError('ow-name', 'Full name is required'); hasError = true;
  } else if (!isValidName(name)) {
    owFieldError('ow-name', 'Name can only contain letters, spaces, apostrophes or hyphens'); hasError = true;
  }
  if (!email) {
    owFieldError('ow-email', 'Email is required'); hasError = true;
  } else {
    const _ee = emailError(email);
    if (_ee) { owFieldError('ow-email', _ee); hasError = true; }
  }
  if (!password) {
    owFieldError('ow-password', 'Password is required'); hasError = true;
  } else if (!isValidPassword(password)) {
    owFieldError('ow-password', 'Password must be 6–128 characters'); hasError = true;
  }
  const owPhoneErr = phoneError(phone);
  if (owPhoneErr) { owFieldError('ow-phone', owPhoneErr); hasError = true; }

  if (!owProofFiles.length) {
    owFieldError('ow-proof', 'Please upload at least one proof document'); hasError = true;
  }
  if (hasError) {
    const firstErr = document.querySelector('.ow-field-err[style*="block"]');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('Please fill in all required fields highlighted above ↑', 'error');
    return;
  }

  const btn = document.getElementById('ow-submit-btn');
  btn.disabled = true; btn.textContent = 'Submitting…';

  try {
    const fd = new FormData();
    const plan = document.getElementById('ow-plan')?.value || 'basic';
    fd.append('name',         name);
    fd.append('email',        email);
    fd.append('password',     password);
    fd.append('phone',        phone);
    fd.append('plan',         plan);

    owProofFiles.forEach(f => fd.append('proofFiles', f));
    await api('/owner/apply', { method:'POST', formData: fd });
    owClearErrors();
    owProofFiles = [];
    document.getElementById('ow-proof-preview').innerHTML = '';
    document.getElementById('ow-success-msg').style.display = 'block';
    btn.textContent = 'Application Submitted ✅';
    toast('Application submitted! We\'ll review and get back to you. 📋', 'success');
  } catch(e) {
    btn.disabled = false;
    btn.textContent = 'Submit Application →';
    toast(e.error || e.errors?.[0] || 'Submission failed', 'error');
  }
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
function scrollToSection(id) {
  hideDashboard();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }));
}
function scrollToVenues()     { scrollToSection('venues-section'); }
function scrollToFacilities() { scrollToSection('facilities-section'); }
function scrollToOwner()      { scrollToSection('owner-section'); }
function scrollToReviews()    { scrollToSection('reviews-section'); }

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
  if (id === 'reports')      loadReports();
  if (id === 'my-plan')      loadMyPlan();
  if (id === 'offers') loadOffersPanel();
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
      : ``;
    return `
    <div class="venue-card" onclick="${v._allBlocked ? "toast('This venue is fully booked on ' + '" + date + "'. Try another date.','info')" : "openVenueDetails('" + v._id + "')"}">
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
          ${v.venueSize ? `<span class="tag">📐 ${escHtml(v.venueSize)}</span>` : ''}
          ${v.platePrice > 0 ? `<span class="tag">🍽️ ₹${v.platePrice}/plate</span>` : ''}
        </div>
        <div class="venue-footer">
          <div class="venue-price">${fmt(v.price1hr)} <span>/hr</span></div>
          ${v._allBlocked
            ? `<button class="btn-book" style="background:var(--brick);color:white;cursor:not-allowed" disabled>Fully Booked</button>`
            : `<button class="btn-book" onclick="event.stopPropagation();openVenueDetails('${v._id}')">Check Availability</button>`}
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
    <div class="venue-card" onclick="openVenueDetails('${v._id}')">
      <div class="venue-img">
        ${cover}
        ${v.rating ? `<div class="venue-rating">★ ${v.rating}</div>` : ''}
      </div>
      <div class="venue-info">
        <div class="venue-name">${escHtml(v.name)}</div>
        <div class="venue-owner">${escHtml(v.location)} · by ${escHtml(v.ownerName||'Owner')}</div>
        <div class="venue-tags">
          <span class="tag">${escHtml(v.type)}</span>
          <span class="tag">👥 ${v.capacity}</span>
          ${v.venueSize ? `<span class="tag">📐 ${escHtml(v.venueSize)}</span>` : ''}
          ${v.platePrice > 0 ? `<span class="tag">🍽️ ₹${v.platePrice}/plate</span>` : ''}
        </div>
        <div class="venue-footer">
          <div class="venue-price">${fmt(v.price1hr)} <span>/hr</span></div>
          <button class="btn-book" onclick="event.stopPropagation();openVenueDetails('${v._id}')">Check Availability</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── VENUE DETAIL VIEW (public — no login needed) ─────────────────
async function openVenueDetails(venueId) {
  let v;
  try {
    v = await api('/venues/' + venueId + '?_=' + Date.now());
  } catch(e) {
    toast('Could not load venue details', 'error');
    return;
  }
  currentVenue = v;
  const titleEl = document.getElementById('booking-modal-title');
  if (titleEl) titleEl.textContent = v.name;
  renderVenueDetailsOnly(v);
  openModal('booking-modal');
}

function renderVenueDetailsOnly(v) {
  const allImages = [];
  if (v.coverImage) allImages.push(v.coverImage);
  (v.images || []).forEach(function(img) { if (img && !allImages.includes(img)) allImages.push(img); });

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

  let ratingTag = v.rating ? '<span class="tag">★ ' + v.rating + ' (' + (v.reviewCount||0) + ' reviews)</span>' : '';
  let descHtml  = v.description ? '<p class="vd-desc">' + escHtml(v.description) + '</p>' : '';
  let venueSizeTag = v.venueSize ? '<span class="tag">📐 ' + escHtml(v.venueSize) + '</span>' : '';

  // Build per-hour pricing table
  let pricingRows = '';
  for (let h = 1; h <= 7; h++) {
    const key = 'price' + h + 'hr';
    if (v[key]) pricingRows += '<div class="vd-price-item"><span class="vd-price-val">' + fmt(v[key]) + '</span><span class="vd-price-label">/' + h + 'hr</span></div>';
  }
  if (!pricingRows) pricingRows = '<div class="vd-price-item"><span class="vd-price-val">' + fmt(v.price1hr) + '</span><span class="vd-price-label">/hr</span></div>';
  let plateHtml = v.platePrice > 0 ? '<div class="vd-price-item"><span class="vd-price-val">₹' + v.platePrice + '</span><span class="vd-price-label">/plate</span></div>' : '';

  let amenityInfoHtml = '';
  if (amenities.length) {
    let tags = amenities.map(function(a) {
      return '<span class="vd-amenity-tag">' + escHtml(a.label) + (a.price > 0 ? ' (' + fmt(a.price) + '/hr)' : '') + '</span>';
    }).join('');
    amenityInfoHtml = '<div class="vd-amenities"><div class="vd-section-title">✨ Facilities</div><div class="vd-amenity-tags">' + tags + '</div></div>';
  }

  // Availability checker — public, no login needed
  const availHtml = `
    <div class="vd-avail-section">
      <div class="vd-section-title">📅 Check Availability</div>
      <div style="background:rgba(74,94,79,0.08);border:1px solid rgba(74,94,79,0.25);border-radius:6px;padding:9px 14px;font-size:0.82rem;color:#4a5e4f;margin-bottom:12px">🕐 <strong>Open:</strong> ${escHtml(v.openTime||'09:00')} – ${escHtml(v.closeTime||'22:00')}</div>
      <div class="booking-grid">
        <div class="form-field"><label class="form-label">Select Date</label><input class="form-input" type="date" id="ca-date" min="${minDate}" onchange="checkAvailSlots()" /></div>
        <div class="form-field"><label class="form-label">Duration</label>
          <select class="form-input" id="ca-hours" onchange="checkAvailSlots()">
            <option value="1">1 Hour</option><option value="2">2 Hours</option><option value="3">3 Hours</option>
            <option value="4">4 Hours</option><option value="5">5 Hours</option><option value="6">6 Hours</option><option value="7">7 Hours</option>
          </select>
        </div>
      </div>
      <div id="ca-slots-wrap" style="margin-bottom:16px"><span style="color:var(--muted);font-size:0.85rem">Select a date to see available slots</span></div>
      <div id="ca-price-display" style="margin-bottom:12px"></div>
      <button class="btn-confirm" style="width:100%" onclick="proceedToBookFromDetail()">Book Now →</button>
    </div>`;

  document.getElementById('booking-body').innerHTML =
    galleryHtml +
    '<div class="vd-info">' +
      '<div class="vd-meta">' +
        '<span class="tag">' + escHtml(v.type) + '</span>' +
        '<span class="tag">📍 ' + escHtml(v.location) + '</span>' +
        '<span class="tag">👥 Up to ' + v.capacity + ' guests</span>' +
        venueSizeTag + ratingTag +
      '</div>' +
      descHtml +
      '<div class="vd-pricing">' + pricingRows + plateHtml + '</div>' +
      amenityInfoHtml +
    '</div>' +
    availHtml;
}

function checkAvailSlots() {
  const v = currentVenue;
  if (!v) return;
  const date = document.getElementById('ca-date')?.value;
  const hours = parseInt(document.getElementById('ca-hours')?.value || 1);
  const wrap = document.getElementById('ca-slots-wrap');
  const priceDisplay = document.getElementById('ca-price-display');
  if (!date) { wrap.innerHTML = '<span style="color:var(--muted);font-size:0.85rem">Select a date to see available slots</span>'; if(priceDisplay) priceDisplay.innerHTML=''; return; }
  const today = new Date().toISOString().split('T')[0];
  if (date <= today) { wrap.innerHTML = '<div class="slot-blocked-msg">⚠️ Same-day bookings not allowed. Select a future date.</div>'; if(priceDisplay) priceDisplay.innerHTML=''; return; }

  const starts = getStartTimes(v.openTime||'09:00', v.closeTime||'22:00', hours);
  if (!starts.length) { wrap.innerHTML = '<div class="slot-blocked-msg">⚠️ No ' + hours + '-hr slots fit within operating hours.</div>'; if(priceDisplay) priceDisplay.innerHTML=''; return; }

  const blocked    = new Set(v.blockedRanges || []);
const dayBlocked = blocked.has(date);
const legacyBlk  = new Set();
(v.slots||[]).forEach(s => { if ((s.blockedDates||[]).includes(date)) legacyBlk.add(s.time); });

// Build booked ranges for overlap checking
const bookedRanges = [];
(v.blockedRanges || []).forEach(key => {
  const m = key.match(/^(.+)\|(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (m && m[1] === date) bookedRanges.push({ start: timeToMins(m[2]), end: timeToMins(m[3]) });
});

wrap.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">' + starts.map(function(start) {
    const startM = timeToMins(start);
    const endM   = startM + hours * 60;
    const end    = minsToTime(endM);
    const label  = start+' – '+end;
    const overlaps = bookedRanges.some(r => startM < r.end && endM > r.start);
    const isBlk = dayBlocked || overlaps || legacyBlk.has(start);
    if (isBlk) return '<button class="slot-btn blocked" disabled>🔒 '+label+'</button>';
    return '<button class="slot-btn" onclick="selectCASlot(this,\''+start+'\',\''+end+'\')">'+label+'</button>';
  }).join('') + '</div>';

  // Show price for selected duration
  const priceKey = 'price' + hours + 'hr';
  const price = v[priceKey] || (v.price1hr * hours);
  if (priceDisplay) priceDisplay.innerHTML = '<div style="background:rgba(200,169,110,0.1);border:1px solid rgba(200,169,110,0.3);border-radius:6px;padding:9px 14px;font-size:0.88rem;color:var(--gold);font-weight:600">💰 ' + hours + ' hr price: <strong>' + fmt(price) + '</strong></div>';
}

function selectCASlot(btn, startTime, endTime) {
  document.querySelectorAll('#ca-slots-wrap .slot-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  btn.dataset.selected = '1';
}

function proceedToBookFromDetail() {
  if (!currentUser) {
    closeModal('booking-modal');
    openModal('auth-modal');
    toast('Please sign in to book a venue', 'info');
    return;
  }
  if (currentUser.role === 'owner') {
    toast('Owners cannot book venues. Please use a customer account.', 'info');
    return;
  }
  renderVenueDetailModal(currentVenue);
  // Pre-fill date/hours from availability check if selected
  const caDate = document.getElementById('ca-date');
  const caHours = document.getElementById('ca-hours');
  const selectedSlot = document.querySelector('#ca-slots-wrap .slot-btn.selected');
  if (caDate?.value) {
    setTimeout(() => {
      const bkDate = document.getElementById('bk-date');
      const bkHours = document.getElementById('bk-hours');
      if (bkDate) { bkDate.value = caDate.value; }
      if (bkHours && caHours) { bkHours.value = caHours.value; }
      refreshSlots();
      if (selectedSlot) {
        setTimeout(() => {
          const slot = document.querySelector('#bk-slots .slot-btn:not(.blocked)');
          if (slot) { /* try to match */ }
        }, 100);
      }
    }, 50);
  }
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
  let venueSizeTag = v.venueSize ? '<span class="tag">📐 ' + escHtml(v.venueSize) + '</span>' : '';

  // Build per-hour pricing display
  let pricingRows = '';
  for (let h = 1; h <= 7; h++) {
    const key = 'price' + h + 'hr';
    if (v[key]) pricingRows += '<div class="vd-price-item"><span class="vd-price-val">' + fmt(v[key]) + '</span><span class="vd-price-label">/' + h + 'hr</span></div>';
  }
  if (!pricingRows) pricingRows = '<div class="vd-price-item"><span class="vd-price-val">' + fmt(v.price1hr) + '</span><span class="vd-price-label">/hr</span></div>';
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
        venueSizeTag + ratingTag +
      '</div>' +
      descHtml +
      '<div class="vd-pricing">' + pricingRows + plateHtml + '</div>' +
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

// Build list of booked ranges for overlap checking
const bookedRanges = [];
(v.blockedRanges || []).forEach(key => {
  const m = key.match(/^(.+)\|(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (m && m[1] === date) bookedRanges.push({ start: timeToMins(m[2]), end: timeToMins(m[3]) });
});

sc.innerHTML = starts.map(function(start) {
    const startM = timeToMins(start);
    const endM   = startM + hours * 60;
    const end    = minsToTime(endM);
    const label  = start+' – '+end;
    const overlaps = bookedRanges.some(r => startM < r.end && endM > r.start);
    const isBlk = dayBlocked || overlaps || legacyBlk.has(start);
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
  // Use the specific hour price if set, otherwise fall back to price1hr * hours
  const priceKey = 'price' + hours + 'hr';
  let base = v[priceKey] || (v.price1hr * hours);
  // Show the effective /hr rate
  const effectiveRate = Math.round(base / hours);
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
    <div class="pb-row"><span>Venue (${hours} hr${hours>1?'s':''} @ ${fmt(effectiveRate)}/hr)</span><span>${fmt(base)}</span></div>
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
  if (!date)                errors.push('Please select an event date');
  else if (date <= today)   errors.push('Same-day bookings are not allowed — please select a future date');
  if (!slotVal || slotVal === 'Flexible') errors.push('Please select a time slot');
  if (!guests || guests < 1)             errors.push('Number of guests must be at least 1');
  else if (isNaN(guests))                errors.push('Guests must be a valid number');
  else if (guests > v.capacity)          errors.push(`This venue fits max ${v.capacity} guests`);
  if (errors.length) return showErrors('bk-errors','bk-errors-list', errors);

  const facilities = [];
  document.querySelectorAll('#booking-body .slot-btn.selected[data-key]').forEach(b => facilities.push(b.dataset.key));
  const priceKey = 'price' + hours + 'hr';
  const base     = v[priceKey] || (v.price1hr * hours);
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
// ─── openscript ─────────────────────────────────────────────────────────
// Identical structure to your original — only the notice text and button
// handler change. Cash on Visit flow is 100% preserved.
function openscript(booking) {
  pendingPaymentBooking = booking;
  const total     = booking.total || 0;
  const paidSoFar = booking.paidAmount || 0;
  const remaining = total - paidSoFar;
  const bookingDate = new Date(booking.date);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysLeft   = Math.floor((bookingDate - today) / (1000 * 60 * 60 * 24));
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
      <div class="payment-type-btn cash-type ${cashAllowed ? '' : 'cash-unavail'}" id="pt-cash" ${cashAllowed ? `onclick="selectPaymentType('cash',${remaining},${total})"` : ''}>
        <div class="pt-icon">🏠</div><div class="pt-label">Cash on Visit</div>
        <div class="pt-sub">${cashAllowed ? 'Pay the full amount at the venue' : 'Must select ≥1 day before'}</div>
      </div>
      <div class="payment-type-btn" id="pt-upi" style="display:none"></div>
    </div>
    <div id="payment-type-details"></div>
    <div class="upi-mock-notice">🔒 <strong>Secure Payment:</strong> Payments are processed securely via Razorpay. Your card/UPI details are never stored on our servers.</div>
    <button class="btn-submit" id="pay-btn" onclick="processPayment()" style="margin-top:16px" disabled>Select payment option above</button>
  `;
  openModal('payment-modal');
}

// ─── selectPaymentType ────────────────────────────────────────────────────────
// Identical to your original. For 'full' and 'advance', the payment method
// buttons (UPI / Card / etc.) now just tell Razorpay which prefill to use —
// they no longer collect card numbers in plain HTML inputs.
let selectedPaymentType = null;

function selectPaymentType(type, remaining, total) {
  selectedPaymentType = type;
  document.querySelectorAll('.payment-type-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('pt-' + (type === 'cash' ? 'cash' : type === 'full' ? 'full' : 'advance'))?.classList.add('selected');
  const details = document.getElementById('payment-type-details');
  const payBtn  = document.getElementById('pay-btn');

  if (type === 'cash') {
    // Cash on Visit: unchanged — no Razorpay involved
    details.innerHTML = `<div style="background:rgba(74,94,79,0.07);border:1.5px solid var(--sage);border-radius:8px;padding:16px 18px;margin:14px 0">
      <div style="font-weight:700;color:var(--sage);margin-bottom:6px">🏠 Cash on Visit Selected</div>
      <div style="font-size:0.82rem;color:var(--muted);line-height:1.7">Your booking will be held confirmed. Please bring <strong>${fmt(remaining)}</strong> in cash on the day of the event.</div></div>`;
    payBtn.disabled = false;
    payBtn.textContent = 'Confirm Cash on Visit →';
    payBtn.style.background = 'var(--sage)';
    payBtn.style.color = 'white';

  } else if (type === 'full') {
    // Full payment via Razorpay — show preferred method selector
    details.innerHTML = `
      <div style="font-size:0.82rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin:14px 0 10px">Preferred Payment Method</div>
      <div style="font-size:0.78rem;color:var(--muted);margin-bottom:12px;line-height:1.6">
        Select your preference. Razorpay's secure checkout will open and support all methods.
      </div>
      <div class="payment-methods">
        <div class="payment-method-btn" onclick="selectPaymentMethod(this,'upi')"><div class="pm-icon">📱</div><div class="pm-label">UPI</div></div>
        <div class="payment-method-btn" onclick="selectPaymentMethod(this,'card')"><div class="pm-icon">💳</div><div class="pm-label">Card</div></div>
        <div class="payment-method-btn" onclick="selectPaymentMethod(this,'netbanking')"><div class="pm-icon">🏦</div><div class="pm-label">Net Banking</div></div>
        <div class="payment-method-btn" onclick="selectPaymentMethod(this,'wallet')"><div class="pm-icon">👛</div><div class="pm-label">Wallet</div></div>
      </div>
      <div id="payment-method-details"></div>`;
    // Enable pay button immediately — method selection is optional preference, not required
    payBtn.disabled = false;
    payBtn.textContent = `Pay ${fmt(remaining)} via Razorpay →`;
    payBtn.style.background = '';
    payBtn.style.color = '';

  } else if (type === 'advance') {
    const minAdv = Math.ceil(remaining * 0.2);
    details.innerHTML = `<div style="margin:14px 0">
      <label class="form-label">Advance Amount (min. 20% = ${fmt(minAdv)})</label>
      <div class="advance-input-row">
        <input class="form-input" type="number" id="advance-amt" placeholder="${minAdv}" min="${minAdv}" max="${remaining - 1}" value="${minAdv}" oninput="updateAdvanceSplit(${remaining}); updateAdvancePayBtn(${remaining})" />
        <button class="btn-sm btn-sm-ghost" onclick="document.getElementById('advance-amt').value=Math.round(${remaining}*0.5);updateAdvanceSplit(${remaining});updateAdvancePayBtn(${remaining})">50%</button>
      </div>
      <div class="payment-split-box" id="advance-split">
        <div class="payment-split-row"><span>Paying now</span><span style="color:var(--success)">${fmt(minAdv)}</span></div>
        <div class="payment-split-row"><span>Remaining on visit</span><span style="color:var(--brick)">${fmt(remaining - minAdv)}</span></div>
      </div></div>
      <div style="font-size:0.82rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Preferred Payment Method</div>
      <div class="payment-methods">
        <div class="payment-method-btn" onclick="selectPaymentMethod(this,'upi')"><div class="pm-icon">📱</div><div class="pm-label">UPI</div></div>
        <div class="payment-method-btn" onclick="selectPaymentMethod(this,'card')"><div class="pm-icon">💳</div><div class="pm-label">Card</div></div>
        <div class="payment-method-btn" onclick="selectPaymentMethod(this,'netbanking')"><div class="pm-icon">🏦</div><div class="pm-label">Net Banking</div></div>
        <div class="payment-method-btn" onclick="selectPaymentMethod(this,'wallet')"><div class="pm-icon">👛</div><div class="pm-label">Wallet</div></div>
      </div>
      <div id="payment-method-details"></div>`;
    // Enable pay button — advance amount has a default value already
    payBtn.disabled = false;
    payBtn.textContent = `Pay Advance of ${fmt(minAdv)} via Razorpay →`;
    payBtn.style.background = '';
    payBtn.style.color = '';
  }
}

// Update advance pay button text as user changes the amount
function updateAdvancePayBtn(remaining) {
  const adv    = parseInt(document.getElementById('advance-amt')?.value || 0);
  const payBtn = document.getElementById('pay-btn');
  if (!payBtn) return;
  if (adv > 0 && adv < remaining) {
    payBtn.disabled = false;
    payBtn.textContent = `Pay Advance of ${fmt(adv)} via Razorpay →`;
  } else {
    payBtn.disabled = true;
    payBtn.textContent = 'Enter a valid advance amount';
  }
}

// ─── processPayment ───────────────────────────────────────────────────────────
// The main function. Cash on Visit is unchanged. Full and Advance now:
//   1. POST /api/payments/create-order  → get razorpay order_id
//   2. Open Razorpay checkout modal     → customer pays
//   3. On success: POST /api/payments/verify → backend verifies HMAC + saves to DB
//   4. On failure: show error toast
async function processPayment() {
  // ── Ensure Razorpay script is loaded before anything else ──
  if (!window.Razorpay) {
    await new Promise((resolve, reject) => {
      const existing = document.querySelector(
        'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
      );
      if (existing) {
        existing.onload = resolve;
        existing.onerror = reject;
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Razorpay script failed to load'));
      document.body.appendChild(s);
    }).catch(() => {
      toast('Could not load Razorpay. Check your internet connection.', 'error');
      return;
    });
  }

  // ── NOW the rest of your original code starts here ──
  const btn       = document.getElementById('pay-btn');
  const b         = pendingPaymentBooking;
  const remaining = (b.total || 0) - (b.paidAmount || 0);

  // ... rest of your code unchanged

  

  // ── Cash on Visit — no Razorpay needed ──────────────────────────────────────
  if (selectedPaymentType === 'cash') {
    btn.disabled = true;
    btn.textContent = 'Confirming…';
    try {
      const updated = await api(`/bookings/${b._id}/payment`, {
        method: 'PATCH',
        body: { paymentType: 'cash_on_visit', paymentMethod: 'cash' },
      });
      document.getElementById('payment-body').innerHTML = `
        <div class="payment-success-anim">
          <div class="payment-success-icon">🏠</div>
          <div class="payment-success-title">Cash on Visit Confirmed!</div>
          <div class="payment-success-msg">Your slot is locked. Bring <strong>${fmt(remaining)}</strong> in cash on the booking day.</div>
        </div>`;
      setTimeout(async () => {
        closeModal('payment-modal');
        await loadMyBookings();
        showPaymentReceipt({ ...b, ...updated });
        pendingPaymentBooking = null;
      }, 1500);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Confirm Cash on Visit →';
      toast(e.error || 'Failed to confirm', 'error');
    }
    return;
  }

  // ── Full / Advance — Razorpay flow ──────────────────────────────────────────
  const isAdvance = selectedPaymentType === 'advance';
  const advAmt    = isAdvance ? parseInt(document.getElementById('advance-amt')?.value || 0) : null;

  if (isAdvance && (!advAmt || advAmt <= 0)) {
    return toast('Enter a valid advance amount', 'error');
  }

  btn.disabled = true;
  btn.textContent = 'Opening Razorpay…';

  let orderData;
  try {
    // Step 1: Create order on backend
    orderData = await api('/payments/create-order', {
      method: 'POST',
      body: {
        bookingId:     b._id,
        paymentType:   selectedPaymentType,
        advanceAmount: advAmt,
      },
    });
  } catch (e) {
    btn.disabled = false;
    btn.textContent = isAdvance ? `Pay Advance via Razorpay →` : `Pay ${fmt(remaining)} via Razorpay →`;
    toast(e.error || 'Could not initiate payment', 'error');
    return;
  }

  // Step 2: Map the chosen method to Razorpay's method key
  const methodMap = { upi: 'upi', card: 'card', netbanking: 'netbanking', wallet: 'wallet' };
  const chosenMethod = getSelectedMethod(); // returns 'upi','card','netbanking','wallet','online'
  const rzpMethod    = methodMap[chosenMethod] || null;

  // Step 3: Get logged-in user info for prefill
  const userStr  = localStorage.getItem('evntly_user');
  const userInfo = userStr ? JSON.parse(userStr) : {};

  // Step 4: Open Razorpay Checkout
  const options = {
    key:         window.RAZORPAY_KEY_ID || '',  // set in evntly-frontend.html config block
    amount:      orderData.amount,              // in paise, from backend
    currency:    orderData.currency || 'INR',
    name:        'EVNTLY',
    description: `Booking: ${b.venueName} on ${b.date}`,
    order_id:    orderData.orderId,
    image:       '',  // optional: your logo URL
    prefill: {
      name:    userInfo.name  || b.userName  || '',
      email:   userInfo.email || b.userEmail || '',
      contact: userInfo.phone || b.userPhone || '',
      method:  rzpMethod,
    },
    notes: {
      bookingId:  b._id,
      bookingRef: orderData.bookingRef,
      venueName:  b.venueName,
    },
    theme: {
      color: '#C8A96E',  // EVNTLY gold
    },
    modal: {
      ondismiss: function () {
        // User closed Razorpay without paying
        btn.disabled = false;
        btn.textContent = isAdvance
          ? `Pay Advance of ${fmt(advAmt)} via Razorpay →`
          : `Pay ${fmt(remaining)} via Razorpay →`;
        toast('Payment cancelled', 'info');
      },
    },
    // Step 5: On successful payment from Razorpay, verify on backend
    handler: async function (response) {
      btn.textContent = 'Verifying payment…';
      try {
        const verified = await api('/payments/verify', {
          method: 'POST',
          body: {
            razorpay_order_id:   response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature:  response.razorpay_signature,
            bookingId:           b._id,
            paymentType:         selectedPaymentType,
            advanceAmount:       advAmt,
          },
        });

        // Success UI
        const successTitle = isAdvance ? 'Advance Paid!' : 'Payment Successful!';
        const successMsg   = isAdvance
          ? `Advance of <strong>${fmt(verified.paidAmount)}</strong> received. Remaining <strong>${fmt(remaining - verified.paidAmount)}</strong> to be paid on visit.`
          : `Your payment of <strong>${fmt(remaining)}</strong> has been received. Booking fully confirmed!`;
        const successIcon  = isAdvance ? '⚡' : '✅';

        document.getElementById('payment-body').innerHTML = `
          <div class="payment-success-anim">
            <div class="payment-success-icon">${successIcon}</div>
            <div class="payment-success-title">${successTitle}</div>
            <div class="payment-success-msg">${successMsg}</div>
            <div style="font-size:0.75rem;color:var(--muted);margin-top:12px;font-family:monospace">
              Payment ID: ${response.razorpay_payment_id}
            </div>
          </div>`;

        setTimeout(async () => {
          closeModal('payment-modal');
          await loadMyBookings();
          showPaymentReceipt({ ...b, ...verified.booking });
          pendingPaymentBooking = null;
        }, 2000);

      } catch (e) {
        // Payment went through on Razorpay but verification failed on our side
        // This is rare but important — show a helpful message
        btn.disabled = false;
        btn.textContent = 'Retry Verification';
        document.getElementById('payment-body').innerHTML += `
          <div style="background:rgba(200,169,110,0.1);border:1px solid rgba(200,169,110,0.3);border-radius:8px;padding:14px;margin-top:16px;font-size:0.84rem;color:var(--muted)">
            ⚠️ Payment received but verification is pending. 
            Your Payment ID: <strong>${response.razorpay_payment_id}</strong>. 
            Please contact support if your booking is not updated within 10 minutes.
          </div>`;
        toast('Payment received — verification pending. Contact support if needed.', 'info');
      }
    },
  };

  // Fire up Razorpay checkout
  try {
    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function (response) {
      btn.disabled = false;
      btn.textContent = isAdvance
        ? `Pay Advance of ${fmt(advAmt)} via Razorpay →`
        : `Pay ${fmt(remaining)} via Razorpay →`;
      toast(`Payment failed: ${response.error.description || 'Please try again'}`, 'error');
      console.error('Razorpay payment failed:', response.error);
    });
    rzp.open();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = `Pay ${fmt(remaining)} via Razorpay →`;
    toast('Could not open Razorpay. Check your internet connection.', 'error');
    console.error('Razorpay open error:', e);
  }
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
            ${isConfirmed && !isAdvance && !isCashVisit ? `<button class="pay-now-btn" onclick='openscript(${JSON.stringify(b)})'>💳 Pay Now — ${fmt(b.total)}</button>` : ''}
            ${isAdvance && isConfirmed && remaining > 0 ? `<button class="btn-sm btn-sm-success" onclick='openscript(${JSON.stringify(b)})'>💳 Pay Remaining — ${fmt(remaining)}</button>` : ''}
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
async function markManualPaid(bookingId) {
  if (!confirm('Mark this booking as fully paid?')) return;
  try {
    await api(`/bookings/${bookingId}/mark-paid`, {
      method: 'PATCH',
      body: { paymentMethod: 'cash' }
    });
    toast('Booking marked as paid! ✅', 'success');
    loadRequests();
    loadOverview();
  } catch(e) {
    toast(e.error || 'Failed to mark as paid', 'error');
  }
}
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
${r.status==='confirmed' && r.paymentStatus!=='fully_paid' && !r.cashOnVisitApproved ? `
  <span style="font-size:0.78rem;color:var(--muted)">Awaiting customer payment</span>
  <button class="btn-sm btn-sm-success" onclick="markManualPaid('${r._id}')">💵 Mark as Paid</button>
` : ''}            ${r.status==='paid' || r.paymentStatus==='fully_paid' ? `<span style="color:var(--success);font-weight:600;font-size:0.88rem">🎉 Booking & Payment Complete</span>` : ''}
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
function validateVenueFormFull(prefix) {
  // Returns array of error messages; shows inline errors too
  const errs = [];
  const g = id => document.getElementById(prefix + '-' + id);
  const showE = (id, msg) => { const el = document.getElementById(prefix + '-' + id + '-err'); if(el){el.textContent=msg; el.style.display='block';} };
  const clearE = id => { const el = document.getElementById(prefix + '-' + id + '-err'); if(el){el.textContent=''; el.style.display='none';} };

  // Name
  if (!g('name')?.value.trim()) { showE('name','Venue name is required'); errs.push('Venue name is required'); } else clearE('name');

  // Location
  if (!g('location')?.value.trim()) { showE('loc','Area/locality is required'); errs.push('Area/locality is required'); } else clearE('loc');

  // Address
  const addr = document.getElementById(prefix + '-address')?.value.trim();
  if (!addr) { showE('addr','Full address is required'); errs.push('Full address is required'); } else clearE('addr');

  // City
  const city = document.getElementById(prefix + '-city')?.value.trim();
  if (!city) { showE('city','City is required'); errs.push('City is required'); } else clearE('city');

  // State
  const state = document.getElementById(prefix + '-state')?.value.trim();
  if (!state) { showE('state','State is required'); errs.push('State is required'); } else clearE('state');

  // PIN
  const pin = document.getElementById(prefix + '-pincode')?.value.trim();
  if (pin && !/^\d{6}$/.test(pin)) { showE('pin','PIN code must be exactly 6 digits'); errs.push('PIN code must be exactly 6 digits'); }
  else clearE('pin');

  // Capacity
  const cap = parseInt(g('capacity')?.value);
  if (!cap || cap < 1) { showE('cap','Capacity must be at least 1'); errs.push('Capacity must be at least 1'); } else clearE('cap');

  // Price
  const p1 = parseFloat(g('price1')?.value);
  if (!p1 || p1 < 1) { showE('p1','Price per hour must be greater than 0'); errs.push('Price per hour must be > 0'); } else clearE('p1');

  // Venue email (optional but if given must be valid)
  const vEmail = document.getElementById(prefix + '-venue-email')?.value.trim();
  if (vEmail) {
    const eErr = emailError(vEmail);
    if (eErr) { showE('email', eErr); errs.push('Venue email: ' + eErr); } else clearE('email');
  }

  return errs;
}

function validateVenueForm(prefix) {
  const name  = document.getElementById(prefix + '-name').value.trim();
  const loc   = document.getElementById(prefix + '-location').value.trim();
  const cap   = parseInt(document.getElementById(prefix + '-capacity').value);
  const p1    = parseFloat(document.getElementById(prefix + '-price1').value);
  const p2    = parseFloat(document.getElementById(prefix + '-price2')?.value || 0);
  const pp    = parseFloat(document.getElementById(prefix + '-plate')?.value || 0);
  const open  = document.getElementById(prefix + '-open-time')?.value;
  const close = document.getElementById(prefix + '-close-time')?.value;
  let ok = true;
  // Name: 2-100 chars, letters/digits/spaces/basic punctuation
  if (!name)                    ok = validateField(prefix+'-name', prefix+'-name-err', false, 'Venue name is required') && ok;
  else if (name.length < 2)     ok = validateField(prefix+'-name', prefix+'-name-err', false, 'Name must be at least 2 characters') && ok;
  else if (name.length > 100)   ok = validateField(prefix+'-name', prefix+'-name-err', false, 'Name must be under 100 characters') && ok;
  else if (!/^[a-zA-Z0-9 \'.,\-&()]+$/.test(name)) ok = validateField(prefix+'-name', prefix+'-name-err', false, 'Name contains invalid characters') && ok;
  else validateField(prefix+'-name', prefix+'-name-err', true, '');
  // Location
  if (!loc)                     ok = validateField(prefix+'-location', prefix+'-loc-err', false, 'Location is required') && ok;
  else if (loc.length < 2)      ok = validateField(prefix+'-location', prefix+'-loc-err', false, 'Location must be at least 2 characters') && ok;
  else if (loc.length > 150)    ok = validateField(prefix+'-location', prefix+'-loc-err', false, 'Location is too long') && ok;
  else validateField(prefix+'-location', prefix+'-loc-err', true, '');
  // Capacity
  if (isNaN(cap) || cap < 1)    ok = validateField(prefix+'-capacity', prefix+'-cap-err', false, 'Capacity must be at least 1') && ok;
  else if (cap > 100000)        ok = validateField(prefix+'-capacity', prefix+'-cap-err', false, 'Capacity seems too high') && ok;
  else validateField(prefix+'-capacity', prefix+'-cap-err', true, '');
  // Price 1hr
  if (isNaN(p1) || p1 <= 0)     ok = validateField(prefix+'-price1', prefix+'-p1-err', false, 'Price must be greater than 0') && ok;
  else if (p1 > 10000000)       ok = validateField(prefix+'-price1', prefix+'-p1-err', false, 'Price seems unrealistically high') && ok;
  else validateField(prefix+'-price1', prefix+'-p1-err', true, '');
  // Price 2hr (optional but if set must be >= price1hr)
  if (p2 > 0 && p2 < p1)        ok = validateField(prefix+'-price2', prefix+'-p2-err', false, '2hr price should be ≥ 1hr price') && ok;
  else validateField(prefix+'-price2', prefix+'-p2-err', true, '');
  // Plate price
  if (isNaN(pp) || pp < 0)      ok = validateField(prefix+'-plate', prefix+'-plate-err', false, 'Plate price must be 0 or more') && ok;
  else validateField(prefix+'-plate', prefix+'-plate-err', true, '');
  // Opening hours
  if (open && close && timeToMins(close) <= timeToMins(open))
    ok = validateField(prefix+'-close-time', prefix+'-close-err', false, 'Closing time must be after opening time') && ok;
  else validateField(prefix+'-close-time', prefix+'-close-err', true, '');
  return ok;
}

// ─── ADD VENUE ────────────────────────────────────────────────────
async function submitAddVenue() {
  clearErrors('av-errors');
  const errs = validateVenueFormFull('av');
  if (errs.length) { showErrors('av-errors','av-errors-list', errs); return; }
  const btn = document.getElementById('av-submit-btn');
  btn.disabled = true; btn.textContent = 'Uploading…';
  try {
    const fd = new FormData();
    fd.append('name',        document.getElementById('av-name').value.trim());
const avTypeRaw = document.getElementById('av-type').value;
const avTypeCustom = document.getElementById('av-type-custom')?.value.trim();
fd.append('type', avTypeRaw === '__custom__' ? (avTypeCustom || 'Other') : avTypeRaw);    fd.append('location',    document.getElementById('av-location').value.trim());
    fd.append('address',     document.getElementById('av-address')?.value.trim() || '');
    fd.append('city',        document.getElementById('av-city')?.value.trim() || '');
    fd.append('state',       document.getElementById('av-state')?.value.trim() || '');
    fd.append('pincode',     document.getElementById('av-pincode')?.value.trim() || '');
    fd.append('venueEmail',  document.getElementById('av-venue-email')?.value.trim() || '');
    fd.append('venuePhone',  document.getElementById('av-venue-phone')?.value.trim() || '');
    fd.append('description', document.getElementById('av-desc').value);
    fd.append('capacity',    document.getElementById('av-capacity').value);
    fd.append('venueSize',   document.getElementById('av-venue-size')?.value.trim() || '');
    fd.append('price1hr',    document.getElementById('av-price1').value);
    for (let h = 2; h <= 7; h++) {
      const val = document.getElementById('av-price' + h)?.value;
      if (val) fd.append('price' + h + 'hr', val);
    }
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
    if (e.error === 'PLAN_NOT_PAID') {
      showErrors('av-errors','av-errors-list', ['⚠️ Your account is not yet activated. Please complete your platform fee payment to list venues. Check your email for the payment link from EVNTLY.']);
    } else {
      showErrors('av-errors','av-errors-list', e.errors || [e.error || 'Failed to add venue']);
    }
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

    // Safe setter — silently skips missing fields
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

    setVal('ev-id',          v._id);
    setVal('ev-name',        v.name        || '');
    setVal('ev-location',    v.location    || '');
    setVal('ev-address',     v.address     || '');
    setVal('ev-city',        v.city        || '');
    setVal('ev-state',       v.state       || '');
    setVal('ev-pincode',     v.pincode     || '');
    setVal('ev-venue-email', v.venueEmail  || '');
    setVal('ev-venue-phone', v.venuePhone  || '');
    setVal('ev-capacity',    v.capacity    || '');
    setVal('ev-venue-size',  v.venueSize   || '');
    setVal('ev-price1',      v.price1hr    || '');
    setVal('ev-plate',       v.platePrice  || 0);
    setVal('ev-desc',        v.description || '');
    setVal('ev-open-time',   v.openTime    || '09:00');
    setVal('ev-close-time',  v.closeTime   || '22:00');

    for (let h = 2; h <= 7; h++) {
      setVal('ev-price' + h, v['price' + h + 'hr'] || '');
    }

    const knownTypes = ['Banquet Hall','Conference Center','Garden','Rooftop','Studio'];
    const evTypeSel  = document.getElementById('ev-type');
    const evTypeCust = document.getElementById('ev-type-custom');
    if (evTypeSel) {
      if (knownTypes.includes(v.type)) {
        evTypeSel.value = v.type;
        if (evTypeCust) { evTypeCust.style.display = 'none'; evTypeCust.value = ''; }
      } else {
        evTypeSel.value = '__custom__';
        if (evTypeCust) { evTypeCust.style.display = ''; evTypeCust.value = v.type || ''; }
      }
    }

    const coverDiv = document.getElementById('ev-current-cover');
    if (coverDiv) {
      coverDiv.innerHTML = v.coverImage
        ? `<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--cream);border-radius:6px;border:1px solid var(--border)"><img src="${imgUrl(v.coverImage)}" style="width:80px;height:60px;object-fit:cover;border-radius:4px" onerror="this.style.display='none'" /><div><div style="font-size:0.82rem;font-weight:600">Current Cover</div><div style="font-size:0.72rem;color:var(--muted)">${v.coverImage}</div></div></div>`
        : `<div style="font-size:0.82rem;color:var(--muted)">No cover image set</div>`;
    }

    const coverPreview = document.getElementById('ev-cover-preview');
    if (coverPreview) coverPreview.innerHTML = '';

    const existingGallery = document.getElementById('ev-existing-gallery');
    if (existingGallery) {
      existingGallery.innerHTML = (v.images || []).length
        ? v.images.map(fn => `<div class="gallery-item" id="eg-${fn.replace(/\./g,'_')}"><img src="${imgUrl(fn)}" alt="venue image" onerror="this.style.display='none'" /><button class="remove-img-btn" onclick="removeExistingImage('${fn}',this)">✕ Remove</button></div>`).join('')
        : `<div style="color:var(--muted);font-size:0.85rem">No gallery images yet</div>`;
    }

    const galleryPreviews = document.getElementById('ev-gallery-previews');
    if (galleryPreviews) galleryPreviews.innerHTML = '';

    evSlots = JSON.parse(JSON.stringify(v.slots || []));
    renderSlots('ev', evSlots);
    updateHoursPreview('ev');

    const evHotels = document.getElementById('ev-hotels');
    if (evHotels) {
      evHotels.innerHTML = '';
      (v.cateringHotels || []).forEach(h => addHotelField('ev', h));
    }

    const tbody = document.getElementById('ev-amenity-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      (v.amenities || []).forEach(a => {
        const tr = document.createElement('tr');
        tr.dataset.key = a.key || 'am_' + Date.now();
        tr.innerHTML = `<td>${escHtml(a.label)}</td><td><input class="price-field" type="number" value="${a.price||0}" min="0" /></td><td><button class="remove-amenity-btn" onclick="removeAmenityRow(this)">✕</button></td>`;
        tbody.appendChild(tr);
      });
    }

    const editNav = document.getElementById('edit-venue-nav');
    if (editNav) editNav.style.display = '';
    clearErrors('ev-errors');
    switchPanel('edit-venue', editNav);

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
const evTypeRaw = document.getElementById('ev-type').value;
const evTypeCustom = document.getElementById('ev-type-custom')?.value.trim();
fd.append('type', evTypeRaw === '__custom__' ? (evTypeCustom || 'Other') : evTypeRaw);    fd.append('location',    document.getElementById('ev-location').value.trim());
    fd.append('address',     document.getElementById('ev-address')?.value.trim() || '');
    fd.append('city',        document.getElementById('ev-city')?.value.trim() || '');
    fd.append('state',       document.getElementById('ev-state')?.value.trim() || '');
    fd.append('pincode',     document.getElementById('ev-pincode')?.value.trim() || '');
    fd.append('venueEmail',  document.getElementById('ev-venue-email')?.value.trim() || '');
    fd.append('venuePhone',  document.getElementById('ev-venue-phone')?.value.trim() || '');
    fd.append('description', document.getElementById('ev-desc').value);
    fd.append('capacity',    document.getElementById('ev-capacity').value);
    fd.append('venueSize',   document.getElementById('ev-venue-size')?.value.trim() || '');
    fd.append('price1hr',    document.getElementById('ev-price1').value);
    for (let h = 2; h <= 7; h++) {
      const val = document.getElementById('ev-price' + h)?.value;
      fd.append('price' + h + 'hr', val || '0');
    }
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
  if (!venueId)                      errors.push('Please select a venue');
  if (!selectedReviewRating)         errors.push('Please select a star rating (1–5)');
  if (!comment)                      errors.push('Please write a review comment');
  else if (comment.length < 5)       errors.push('Review must be at least 5 characters');
  else if (comment.length > 1000)    errors.push('Review must be under 1000 characters');
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

// ─── HOMEPAGE SHOWCASE ────────────────────────────────────────────
let showcaseIndex = 0;
let showcasePhotos = [];

async function loadShowcase() {
  try {
    const photos = await api('/homepage-photos');
    if (!photos || !photos.length) return;
    showcasePhotos = photos;
    const track = document.getElementById('showcase-track');
    const dots   = document.getElementById('showcase-dots');
    if (!track) return;
    track.innerHTML = photos.map(p => `
      <div style="min-width:100%;position:relative;height:420px;flex-shrink:0">
        <img src="${imgUrl(p.photo)}" alt="${escHtml(p.title)}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'" />
        <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.65) 0%,transparent 60%)"></div>
        <div style="position:absolute;bottom:40px;left:48px;color:#fff">
          <div style="font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:700;text-shadow:0 2px 8px rgba(0,0,0,0.5)">${escHtml(p.title)}</div>
          ${p.caption ? `<div style="font-size:0.9rem;opacity:0.8;margin-top:4px;text-shadow:0 1px 4px rgba(0,0,0,0.5)">${escHtml(p.caption)}</div>` : ''}
        </div>
      </div>`).join('');
    dots.innerHTML = photos.map((_, i) =>
      `<div onclick="goToSlide(${i})" style="width:8px;height:8px;border-radius:50%;background:${i===0?'#fff':'rgba(255,255,255,0.4)'};cursor:pointer;transition:background .3s" id="dot-${i}"></div>`
    ).join('');
    document.getElementById('showcase-section').style.display = 'block';
    // Auto-slide every 4s
    setInterval(() => showcaseSlide(1), 4000);
  } catch(e) { /* silently skip */ }
}

function showcaseSlide(dir) {
  if (!showcasePhotos.length) return;
  showcaseIndex = (showcaseIndex + dir + showcasePhotos.length) % showcasePhotos.length;
  goToSlide(showcaseIndex);
}
function goToSlide(i) {
  showcaseIndex = i;
  const track = document.getElementById('showcase-track');
  if (track) track.style.transform = `translateX(-${i * 100}%)`;
  document.querySelectorAll('[id^="dot-"]').forEach((d, idx) => {
    d.style.background = idx === i ? '#fff' : 'rgba(255,255,255,0.4)';
  });
}


// ─── REPORTS & ANALYTICS ──────────────────────────────────────────────────────

// State
var _rState = { tab: 'summary', from: '', to: '', venueId: '', groupBy: 'month' };

async function loadReports() {
  const container = document.getElementById('reports-content');
  if (!container) return;

  // Build filter bar + tabs
  container.innerHTML = `
    <style>
      .rpt-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:20px;border-bottom:1px solid var(--border,#e5e5e5);padding-bottom:0}
      .rpt-tab{padding:9px 16px;border:none;background:none;cursor:pointer;font-size:0.84rem;font-weight:600;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .15s;font-family:inherit}
      .rpt-tab.active{color:var(--gold,#c8a96e);border-bottom-color:var(--gold,#c8a96e)}
      .rpt-tab:hover{color:var(--dark)}
      .rpt-filters{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;padding:16px;background:var(--cream,#f9f5ee);border-radius:10px;margin-bottom:20px;border:1px solid var(--border,#e5e5e5)}
      .rpt-filter-group{display:flex;flex-direction:column;gap:4px}
      .rpt-filter-group label{font-size:0.7rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.8px}
      .rpt-filter-group select,.rpt-filter-group input{border:1px solid var(--border,#d1c4b0);border-radius:6px;padding:7px 10px;font-size:0.83rem;background:#fff;color:var(--dark);font-family:inherit;outline:none}
      .rpt-filter-group select:focus,.rpt-filter-group input:focus{border-color:var(--gold)}
      .rpt-kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px}
      .rpt-kpi{background:#fff;border:1px solid var(--border,#e5e5e5);border-radius:10px;padding:16px;text-align:center}
      .rpt-kpi-val{font-size:1.5rem;font-weight:800;color:var(--dark)}
      .rpt-kpi-val.gold{color:var(--gold,#c8a96e)}
      .rpt-kpi-val.sage{color:var(--sage,#4a5e4f)}
      .rpt-kpi-val.brick{color:var(--brick,#8b3a2a)}
      .rpt-kpi-label{font-size:0.72rem;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:0.5px}
      .rpt-kpi-sub{font-size:0.75rem;color:var(--muted);margin-top:2px}
      .rpt-section{margin-bottom:28px}
      .rpt-section-title{font-size:0.72rem;font-weight:700;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px}
      .rpt-table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;border:1px solid var(--border,#e5e5e5)}
      .rpt-table th{background:var(--cream,#f9f5ee);color:var(--muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;padding:10px 14px;text-align:left;font-weight:700}
      .rpt-table td{padding:11px 14px;border-bottom:1px solid var(--border,#f0e8de);font-size:0.84rem;color:var(--dark)}
      .rpt-table tr:last-child td{border-bottom:none}
      .rpt-table tr:hover td{background:var(--cream,#f9f5ee)}
      .rpt-bar-wrap{background:var(--cream,#f9f5ee);border-radius:4px;height:8px;overflow:hidden;margin-top:4px}
      .rpt-bar{height:8px;border-radius:4px;background:var(--gold,#c8a96e);transition:width .4s ease}
      .rpt-chart-wrap{background:#fff;border:1px solid var(--border,#e5e5e5);border-radius:10px;padding:16px;margin-bottom:20px}
      .rpt-chart-title{font-size:0.78rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
      .rpt-bar-chart{display:flex;flex-direction:column;gap:6px}
      .rpt-bc-row{display:flex;align-items:center;gap:10px;font-size:0.81rem}
      .rpt-bc-label{min-width:90px;color:var(--dark);font-weight:500;text-align:right;font-size:0.75rem}
      .rpt-bc-bar-wrap{flex:1;background:var(--cream,#f9f5ee);border-radius:4px;height:22px;overflow:hidden}
      .rpt-bc-bar{height:22px;border-radius:4px;background:var(--gold,#c8a96e);display:flex;align-items:center;padding-left:6px;font-size:0.72rem;font-weight:700;color:#1a1a1a;min-width:2px;transition:width .5s ease}
      .rpt-bc-val{min-width:60px;font-weight:700;color:var(--dark);font-size:0.78rem}
      .rpt-pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:700;text-transform:uppercase}
      .rpt-pill-green{background:rgba(34,197,94,0.1);color:#16a34a}
      .rpt-pill-amber{background:rgba(245,158,11,0.1);color:#b45309}
      .rpt-pill-red{background:rgba(239,68,68,0.1);color:#ef4444}
      .rpt-pill-blue{background:rgba(59,130,246,0.1);color:#2563eb}
      .rpt-export-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
      .btn-export{background:#fff;border:1px solid var(--border,#e5e5e5);border-radius:7px;padding:8px 16px;font-size:0.8rem;font-weight:600;cursor:pointer;color:var(--dark);display:flex;align-items:center;gap:6px;transition:all .15s;font-family:inherit}
      .btn-export:hover{border-color:var(--gold);color:var(--gold)}
      .rpt-empty{padding:40px;text-align:center;color:var(--muted);font-size:0.88rem}
    </style>
    <div class="rpt-tabs" id="rpt-tabs">
      <button class="rpt-tab active" onclick="rptTab('summary',this)">📊 Summary</button>
      <button class="rpt-tab" onclick="rptTab('revenue',this)">💰 Revenue</button>
      <button class="rpt-tab" onclick="rptTab('bookings',this)">📅 Bookings</button>
      <button class="rpt-tab" onclick="rptTab('venues',this)">🏛️ Venues</button>
      <button class="rpt-tab" onclick="rptTab('customers',this)">👥 Customers</button>
      <button class="rpt-tab" onclick="rptTab('payments',this)">💳 Payments</button>
    </div>
    <div class="rpt-filters">
      <div class="rpt-filter-group">
        <label>From Date</label>
        <input type="date" id="rpt-from" onchange="_rState.from=this.value;rptValidateDates();rptRender()" />
      </div>
      <div class="rpt-filter-group">
        <label>To Date</label>
        <input type="date" id="rpt-to" onchange="_rState.to=this.value;rptValidateDates();rptRender()" />
      </div>
      <div class="rpt-filter-group" id="rpt-venue-filter-wrap">
        <label>Venue</label>
        <select id="rpt-venue" onchange="_rState.venueId=this.value;rptRender()">
          <option value="">All Venues</option>
        </select>
      </div>
      <div class="rpt-filter-group" id="rpt-groupby-wrap">
        <label>Group By</label>
        <select id="rpt-groupby" onchange="_rState.groupBy=this.value;rptRender()">
          <option value="day">Day</option>
          <option value="month" selected>Month</option>
          <option value="year">Year</option>
        </select>
      </div>
      <div class="rpt-filter-group">
        <label>&nbsp;</label>
        <div style="display:flex;gap:6px">
          <button class="btn-export" onclick="rptQuickRange(7)">Last 7d</button>
          <button class="btn-export" onclick="rptQuickRange(30)">Last 30d</button>
          <button class="btn-export" onclick="rptQuickRange(90)">Last 90d</button>
          <button class="btn-export" onclick="rptQuickRangeThisMonth()">This Month</button>
          <button class="btn-export" onclick="rptQuickRangeThisYear()">This Year</button>
          <button class="btn-export" onclick="rptClearRange()" style="color:var(--muted)">All Time</button>
        </div>
      </div>
    </div>
    <div id="rpt-body"><div class="rpt-empty">Loading…</div></div>
  `;

  // Set default date range = last 30 days, and inject today's date into input max attrs
  const rptToday = new Date().toISOString().split('T')[0];
  const rptFrom30 = new Date(); rptFrom30.setDate(rptFrom30.getDate() - 29);
  const rptDefaultFrom = rptFrom30.toISOString().split('T')[0];
  // Replace ${rptToday} placeholders in the injected HTML
  // Set max=today on date inputs to block future selection
  const fi = document.getElementById('rpt-from'), ti = document.getElementById('rpt-to');
  if (fi) { fi.max = rptToday; }
  if (ti) { ti.max = rptToday; }
  // Set default range
  _rState.from = rptDefaultFrom; _rState.to = rptToday;
  if (fi) fi.value = rptDefaultFrom;
  if (ti) ti.value = rptToday;

  // Load venues for filter dropdown
  try {
    const stats = await api('/owner/stats');
    const sel = document.getElementById('rpt-venue');
    if (sel) (stats.venues||[]).forEach(function(v) {
      const o = document.createElement('option'); o.value = v._id; o.textContent = v.name; sel.appendChild(o);
    });
  } catch(e) {}

  await rptRender();
}

function rptFmtDate(d) { return d.toISOString().split('T')[0]; }
function rptQuickRange(days) {
  const to   = new Date(); to.setHours(0,0,0,0);
  const from = new Date(to); from.setDate(from.getDate() - days + 1);
  _rState.from = rptFmtDate(from); _rState.to = rptFmtDate(to);
  const fi = document.getElementById('rpt-from'), ti = document.getElementById('rpt-to');
  if (fi) fi.value = _rState.from;
  if (ti) ti.value = _rState.to;
  rptRender();
}
function rptQuickRangeThisMonth() {
  const now  = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to   = new Date(); to.setHours(0,0,0,0);
  _rState.from = rptFmtDate(from); _rState.to = rptFmtDate(to);
  const fi = document.getElementById('rpt-from'), ti = document.getElementById('rpt-to');
  if (fi) fi.value = _rState.from; if (ti) ti.value = _rState.to;
  rptRender();
}
function rptQuickRangeThisYear() {
  const now  = new Date();
  const from = new Date(now.getFullYear(), 0, 1);
  const to   = new Date(); to.setHours(0,0,0,0);
  _rState.from = rptFmtDate(from); _rState.to = rptFmtDate(to);
  const fi = document.getElementById('rpt-from'), ti = document.getElementById('rpt-to');
  if (fi) fi.value = _rState.from; if (ti) ti.value = _rState.to;
  rptRender();
}
function rptClearRange() {
  _rState.from = ''; _rState.to = '';
  const fi = document.getElementById('rpt-from'), ti = document.getElementById('rpt-to');
  if (fi) fi.value = ''; if (ti) ti.value = '';
  rptRender();
}
function rptValidateDates() {
  const today = new Date().toISOString().split('T')[0];
  const fi = document.getElementById('rpt-from');
  const ti = document.getElementById('rpt-to');
  // Remove old inline errors
  ['rpt-from-err','rpt-to-err'].forEach(function(id){ const e=document.getElementById(id); if(e) e.remove(); });
  if (fi && _rState.from && _rState.from > today) {
    _rState.from = today; fi.value = today;
    fi.insertAdjacentHTML('afterend', '<span id="rpt-from-err" style="color:#ef4444;font-size:0.72rem;display:block;margin-top:2px">⚠️ Capped to today</span>');
  }
  if (ti && _rState.to && _rState.to > today) {
    _rState.to = today; ti.value = today;
    ti.insertAdjacentHTML('afterend', '<span id="rpt-to-err" style="color:#b45309;font-size:0.72rem;display:block;margin-top:2px">⚠️ Capped to today (reports are historical)</span>');
  }
  if (_rState.from && _rState.to && _rState.from > _rState.to) {
    if (fi) fi.insertAdjacentHTML('afterend', '<span id="rpt-from-err" style="color:#ef4444;font-size:0.72rem;display:block;margin-top:2px">⚠️ Start must be before end date</span>');
  }
}

function rptTab(tab, btn) {
  _rState.tab = tab;
  document.querySelectorAll('.rpt-tab').forEach(function(b){ b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  // Show/hide groupBy based on tab
  const gbw = document.getElementById('rpt-groupby-wrap');
  if (gbw) gbw.style.display = tab === 'revenue' ? '' : 'none';
  rptRender();
}

async function rptRender() {
  const body = document.getElementById('rpt-body');
  if (!body) return;

  const today = new Date().toISOString().split('T')[0];

  // ── Validate date range ────────────────────────────────────
  const errEl = document.getElementById('rpt-date-err');
  if (errEl) errEl.remove(); // clear previous error

  if (_rState.from && _rState.to && _rState.from > _rState.to) {
    const fi = document.getElementById('rpt-from');
    if (fi) fi.insertAdjacentHTML('afterend',
      '<div id="rpt-date-err" style="color:#ef4444;font-size:0.75rem;margin-top:4px">⚠️ "From" date cannot be after "To" date</div>');
    body.innerHTML = '<div class="rpt-empty" style="color:#ef4444">⚠️ Invalid date range: start date is after end date.<br><small style="color:var(--muted)">Please fix the date filters above.</small></div>';
    return;
  }
  if (_rState.from && _rState.from > today) {
    const fi = document.getElementById('rpt-from');
    if (fi) fi.insertAdjacentHTML('afterend',
      '<div id="rpt-date-err" style="color:#ef4444;font-size:0.75rem;margin-top:4px">⚠️ Reports only show historical data. Future start date selected.</div>');
    body.innerHTML = '<div class="rpt-empty">📅 No data for future dates.<br><small style="color:var(--muted)">Reports are based on actual bookings — select a past date range to see data.</small></div>';
    return;
  }

  // Warn if "to" is in the future — cap it silently to today
  var effectiveTo = _rState.to;
  var futureToWarning = '';
  if (_rState.to && _rState.to > today) {
    effectiveTo = today;
    futureToWarning = '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:7px;padding:9px 14px;font-size:0.8rem;color:#b45309;margin-bottom:14px">⚠️ End date is in the future — report data shown up to <strong>today (' + today + ')</strong> only.</div>';
  }

  body.innerHTML = '<div class="rpt-empty">⏳ Loading…</div>';

  const qs = new URLSearchParams();
if (_rState.from)    qs.set('from',    _rState.from);
if (effectiveTo)     qs.set('to',      effectiveTo);
if (_rState.venueId) qs.set('venueId', _rState.venueId);
if (_rState.groupBy) qs.set('groupBy', _rState.groupBy);
qs.set('_t', Date.now()); // ← cache buster
  try {
    var content = '';
    switch(_rState.tab) {
      case 'summary':   content = await rptSummaryHTML(qs);  break;
      case 'revenue':   content = await rptRevenueHTML(qs);  break;
      case 'bookings':  content = await rptBookingsHTML(qs); break;
      case 'venues':    content = await rptVenuesHTML(qs);   break;
      case 'customers': content = await rptCustomersHTML(qs);break;
      case 'payments':  content = await rptPaymentsHTML(qs); break;
    }
    body.innerHTML = futureToWarning + content;
  } catch(e) {
    body.innerHTML = '<div class="rpt-empty">⚠️ Failed to load report: ' + escHtml(e.error||e.message||'') + '</div>';
  }
}

// ── Helpers ───────────────────────────────────────────────────
function rptKpi(val, label, cls, sub) {
  return '<div class="rpt-kpi"><div class="rpt-kpi-val '+(cls||'')+'">'+val+'</div><div class="rpt-kpi-label">'+label+'</div>'+(sub?'<div class="rpt-kpi-sub">'+sub+'</div>':'')+'</div>';
}
function rptBarChart(rows, title, maxVal) {
  var max = maxVal || Math.max.apply(null, rows.map(function(r){return r.val||0;})) || 1;
  return '<div class="rpt-chart-wrap"><div class="rpt-chart-title">'+title+'</div>'
    + '<div class="rpt-bar-chart">'
    + rows.map(function(r){
        var pct = Math.max(2, Math.round((r.val||0)/max*100));
        return '<div class="rpt-bc-row">'
          +'<div class="rpt-bc-label">'+escHtml(String(r.label))+'</div>'
          +'<div class="rpt-bc-bar-wrap"><div class="rpt-bc-bar" style="width:'+pct+'%">'+(pct>12?fmt(r.val):'')+'</div></div>'
          +'<div class="rpt-bc-val">'+fmt(r.val)+'</div></div>';
      }).join('')
    + '</div></div>';
}
function rptStatusPill(status) {
  var map = { confirmed:'green', paid:'green', pending:'amber', rejected:'red', cancelled:'red' };
  return '<span class="rpt-pill rpt-pill-'+(map[status]||'blue')+'">'+status+'</span>';
}
function rptExportBtn(label, url) {
  return '<button class="btn-export" onclick="rptDownload(\''+escHtml(url)+'\')">⬇️ '+escHtml(label)+'</button>';
}
function rptDownload(path) {
  // Build full URL with auth token and date params
  const qs = new URLSearchParams();
  if (_rState.from) qs.set('from', _rState.from);
  if (_rState.to)   qs.set('to',   _rState.to);
  const token = localStorage.getItem('evntly_token');
  const sep = path.includes('?') ? '&' : '?';
  // Create a temporary link to trigger download with auth header via fetch
  rptFetchAndDownload(path + sep + qs.toString(), token);
}
async function rptFetchAndDownload(url, token) {
  try {
    const res = await fetch(API_BASE + url, { cache: 'no-store', headers: { 'Authorization': 'Bearer ' + token } });
    const blob = await res.blob();
    const cd   = res.headers.get('content-disposition') || '';
    const fn   = cd.match(/filename="([^"]+)"/)?.[1] || 'report.csv';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fn; a.click();
    URL.revokeObjectURL(a.href);
    toast('Report downloaded ✅', 'success');
  } catch(e) { toast('Download failed', 'error'); }
}

// ── 1. SUMMARY ─────────────────────────────────────────────────
async function rptSummaryHTML(qs) {
  const d = await api('/owner/reports/summary?' + qs);
  const growthClr = d.revenueGrowth >= 0 ? 'sage' : 'brick';
  const growthIcon = d.revenueGrowth >= 0 ? '▲' : '▼';
  var html =
    '<div class="rpt-kpi-grid">'
    + rptKpi(fmt(d.totalRevenue), 'Total Revenue', 'gold')
    + rptKpi(d.totalBookings, 'Total Bookings', '')
    + rptKpi(d.confirmedBookings, 'Confirmed', 'sage')
    + rptKpi(d.pendingBookings, 'Pending', d.pendingBookings>0?'brick':'')
    + rptKpi(d.conversionRate+'%', 'Conversion Rate', 'sage')
    + rptKpi(fmt(d.avgBookingValue), 'Avg Booking Value', '')
    + rptKpi(d.venueCount, 'My Venues', '')
    + rptKpi(growthIcon+' '+Math.abs(d.revenueGrowth)+'%', 'MoM Revenue Growth', growthClr, 'vs last month')
    + '</div>'
    + '<div class="rpt-kpi-grid" style="margin-bottom:20px">'
    + rptKpi(fmt(d.thisMonthRevenue), 'This Month', 'gold')
    + rptKpi(fmt(d.lastMonthRevenue), 'Last Month', '')
    + rptKpi(d.cancelledBookings, 'Cancelled', d.cancelledBookings>0?'brick':'')
    + '</div>'
    + '<div class="rpt-export-bar">'
    + rptExportBtn('Export Bookings CSV', '/owner/reports/export/bookings-csv')
    + rptExportBtn('Export Revenue CSV', '/owner/reports/export/revenue-csv')
    + '</div>';
  return html;
}

// ── 2. REVENUE ─────────────────────────────────────────────────
async function rptRevenueHTML(qs) {
  const d = await api('/owner/reports/revenue?' + qs);
  var rows = d.series.length
    ? rptBarChart(d.series.map(function(s){ return { label: s.period, val: s.revenue }; }), 'Revenue by Period')
    : '<div class="rpt-empty">No revenue data for selected period.</div>';
  var byVenueHtml = '';
  if (d.byVenue && d.byVenue.length) {
    var max = d.byVenue[0].revenue || 1;
    byVenueHtml = '<div class="rpt-section"><div class="rpt-section-title">Revenue by Venue</div>'
      + '<table class="rpt-table"><thead><tr><th>Venue</th><th>Revenue</th><th>Bookings</th><th>Share</th></tr></thead><tbody>'
      + d.byVenue.map(function(v){
          var share = d.totalRevenue > 0 ? Math.round(v.revenue/d.totalRevenue*100) : 0;
          return '<tr><td><strong>'+escHtml(v.venue)+'</strong></td><td>'+fmt(v.revenue)+'</td><td>'+v.bookings+'</td>'
            +'<td><div style="font-weight:700">'+share+'%</div><div class="rpt-bar-wrap"><div class="rpt-bar" style="width:'+share+'%"></div></div></td></tr>';
        }).join('')
      + '</tbody></table></div>';
  }
  var tableHtml = d.series.length
    ? '<div class="rpt-section"><div class="rpt-section-title">Period Breakdown</div>'
      + '<table class="rpt-table"><thead><tr><th>Period</th><th>Revenue</th><th>Bookings</th><th>Avg Value</th></tr></thead><tbody>'
      + d.series.map(function(s){
          return '<tr><td>'+s.period+'</td><td><strong>'+fmt(s.revenue)+'</strong></td><td>'+s.bookings+'</td><td>'+fmt(s.avgBookingValue)+'</td></tr>';
        }).join('')
      + '</tbody></table></div>'
    : '';
  return '<div class="rpt-kpi-grid">'
    + rptKpi(fmt(d.totalRevenue), 'Total Revenue', 'gold')
    + rptKpi(d.totalBookings, 'Paid Bookings', 'sage')
    + rptKpi(fmt(d.avgBookingValue), 'Avg Value', '')
    + '</div>'
    + '<div class="rpt-export-bar">'+rptExportBtn('Export Revenue CSV', '/owner/reports/export/revenue-csv')+'</div>'
    + rows + byVenueHtml + tableHtml;
}

// ── 3. BOOKINGS ─────────────────────────────────────────────────
async function rptBookingsHTML(qs) {
  const d = await api('/owner/reports/bookings?' + qs);
  // Status chart
  var statusRows = Object.entries(d.byStatus||{}).map(function(e){ return { label: e[0], val: e[1] }; })
    .sort(function(a,b){ return b.val - a.val; });
  var dayRows = (d.byDay||[]).map(function(r){ return { label: r.day, val: r.count }; });
  var etRows  = Object.entries(d.byEventType||{}).map(function(e){ return { label: e[0], val: e[1] }; })
    .sort(function(a,b){ return b.val - a.val; });
  var tableHtml = '<div class="rpt-section"><div class="rpt-section-title">All Bookings</div>'
    + '<div class="rpt-export-bar">'+rptExportBtn('Export Bookings CSV', '/owner/reports/export/bookings-csv')+'</div>'
    + '<table class="rpt-table"><thead><tr><th>Ref</th><th>Venue</th><th>Customer</th><th>Date</th><th>Event</th><th>Hours</th><th>Guests</th><th>Total</th><th>Status</th></tr></thead><tbody>'
    + (d.bookings||[]).slice(0,100).map(function(b){
        return '<tr><td style="font-size:0.72rem;color:var(--muted);font-family:monospace">'+(b.ref||String(b._id||'').slice(-6))+'</td>'
          +'<td>'+escHtml(b.venueName||'')+'</td>'
          +'<td>'+escHtml(b.userName||'')+'</td>'
          +'<td>'+escHtml(b.date||'')+'</td>'
          +'<td>'+escHtml(b.eventType||'')+'</td>'
          +'<td>'+b.hours+'h</td>'
          +'<td>'+b.guests+'</td>'
          +'<td><strong>'+fmt(b.total)+'</strong></td>'
          +'<td>'+rptStatusPill(b.status)+'</td></tr>';
      }).join('')
    + '</tbody></table></div>';
  return '<div class="rpt-kpi-grid">'
    + rptKpi(d.total, 'Total Bookings', '')
    + rptKpi(d.byStatus&&d.byStatus.confirmed ? d.byStatus.confirmed+' / '+(d.byStatus.paid||0) : '0', 'Confirmed / Paid', 'sage')
    + rptKpi(d.byStatus&&d.byStatus.pending||0, 'Pending', 'amber')
    + rptKpi((d.byStatus&&((d.byStatus.rejected||0)+(d.byStatus.cancelled||0)))||0, 'Cancelled', 'brick')
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">'
    + (statusRows.length ? rptBarChart(statusRows, 'By Status') : '')
    + (dayRows.length ? rptBarChart(dayRows, 'Bookings by Day of Week') : '')
    + '</div>'
    + (etRows.length ? rptBarChart(etRows, 'By Event Type') : '')
    + tableHtml;
}

// ── 4. VENUES ──────────────────────────────────────────────────
async function rptVenuesHTML(qs) {
  const d = await api('/owner/reports/venues?' + qs);
  if (!d.venues || !d.venues.length) return '<div class="rpt-empty">No venue data available.</div>';
  var topRev = d.venues[0].revenue || 1;
  return '<div class="rpt-section"><div class="rpt-section-title">Venue Performance</div>'
    + '<table class="rpt-table"><thead><tr><th>Venue</th><th>Type</th><th>Revenue</th><th>Bookings</th><th>Avg Value</th><th>Conversion</th><th>Rating</th><th>Pending</th></tr></thead><tbody>'
    + d.venues.map(function(v){
        var share = Math.round(v.revenue/topRev*100);
        return '<tr>'
          + '<td><strong>'+escHtml(v.name)+'</strong><br><small style="color:var(--muted)">'+escHtml(v.location)+'</small></td>'
          + '<td>'+escHtml(v.type)+'</td>'
          + '<td><strong>'+fmt(v.revenue)+'</strong><div class="rpt-bar-wrap"><div class="rpt-bar" style="width:'+share+'%"></div></div></td>'
          + '<td>'+v.confirmedBookings+'<span style="color:var(--muted);font-size:0.75rem"> / '+v.totalBookings+' total</span></td>'
          + '<td>'+fmt(v.avgBookingValue)+'</td>'
          + '<td><strong style="color:'+(v.conversionRate>=50?'var(--sage)':'var(--brick)')+'">'+v.conversionRate+'%</strong></td>'
          + '<td>'+(v.avgRating ? '★ '+v.avgRating+' <small style="color:var(--muted)">('+v.reviewCount+')</small>' : '<span style="color:var(--muted)">—</span>')+'</td>'
          + '<td>'+(v.pendingBookings > 0 ? '<span class="rpt-pill rpt-pill-amber">'+v.pendingBookings+' pending</span>' : '—')+'</td>'
          + '</tr>';
      }).join('')
    + '</tbody></table></div>';
}

// ── 5. CUSTOMERS ───────────────────────────────────────────────
async function rptCustomersHTML(qs) {
  const d = await api('/owner/reports/customers?' + qs);
  if (!d.customers || !d.customers.length) return '<div class="rpt-empty">No customer data available.</div>';
  return '<div class="rpt-kpi-grid">'
    + rptKpi(d.total, 'Total Customers', '')
    + rptKpi(d.repeatCustomers, 'Repeat Customers', 'sage')
    + rptKpi(d.repeatRate+'%', 'Repeat Rate', 'sage')
    + '</div>'
    + '<div class="rpt-section"><div class="rpt-section-title">Customer List (by Revenue)</div>'
    + '<table class="rpt-table"><thead><tr><th>Customer</th><th>Email</th><th>Bookings</th><th>Revenue</th><th>Last Booking</th><th>Type</th></tr></thead><tbody>'
    + d.customers.map(function(c){
        return '<tr>'
          + '<td><strong>'+escHtml(c.name)+'</strong></td>'
          + '<td style="font-size:0.78rem;color:var(--muted)">'+escHtml(c.email)+'</td>'
          + '<td>'+c.bookings+'</td>'
          + '<td><strong>'+fmt(c.revenue)+'</strong></td>'
          + '<td>'+escHtml(c.lastBooking||'—')+'</td>'
          + '<td>'+(c.bookings > 1 ? '<span class="rpt-pill rpt-pill-green">Repeat</span>' : '<span class="rpt-pill rpt-pill-blue">New</span>')+'</td>'
          + '</tr>';
      }).join('')
    + '</tbody></table></div>';
}

// ── 6. PAYMENTS ────────────────────────────────────────────────
async function rptPaymentsHTML(qs) {
  const d = await api('/owner/reports/payments?' + qs);
  const s = d.summary || {};
  var pmRows = Object.entries(d.byPaymentMethod||{})
    .filter(function(e){ return e[1] > 0; })
    .map(function(e){ return { label: e[0], val: e[1] }; })
    .sort(function(a,b){ return b.val - a.val; });
  return '<div class="rpt-kpi-grid">'
    + rptKpi(fmt(s.totalRevenue||0), 'Total Revenue', 'gold')
    + rptKpi(fmt(s.totalCollected||0), 'Collected', 'sage')
    + rptKpi(fmt(s.totalPending||0), 'Pending Collection', 'brick')
    + rptKpi(s.fullyPaidCount||0, 'Fully Paid', 'sage')
    + rptKpi(s.advancePaidCount||0, 'Advance Paid', '')
    + rptKpi(s.cashOnVisitCount||0, 'Cash on Visit', '')
    + rptKpi(s.unpaidCount||0, 'Unpaid', s.unpaidCount>0?'brick':'')
    + '</div>'
    + (pmRows.length ? rptBarChart(pmRows, 'Payment Method Distribution') : '')
    + '<div class="rpt-section"><div class="rpt-section-title">Payment Details</div>'
    + '<table class="rpt-table"><thead><tr><th>Ref</th><th>Customer</th><th>Venue</th><th>Date</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Status</th></tr></thead><tbody>'
    + (d.bookings||[]).slice(0,100).map(function(b){
        var paid = b.paidAmount||0; var rem = (b.total||0)-paid;
        if (b.status==='paid'||b.paymentStatus==='fully_paid'){ paid=b.total; rem=0; }
        return '<tr>'
          +'<td style="font-size:0.72rem;font-family:monospace;color:var(--muted)">'+(b.ref||String(b._id||'').slice(-6))+'</td>'
          +'<td>'+escHtml(b.userName||'')+'</td>'
          +'<td>'+escHtml(b.venueName||'')+'</td>'
          +'<td>'+escHtml(b.date||'')+'</td>'
          +'<td><strong>'+fmt(b.total)+'</strong></td>'
          +'<td style="color:var(--sage);font-weight:600">'+fmt(paid)+'</td>'
          +'<td style="color:'+(rem>0?'var(--brick)':'var(--muted)')+'">'+fmt(rem)+'</td>'
          +'<td>'+rptStatusPill(b.status)+'</td>'
          +'</tr>';
      }).join('')
    + '</tbody></table></div>';
}


// ─── MY PLAN (owner) ──────────────────────────────────────────────────────────
async function loadMyPlan() {
  const container = document.getElementById('my-plan-content');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--muted);padding:32px;text-align:center">Loading plan details\u2026</p>';
  try {
    const [stats, allPlans] = await Promise.all([
      api('/owner/stats'),
      api('/plans').catch(() => []),
    ]);
    const planKey   = stats.plan || 'basic';
    const isPaid    = stats.planPaymentStatus === 'paid' || stats.listingEnabled;
    const paidAt    = stats.planPaidAt    ? new Date(stats.planPaidAt)    : null;
    const expiresAt = stats.planExpiresAt ? new Date(stats.planExpiresAt) : null;
    const today     = new Date(); today.setHours(0, 0, 0, 0);
    const curPlan   = allPlans.find(function(p) { return p.key === planKey; }) || {
      name: planKey.charAt(0).toUpperCase() + planKey.slice(1),
      key: planKey, price: 0, maxVenues: 1, features: []
    };
    const statusBadge = isPaid
      ? '<span style="background:rgba(34,197,94,0.12);color:#16a34a;border:1px solid rgba(34,197,94,0.3);border-radius:20px;padding:4px 14px;font-size:0.74rem;font-weight:700">\u2705 Active</span>'
      : '<span style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.3);border-radius:20px;padding:4px 14px;font-size:0.74rem;font-weight:700">\u26a0\ufe0f Payment Pending</span>';
    var deadlineHtml = '';
    var isExpired = false, isNear = false, daysLeft = 9999;
    if (expiresAt) {
      daysLeft  = Math.ceil((expiresAt - today) / (1000*60*60*24));
      isExpired = daysLeft <= 0;
      isNear    = !isExpired && daysLeft <= 30;
      var expStr = expiresAt.toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });
      var bg   = isExpired ? 'rgba(239,68,68,0.08)'  : isNear ? 'rgba(245,158,11,0.08)' : 'rgba(74,94,79,0.07)';
      var bdr  = isExpired ? 'rgba(239,68,68,0.28)'  : isNear ? 'rgba(245,158,11,0.3)'  : 'rgba(74,94,79,0.2)';
      var clr  = isExpired ? 'var(--brick)'           : isNear ? '#b45309'               : 'var(--sage)';
      var icon = isExpired ? '\U0001f534' : isNear ? '\u26a0\ufe0f' : '\u2705';
      var msg  = isExpired
        ? 'Plan Expired \u2014 please renew to continue listing venues'
        : isNear ? ('Expiring in ' + daysLeft + ' day' + (daysLeft !== 1 ? 's' : '') + ' \u2014 renew soon')
        : ('Valid for ' + daysLeft + ' more day' + (daysLeft !== 1 ? 's' : ''));
      deadlineHtml =
        '<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:8px;margin-top:14px;background:'+bg+';border:1px solid '+bdr+'">'
        + '<span style="font-size:1.2rem">'+icon+'</span>'
        + '<div style="flex:1"><div style="font-size:0.84rem;font-weight:700;color:'+clr+'">'+msg+'</div>'
        + '<div style="font-size:0.76rem;color:var(--muted);margin-top:1px">'+(isExpired?'Expired on ':'Expires on ')+expStr+'</div>'
        + '</div></div>';
    } else if (paidAt) {
      deadlineHtml = '<div style="font-size:0.79rem;color:var(--muted);margin-top:10px">\u2705 Plan activated on '
        + paidAt.toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' }) + '</div>';
    }
    var maxVL = curPlan.maxVenues === -1 ? 'Unlimited venue listings' : curPlan.maxVenues + ' venue listing' + (curPlan.maxVenues > 1 ? 's' : '');
    var feats = (curPlan.features && curPlan.features.length) ? curPlan.features : [maxVL];
    var featsHtml = feats.map(function(f) {
      return '<div style="display:flex;align-items:center;gap:8px;font-size:0.83rem;color:rgba(255,255,255,0.75);padding:4px 0">'
        + '<span style="color:#6db87a;font-weight:700;flex-shrink:0">\u2713</span>' + escHtml(f) + '</div>';
    }).join('');
    var currentCardHtml =
      '<div style="background:linear-gradient(135deg,#1a1209 0%,#1a1a1a 100%);border:1.5px solid rgba(200,169,110,0.6);border-radius:14px;padding:22px 26px;margin-bottom:24px;position:relative;overflow:hidden">'
      + '<div style="position:absolute;top:-40px;right:-40px;width:130px;height:130px;border-radius:50%;background:rgba(200,169,110,0.04);pointer-events:none"></div>'
      + '<div style="font-size:0.65rem;color:rgba(200,169,110,0.55);font-weight:700;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:8px">Your Current Plan</div>'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:8px">'
      + '<div style="font-family:\'Playfair Display\',serif;font-size:1.5rem;font-weight:900;color:#fff">' + escHtml(curPlan.name) + '</div>'
      + '<div style="display:flex;align-items:center;gap:10px">' + statusBadge
      + '<span style="font-size:1.3rem;font-weight:800;color:#c8a96e">\u20b9' + Number(curPlan.price).toLocaleString('en-IN') + '</span></div></div>'
      + '<div style="font-size:0.8rem;color:rgba(255,255,255,0.4);margin-bottom:8px">\U0001f4e6 ' + escHtml(maxVL) + '</div>'
      + (featsHtml ? '<div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:10px;margin-top:4px">' + featsHtml + '</div>' : '')
      + deadlineHtml + '</div>';
    var renewBannerHtml = '';
    if (isExpired || isNear) {
      renewBannerHtml =
        '<div style="background:rgba(200,169,110,0.08);border:1.5px solid rgba(200,169,110,0.4);border-radius:10px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">'
        + '<div>'
        + '<div style="font-size:0.88rem;font-weight:700;color:var(--dark)">' + (isExpired ? '\U0001f534 Your plan has expired' : '\u26a0\ufe0f Your plan expires soon') + '</div>'
        + '<div style="font-size:0.78rem;color:var(--muted);margin-top:2px">' + (isExpired ? 'Renew now to restore venue listing access' : 'Renew to avoid losing listing access') + '</div>'
        + '</div>'
        + '<button class="btn-submit" style="padding:9px 20px;width:auto;font-size:0.85rem" onclick="cpSelectRenew()">\U0001f504 Renew ' + escHtml(curPlan.name) + ' Plan</button>'
        + '</div>';
    }
    var activePlans = allPlans.filter(function(p) { return p.isActive !== false; });
    var planCardsHtml = activePlans.length
      ? activePlans.map(function(p) {
          var isCur = p.key === planKey;
          var mxL   = p.maxVenues === -1 ? 'Unlimited venues' : p.maxVenues + ' venue listing' + (p.maxVenues > 1 ? 's' : '');
          var feat  = (p.features && p.features.length ? p.features : [mxL]).join(' \u00b7 ');
          return '<div id="cp-card-' + p.key + '" onclick="cpSelect(this,\'' + p.key + '\',' + p.price + ')"'
            + ' style="border:2px solid ' + (isCur ? 'var(--gold)' : 'var(--border,#e5e5e5)') + ';border-radius:10px;padding:14px 18px;cursor:pointer;transition:all .18s;background:' + (isCur ? 'rgba(200,169,110,0.05)' : 'var(--card-bg,#fff)') + ';">'
            + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'
            + '<div>'
            + (isCur ? '<div style="font-size:0.62rem;font-weight:700;background:var(--gold);color:#1a1a1a;border-radius:8px;padding:1px 8px;text-transform:uppercase;display:inline-block;margin-bottom:4px">Current</div><br>' : '')
            + '<span style="font-family:\'Playfair Display\',serif;font-weight:700;font-size:0.95rem;color:var(--dark)">' + escHtml(p.name) + '</span>'
            + '</div>'
            + '<span style="font-size:1.15rem;font-weight:800;color:var(--gold)">\u20b9' + Number(p.price).toLocaleString('en-IN') + '</span>'
            + '</div>'
            + '<div style="font-size:0.75rem;color:var(--muted);margin-top:5px">' + escHtml(feat) + '</div>'
            + '</div>';
        }).join('')
      : '<p style="color:var(--muted);font-size:0.85rem">No plans available.</p>';
    container.innerHTML =
      currentCardHtml + renewBannerHtml
      + '<div style="font-size:0.68rem;color:var(--muted);font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px">Switch or Resubscribe</div>'
      + '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px" id="cp-cards">' + planCardsHtml + '</div>'
      + '<div id="cp-action" style="display:none;background:rgba(200,169,110,0.06);border:1px solid rgba(200,169,110,0.22);border-radius:10px;padding:16px 20px">'
      + '<div style="font-size:0.88rem;font-weight:600;color:var(--dark);margin-bottom:12px;line-height:1.5" id="cp-action-text"></div>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap">'
      + '<button class="btn-submit" style="padding:10px 26px;width:auto" onclick="cpConfirm()">Proceed \u2192</button>'
      + '<button class="btn-ghost" style="padding:10px 18px" onclick="cpCancel()">Cancel</button></div>'
      + '<div id="cp-result" style="display:none;margin-top:12px;padding:10px 14px;border-radius:7px;font-size:0.83rem"></div></div>';
  } catch(e) {
    container.innerHTML = '<div style="color:var(--brick);padding:24px;text-align:center">\u26a0\ufe0f Failed to load plan details. ' + (e.error || '') + '</div>';
  }
}

var _cpKey = null, _cpPrice = 0;
function cpSelectRenew() {
  var cards = document.querySelectorAll('[id^="cp-card-"]');
  if (!cards.length) return;
  var first = cards[0];
  var key   = first.id.replace('cp-card-', '');
  var priceEl = first.querySelector('[style*="font-weight:800"]');
  var price = priceEl ? parseFloat((priceEl.textContent||'0').replace(/[^\d.]/g,'')) : 0;
  cpSelect(first, key, price);
  document.getElementById('cp-action')?.scrollIntoView({ behavior:'smooth', block:'nearest' });
}
function cpSelect(card, key, price) {
  _cpKey = key; _cpPrice = price;
  document.querySelectorAll('[id^="cp-card-"]').forEach(function(c) {
    var sel = c.id === 'cp-card-' + key;
    c.style.borderColor = sel ? 'var(--gold)' : 'var(--border,#e5e5e5)';
    c.style.background  = sel ? 'rgba(200,169,110,0.05)' : 'var(--card-bg,#fff)';
  });
  var aDiv = document.getElementById('cp-action');
  var aTxt = document.getElementById('cp-action-text');
  var rDiv = document.getElementById('cp-result');
  if (rDiv) rDiv.style.display = 'none';
  var cardEl   = document.getElementById('cp-card-' + key);
  var isCur    = cardEl && cardEl.innerHTML.includes('Current');
  var planName = key.charAt(0).toUpperCase() + key.slice(1);
  var priceStr = '\u20b9' + Number(price).toLocaleString('en-IN');
  aTxt.innerHTML = isCur
    ? '\U0001f504 <strong>Renew / Resubscribe to ' + escHtml(planName) + ' Plan</strong> \u2014 ' + priceStr
      + '<br><small style="color:var(--muted);font-weight:400">Renewing extends your plan by 1 year. Our team will send you a payment link.</small>'
    : '\u2b06\ufe0f <strong>Upgrade to ' + escHtml(planName) + ' Plan</strong> \u2014 ' + priceStr
      + '<br><small style="color:var(--muted);font-weight:400">Our team will send you a payment link. Plan activates after payment.</small>';
  aDiv.style.display = 'block';
}
function cpCancel() {
  _cpKey = null;
  document.getElementById('cp-action').style.display = 'none';
}
async function cpConfirm() {
  if (!_cpKey) return;
  var rDiv = document.getElementById('cp-result');
  rDiv.style.display = 'none';
  var btn = document.querySelector('#cp-action .btn-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending\u2026'; }
  try {
    await api('/owner/plan-change-request', { method:'POST', body:{ plan: _cpKey } });
    rDiv.style.cssText = 'display:block;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);color:#16a34a;padding:10px 14px;border-radius:7px;font-size:0.83rem;margin-top:12px';
    rDiv.innerHTML = '\u2705 <strong>Request sent!</strong> Our team will email you a payment link within 1\u20132 business days.';
    toast('Plan request sent! Check your email \U0001f4e7', 'success');
  } catch(e) {
    rDiv.style.cssText = 'display:block;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.28);color:#ef4444;padding:10px 14px;border-radius:7px;font-size:0.83rem;margin-top:12px';
    rDiv.textContent = '\u274c ' + (e.error || 'Request failed. Please try again.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Proceed \u2192'; }
  }
}
// ─── OFFERS PANEL (owner dashboard) ──────────────────────────────
async function loadOffersPanel() {
  const container = document.getElementById('offers-content');
  if (!container) return;
  const container = document.getElementById('offers-content');
  if (!container) return;

  // ── Date defaults ──────────────────────────────────────────────
  const ofToday = new Date().toISOString().split('T')[0];
  const ofTomorrowDate = new Date();
  ofTomorrowDate.setDate(ofTomorrowDate.getDate() + 1);
  const ofTomorrow = ofTomorrowDate.toISOString().split('T')[0];
  container.innerHTML = '<p style="color:var(--muted);padding:32px;text-align:center">Loading offers…</p>';

  /* ── Try to load existing offers ── */
  let offers = [], venues = [];
  try {
    const stats = await api('/owner/stats');
    venues = stats.venues || [];
    offers = await api('/offers').catch(() => []);
  } catch(e) {
    offers = []; venues = [];
  }

  /* ── Filter to this owner's venues only ── */
  const venueIds = new Set(venues.map(v => String(v._id)));
  const myOffers = offers.filter(o => venueIds.has(String(o.venueId)));

  /* ── Venue options for form ── */
  const venueOptions = venues.map(v =>
    `<option value="${v._id}">${escHtml(v.name)}</option>`).join('');

  container.innerHTML = `
    <style>
      .offer-form-card{background:#fff;border:1px solid var(--border,#e5e5e5);border-radius:12px;padding:24px 28px;margin-bottom:28px;box-shadow:0 2px 14px rgba(0,0,0,0.04)}
      .offer-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      @media(max-width:600px){.offer-form-grid{grid-template-columns:1fr}}
      .offer-list-card{background:#fff;border:1px solid var(--border,#e5e5e5);border-radius:10px;overflow:hidden;margin-bottom:14px;transition:box-shadow .15s}
      .offer-list-card:hover{box-shadow:0 4px 18px rgba(0,0,0,0.07)}
      .offer-list-img{width:100%;height:140px;object-fit:cover;background:var(--cream,#f9f5ee);display:block}
      .offer-list-img-placeholder{width:100%;height:140px;display:flex;align-items:center;justify-content:center;font-size:2.5rem;background:var(--cream,#f9f5ee)}
      .offer-list-body{padding:14px 18px}
      .offer-list-title{font-family:'Playfair Display',serif;font-size:1rem;font-weight:700;color:var(--dark);margin-bottom:2px}
      .offer-list-venue{font-size:0.78rem;color:var(--muted);margin-bottom:8px}
      .offer-list-desc{font-size:0.83rem;color:#555;line-height:1.55;margin-bottom:10px}
      .offer-list-meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
      .offer-meta-chip{font-size:0.73rem;font-weight:600;padding:3px 10px;border-radius:12px;background:var(--cream,#f9f5ee);color:var(--muted);border:1px solid var(--border,#e5e5e5)}
      .offer-list-footer{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
      .offer-toggle-wrap{display:flex;align-items:center;gap:8px;font-size:0.8rem;color:var(--muted);font-weight:600}
      .offer-toggle{position:relative;display:inline-block;width:42px;height:22px;cursor:pointer}
      .offer-toggle input{display:none}
      .offer-slider{position:absolute;inset:0;background:#d1c4b0;border-radius:22px;transition:.2s}
      .offer-slider:before{content:'';position:absolute;width:16px;height:16px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 4px rgba(0,0,0,0.18)}
      .offer-toggle input:checked + .offer-slider{background:#22c55e}
      .offer-toggle input:checked + .offer-slider:before{transform:translateX(20px)}
      .offer-delete-btn{background:none;border:1px solid #fee2e2;color:#ef4444;border-radius:7px;padding:5px 13px;font-size:0.75rem;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit}
      .offer-delete-btn:hover{background:#fee2e2}
      .offers-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin-top:4px}
      .offer-form-errors{display:none;background:#fee2e2;border:1px solid #fca5a5;border-radius:7px;padding:10px 14px;font-size:0.83rem;color:#991b1b;margin-bottom:14px}
      .offer-form-errors.show{display:block}
    </style>

    <!-- ── Add Offer Form ── -->
    <div class="offer-form-card">
      <div style="font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:700;margin-bottom:16px;color:var(--dark)">🎁 Create New Offer</div>
      <div class="offer-form-errors" id="offer-form-errors"></div>
      <div class="offer-form-grid">
        <div class="dash-form-field">
          <label class="dash-label">Venue *</label>
          <select class="dash-input" id="of-venue">
            <option value="">— Select venue —</option>
            ${venueOptions || '<option disabled>No venues yet</option>'}
          </select>
        </div>
        <div class="dash-form-field">
          <label class="dash-label">Offer Title *</label>
          <input class="dash-input" type="text" id="of-title" placeholder="e.g. 20% Off Weekday Bookings" maxlength="80" />
        </div>
      </div>
      <div class="dash-form-field">
        <label class="dash-label">Description</label>
        <textarea class="dash-input" id="of-desc" style="height:70px;resize:vertical" placeholder="Tell customers what's included, validity, T&C…"></textarea>
      </div>
      <div class="offer-form-grid">
        <div class="dash-form-field">
          <label class="dash-label">Discount Type *</label>
          <select class="dash-input" id="of-dtype" onchange="toggleOfferDiscount()">
            <option value="percent">Percentage Off (%)</option>
            <option value="flat">Flat Amount Off (₹)</option>
            <option value="free_amenity">Free Amenity / Add-on</option>
            <option value="custom">Custom / Other</option>
          </select>
        </div>
        <div class="dash-form-field" id="of-dval-wrap">
          <label class="dash-label">Discount Value *</label>
          <input class="dash-input" type="number" id="of-dval" placeholder="e.g. 20" min="0" />
        </div>
      </div>
      <div class="offer-form-grid">
        <div class="dash-form-field">
          <label class="dash-label">Valid From</label>
          <input class="dash-input" type="date" id="of-from"
            min="${ofToday}"
            value="${ofToday}"
            onchange="ofSyncTillMin()" />
          <span style="font-size:0.72rem;color:var(--muted);margin-top:4px;display:block">📅 Cannot be a past date</span>
        </div>
        <div class="dash-form-field">
          <label class="dash-label">Valid Till</label>
          <input class="dash-input" type="date" id="of-till"
            min="${ofTomorrow}"
            value="${ofTomorrow}" />
          <span style="font-size:0.72rem;color:var(--muted);margin-top:4px;display:block">📅 Must be after the "From" date</span>
        </div>
      </div>
      <div class="dash-form-field">
        <label class="dash-label">Offer Image <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
        <div class="img-upload-area" style="padding:14px" onclick="document.getElementById('of-img-input').click()">
          <input type="file" id="of-img-input" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="previewOfferImg(event)" />
          <div class="img-upload-icon" style="font-size:1.3rem">🖼️</div>
          <div class="img-upload-text" style="font-size:0.78rem">Click to upload banner image</div>
        </div>
        <div id="of-img-preview" style="margin-top:8px"></div>
      </div>
      <button class="btn-submit" style="margin-top:4px;width:auto;padding:11px 30px" id="of-submit-btn" onclick="submitOffer()">Create Offer →</button>
    </div>

    <!-- ── Existing Offers ── -->
    <div style="font-size:0.7rem;font-weight:700;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-bottom:12px">
      Active Offers (${myOffers.length})
    </div>
    <div class="offers-grid" id="offers-list-grid">
      ${myOffers.length ? renderOfferCards(myOffers, venues) : '<div style="padding:32px;text-align:center;color:var(--muted);font-size:0.88rem;grid-column:1/-1">No offers yet. Create one above to attract more bookings!</div>'}
    </div>
  `;
}
function ofSyncTillMin() {
  const fromEl = document.getElementById('of-from');
  const tillEl = document.getElementById('of-till');
  if (!fromEl || !tillEl) return;

  const fromDate = new Date(fromEl.value);
  fromDate.setDate(fromDate.getDate() + 1);
  const newMin = fromDate.toISOString().split('T')[0];

  tillEl.min = newMin;

  // Auto-bump "till" if it's now on or before "from"
  if (!tillEl.value || tillEl.value <= fromEl.value) {
    tillEl.value = newMin;
  }
}
function toggleOfferDiscount() {
  const dtype = document.getElementById('of-dtype')?.value;
  const wrap  = document.getElementById('of-dval-wrap');
  if (!wrap) return;
  if (dtype === 'free_amenity' || dtype === 'custom') {
    wrap.style.display = 'none';
  } else {
    wrap.style.display = '';
    document.getElementById('of-dval').placeholder =
      dtype === 'percent' ? 'e.g. 20 (= 20% off)' : 'e.g. 1000 (= ₹1,000 off)';
  }
}

let ofImgFile = null;
function previewOfferImg(e) {
  const file = e.target.files[0];
  if (!file) return;
  ofImgFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('of-img-preview').innerHTML = `
      <div style="position:relative;display:inline-block">
        <img src="${ev.target.result}" style="width:180px;height:110px;object-fit:cover;border-radius:7px;border:2px solid var(--gold)" />
        <button onclick="ofImgFile=null;document.getElementById('of-img-preview').innerHTML='';document.getElementById('of-img-input').value=''"
          style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#ef4444;color:#fff;border:none;cursor:pointer;font-size:0.7rem;font-weight:700">✕</button>
      </div>`;
  };
  reader.readAsDataURL(file);
}

async function submitOffer() {
  const errBox = document.getElementById('offer-form-errors');
  errBox.className = 'offer-form-errors';
  const venueId = document.getElementById('of-venue')?.value;
  const title   = document.getElementById('of-title')?.value.trim();
  const desc    = document.getElementById('of-desc')?.value.trim();
  const dtype   = document.getElementById('of-dtype')?.value;
  const dval    = document.getElementById('of-dval')?.value;
  const from    = document.getElementById('of-from')?.value;
  const till    = document.getElementById('of-till')?.value;
  const errs = [];
  if (!venueId)    errs.push('Please select a venue');
  if (!title)      errs.push('Offer title is required');
  if (dtype !== 'free_amenity' && dtype !== 'custom' && (!dval || parseFloat(dval) <= 0))
    errs.push('Please enter a discount value greater than 0');
  if (dtype === 'percent' && parseFloat(dval) > 100)
    errs.push('Percentage discount cannot exceed 100%');
  if (from && till && from > till)
    errs.push('"Valid From" must be before "Valid Till"');
  if (errs.length) {
    errBox.innerHTML = errs.map(e => `• ${e}`).join('<br>');
    errBox.className = 'offer-form-errors show';
    return;
  }
  const btn = document.getElementById('of-submit-btn');
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const fd = new FormData();
    fd.append('venueId',       venueId);
    fd.append('title',         title);
    fd.append('description',   desc || '');
    fd.append('discountType',  dtype);
    fd.append('discountValue', dval || '0');
    fd.append('validFrom',     from || '');
    fd.append('validTill',     till || '');
    fd.append('active',        'true');
    if (ofImgFile) fd.append('image', ofImgFile);
    await api('/offers', { method: 'POST', formData: fd });
    toast('Offer created! 🎉', 'success');
    ofImgFile = null;
    await loadOffersPanel();
  } catch(e) {
    errBox.innerHTML = '❌ ' + escHtml(e.error || e.errors?.[0] || 'Failed to create offer');
    errBox.className = 'offer-form-errors show';
    btn.disabled = false; btn.textContent = 'Create Offer →';
  }
}

function renderOfferCards(offers, venues) {
  return offers.map(o => {
    const venueName = venues.find(v => String(v._id) === String(o.venueId))?.name || o.venueName || '—';
    const discLabel = o.discountType === 'percent'      ? `${o.discountValue}% Off`
                    : o.discountType === 'flat'         ? `₹${Number(o.discountValue).toLocaleString('en-IN')} Off`
                    : o.discountType === 'free_amenity' ? 'Free Add-on'
                    : 'Special Offer';
    const dateRange = (o.validFrom || o.validTill)
      ? `📅 ${o.validFrom || '—'} → ${o.validTill || '—'}`
      : '📅 No expiry set';
    const imgHtml = o.image
      ? `<img class="offer-list-img" src="${imgUrl(o.image)}" alt="${escHtml(o.title)}" onerror="this.style.display='none'" />`
      : `<div class="offer-list-img-placeholder">🎁</div>`;
    return `
      <div class="offer-list-card" id="ocard-${o._id}">
        ${imgHtml}
        <div class="offer-list-body">
          <div class="offer-list-title">${escHtml(o.title)}</div>
          <div class="offer-list-venue">📍 ${escHtml(venueName)}</div>
          ${o.description ? `<div class="offer-list-desc">${escHtml(o.description)}</div>` : ''}
          <div class="offer-list-meta">
            <span class="offer-meta-chip" style="background:rgba(200,169,110,0.12);color:#a07840;border-color:rgba(200,169,110,0.3)">🏷️ ${discLabel}</span>
            <span class="offer-meta-chip">${dateRange}</span>
          </div>
          <div class="offer-list-footer">
            <label class="offer-toggle-wrap">
              <label class="offer-toggle">
                <input type="checkbox" ${o.active ? 'checked' : ''} onchange="toggleOffer('${o._id}',this.checked)" />
                <span class="offer-slider"></span>
              </label>
              <span id="offer-status-${o._id}">${o.active ? 'Active' : 'Paused'}</span>
            </label>
            <button class="offer-delete-btn" onclick="deleteOffer('${o._id}','${escHtml(o.title)}')">🗑️ Delete</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

async function toggleOffer(id, active) {
  const label = document.getElementById('offer-status-' + id);
  try {
    await api('/offers/' + id, { method: 'PATCH', body: { active } });
    if (label) label.textContent = active ? 'Active' : 'Paused';
    toast(active ? 'Offer activated ✅' : 'Offer paused', active ? 'success' : 'info');
  } catch(e) {
    toast('Failed to update offer: ' + (e.error || ''), 'error');
    if (label) label.textContent = active ? 'Paused' : 'Active'; // revert
  }
}

async function deleteOffer(id, title) {
  if (!confirm(`Delete offer "${title}"? This cannot be undone.`)) return;
  try {
    await api('/offers/' + id, { method: 'DELETE' });
    toast('Offer deleted', 'info');
    document.getElementById('ocard-' + id)?.remove();
  } catch(e) {
    toast('Delete failed: ' + (e.error || ''), 'error');
  }
}

// ─── OFFERS POPUP (homepage — shown to visitors) ──────────────────
async function loadOffersPopup() {
  try {
    const offers = await api('/offers?active=true').catch(() => []);
    const active = offers.filter(o => o.active);
    if (!active.length) return;
    // Pick a random active offer with an image, else just the first
    const withImg = active.filter(o => o.image);
    const offer   = withImg.length ? withImg[Math.floor(Math.random() * withImg.length)] : active[0];
    const discLabel = offer.discountType === 'percent'      ? `${offer.discountValue}% Off`
                    : offer.discountType === 'flat'         ? `₹${Number(offer.discountValue||0).toLocaleString('en-IN')} Off`
                    : offer.discountType === 'free_amenity' ? 'Free Add-on'
                    : 'Special Offer';
    const overlay = document.createElement('div');
    overlay.className = 'offer-popup-overlay';
    overlay.id = 'offer-popup-overlay';
    overlay.innerHTML = `
      <div class="offer-popup">
        ${offer.image ? `<img class="offer-popup-img" src="${imgUrl(offer.image)}" alt="${escHtml(offer.title)}" onerror="this.style.display='none'" />` : ''}
        <div class="offer-popup-body">
          <div class="offer-popup-tag">🎁 Limited Offer · ${discLabel}</div>
          <div class="offer-popup-title">${escHtml(offer.title)}</div>
          <div class="offer-popup-venue">📍 ${escHtml(offer.venueName || 'EVNTLY Venue')}</div>
          ${offer.description ? `<div class="offer-popup-desc">${escHtml(offer.description)}</div>` : ''}
          <div class="offer-popup-actions">
            <button class="btn-cta" style="padding:9px 22px;font-size:0.88rem" onclick="document.getElementById('offer-popup-overlay').remove();scrollToVenues()">Browse Venues →</button>
            <button class="offer-popup-close" onclick="document.getElementById('offer-popup-overlay').remove()">Not now</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    // Auto-dismiss after 12 seconds
    setTimeout(() => overlay.remove(), 12000);
  } catch(e) { /* silently skip */ }
}
// ─── INIT ─────────────────────────────────────────────────────────
(async () => {
  const searchDate = document.getElementById('search-date');
  if (searchDate) searchDate.min = new Date().toISOString().split('T')[0];
  await checkConnection();
  await restoreSession();
  await loadVenues();
  loadReviews();
  loadShowcase();
  loadOwnerPlans(); 
  loadOffersPopup();  // load plan cards from API (with static fallback)
  if (currentUser) showDashboard();
})();
