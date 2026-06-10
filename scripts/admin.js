// ── Kalyra Admin Panel ──────────────────────────────────────────────
// All data is fetched live from the backend. Zero hardcoded values.

const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000/api/v1/admin'
    : 'https://api.kalyraa.com/api/v1/admin';
let adminToken = localStorage.getItem('kalyra_admin_token');

// Page state
const state = {
    products: { page: 1 },
    orders:   { page: 1 },
    users:    { page: 1 },
    wishlists: { page: 1 },
    activeView: localStorage.getItem('kalyra_admin_view') || 'overview',   // track the currently visible section
};

// In-memory product cache — avoids re-fetching for the edit modal
const _productCache = new Map();

// ── DOM refs ──────────────────────────────────────────────────────
const loginView     = document.getElementById('admin-login-view');
const dashboardView = document.getElementById('admin-dashboard-view');
const loginForm     = document.getElementById('admin-login-form');
const loginError    = document.getElementById('login-error');
const logoutBtn     = document.getElementById('logout-btn');
const navItems      = document.querySelectorAll('.nav-item');
const pageTitle     = document.getElementById('page-title');
const pageSubtitle  = document.getElementById('page-subtitle');

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    adminToken ? showDashboard() : showLogin();
});

// ── Auth ──────────────────────────────────────────────────────────
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const btn      = document.getElementById('login-btn');

    btn.disabled = true;
    btn.innerHTML = '<span>Signing in…</span>';
    loginError.textContent = '';

    try {
        const res  = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();

        if (data.success) {
            adminToken = data.data.accessToken;
            localStorage.setItem('kalyra_admin_token', adminToken);
            document.getElementById('admin-name').textContent   = data.data.admin.name;
            document.getElementById('admin-role').textContent   = data.data.admin.role;
            document.getElementById('admin-avatar').textContent = (data.data.admin.name || 'A')[0].toUpperCase();
            showDashboard();
        } else {
            loginError.textContent = data.message || 'Invalid credentials';
        }
    } catch {
        loginError.textContent = 'Network error — make sure the backend is running.';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Sign In to Dashboard</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
    }
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('kalyra_admin_token');
    localStorage.removeItem('kalyra_admin_view');
    adminToken = null;
    state.activeView = 'overview';
    showLogin();
});

function handleAuthExpired() {
    localStorage.removeItem('kalyra_admin_token');
    localStorage.removeItem('kalyra_admin_view');
    adminToken = null;
    state.activeView = 'overview';
    showLogin();
    toast('Session expired. Please log in again.', 'error');
}

function showLogin() {
    loginView.classList.remove('hidden');
    dashboardView.classList.add('hidden');
}

function showDashboard() {
    loginView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    // Restore the last active view instead of always going to overview
    switchView(state.activeView || 'overview');
}

// ── Navigation ────────────────────────────────────────────────────
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        switchView(item.dataset.view);
    });
});

const subtitles = {
    overview: 'Your store at a glance',
    products: 'Manage your catalogue',
    orders:   'Track and fulfil orders',
    users:    'Manage your customers',
    wishlists: 'Monitor customer interests and wishlist items',
};

function switchView(viewName) {
    document.querySelectorAll('.content-body').forEach(el => el.classList.add('hidden'));
    document.getElementById(`content-${viewName}`)?.classList.remove('hidden');
    pageTitle.textContent    = viewName.charAt(0).toUpperCase() + viewName.slice(1);
    pageSubtitle.textContent = subtitles[viewName] || '';

    navItems.forEach(n => n.classList.toggle('active', n.dataset.view === viewName));

    // Only reset pagination when actually switching tabs (not during in-place refreshes)
    state.activeView = viewName;
    localStorage.setItem('kalyra_admin_view', viewName);

    if (viewName === 'overview')  { state.products.page = 1; state.orders.page = 1; state.users.page = 1; state.wishlists.page = 1; fetchOverview(); loadBannerPreview(); }
    if (viewName === 'products')  fetchProducts();
    if (viewName === 'orders')    fetchOrders();
    if (viewName === 'users')     fetchUsers();
    if (viewName === 'wishlists') fetchWishlists();
    if (viewName === 'settings')  fetchSettings();
}

// ── API helpers ───────────────────────────────────────────────────
async function apiGet(path) {
    try {
        const res = await fetch(`${API}${path}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (res.status === 401) {
            handleAuthExpired();
            return null;
        }
        return await res.json();
    } catch (err) {
        console.error('API GET error:', err);
        return null;
    }
}

async function apiPatch(path, body) {
    try {
        const res = await fetch(`${API}${path}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify(body),
        });
        if (res.status === 401) {
            handleAuthExpired();
            return null;
        }
        return await res.json();
    } catch (err) {
        console.error('API PATCH error:', err);
        return null;
    }
}

