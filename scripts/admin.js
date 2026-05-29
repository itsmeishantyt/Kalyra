// ── Kalyra Admin Panel ──────────────────────────────────────────
// All data comes from the live backend. Zero hardcoded/mock values.

const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000/api/v1/admin'
    : 'https://api.kalyraa.com/api/v1/admin';
let adminToken = localStorage.getItem('kalyra_admin_token');

// DOM refs
const loginView    = document.getElementById('admin-login-view');
const dashboardView = document.getElementById('admin-dashboard-view');
const loginForm    = document.getElementById('admin-login-form');
const loginError   = document.getElementById('login-error');
const logoutBtn    = document.getElementById('logout-btn');
const navItems     = document.querySelectorAll('.nav-item');
const pageTitle    = document.getElementById('page-title');

// ── Initialise ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (adminToken) {
        showDashboard();
    } else {
        showLogin();
    }
});

// ── Auth ─────────────────────────────────────────────────────────
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const btn      = document.getElementById('login-btn');

    btn.disabled = true;
    btn.innerHTML = '<span>Logging in…</span>';
    loginError.textContent = '';

    try {
        const res  = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();

        if (data.success) {
            adminToken = data.data.accessToken;
            localStorage.setItem('kalyra_admin_token', adminToken);
            document.getElementById('admin-name').textContent  = data.data.admin.name;
            document.getElementById('admin-role').textContent  = data.data.admin.role;
            document.getElementById('admin-avatar').textContent = (data.data.admin.name || 'A')[0].toUpperCase();
            showDashboard();
        } else {
            loginError.textContent = data.message || 'Login failed';
        }
    } catch {
        loginError.textContent = 'Network error — make sure the backend is running.';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Sign In</span>';
    }
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('kalyra_admin_token');
    adminToken = null;
    showLogin();
});

function showLogin() {
    loginView.classList.remove('hidden');
    dashboardView.classList.add('hidden');
}

function showDashboard() {
    loginView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    loadView('overview');
}

// ── Navigation ───────────────────────────────────────────────────
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        switchView(item.dataset.view);
    });
});

function switchView(viewName) {
    document.querySelectorAll('.content-body').forEach(el => el.classList.add('hidden'));
    document.getElementById(`content-${viewName}`).classList.remove('hidden');
    pageTitle.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);
    loadView(viewName);
}

function loadView(viewName) {
    if (viewName === 'overview')  fetchAnalytics();
    if (viewName === 'products')  fetchProducts();
    if (viewName === 'orders')    fetchOrders();
    if (viewName === 'users')     fetchUsers();
    if (viewName === 'settings')  fetchSettings();
}

// ── API helpers ──────────────────────────────────────────────────
async function apiGet(endpoint) {
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (res.status === 401) { logoutBtn.click(); return null; }
        return await res.json();
    } catch (err) {
        console.error('API error:', err);
        return null;
    }
}

const INR = (v) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

const fmtDate = (s) =>
    new Date(s).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

// ISO date helpers
function isoDate(d) { return d.toISOString().slice(0, 10); }
function monthRange(offsetMonths = 0) {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
    const end   = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0);
    return { from: isoDate(start), to: isoDate(end) };
}

// Build trend HTML — compares current vs previous value
function trendHtml(current, previous, isCurrency = false) {
    if (previous == null || previous === 0) {
        // No prior data — just show "All time" note, no fake percentage
        return previous === 0 && current > 0
            ? `<span class="trend neutral">First recorded data</span>`
            : '';
    }
    const pct   = ((current - previous) / previous) * 100;
    const sign  = pct >= 0 ? '+' : '';
    const cls   = pct > 0 ? 'positive' : pct < 0 ? 'negative' : 'neutral';
    const label = isCurrency ? INR(Math.abs(current - previous)) : Math.abs(Math.round(pct)) + '%';
    return `<span class="trend ${cls}"><strong>${sign}${Math.round(pct)}%</strong> (${sign}${label}) vs last month</span>`;
}

