// Admin Panel Scripts

const API_BASE_URL = 'http://localhost:3000/api/v1/admin';
let adminToken = localStorage.getItem('kalyra_admin_token');

// DOM Elements
const loginView = document.getElementById('admin-login-view');
const dashboardView = document.getElementById('admin-dashboard-view');
const loginForm = document.getElementById('admin-login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const navItems = document.querySelectorAll('.nav-item');
const pageTitle = document.getElementById('page-title');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (adminToken) {
        showDashboard();
    } else {
        showLogin();
    }
});

// Auth Flow
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const btn = document.getElementById('login-btn');
    
    btn.disabled = true;
    btn.innerHTML = '<span>Logging in...</span>';
    loginError.textContent = '';

    try {
        const res = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await res.json();
        
        if (data.success) {
            adminToken = data.data.accessToken;
            localStorage.setItem('kalyra_admin_token', adminToken);
            document.getElementById('admin-name').textContent = data.data.admin.name;
            document.getElementById('admin-role').textContent = data.data.admin.role;
            showDashboard();
        } else {
            loginError.textContent = data.message || 'Login failed';
        }
    } catch (err) {
        loginError.textContent = 'Network error. Make sure the backend is running.';
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

// Navigation & Views
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        const view = item.dataset.view;
        switchView(view);
    });
});

function switchView(viewName) {
    document.querySelectorAll('.content-body').forEach(el => el.classList.add('hidden'));
    document.getElementById(`content-${viewName}`).classList.remove('hidden');
    
    // Update title
    pageTitle.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);
    
    // Load data
    loadView(viewName);
}

function loadView(viewName) {
    if (viewName === 'overview') fetchAnalytics();
    if (viewName === 'products') fetchProducts();
    if (viewName === 'orders') fetchOrders();
    if (viewName === 'users') fetchUsers();
}

// API Helpers
async function fetchAdminData(endpoint) {
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.status === 401) {
            // Token expired or invalid
            logoutBtn.click();
            return null;
        }
        return await res.json();
    } catch (err) {
        console.error('API Error:', err);
        return null;
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Data Fetching & Rendering
async function fetchAnalytics() {
    const data = await fetchAdminData('/analytics/dashboard');
    if (!data || !data.success) return;

    const stats = data.data.summary;
    document.getElementById('metric-revenue').textContent = formatCurrency(stats.totalRevenue);
    document.getElementById('metric-orders').textContent = stats.totalOrders;
    document.getElementById('metric-products').textContent = stats.activeProducts;
    document.getElementById('metric-users').textContent = stats.totalUsers;

    // Fetch recent orders for overview
    const ordersData = await fetchAdminData('/orders?limit=5');
    if (ordersData && ordersData.success) {
        const tbody = document.getElementById('recent-orders-body');
        tbody.innerHTML = '';
        if (ordersData.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No recent orders.</td></tr>';
            return;
        }
        
        ordersData.data.forEach(order => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${order.order_ref}</td>
                <td>${order.user_name || 'Customer'}</td>
                <td>${formatDate(order.created_at)}</td>
                <td>${formatCurrency(order.total_amount)}</td>
                <td><span class="status-badge ${order.status === 'delivered' ? 'success' : 'pending'}">${order.status}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }
}

async function fetchProducts() {
    const data = await fetchAdminData('/products');
    const tbody = document.getElementById('products-table-body');
    if (!data || !data.success) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-state">Failed to load products.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    if (data.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No products found.</td></tr>';
        return;
    }

    data.data.forEach(product => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="product-cell">
                    <img src="${product.image_url || 'assets/imgs/placeholder.png'}" class="product-img" alt="${product.name}">
                    <div>
                        <div style="font-weight: 500;">${product.name}</div>
                        <div style="font-size: 0.75rem; color: var(--admin-text-muted);">${product.sku}</div>
                    </div>
                </div>
            </td>
            <td>${product.category}</td>
            <td>${formatCurrency(product.price)}</td>
            <td>${product.stock}</td>
            <td><span class="status-badge ${product.is_active ? 'success' : 'inactive'}">${product.is_active ? 'Active' : 'Inactive'}</span></td>
            <td><button class="btn-text btn-sm">Edit</button></td>
        `;
        tbody.appendChild(tr);
    });
}

async function fetchOrders() {
    const data = await fetchAdminData('/orders');
    const tbody = document.getElementById('orders-table-body');
    if (!data || !data.success) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-state">Failed to load orders.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    if (data.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No orders found.</td></tr>';
        return;
    }

    data.data.forEach(order => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${order.order_ref}</td>
            <td>${order.user_name || 'Customer'}</td>
            <td>${formatDate(order.created_at)}</td>
            <td>${formatCurrency(order.total_amount)}</td>
            <td><span class="status-badge ${order.status === 'delivered' ? 'success' : 'pending'}">${order.status}</span></td>
            <td><button class="btn-text btn-sm">View</button></td>
        `;
        tbody.appendChild(tr);
    });
}

async function fetchUsers() {
    const data = await fetchAdminData('/users');
    const tbody = document.getElementById('users-table-body');
    if (!data || !data.success) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading-state">Failed to load users.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    if (data.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">No users found.</td></tr>';
        return;
    }

    data.data.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight: 500;">${user.name}</div>
                <div style="font-size: 0.75rem; color: var(--admin-text-muted);">${user.phone || '-'}</div>
            </td>
            <td>${user.email}</td>
            <td>${formatDate(user.created_at)}</td>
            <td><span class="status-badge ${user.status === 'active' ? 'success' : 'inactive'}">${user.status}</span></td>
        `;
        tbody.appendChild(tr);
    });
}