async function apiPost(path, body) {
    try {
        const res = await fetch(`${API}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify(body),
        });
        if (res.status === 401) {
            handleAuthExpired();
            return null;
        }
        return await res.json();
    } catch (err) {
        console.error('API POST error:', err);
        return null;
    }
}

// ── Formatters ────────────────────────────────────────────────────
const INR = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);
const fmtDate = s => new Date(s).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
function isoDate(d) { return d.toISOString().slice(0, 10); }
function monthRange(offset = 0) {
    const now = new Date();
    const s   = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const e   = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    return { from: isoDate(s), to: isoDate(e) };
}

function trendHtml(cur, prev) {
    if (prev == null || prev === 0) return '';
    const pct = ((cur - prev) / prev) * 100;
    const cls = pct > 0 ? 'positive' : pct < 0 ? 'negative' : 'neutral';
    const sign = pct >= 0 ? '+' : '';
    return `<span class="trend ${cls}">${sign}${Math.round(pct)}% vs last month</span>`;
}

const STATUS_COLORS = {
    delivered: 'success', paid: 'success', active: 'success',
    pending: 'pending', processing: 'pending',
    shipped: 'shipped',
    cancelled: 'inactive', refunded: 'inactive', inactive: 'inactive', suspended: 'inactive',
};

function badge(status) {
    const cls = STATUS_COLORS[status] || 'pending';
    return `<span class="status-badge ${cls}">${status}</span>`;
}

// ── Debounce ──────────────────────────────────────────────────────
const _debTimers = {};
function debounce(fn, delay) {
    return (...args) => {
        clearTimeout(_debTimers[fn.name]);
        _debTimers[fn.name] = setTimeout(() => fn(...args), delay);
    };
}

// ── Toast ─────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
    const el = document.getElementById('admin-toast');
    el.textContent = msg;
    el.className = `admin-toast admin-toast-${type}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
}

// ── Pagination ────────────────────────────────────────────────────
function renderPagination(containerId, meta, onPage) {
    const el = document.getElementById(containerId);
    if (!el || !meta) return;
    const { page, totalPages } = meta;
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    let html = `<span class="pag-info">Page ${page} of ${totalPages}</span>`;
    html += `<div class="pag-btns">`;
    html += `<button onclick="${onPage}(${page - 1})" ${page <= 1 ? 'disabled' : ''}>← Prev</button>`;
    html += `<button onclick="${onPage}(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Next →</button>`;
    html += `</div>`;
    el.innerHTML = html;
}

// ── OVERVIEW ──────────────────────────────────────────────────────
async function fetchOverview() {
    const cur  = monthRange(0);
    const prev = monthRange(-1);

    const [summary, curSales, prevSales, recentOrders, topProds] = await Promise.all([
        apiGet('/analytics/dashboard'),
        apiGet(`/analytics/sales?from=${cur.from}&to=${cur.to}`),
        apiGet(`/analytics/sales?from=${prev.from}&to=${prev.to}`),
        apiGet('/orders?limit=5&page=1'),
        apiGet(`/analytics/top-products?from=${cur.from}&to=${cur.to}&limit=5`),
    ]);

    // Metrics
    if (summary?.success) {
        const s = summary.data.summary;
        document.getElementById('metric-revenue').textContent  = INR(s.totalRevenue);
        document.getElementById('metric-orders').textContent   = s.totalOrders;
        document.getElementById('metric-products').textContent = s.activeProducts;
        document.getElementById('metric-users').textContent    = s.totalUsers;
    }

    // Trends
    const ct = curSales?.data?.totals  || {};
    const pt = prevSales?.data?.totals || {};
    document.getElementById('trend-revenue').innerHTML = trendHtml(ct.total_revenue || 0, pt.total_revenue ?? null);
    document.getElementById('trend-orders').innerHTML  = trendHtml(ct.total_orders  || 0, pt.total_orders  ?? null);
    document.getElementById('trend-products').innerHTML = '';
    document.getElementById('trend-users').innerHTML    = '';

    // Recent orders table
    const ob = document.getElementById('recent-orders-body');
    if (!recentOrders?.success || !recentOrders.data.length) {
        ob.innerHTML = '<tr><td colspan="5" class="loading-state">No orders yet.</td></tr>';
    } else {
        ob.innerHTML = recentOrders.data.map(o => `
            <tr>
                <td><strong>#${o.order_ref}</strong></td>
                <td>${o.user_name || '—'}</td>
                <td>${fmtDate(o.created_at)}</td>
                <td><strong>${INR(o.total_amount)}</strong></td>
                <td>${badge(o.status)}</td>
            </tr>
        `).join('');
    }

    // Top products table
    const pb = document.getElementById('top-products-body');
    if (!topProds?.success || !topProds.data.products?.length) {
        pb.innerHTML = '<tr><td colspan="3" class="loading-state">No sales data yet.</td></tr>';
    } else {
        pb.innerHTML = topProds.data.products.map((p, i) => `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span class="rank-badge">${i + 1}</span>
                        <span style="font-weight:500">${p.product_name}</span>
                    </div>
                </td>
                <td>${p.units_sold}</td>
                <td>${INR(p.revenue)}</td>
            </tr>
        `).join('');
    }
}

// ── PRODUCTS ──────────────────────────────────────────────────────
async function fetchProducts(page = null) {
    if (page !== null) state.products.page = page;
    const tbody = document.getElementById('products-table-body');
    tbody.innerHTML = '<tr><td colspan="6" class="loading-state">Loading…</td></tr>';

    const search = document.getElementById('product-search')?.value || '';
    const active = document.getElementById('product-status-filter')?.value || '';
    const lowStock = document.getElementById('product-stock-filter')?.value || '';

    const params = new URLSearchParams({ page: state.products.page, limit: 15 });
    if (search)   params.set('search', search);
    if (active)   params.set('active', active);
    if (lowStock) params.set('low_stock', lowStock);

    const data = await apiGet(`/products?${params}`);
    if (!data?.success) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-state">Failed to load products.</td></tr>';
        return;
    }
    if (!data.data.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-state">No products found.</td></tr>';
        renderPagination('products-pagination', null, 'fetchProducts');
        return;
    }

    // Cache products so the edit modal can pre-fill without a second API call
    data.data.forEach(p => _productCache.set(p.id, p));

    const apiOrigin = API.replace('/api/v1/admin', '');
    tbody.innerHTML = data.data.map(p => `
        <tr>
            <td>
                <div class="product-cell">
                    <img src="${p.image_url ? `${apiOrigin}${p.image_url}` : 'assets/imgs/placeholder.png'}" class="product-img" alt="${p.name}" onerror="this.src='assets/imgs/placeholder.png'">
                    <div>
                        <div style="font-weight:500">${p.name}</div>
                        <div style="font-size:.75rem;color:var(--admin-text-muted)">${p.sku || '—'}</div>
                    </div>
                </div>
            </td>
            <td><span class="category-tag">${p.category || '—'}</span></td>
            <td>${INR(p.price)}</td>
            <td>
                <span class="${p.stock === 0 ? 'stock-zero' : p.stock <= 10 ? 'stock-low' : ''}">${p.stock}</span>
            </td>
            <td>${badge(p.is_active ? 'active' : 'inactive')}</td>
            <td>
                <div class="action-btns">
                    <button class="btn-action btn-edit" onclick="openEditProductModal(${p.id})" title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-action ${p.is_active ? 'btn-deactivate' : 'btn-activate'}" onclick="toggleProduct(${p.id}, ${p.is_active})" title="${p.is_active ? 'Deactivate' : 'Activate'}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/>${p.is_active ? '<line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>' : '<polyline points="20 6 9 17 4 12"/>'}</svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    renderPagination('products-pagination', data.meta, 'fetchProducts');
}

async function toggleProduct(id, isActive) {
    const data = await apiPatch(`/products/${id}/toggle`, {});
    if (data?.success) {
        toast(`Product ${isActive ? 'deactivated' : 'activated'}`, 'success');
        fetchProducts();
    } else {
        toast('Failed to update product status', 'error');
    }
}

// ── Product Modal ─────────────────────────────────────────────────
async function loadCategoryDatalist() {
    try {
        const res = await fetch(`${API.replace('/api/v1/admin', '')}/api/v1/products/categories`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
            const dl = document.getElementById('categories-list');
            if (dl) {
                dl.innerHTML = data.data
                    .map(c => `<option value="${c.category}">`)
                    .join('');
            }
        }
    } catch (_) {
        // Silently fail
    }
}

function openAddProductModal() {
    document.getElementById('modal-title').textContent = 'Add New Product';
    document.getElementById('product-form').reset();
    document.getElementById('product-form-id').value = '';
    document.getElementById('pf-type').value = 'shop';
    document.getElementById('pf-badge').value = '';
    document.getElementById('product-delete-btn').classList.add('hidden');
    document.getElementById('product-submit-btn').textContent = 'Add Product';
    document.getElementById('product-modal-overlay').classList.remove('hidden');
    loadCategoryDatalist();
}

function openEditProductModal(id) {
    // Pull from the in-memory cache populated when the table was last loaded
    const p = _productCache.get(id);
    if (!p) { toast('Product data not found — please refresh the list', 'error'); return; }

    document.getElementById('modal-title').textContent        = 'Edit Product';
    document.getElementById('product-form-id').value          = p.id;
    document.getElementById('pf-name').value                  = p.name || '';
    document.getElementById('pf-sku').value                   = p.sku || '';
    document.getElementById('pf-category').value              = p.category || '';
    document.getElementById('pf-type').value                  = p.product_type || 'shop';
    document.getElementById('pf-badge').value                 = p.badge || '';
    document.getElementById('pf-price').value                 = p.price || '';
    document.getElementById('pf-discount').value              = p.discount_pct || 0;
    document.getElementById('pf-stock').value                 = p.stock || 0;
    document.getElementById('pf-description').value           = p.description || '';
    document.getElementById('pf-image').value                 = ''; // file inputs can't be pre-filled
    document.getElementById('product-delete-btn').classList.remove('hidden');
    document.getElementById('product-submit-btn').textContent = 'Save Changes';
    document.getElementById('product-modal-overlay').classList.remove('hidden');
    loadCategoryDatalist();
}

function closeProductModal() {
    document.getElementById('product-modal-overlay').classList.add('hidden');
}

async function submitProductForm(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('product-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    const id = document.getElementById('product-form-id').value;
    const formData = new FormData();
    formData.append('name',         document.getElementById('pf-name').value);
    formData.append('sku',          document.getElementById('pf-sku').value);
    formData.append('category',     document.getElementById('pf-category').value);
    formData.append('product_type', document.getElementById('pf-type').value);
    formData.append('price',        document.getElementById('pf-price').value);
    formData.append('discount_pct', document.getElementById('pf-discount').value || 0);
    formData.append('stock',        document.getElementById('pf-stock').value || 0);
    formData.append('description',  document.getElementById('pf-description').value);
    formData.append('badge',        document.getElementById('pf-badge').value);
    const imgFile = document.getElementById('pf-image').files[0];
    if (imgFile) formData.append('image', imgFile);

    try {
        const url    = id ? `${API}/products/${id}` : `${API}/products`;
        const method = id ? 'PUT' : 'POST';
        const res    = await fetch(url, {
            method,
            headers: { Authorization: `Bearer ${adminToken}` },
            body: formData,
        });
        if (res.status === 401) {
            handleAuthExpired();
            return;
        }
        const data = await res.json();
        if (data.success) {
            toast(id ? 'Product updated' : 'Product added', 'success');
            closeProductModal();
            fetchProducts();
        } else {
            toast(data.message || 'Failed to save product', 'error');
        }
    } catch {
        toast('Network error saving product', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = id ? 'Save Changes' : 'Add Product';
    }
}

async function deleteCurrentProduct() {
    const id = document.getElementById('product-form-id').value;
    if (!id) return;
    if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) return;

    const deleteBtn = document.getElementById('product-delete-btn');
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Deleting…';

    try {
        const res = await fetch(`${API}/products/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (res.status === 401) {
            handleAuthExpired();
            return;
        }
        const data = await res.json();
        if (data.success) {
            toast('Product deleted successfully', 'success');
            closeProductModal();
            fetchProducts();
        } else {
            toast(data.message || 'Failed to delete product', 'error');
        }
    } catch {
        toast('Network error deleting product', 'error');
    } finally {
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete Product';
    }
}

// ── ORDERS ────────────────────────────────────────────────────────
async function fetchOrders(page = null) {
    if (page !== null) state.orders.page = page;
    const tbody = document.getElementById('orders-table-body');
    tbody.innerHTML = '<tr><td colspan="7" class="loading-state">Loading…</td></tr>';

    const status = document.getElementById('order-status-filter')?.value || '';
    const search = document.getElementById('order-search')?.value || '';

    const params = new URLSearchParams({ page: state.orders.page, limit: 15 });
    if (status) params.set('status', status);
    if (search) params.set('search', search);

    const data = await apiGet(`/orders?${params}`);
    if (!data?.success) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-state">Failed to load orders.</td></tr>';
        return;
    }
    if (!data.data.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-state">No orders found.</td></tr>';
        renderPagination('orders-pagination', null, 'fetchOrders');
        return;
    }

    const statuses = ['pending','paid','processing','shipped','delivered','cancelled','refunded'];
    tbody.innerHTML = data.data.map(o => `
        <tr>
            <td><strong>#${o.order_ref}</strong></td>
            <td>${o.user_name || '—'}</td>
            <td>${fmtDate(o.created_at)}</td>
            <td><strong>${INR(o.total_amount)}</strong></td>
            <td><span style="font-size:.75rem;color:var(--admin-text-muted)">${o.payment_method || '—'}</span></td>
            <td>${badge(o.status)}</td>
            <td>
                <select class="status-select" onchange="updateOrderStatus(${o.id}, this.value)">
                    ${statuses.map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </td>
        </tr>
    `).join('');

    renderPagination('orders-pagination', data.meta, 'fetchOrders');
}