// ── Overview / Analytics ─────────────────────────────────────────
async function fetchAnalytics() {
    // Current month range
    const cur  = monthRange(0);
    const prev = monthRange(-1);

    // Fetch summary (all-time totals) + current and previous month sales
    const [summary, curSales, prevSales, recentOrders] = await Promise.all([
        apiGet('/analytics/dashboard'),
        apiGet(`/analytics/sales?from=${cur.from}&to=${cur.to}`),
        apiGet(`/analytics/sales?from=${prev.from}&to=${prev.to}`),
        apiGet('/orders?limit=5'),
    ]);

    // ── Metric values (all-time from dashboard) ──
    if (summary?.success) {
        const s = summary.data.summary;
        document.getElementById('metric-revenue').textContent  = INR(s.totalRevenue);
        document.getElementById('metric-orders').textContent   = s.totalOrders;
        document.getElementById('metric-products').textContent = s.activeProducts;
        document.getElementById('metric-users').textContent    = s.totalUsers;
    }

    // ── Real trend percentages (current month vs previous month) ──
    const curT  = curSales?.data?.totals  || {};
    const prevT = prevSales?.data?.totals || {};

    document.getElementById('trend-revenue').innerHTML =
        trendHtml(curT.total_revenue || 0, prevT.total_revenue ?? null, true);
    document.getElementById('trend-orders').innerHTML =
        trendHtml(curT.total_orders || 0, prevT.total_orders ?? null, false);

    // Products and users don't have month-range endpoints — leave blank (no fake data)
    document.getElementById('trend-products').innerHTML = '';
    document.getElementById('trend-users').innerHTML    = '';

    // ── Recent Orders table ──
    const tbody = document.getElementById('recent-orders-body');
    if (!recentOrders?.success || recentOrders.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:24px;">No orders yet.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    recentOrders.data.forEach(order => {
        const statusCls = { delivered: 'success', paid: 'success', pending: 'pending', cancelled: 'inactive' }[order.status] || 'pending';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>#${order.order_ref}</strong></td>
            <td>${order.user_name || 'Customer'}</td>
            <td>${fmtDate(order.created_at)}</td>
            <td>${INR(order.total_amount)}</td>
            <td><span class="status-badge ${statusCls}">${order.status}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// ── Products ─────────────────────────────────────────────────────
let currentProducts = [];

async function fetchProducts() {
    const tbody = document.getElementById('products-table-body');
    tbody.innerHTML = '<tr><td colspan="6" class="loading-state">Loading…</td></tr>';

    const data = await apiGet('/products');
    if (!data?.success) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-state">Failed to load products.</td></tr>';
        return;
    }

    currentProducts = data.data || [];

    if (currentProducts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:24px;">No products found.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    currentProducts.forEach(p => {
        const tr = document.createElement('tr');
        const imgPath = p.image_url ? (p.image_url.startsWith('/') ? API_BASE_URL.replace('/api/v1/admin', '') + p.image_url : p.image_url) : 'assets/imgs/placeholder.png';
        tr.innerHTML = `
            <td>
                <div class="product-cell">
                    <img src="${imgPath}" class="product-img" alt="${p.name}">
                    <div>
                        <div style="font-weight:500">${p.name}</div>
                        <div style="font-size:.75rem;color:var(--admin-text-muted)">${p.sku || 'No SKU'}</div>
                    </div>
                </div>
            </td>
            <td>${p.category || 'Uncategorized'}</td>
            <td>${INR(p.price)}</td>
            <td>${p.stock}</td>
            <td>
                <button class="status-badge ${p.is_active ? 'success' : 'inactive'}" onclick="toggleProductActive(${p.id})">
                    ${p.is_active ? 'Active' : 'Inactive'}
                </button>
            </td>
            <td>
                <div style="display:flex; gap:8px;">
                    <button class="btn-text btn-sm" onclick="editProduct(${p.id})">Edit</button>
                    <button class="btn-text btn-sm btn-delete" onclick="deleteProduct(${p.id})" style="color:var(--admin-error,#e05c5c);">Delete</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ── Orders ───────────────────────────────────────────────────────
async function fetchOrders() {
    const tbody = document.getElementById('orders-table-body');
    tbody.innerHTML = '<tr><td colspan="6" class="loading-state">Loading…</td></tr>';

    const data = await apiGet('/orders');
    if (!data?.success) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-state">Failed to load orders.</td></tr>';
        return;
    }

    if (data.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:24px;">No orders yet.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    data.data.forEach(order => {
        const statusCls = { delivered: 'success', paid: 'success', pending: 'pending', cancelled: 'inactive' }[order.status] || 'pending';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>#${order.order_ref}</strong></td>
            <td>${order.user_name || 'Customer'}</td>
            <td>${fmtDate(order.created_at)}</td>
            <td>${INR(order.total_amount)}</td>
            <td><span class="status-badge ${statusCls}">${order.status}</span></td>
            <td>
                <select class="status-select" onchange="updateOrderStatus(${order.id}, this.value)">
                    ${['pending','paid','processing','shipped','delivered','cancelled','refunded']
                        .map(s => `<option value="${s}" ${s === order.status ? 'selected' : ''}>${s}</option>`)
                        .join('')}
                </select>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function updateOrderStatus(orderId, status) {
    try {
        const res = await fetch(`${API_BASE_URL}/orders/${orderId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({ status }),
        });
        const data = await res.json();
        if (!data.success) alert('Failed to update status: ' + (data.message || ''));
    } catch {
        alert('Network error updating order status.');
    }
}

// ── Users ────────────────────────────────────────────────────────
async function fetchUsers() {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '<tr><td colspan="4" class="loading-state">Loading…</td></tr>';

    const data = await apiGet('/users');
    if (!data?.success) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading-state">Failed to load users.</td></tr>';
        return;
    }

    if (data.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#aaa;padding:24px;">No users yet.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    data.data.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight:500">${user.name}</div>
                <div style="font-size:.75rem;color:var(--admin-text-muted)">${user.phone || '—'}</div>
            </td>
            <td>${user.email}</td>
            <td>${fmtDate(user.created_at)}</td>
            <td><span class="status-badge ${user.status === 'active' ? 'success' : 'inactive'}">${user.status}</span></td>
        `;
        tbody.appendChild(tr);
    });
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

// Global exposes for inline onclick events
window.toggleProductActive = toggleProductActive;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.switchView = switchView;
