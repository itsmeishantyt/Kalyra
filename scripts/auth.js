/**
 * scripts/auth.js — Kalyra Auth Manager
 * Handles login, signup (3-step), logout, Google OAuth (mock/real),
 * session persistence, and navbar UI state.
 */

const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

/* ─── Toast helper ─────────────────────────────────────── */
function showToast(msg, type = 'info') {
  let container = document.getElementById('kalyra-toast-root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'kalyra-toast-root';
    container.style.cssText = `
      position:fixed;bottom:28px;right:24px;z-index:99999;
      display:flex;flex-direction:column;gap:10px;pointer-events:none;
    `;
    document.body.appendChild(container);
  }

  // Remove common emojis to render them in a premium way
  const cleanMsg = msg.replace('🛍️', '').replace('🛒', '').replace('🎉', '').trim();

  // Get matching SVG icon
  const lowercaseMsg = msg.toLowerCase();
  let iconHtml = '';
  
  if (lowercaseMsg.includes('cart') || lowercaseMsg.includes('🛍️') || lowercaseMsg.includes('🛒') || lowercaseMsg.includes('added to')) {
    // Shopping Bag icon for add/remove from cart
    iconHtml = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
      <line x1="3" y1="6" x2="21" y2="6"></line>
      <path d="M16 10a4 4 0 0 1-8 0"></path>
    </svg>`;
  } else if (lowercaseMsg.includes('wishlist')) {
    // Heart icon
    iconHtml = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>`;
  } else if (type === 'success' || lowercaseMsg.includes('success') || lowercaseMsg.includes('welcome')) {
    // Checkmark
    iconHtml = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>`;
  } else if (type === 'error' || lowercaseMsg.includes('fail') || lowercaseMsg.includes('could not')) {
    // Alert Circle
    iconHtml = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>`;
  } else {
    // Info Circle
    iconHtml = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>`;
  }

  const colors = { 
    success: '#8A9478', // Premium sage green matching --green
    error: '#c97a7a',   // Soft rose red
    info: '#B89B71',    // Muted gold matching --accent
    warning: '#d4a373'  // Warm sand
  };
  const iconColor = colors[type] || colors.info;
  const iconBg = iconColor + '20'; // 12.5% opacity

  const toast = document.createElement('div');
  toast.style.cssText = `
    display:flex;align-items:center;gap:12px;
    background:rgba(30, 26, 23, 0.96);color:#fff;
    border:1px solid ${iconColor}40;
    padding:12px 18px;border-radius:100px;font-size:13px;font-family:var(--sans,sans-serif);
    font-weight:500;letter-spacing:0.02em;
    box-shadow:0 12px 30px rgba(0,0,0,0.15), 0 0 15px ${iconColor}15;
    opacity:0;transform:translateY(12px) scale(0.95);
    transition:opacity .35s cubic-bezier(0.165, 0.84, 0.44, 1), transform .35s cubic-bezier(0.165, 0.84, 0.44, 1);
    pointer-events:auto;max-width:340px;line-height:1.3;
  `;

  toast.innerHTML = `
    <div style="
      display:flex;align-items:center;justify-content:center;
      width:28px;height:28px;border-radius:50%;
      background:${iconBg};color:${iconColor};flex-shrink:0;
    ">
      ${iconHtml}
    </div>
    <div style="flex:1;padding-right:4px;">${cleanMsg}</div>
  `;

  container.appendChild(toast);
  
  // Trigger animation
  requestAnimationFrame(() => { 
    toast.style.opacity = '1'; 
    toast.style.transform = 'translateY(0) scale(1)'; 
  });

  setTimeout(() => {
    toast.style.opacity = '0'; 
    toast.style.transform = 'translateY(-8px) scale(0.95)';
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

/* ─── Spinner keyframe ──────────────────────────────────── */
if (!document.getElementById('kalyra-spin-style')) {
  const s = document.createElement('style');
  s.id = 'kalyra-spin-style';
  s.textContent = '@keyframes kalyra-spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
}

/* ─── Button loading state ──────────────────────────────── */
function setLoading(btn, loading, text = '') {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.origText = btn.textContent;
    btn.innerHTML = `<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:kalyra-spin .7s linear infinite;vertical-align:middle;margin-right:8px;"></span>${text || btn.dataset.origText}`;
  } else {
    btn.textContent = text || btn.dataset.origText || btn.textContent;
  }
}