async function updateOrderStatus(orderId, status) {
    const data = await apiPatch(`/orders/${orderId}/status`, { status });
    if (data?.success) {
        toast(`Order status updated to "${status}"`, 'success');
        fetchOrders();
    } else {
        toast('Failed to update order status', 'error');
    }
}

// ── USERS ─────────────────────────────────────────────────────────
async function fetchUsers(page = null) {
    if (page !== null) state.users.page = page;
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '<tr><td colspan="7" class="loading-state">Loading…</td></tr>';

    const search = document.getElementById('user-search')?.value || '';
    const status = document.getElementById('user-status-filter')?.value || '';

    const params = new URLSearchParams({ page: state.users.page, limit: 15 });
    if (search) params.set('search', search);
    if (status) params.set('status', status);

    const data = await apiGet(`/users?${params}`);
    if (!data?.success) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-state">Failed to load users.</td></tr>';
        return;
    }
    if (!data.data.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-state">No users found.</td></tr>';
        renderPagination('users-pagination', null, 'fetchUsers');
        return;
    }

    tbody.innerHTML = data.data.map(u => `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div class="user-avatar">${(u.name || '?')[0].toUpperCase()}</div>
                    <div>
                        <div style="font-weight:500">${u.name}</div>
                        <div style="font-size:.72rem;color:var(--admin-text-muted)">${u.phone || '—'}</div>
                    </div>
                </div>
            </td>
            <td style="font-size:.85rem">${u.email}</td>
            <td>${u.order_count || 0}</td>
            <td>${INR(u.total_spent || 0)}</td>
            <td style="font-size:.82rem">${fmtDate(u.created_at)}</td>
            <td>${badge(u.status)}</td>
            <td>
                ${u.status === 'active'
                    ? `<button class="btn-action btn-deactivate" onclick="suspendUser(${u.id})" title="Suspend user">Suspend</button>`
                    : `<button class="btn-action btn-activate"   onclick="reactivateUser(${u.id})" title="Reactivate user">Reactivate</button>`
                }
            </td>
        </tr>
    `).join('');

    renderPagination('users-pagination', data.meta, 'fetchUsers');
}

