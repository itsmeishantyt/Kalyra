// ── Kalyra Admin Panel ──────────────────────────────────────────
// All data comes from the live backend. Zero hardcoded/mock values.

const API_BASE_URL = 'http://localhost:3000/api/v1/admin';
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
async function fetchProducts() {
    const tbody = document.getElementById('products-table-body');
    tbody.innerHTML = '<tr><td colspan="6" class="loading-state">Loading…</td></tr>';

    const data = await apiGet('/products');
    if (!data?.success) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-state">Failed to load products.</td></tr>';
        return;
    }

    if (data.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:24px;">No products found.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    data.data.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="product-cell">
                    <img src="${p.image_url || 'assets/imgs/placeholder.png'}" class="product-img" alt="${p.name}">
                    <div>
                        <div style="font-weight:500">${p.name}</div>
                        <div style="font-size:.75rem;color:var(--admin-text-muted)">${p.sku}</div>
                    </div>
                </div>
            </td>
            <td>${p.category}</td>
            <td>${INR(p.price)}</td>
            <td>${p.stock}</td>
            <td><span class="status-badge ${p.is_active ? 'success' : 'inactive'}">${p.is_active ? 'Active' : 'Inactive'}</span></td>
            <td><button class="btn-text btn-sm">Edit</button></td>
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