/* ─── Close all modals ──────────────────────────────────── */
function closeAllModals() {
  document.getElementById('login-modal')?.classList.remove('active');
  document.getElementById('login-backdrop')?.classList.remove('active');
  document.getElementById('signup-modal')?.classList.remove('active');
  document.getElementById('signup-backdrop')?.classList.remove('active');
  document.body.style.overflow = '';
}

/* ─── Show login step ───────────────────────────────────── */
function showLoginStep(name) {
  ['phone', 'otp', 'email', 'emailpw'].forEach(id => {
    const el = document.getElementById(`login-step-${id}`);
    if (el) el.hidden = (id !== name);
  });
}

/* ─── Navbar user state ─────────────────────────────────── */
function updateNavbarUserState() {
  const user = KalyraToken.getUser();
  const userIconLinks = document.querySelectorAll('a[href="#login"], a[href="#signup"], .nav-user-icon-link');

  if (user) {
    userIconLinks.forEach(link => {
      if (link.dataset.navReplaced) return;
      link.dataset.navReplaced = 'true';

      const initials = user.name
        ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
        : user.email[0].toUpperCase();

      const photoHtml = user.profile_photo
        ? `<img src="${user.profile_photo}" alt="${user.name}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`
        : `<div style="width:32px;height:32px;border-radius:50%;background:var(--stitch-gold,#B89B71);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;font-family:var(--sans,sans-serif);">${initials}</div>`;

      link.href = 'javascript:void(0)';
      link.setAttribute('aria-label', 'My Account');
      link.innerHTML = `
        <div class="nav-user-avatar" style="position:relative;">
          ${photoHtml}
          <div id="nav-user-dropdown" style="
            display:none;position:absolute;top:calc(100% + 12px);right:0;
            background:#fff;border:1px solid #ece8e0;border-radius:12px;
            box-shadow:0 8px 32px rgba(0,0,0,.12);min-width:186px;
            padding:8px 0;z-index:9999;font-family:var(--sans,sans-serif);
          ">
            <div style="padding:12px 16px 8px;border-bottom:1px solid #f3f0ea;">
              <div style="font-weight:600;font-size:14px;color:#222;">${user.name || 'My Account'}</div>
              <div style="font-size:12px;color:#888;margin-top:2px;">${user.email}</div>
            </div>
            <a href="orders.html" style="display:block;padding:10px 16px;font-size:14px;color:#555;text-decoration:none;" onmouseover="this.style.background='#faf8f4'" onmouseout="this.style.background='transparent'">My Orders</a>
            <a href="wishlist.html" style="display:block;padding:10px 16px;font-size:14px;color:#555;text-decoration:none;" onmouseover="this.style.background='#faf8f4'" onmouseout="this.style.background='transparent'">Wishlist</a>
            <a href="profile.html" style="display:block;padding:10px 16px;font-size:14px;color:#555;text-decoration:none;" onmouseover="this.style.background='#faf8f4'" onmouseout="this.style.background='transparent'">Profile Settings</a>
            <div style="border-top:1px solid #f3f0ea;margin-top:4px;"></div>
            <a href="javascript:void(0)" id="nav-logout-btn" style="display:block;padding:10px 16px;font-size:14px;color:#c0392b;text-decoration:none;" onmouseover="this.style.background='#faf8f4'" onmouseout="this.style.background='transparent'">Sign Out</a>
          </div>
        </div>
      `;

      link.addEventListener('click', e => {
        e.stopPropagation();
        const dd = document.getElementById('nav-user-dropdown');
        if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
      });

      document.addEventListener('click', e => {
        if (e.target?.id === 'nav-logout-btn') { e.preventDefault(); KalyraAuth.logout(); }
        else {
          const dd = document.getElementById('nav-user-dropdown');
          if (dd && !link.contains(e.target)) dd.style.display = 'none';
        }
      });
    });
  } else {
    userIconLinks.forEach(link => {
      if (!link.dataset.navReplaced) return;
      delete link.dataset.navReplaced;
      link.href = '#login';
      link.setAttribute('aria-label', 'User Account');
      link.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
    });
  }
}