async function suspendUser(id) {
    if (!confirm('Suspend this user? Their sessions will be invalidated.')) return;
    const data = await apiPost(`/users/${id}/suspend`, {});
    if (data?.success) {
        toast('User suspended', 'success');
        fetchUsers();
    } else {
        toast(data?.message || 'Failed to suspend user', 'error');
    }
}

async function reactivateUser(id) {
    const data = await apiPatch(`/users/${id}/reactivate`, {});
    if (data?.success) {
        toast('User reactivated', 'success');
        fetchUsers();
    } else {
        toast(data?.message || 'Failed to reactivate user', 'error');
    }
}

// ── Banner Customiser ──────────────────────────────────────────────
async function loadBannerPreview() {
    const data = await apiGet('/settings');
    const settings = data?.data || {};

    // Desktop elements
    const desktopImg   = document.getElementById('banner-img-desktop');
    const desktopPh    = document.getElementById('banner-placeholder-desktop');
    const desktopRmBtn = document.getElementById('banner-remove-desktop');
    const desktopLabel = document.getElementById('banner-label-desktop');
    const desktopUpBtn = document.getElementById('banner-upload-btn-desktop');
    const desktopCcBtn = document.getElementById('banner-cancel-btn-desktop');

    // Mobile elements
    const mobileImg    = document.getElementById('banner-img-mobile');
    const mobilePh     = document.getElementById('banner-placeholder-mobile');
    const mobileRmBtn  = document.getElementById('banner-remove-mobile');
    const mobileLabel  = document.getElementById('banner-label-mobile');
    const mobileUpBtn  = document.getElementById('banner-upload-btn-mobile');
    const mobileCcBtn  = document.getElementById('banner-cancel-btn-mobile');

    const host = API.replace('/api/v1/admin', '');

    // Reset upload/cancel button visibility on preview load
    if (desktopUpBtn) desktopUpBtn.style.display = 'none';
    if (desktopCcBtn) desktopCcBtn.style.display = 'none';
    if (desktopLabel) desktopLabel.style.display = 'inline-flex';
    if (mobileUpBtn) mobileUpBtn.style.display = 'none';
    if (mobileCcBtn) mobileCcBtn.style.display = 'none';
    if (mobileLabel) mobileLabel.style.display = 'inline-flex';

    if (desktopImg && desktopPh && desktopRmBtn) {
        if (settings.desktopBannerImage) {
            desktopImg.src = `${host}${settings.desktopBannerImage}?t=${Date.now()}`;
            desktopImg.style.display = 'block';
            desktopPh.style.display  = 'none';
            desktopRmBtn.style.display = 'inline-flex';
        } else {
            desktopImg.style.display = 'none';
            desktopPh.style.display  = 'flex';
            desktopRmBtn.style.display = 'none';
        }
    }

    if (mobileImg && mobilePh && mobileRmBtn) {
        if (settings.mobileBannerImage) {
            mobileImg.src = `${host}${settings.mobileBannerImage}?t=${Date.now()}`;
            mobileImg.style.display = 'block';
            mobilePh.style.display  = 'none';
            mobileRmBtn.style.display = 'inline-flex';
        } else {
            mobileImg.style.display = 'none';
            mobilePh.style.display  = 'flex';
            mobileRmBtn.style.display = 'none';
        }
    }
}

