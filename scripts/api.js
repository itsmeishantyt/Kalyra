/**
 * scripts/api.js — Kalyra API Client
 * Centralised fetch wrapper for all backend calls.
 * Base URL auto-detects dev vs prod.
 */

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000/api/v1'
  : 'https://api.kalyraa.com/api/v1';
const TOKEN_KEY  = 'kalyra_access_token';
const REFRESH_KEY = 'kalyra_refresh_token';
const USER_KEY   = 'kalyra_user';

/* ─── Token helpers ──────────────────────────────────────── */
const KalyraToken = {
  getAccess()        { return localStorage.getItem(TOKEN_KEY); },
  getRefresh()       { return localStorage.getItem(REFRESH_KEY); },
  getUser()          { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } },
  setAccess(t)       { localStorage.setItem(TOKEN_KEY, t); },
  setRefresh(t)      { localStorage.setItem(REFRESH_KEY, t); },
  setUser(u)         { localStorage.setItem(USER_KEY, JSON.stringify(u)); },
  clear()            { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); localStorage.removeItem(USER_KEY); localStorage.removeItem('kalyra_cart'); },
  isLoggedIn()       { return !!this.getAccess() && !!this.getUser(); },
};

/* ─── Core fetch wrapper ─────────────────────────────────── */
async function apiFetch(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = KalyraToken.getAccess();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

  // Attempt token refresh on 401
  if (res.status === 401 && KalyraToken.getRefresh()) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${KalyraToken.getAccess()}`;
      const retry = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
      return parseResponse(retry);
    } else {
      KalyraToken.clear();
      window.dispatchEvent(new Event('kalyra:logout'));
      throw new Error('Session expired. Please login again.');
    }
  }

  return parseResponse(res);
}

async function parseResponse(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Extract specific validation error messages if present
    let msg = json.message || `Request failed (${res.status})`;
    if (json.errors && Array.isArray(json.errors) && json.errors.length > 0) {
      msg = json.errors.map(e => e.msg || e.message || e).join(' · ');
    }
    throw new Error(msg);
  }
  return json;
}

async function tryRefreshToken() {
  try {
    const user = KalyraToken.getUser();
    const endpoint = (user && user.isAdmin) ? '/admin/auth/refresh' : '/auth/refresh';
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: KalyraToken.getRefresh() }),
    });
    if (!res.ok) return false;
    const { data } = await res.json();
    KalyraToken.setAccess(data.accessToken);
    KalyraToken.setRefresh(data.refreshToken);
    return true;
  } catch { return false; }
}

/* ─── Public API methods ─────────────────────────────────── */
const KalyraAPI = {
  // Auth
  async register(name, email, password, phone, otp_token) {
    const body = { name, email, password, otp_token };
    const cleanPhone = (phone || '').trim();
    if (cleanPhone) body.phone = cleanPhone;   // only include when non-empty
    return apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(body) });
  },
  async sendOtp(email, name = '') {
    return apiFetch('/auth/send-otp', { method: 'POST', body: JSON.stringify({ email, name }) });
  },
  async verifyOtp(email, otp) {
    return apiFetch('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp }) });
  },
  async login(email, password) {
    try {
      return await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    } catch (err) {
      // Fallback to check if it's an admin account
      if (err.message.includes('Invalid') || err.message.includes('credentials')) {
        try {
          const adminRes = await apiFetch('/admin/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
          // Normalize payload for the frontend AuthManager
          if (adminRes.data && adminRes.data.admin) {
            adminRes.data.user = adminRes.data.admin;
            adminRes.data.user.isAdmin = true;
          }
          return adminRes;
        } catch (adminErr) {
          throw err; // throw original if admin fails too
        }
      }
      throw err;
    }
  },
  async logout() {
    const refreshToken = KalyraToken.getRefresh();
    if (refreshToken) {
      const user = KalyraToken.getUser();
      const endpoint = (user && user.isAdmin) ? '/admin/auth/logout' : '/auth/logout';
      await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => {});
    }
  },
  async forgotPassword(email) {
    return apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
  },
  async resetPassword(token, password) {
    return apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
  },

  // User
  async getProfile() {
    return apiFetch('/user/profile');
  },
  async changePassword(currentPassword, newPassword) {
    return apiFetch('/user/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) });
  },

  // Products
  async getProducts(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/products${qs ? '?' + qs : ''}`);
  },
  async getProduct(id) {
    return apiFetch(`/products/${id}`);
  },

  // Cart
  async getCart() {
    return apiFetch('/cart');
  },
  async addToCart(product_id, quantity = 1, size = null, color = null) {
    return apiFetch('/cart', { method: 'POST', body: JSON.stringify({ product_id, quantity, size, color }) });
  },
  async updateCartItem(itemId, quantity) {
    return apiFetch(`/cart/${itemId}`, { method: 'PUT', body: JSON.stringify({ quantity }) });
  },
  async removeFromCart(itemId) {
    return apiFetch(`/cart/${itemId}`, { method: 'DELETE' });
  },
  async clearCart() {
    return apiFetch('/cart', { method: 'DELETE' });
  },

  // Wishlist
  async toggleWishlist(productId) {
    return apiFetch(`/wishlist/${productId}`, { method: 'POST' });
  },
  async getWishlist() {
    return apiFetch('/wishlist');
  },
  async removeFromWishlist(productId) {
    return apiFetch(`/wishlist/${productId}`, { method: 'DELETE' });
  },

  // Orders
  async getOrders(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/orders${qs ? '?' + qs : ''}`);
  },
  async getOrder(id) {
    return apiFetch(`/orders/${id}`);
  },
  async cancelOrder(id) {
    return apiFetch(`/orders/${id}/cancel`, { method: 'PATCH' });
  },
  
  // Addresses
  async getAddresses() {
    return apiFetch('/user/addresses');
  },
  async createAddress(addressData) {
    return apiFetch('/user/addresses', { method: 'POST', body: JSON.stringify(addressData) });
  },

  // Create Order
  async createOrder(orderData) {
    return apiFetch('/orders', { method: 'POST', body: JSON.stringify(orderData) });
  },

  // Validate promo code (no auth required — just needs subtotal)
  async validatePromo(code, subtotal) {
    return apiFetch('/orders/validate-promo', { method: 'POST', body: JSON.stringify({ code, subtotal }) });
  },

  // Payments
  async initiatePayment(orderId) {
    return apiFetch('/payments/initiate', { method: 'POST', body: JSON.stringify({ order_id: orderId }) });
  },
  async verifyPayment(paymentData) {
    return apiFetch('/payments/webhook', { method: 'POST', body: JSON.stringify(paymentData) });
  },
};

// Expose globally
window.KalyraAPI   = KalyraAPI;
window.KalyraToken = KalyraToken;
window.API_HOST    = API_BASE.replace('/api/v1', '');
