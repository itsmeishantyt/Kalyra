/**
 * scripts/cart.js — Kalyra Cart Manager
 * Syncs cart with backend when logged in.
 * Falls back to localStorage when guest.
 */

const CART_KEY = 'kalyra_cart';

const KalyraCart = {

  /* ── Get current cart (localStorage or backend) ── */
  getLocal() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
  },

  saveLocal(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    this._updateBadge(items.length);
    window.dispatchEvent(new CustomEvent('kalyra:cart-updated', { detail: { items } }));
  },

  /* ── Add item ── */
  async addItem(product_id, quantity = 1, size = null, color = null, productMeta = {}) {
    const user = KalyraToken.getUser();
    if (KalyraToken.isLoggedIn() && (!user || !user.isAdmin)) {
      try {
        await KalyraAPI.addToCart(product_id, quantity, size, color);
        await this.syncFromBackend();
        showToast('Added to cart! 🛍️', 'success');
        return;
      } catch (err) {
        showToast(err.message || 'Could not add item.', 'error');
        return;
      }
    }

    // Guest or Admin local-only: localStorage
    const items = this.getLocal();
    const existing = items.find(i => i.product_id === product_id && i.size === size && i.color === color);
    if (existing) {
      existing.quantity += quantity;
    } else {
      items.push({ product_id, quantity, size, color, ...productMeta, added_at: new Date().toISOString() });
    }
    this.saveLocal(items);
    showToast('Added to cart! 🛍️', 'success');
  },

  /* ── Remove item ── */
  async removeItem(product_id, itemId = null) {
    const user = KalyraToken.getUser();
    if (KalyraToken.isLoggedIn() && (!user || !user.isAdmin) && itemId) {
      try {
        await KalyraAPI.removeFromCart(itemId);
        await this.syncFromBackend();
        return;
      } catch { /* fall through */ }
    }
    const items = this.getLocal().filter(i => i.product_id !== product_id);
    this.saveLocal(items);
  },

  /* ── Clear cart ── */
  async clear() {
    const user = KalyraToken.getUser();
    if (KalyraToken.isLoggedIn() && (!user || !user.isAdmin)) {
      await KalyraAPI.clearCart().catch(() => {});
    }
    this.saveLocal([]);
  },

  /* ── Sync from backend (called after login) ── */
  async syncFromBackend() {
    if (!KalyraToken.isLoggedIn()) return;
    const user = KalyraToken.getUser();
    if (user && user.isAdmin) return; // Admins don't have storefront carts
    try {
      const res = await KalyraAPI.getCart();
      const items = res.data || [];
      this.saveLocal(items);
    } catch { /* silently fail */ }
  },

  /* ── Get item count ── */
  getCount() {
    return this.getLocal().reduce((sum, i) => sum + (i.quantity || 1), 0);
  },

  /* ── Update badge across navbar ── */
  _updateBadge(count) {
    document.querySelectorAll('.cart-count').forEach(el => {
      el.textContent = count > 99 ? '99+' : count;
      el.style.display = count > 0 ? '' : 'none';
    });
  },

  /* ── Init: hydrate badge, sync if logged in ── */
  async init() {
    this._updateBadge(this.getCount());
    if (KalyraToken.isLoggedIn()) await this.syncFromBackend();
  },
};

/* Sync on login, clear on logout */
window.addEventListener('kalyra:login',  () => KalyraCart.syncFromBackend());
window.addEventListener('kalyra:logout', () => KalyraCart.saveLocal([]));

/* Init when DOM ready */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => KalyraCart.init());
} else {
  KalyraCart.init();
}

/* Wire "Add to Cart" buttons on PDP automatically */
window.addEventListener('kalyra:pdp-ready', (e) => {
  const { product } = e.detail || {};
  document.getElementById('pdp-add-cart')?.addEventListener('click', async () => {
    const selectedSize  = document.querySelector('.size-pill.active')?.textContent || null;
    const selectedColor = document.querySelector('.color-pill.active')?.textContent || null;
    if (product) {
      await KalyraCart.addItem(product.id, 1, selectedSize, selectedColor, {
        name: product.name, price: product.price, image_url: product.image_url || product.img,
      });
    }
  });
});

window.KalyraCart = KalyraCart;