function previewBannerImage(input, type = 'desktop') {
    const file = input.files[0];
    if (!file) return;

    const img = document.getElementById(`banner-img-${type}`);
    const ph  = document.getElementById(`banner-placeholder-${type}`);
    const label = document.getElementById(`banner-label-${type}`);
    const upBtn = document.getElementById(`banner-upload-btn-${type}`);
    const ccBtn = document.getElementById(`banner-cancel-btn-${type}`);
    const rmBtn = document.getElementById(`banner-remove-${type}`);

    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (img) {
                img.src = e.target.result;
                img.style.display = 'block';
            }
            if (ph) ph.style.display = 'none';
            if (label) label.style.display = 'none';
            if (upBtn) upBtn.style.display = 'inline-flex';
            if (ccBtn) ccBtn.style.display = 'inline-flex';
            if (rmBtn) rmBtn.style.display = 'none'; // hide remove button during preview/selection
        };
        reader.readAsDataURL(file);
    }
}

function cancelBannerSelect(type = 'desktop') {
    const input = document.getElementById(`banner-file-${type}`);
    if (input) input.value = '';
    loadBannerPreview();
}

async function performBannerUpload(type = 'desktop') {
    const input = document.getElementById(`banner-file-${type}`);
    const file = input ? input.files[0] : null;
    if (!file) return;

    const statusEl = document.getElementById(`banner-status-${type}`);
    if (statusEl) {
        statusEl.className = 'banner-status';
        statusEl.textContent = 'Uploading…';
    }

    const formData = new FormData();
    formData.append('banner', file);

    try {
        const res = await fetch(`${API}/settings/banner/${type}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}` },
            body: formData,
        });
        if (res.status === 401) {
            handleAuthExpired();
            return;
        }
        const data = await res.json();
        if (data?.success) {
            if (statusEl) {
                statusEl.className = 'banner-status success';
                statusEl.textContent = 'Banner updated!';
            }
            await loadBannerPreview();
            if (statusEl) {
                setTimeout(() => { statusEl.textContent = ''; }, 3000);
            }
        } else {
            if (statusEl) {
                statusEl.className = 'banner-status error';
                statusEl.textContent = data?.message || 'Upload failed';
            }
        }
    } catch (err) {
        if (statusEl) {
            statusEl.className = 'banner-status error';
            statusEl.textContent = 'Upload failed';
        }
    }
    if (input) input.value = '';
}