/* ─── Signup step manager ───────────────────────────────── */
const SignupFlow = {
  currentStep: 1,

  goTo(step) {
    const prev = this.currentStep;
    document.getElementById(`signup-step-${prev}`)?.setAttribute('hidden', '');
    document.getElementById(`signup-step-${step}`)?.removeAttribute('hidden');
    this.currentStep = step;
    this._updateIndicator(step);
  },

  _updateIndicator(active) {
    document.querySelectorAll('.step-dot').forEach((dot, i) => {
      const n = i + 1;
      dot.classList.toggle('active', n === active);
      dot.classList.toggle('done', n < active);
    });
    document.querySelectorAll('.step-line').forEach((line, i) => {
      line.classList.toggle('done', i + 1 < active);
    });
  },

  reset() {
    this.goTo(1);
    ['signup-name','signup-email','signup-phone','signup-password','signup-confirm'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const tc = document.getElementById('signup-terms');
    if (tc) tc.checked = false;
    document.querySelectorAll('.field-error').forEach(e => e.textContent = '');
    document.getElementById('signup-api-error')?.style.setProperty('display','none');
    // Reset password strength
    document.getElementById('pw-strength-wrap')?.style.setProperty('display','none');
    document.querySelectorAll('.req-item').forEach(r => r.classList.remove('met'));
  },
};

/* ─── Field helpers ─────────────────────────────────────── */
function setError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}
function clearError(id) { setError(id, ''); }

/* ─── Password strength calculator ─────────────────────── */
function calcPasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score; // 0–5
}

function updatePasswordUI(pw) {
  const wrap  = document.getElementById('pw-strength-wrap');
  const fill  = document.getElementById('pw-strength-fill');
  const label = document.getElementById('pw-strength-label');

  if (!pw) { wrap?.style.setProperty('display','none'); return; }
  wrap?.style.removeProperty('display');

  const score = calcPasswordStrength(pw);
  const levels = [
    { pct: '20%', color: '#e74c3c', text: 'Very weak' },
    { pct: '40%', color: '#e67e22', text: 'Weak'      },
    { pct: '60%', color: '#f1c40f', text: 'Fair'      },
    { pct: '80%', color: '#2ecc71', text: 'Strong'    },
    { pct: '100%',color: '#27ae60', text: 'Very strong'},
  ];
  const l = levels[Math.min(score - 1, 4)] || levels[0];
  if (fill)  { fill.style.width = l.pct; fill.style.background = l.color; }
  if (label) { label.textContent = l.text; label.style.color = l.color; }

  // Requirements
  const reqLen   = document.getElementById('req-len');
  const reqUpper = document.getElementById('req-upper');
  const reqNum   = document.getElementById('req-num');
  reqLen?.classList.toggle('met',   pw.length >= 8);
  reqUpper?.classList.toggle('met', /[A-Z]/.test(pw));
  reqNum?.classList.toggle('met',   /[0-9]/.test(pw));
}

/* ─── Validation helpers ────────────────────────────────── */
function validateStep1() {
  let ok = true;
  clearError('err-name'); clearError('err-email'); clearError('err-phone');

  const name  = document.getElementById('signup-name')?.value.trim();
  const email = document.getElementById('signup-email')?.value.trim();
  const phone = document.getElementById('signup-phone')?.value.trim();

  if (!name) { setError('err-name', 'Please enter your full name.'); ok = false; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError('err-email', 'Please enter a valid email address.'); ok = false;
  }
  if (phone && !/^\d{10}$/.test(phone)) {
    setError('err-phone', 'Phone must be exactly 10 digits if provided.'); ok = false;
  }
  return ok;
}

function validateStep2() {
  let ok = true;
  clearError('err-password'); clearError('err-confirm');

  const pw  = document.getElementById('signup-password')?.value;
  const pw2 = document.getElementById('signup-confirm')?.value;

  if (!pw || pw.length < 8) {
    setError('err-password', 'Password must be at least 8 characters.'); ok = false;
  } else if (!/[A-Z]/.test(pw)) {
    setError('err-password', 'Password must contain at least one uppercase letter.'); ok = false;
  } else if (!/[0-9]/.test(pw)) {
    setError('err-password', 'Password must contain at least one number.'); ok = false;
  }
  if (pw !== pw2) {
    setError('err-confirm', 'Passwords do not match.'); ok = false;
  }
  return ok;
}