async function removeBannerImage(type = 'desktop') {
    const statusEl = document.getElementById(`banner-status-${type}`);
    if (statusEl) {
        statusEl.className = 'banner-status';
        statusEl.textContent = 'Removing…';
    }

    try {
        const res = await fetch(`${API}/settings/banner/${type}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (res.status === 401) {
            handleAuthExpired();
            return;
        }
        const data = await res.json();
        if (data?.success) {
            if (statusEl) {
                statusEl.className = 'banner-status success';
                statusEl.textContent = 'Custom banner removed';
            }
            await loadBannerPreview();
            if (statusEl) {
                setTimeout(() => { statusEl.textContent = ''; }, 3000);
            }
        } else {
            if (statusEl) {
                statusEl.className = 'banner-status error';
                statusEl.textContent = data?.message || 'Removal failed';
            }
        }
    } catch (err) {
        if (statusEl) {
            statusEl.className = 'banner-status error';
            statusEl.textContent = 'Removal failed';
        }
    }
}

// ── Website Settings (CMS) ───────────────────────────────────────
async function fetchSettings() {
    const base = API_BASE_URL.replace('/admin', '');
    try {
        const res = await fetch(`${base}/settings`);
        const data = await res.json();
        if (data?.success && data?.data) {
            const settings = data.data;
            document.getElementById('settings-hero-title').value = settings.hero_title || '';
            document.getElementById('settings-hero-sub').value = settings.hero_sub || '';
            document.getElementById('settings-cta-title').value = settings.cta_title || '';

            // Image previews
            updateSettingPreview('settings-hero-image-preview', settings.hero_image_url);
            updateSettingPreview('settings-cta-image-1-preview', settings.cta_image_1);
            updateSettingPreview('settings-cta-image-2-preview', settings.cta_image_2);
            updateSettingPreview('settings-cta-image-3-preview', settings.cta_image_3);
        }
    } catch (err) {
        console.error('Error fetching settings:', err);
    }
}

function updateSettingPreview(imgId, url) {
    const img = document.getElementById(imgId);
    if (!img) return;
    if (url) {
        img.src = url.startsWith('/') ? API_BASE_URL.replace('/api/v1/admin', '') + url : url;
        img.style.display = 'block';
    } else {
        img.style.display = 'none';
        img.src = '';
    }
}

// ── File Upload Preview Helper ──────────────────────────────────
function setupFilePreview(inputId, imgId) {
    const input = document.getElementById(inputId);
    const img = document.getElementById(imgId);
    if (!input || !img) return;
    input.addEventListener('change', () => {
        const file = input.files[0];
        if (file) {
            img.src = URL.createObjectURL(file);
            img.style.display = 'block';
        }
    });
}

// Wire real-time preview events on DOMContentLoaded or script load
setupFilePreview('settings-hero-image', 'settings-hero-image-preview');
setupFilePreview('settings-cta-image-1', 'settings-cta-image-1-preview');
setupFilePreview('settings-cta-image-2', 'settings-cta-image-2-preview');
setupFilePreview('settings-cta-image-3', 'settings-cta-image-3-preview');
setupFilePreview('product-image', 'product-image-preview');

// Settings form submission
const settingsForm = document.getElementById('website-settings-form');
if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('save-settings-btn');
        btn.disabled = true;
        btn.innerHTML = '<span>Saving...</span>';

        const formData = new FormData();
        formData.append('hero_title', document.getElementById('settings-hero-title').value);
        formData.append('hero_sub', document.getElementById('settings-hero-sub').value);
        formData.append('cta_title', document.getElementById('settings-cta-title').value);

        const heroImgFile = document.getElementById('settings-hero-image').files[0];
        if (heroImgFile) formData.append('hero_image', heroImgFile);

        const cta1 = document.getElementById('settings-cta-image-1').files[0];
        if (cta1) formData.append('cta_image_1', cta1);

        const cta2 = document.getElementById('settings-cta-image-2').files[0];
        if (cta2) formData.append('cta_image_2', cta2);

        const cta3 = document.getElementById('settings-cta-image-3').files[0];
        if (cta3) formData.append('cta_image_3', cta3);

        try {
            const res = await fetch(`${API_BASE_URL}/settings`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${adminToken}`
                },
                body: formData
            });
            const result = await res.json();
            if (result.success) {
                alert('Settings saved successfully!');
                fetchSettings(); // Refresh preview URLs and inputs
            } else {
                alert('Failed to save settings: ' + (result.message || 'Unknown error'));
            }
        } catch (err) {
            console.error('Error saving settings:', err);
            alert('Network error saving settings.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>Save Settings</span>';
        }
    });
}

// ── Add / Edit Product Modals ────────────────────────────────────
const modalBackdrop = document.getElementById('product-modal-backdrop');
const productModal = document.getElementById('product-modal');
const modalClose = document.getElementById('product-modal-close');

// Attach listener to '+ Add Product' button
document.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('btn-primary') && e.target.textContent.includes('Add Product')) {
        openProductModal();
    }
});

if (modalClose) {
    modalClose.addEventListener('click', () => {
        closeProductModal();
    });
}

if (modalBackdrop) {
    modalBackdrop.addEventListener('click', () => {
        closeProductModal();
    });
}

function openProductModal(productId = null) {
    const title = document.getElementById('product-modal-title');
    const form = document.getElementById('product-form');
    form.reset();
    document.getElementById('product-id').value = '';
    
    const preview = document.getElementById('product-image-preview');
    preview.src = '';
    preview.style.display = 'none';

    if (productId) {
        title.textContent = 'Edit Product';
        const p = currentProducts.find(prod => prod.id === productId);
        if (p) {
            document.getElementById('product-id').value = p.id;
            document.getElementById('product-name').value = p.name || '';
            document.getElementById('product-sku').value = p.sku || '';
            document.getElementById('product-desc').value = p.description || '';
            document.getElementById('product-cat').value = p.category || '';
            document.getElementById('product-price').value = Math.round(p.price) || '';
            document.getElementById('product-discount').value = p.discount_pct || 0;
            document.getElementById('product-stock').value = p.stock || 0;
            
            let sizesStr = p.sizes || '[]';
            try {
                const parsed = JSON.parse(sizesStr);
                if (Array.isArray(parsed)) sizesStr = parsed.join(', ');
            } catch {}
            document.getElementById('product-sizes').value = sizesStr;

            let colorsStr = p.colors || '[]';
            try {
                const parsed = JSON.parse(colorsStr);
                if (Array.isArray(parsed)) colorsStr = parsed.join(', ');
            } catch {}
            document.getElementById('product-colors').value = colorsStr;

            if (p.image_url) {
                preview.src = p.image_url.startsWith('/') ? API_BASE_URL.replace('/api/v1/admin', '') + p.image_url : p.image_url;
                preview.style.display = 'block';
            }
        }
    } else {
        title.textContent = 'Add New Product';
    }

    productModal.classList.remove('hidden');
    modalBackdrop.classList.remove('hidden');
}

function closeProductModal() {
    productModal.classList.add('hidden');
    modalBackdrop.classList.add('hidden');
}