function populateSummary() {
  const name  = document.getElementById('signup-name')?.value.trim();
  const email = document.getElementById('signup-email')?.value.trim();
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const avatar = document.getElementById('summary-avatar');
  if (avatar) avatar.textContent = initials;
  const sName = document.getElementById('summary-name');
  const sEmail = document.getElementById('summary-email');
  if (sName)  sName.textContent  = name;
  if (sEmail) sEmail.textContent = email;
}

/* ─── Core Auth object ──────────────────────────────────── */
const KalyraAuth = {
  async loginWithEmail(email, password) {
    const res = await KalyraAPI.login(email, password);
    KalyraToken.setAccess(res.data.accessToken);
    KalyraToken.setRefresh(res.data.refreshToken);
    KalyraToken.setUser(res.data.user);
    window.dispatchEvent(new Event('kalyra:login'));
    return res.data.user;
  },

  async register(name, email, password, phone) {
    const res = await KalyraAPI.register(name, email, password, phone);
    KalyraToken.setAccess(res.data.accessToken);
    KalyraToken.setRefresh(res.data.refreshToken);
    KalyraToken.setUser(res.data.user);
    window.dispatchEvent(new Event('kalyra:login'));
    return res.data.user;
  },

  async logout() {
    await KalyraAPI.logout().catch(() => {});
    KalyraToken.clear();
    window.dispatchEvent(new Event('kalyra:logout'));
    showToast('You have been signed out.', 'info');
    setTimeout(() => updateNavbarUserState(), 50);
  },

  async loginWithGoogle(googleUser) {
    const mockUser = {
      id: googleUser.sub || 'google_' + Date.now(),
      name: googleUser.name,
      email: googleUser.email,
      profile_photo: googleUser.picture || null,
      provider: 'google',
    };
    KalyraToken.setUser(mockUser);
    localStorage.setItem('kalyra_social_session', '1');
    window.dispatchEvent(new Event('kalyra:login'));
    return mockUser;
  },

  isLoggedIn() { return KalyraToken.isLoggedIn(); },
};