async function toggleProductActive(id) {
    try {
        const res = await fetch(`${API_BASE_URL}/products/${id}/toggle`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${adminToken}`
            }
        });
        const data = await res.json();
        if (data.success) {
            fetchProducts();
        } else {
            alert('Failed to toggle status: ' + (data.message || ''));
        }
    } catch {
        alert('Network error toggling status.');
    }
}

async function deleteProduct(id) {
    const product = currentProducts.find(p => p.id === id);
    if (!product) return;
    if (!confirm(`Are you sure you want to permanently delete "${product.name}"? This action cannot be undone.`)) {
        return;
    }
    try {
        const res = await fetch(`${API_BASE_URL}/products/${id}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${adminToken}`
            }
        });
        const data = await res.json();
        if (data.success) {
            fetchProducts();
        } else {
            alert('Failed to delete product: ' + (data.message || ''));
        }
    } catch {
        alert('Network error deleting product.');
    }
}

function editProduct(id) {
    openProductModal(id);
}

// Product form submission
const productForm = document.getElementById('product-form');
if (productForm) {
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('btn-save-product');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        const productId = document.getElementById('product-id').value;
        const formData = new FormData();
        formData.append('name', document.getElementById('product-name').value);
        formData.append('sku', document.getElementById('product-sku').value);
        formData.append('description', document.getElementById('product-desc').value);
        formData.append('category', document.getElementById('product-cat').value);
        formData.append('price', document.getElementById('product-price').value);
        formData.append('discount_pct', document.getElementById('product-discount').value || '0');
        formData.append('stock', document.getElementById('product-stock').value || '0');

        const sizesVal = document.getElementById('product-sizes').value.trim();
        let sizesJson = '[]';
        if (sizesVal) {
            if (sizesVal.startsWith('[') && sizesVal.endsWith(']')) {
                sizesJson = sizesVal;
            } else {
                sizesJson = JSON.stringify(sizesVal.split(',').map(s => s.trim()).filter(Boolean));
            }
        }
        formData.append('sizes', sizesJson);

        const colorsVal = document.getElementById('product-colors').value.trim();
        let colorsJson = '[]';
        if (colorsVal) {
            if (colorsVal.startsWith('[') && colorsVal.endsWith(']')) {
                colorsJson = colorsVal;
            } else {
                colorsJson = JSON.stringify(colorsVal.split(',').map(c => c.trim()).filter(Boolean));
            }
        }
        formData.append('colors', colorsJson);

        const imgFile = document.getElementById('product-image').files[0];
        if (imgFile) {
            formData.append('image', imgFile);
        }

        const url = productId ? `${API_BASE_URL}/products/${productId}` : `${API_BASE_URL}/products`;
        const method = productId ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: {
                    Authorization: `Bearer ${adminToken}`
                },
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                alert(productId ? 'Product updated successfully!' : 'Product added successfully!');
                closeProductModal();
                fetchProducts();
            } else {
                alert('Error saving product: ' + (data.message || 'Unknown error'));
            }
        } catch (err) {
            console.error('Error saving product:', err);
            alert('Network error saving product.');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Product';
        }
    });
}

// ── WISHLISTS ─────────────────────────────────────────────────────
async function fetchWishlists(page = null) {
    if (page !== null) state.wishlists.page = page;
    const tbody = document.getElementById('wishlists-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="loading-state">Loading…</td></tr>';

    const search = document.getElementById('wishlist-search')?.value || '';

    const params = new URLSearchParams({ page: state.wishlists.page, limit: 15 });
    if (search) params.set('search', search);

    const data = await apiGet(`/users/wishlists?${params}`);
    if (!data?.success) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading-state">Failed to load wishlists.</td></tr>';
        return;
    }
    if (!data.data.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading-state">No wishlists found.</td></tr>';
        renderPagination('wishlists-pagination', null, 'fetchWishlists');
        return;
    }

    const apiOrigin = API.replace('/api/v1/admin', '');
    tbody.innerHTML = data.data.map(item => `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div class="user-avatar">${(item.user_name || '?')[0].toUpperCase()}</div>
                    <div style="font-weight:500">${item.user_name || '—'}</div>
                </div>
            </td>
            <td style="font-size:.85rem">${item.user_email || '—'}</td>
            <td>
                <div class="product-cell">
                    <img src="${item.product_image ? `${apiOrigin}${item.product_image}` : 'assets/imgs/placeholder.png'}" class="product-img" alt="${item.product_name}" onerror="this.src='assets/imgs/placeholder.png'">
                    <div style="font-weight:500">${item.product_name}</div>
                </div>
            </td>
            <td><strong>${INR(item.product_price)}</strong></td>
            <td style="font-size:.82rem">${fmtDate(item.liked_at)}</td>
        </tr>
    `).join('');

    renderPagination('wishlists-pagination', data.meta, 'fetchWishlists');
}

// Global exposes for inline onclick events
window.toggleProductActive = toggleProductActive;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.switchView = switchView;
window.fetchWishlists = fetchWishlists;