/* ─── Google GSI callback ───────────────────────────────── */
window.handleGoogleResponse = async (response) => {
  try {
    const base64 = response.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const user   = JSON.parse(decodeURIComponent(atob(base64).split('').map(c =>
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
    await KalyraAuth.loginWithGoogle(user);
    closeAllModals();
    showToast(`Welcome, ${user.name}! 🎉`, 'success');
    updateNavbarUserState();
  } catch (err) {
    showToast('Google sign-in failed. Please try again.', 'error');
  }
};

/* ─── Wire all modals ───────────────────────────────────── */
let _modalsWired = false;

function wireModals() {
  if (_modalsWired) return;
  if (!document.getElementById('login-modal') || !document.getElementById('signup-modal')) return;
  _modalsWired = true;

  /* ════ LOGIN MODAL ════════════════════════════════════════ */

  // Phone → OTP step
  document.getElementById('btn-send-otp')?.addEventListener('click', () => {
    const phone = document.getElementById('login-phone')?.value;
    if (phone?.length === 10) { showLoginStep('otp'); document.querySelector('.otp-digit')?.focus(); }
    else showToast('Please enter a valid 10-digit number.', 'error');
  });
  document.getElementById('btn-verify-otp')?.addEventListener('click', () => {
    showToast('OTP login coming soon. Use Email & Password instead.', 'info');
  });

  // Step switches
  document.getElementById('btn-to-email')?.addEventListener('click', () => showLoginStep('email'));
  document.getElementById('btn-back-to-phone')?.addEventListener('click', () => showLoginStep('phone'));
  document.getElementById('btn-back-to-phone-from-email')?.addEventListener('click', () => showLoginStep('phone'));
  document.getElementById('btn-to-emailpw')?.addEventListener('click', () => showLoginStep('emailpw'));
  document.getElementById('btn-back-from-emailpw')?.addEventListener('click', () => showLoginStep('phone'));

  // Email + password login
  async function doEmailLogin() {
    const email    = document.getElementById('emailpw-email')?.value?.trim();
    const password = document.getElementById('emailpw-password')?.value;
    const btn      = document.getElementById('btn-emailpw-login');
    if (!email || !password) { showToast('Please enter email and password.', 'error'); return; }
    setLoading(btn, true, 'Signing in…');
    try {
      const user = await KalyraAuth.loginWithEmail(email, password);
      showToast(`Welcome back, ${user.name || user.email}! 🎉`, 'success');
      closeAllModals();
      updateNavbarUserState();
      if (typeof KalyraCart !== 'undefined') KalyraCart.syncFromBackend();
    } catch (err) {
      showToast(err.message || 'Login failed. Check your credentials.', 'error');
    } finally { setLoading(btn, false); }
  }
  document.getElementById('btn-emailpw-login')?.addEventListener('click', doEmailLogin);
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.activeElement?.id === 'emailpw-password') doEmailLogin();
  });

  // Forgot password
  document.addEventListener('click', e => {
    if (e.target?.id !== 'btn-forgot-password') return;
    e.preventDefault();
    const email = document.getElementById('emailpw-email')?.value?.trim();
    if (!email) { showToast('Enter your email first, then click Forgot password.', 'info'); return; }
    KalyraAPI?.forgotPassword(email)
      .then(res => showToast(res.message || 'Reset link sent! Check your inbox.', 'success'))
      .catch(err => showToast(err.message || 'Could not send reset email.', 'error'));
  });

  // Google login button
  document.getElementById('btn-google-login')?.addEventListener('click', _handleGoogleClick);

  /* ════ SIGNUP MODAL ═══════════════════════════════════════ */

  // Password strength live update
  document.getElementById('signup-password')?.addEventListener('input', e => {
    updatePasswordUI(e.target.value);
  });

  // Password toggle buttons (delegated)
  document.addEventListener('click', e => {
    const btn = e.target.closest('.pw-toggle-btn');
    if (!btn) return;
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
  });

  // Step 1 → Step 2
  document.getElementById('signup-next-1')?.addEventListener('click', () => {
    if (validateStep1()) SignupFlow.goTo(2);
  });
  // Allow Enter to proceed
  ['signup-name','signup-email','signup-phone'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('signup-next-1')?.click();
    });
  });

  // Step 2 → Step 3
  document.getElementById('signup-next-2')?.addEventListener('click', () => {
    if (validateStep2()) { populateSummary(); SignupFlow.goTo(3); }
  });
  ['signup-password','signup-confirm'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('signup-next-2')?.click();
    });
  });

  // Back buttons
  document.getElementById('signup-back-1')?.addEventListener('click', () => SignupFlow.goTo(1));
  document.getElementById('signup-back-2')?.addEventListener('click', () => SignupFlow.goTo(2));

  // Google in signup modal
  document.getElementById('signup-google-btn')?.addEventListener('click', _handleGoogleClick);

  // Final submit
  document.getElementById('signup-submit-btn')?.addEventListener('click', async () => {
    clearError('err-terms');
    const apiErr = document.getElementById('signup-api-error');

    // Terms check
    if (!document.getElementById('signup-terms')?.checked) {
      setError('err-terms', 'You must agree to the Terms & Conditions to continue.');
      return;
    }

    const name  = document.getElementById('signup-name')?.value.trim();
    const email = document.getElementById('signup-email')?.value.trim();
    const pw    = document.getElementById('signup-password')?.value;
    const phone = document.getElementById('signup-phone')?.value.trim();
    const btn   = document.getElementById('signup-submit-btn');

    setLoading(btn, true, 'Creating account…');
    if (apiErr) apiErr.style.display = 'none';

    try {
      const user = await KalyraAuth.register(name, email, pw, phone || null);
      showToast(`Welcome to Kalyra, ${user.name}! 🎉`, 'success');
      closeAllModals();
      SignupFlow.reset();
      updateNavbarUserState();
      if (typeof KalyraCart !== 'undefined') KalyraCart.syncFromBackend();
    } catch (err) {
      // Show detailed error in-modal
      if (apiErr) {
        apiErr.textContent = err.message || 'Registration failed. Please try again.';
        apiErr.style.display = 'block';
      }
      showToast(err.message || 'Registration failed.', 'error');
    } finally {
      setLoading(btn, false);
    }
  });

  // "Sign in" link inside signup modal
  document.querySelectorAll('.signup-switch-to-login').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('signup-modal')?.classList.remove('active');
    document.getElementById('signup-backdrop')?.classList.remove('active');
    showLoginStep('emailpw');
    document.getElementById('login-modal')?.classList.add('active');
    document.getElementById('login-backdrop')?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }));

  /* ════ CLOSE HANDLERS ══════════════════════════════════════ */
  document.getElementById('login-close')?.addEventListener('click', closeAllModals);
  document.getElementById('signup-close')?.addEventListener('click', closeAllModals);
  document.getElementById('login-backdrop')?.addEventListener('click', closeAllModals);
  document.getElementById('signup-backdrop')?.addEventListener('click', closeAllModals);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllModals(); });

  /* ════ OPEN TRIGGERS (delegated — captures dynamically injected links) ═ */
  // These are on `document` so they work for links inside fetch-injected HTML too
  document.addEventListener('click', function _loginTrigger(e) {
    const a = e.target.closest('a[href="#login"]');
    if (!a) return;
    e.preventDefault();
    if (KalyraToken.isLoggedIn()) return;
    showLoginStep('phone');
    document.getElementById('login-modal')?.classList.add('active');
    document.getElementById('login-backdrop')?.classList.add('active');
    document.body.style.overflow = 'hidden';
  });

  document.addEventListener('click', function _signupTrigger(e) {
    const a = e.target.closest('a[href="#signup"]');
    if (!a) return;
    e.preventDefault();
    // Close login modal if it's open
    document.getElementById('login-modal')?.classList.remove('active');
    document.getElementById('login-backdrop')?.classList.remove('active');
    // Reset + open signup
    SignupFlow.reset();
    document.getElementById('signup-modal')?.classList.add('active');
    document.getElementById('signup-backdrop')?.classList.add('active');
    document.body.style.overflow = 'hidden';
  });

  // "Sign in" link inside signup modal (delegated)
  document.addEventListener('click', function _signupToLogin(e) {
    if (!e.target.matches('.signup-switch-to-login')) return;
    e.preventDefault();
    document.getElementById('signup-modal')?.classList.remove('active');
    document.getElementById('signup-backdrop')?.classList.remove('active');
    showLoginStep('emailpw');
    document.getElementById('login-modal')?.classList.add('active');
    document.getElementById('login-backdrop')?.classList.add('active');
    document.body.style.overflow = 'hidden';
  });
}

/* ─── Google login helper ───────────────────────────────── */
function _handleGoogleClick() {
  if (GOOGLE_CLIENT_ID.startsWith('YOUR_')) {
    KalyraAuth.loginWithGoogle({
      sub: 'google_demo_' + Date.now(),
      name: 'Demo User',
      email: 'demo@gmail.com',
      picture: null,
    }).then(() => {
      closeAllModals();
      showToast('Signed in with Google (demo mode) 🎉', 'success');
      updateNavbarUserState();
    });
  } else {
    typeof google !== 'undefined'
      ? google.accounts.id.prompt()
      : showToast('Google Sign-In unavailable. Use email/password.', 'error');
  }
}

/* ─── Global events ─────────────────────────────────────── */
window.addEventListener('kalyra:login',  () => updateNavbarUserState());
window.addEventListener('kalyra:logout', () => updateNavbarUserState());

/* ─── Auto-init ─────────────────────────────────────────── */
function initAuth() {
  const check = setInterval(() => {
    if (document.getElementById('login-modal') && document.getElementById('signup-modal')) {
      clearInterval(check);
      wireModals();
      updateNavbarUserState();
    }
  }, 100);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}

window.KalyraAuth  = KalyraAuth;
window.showToast   = showToast;
window.updateNavbarUserState = updateNavbarUserState;
window.SignupFlow  = SignupFlow;
