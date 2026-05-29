-- ═══════════════════════════════════════════════════════════
--  KALYRA E-COMMERCE  ·  SQLite Schema  ·  v1.0.0
-- ═══════════════════════════════════════════════════════════
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────
--  USERS
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    email           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash   TEXT    NOT NULL,
    phone           TEXT,
    profile_photo   TEXT,
    status          TEXT    NOT NULL DEFAULT 'active'
                            CHECK(status IN ('active','suspended')),
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────
--  USER SESSIONS  (login / logout tracking)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token   TEXT    NOT NULL UNIQUE,
    ip_address      TEXT,
    user_agent      TEXT,
    is_valid        INTEGER NOT NULL DEFAULT 1
                            CHECK(is_valid IN (0,1)),
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at      TEXT    NOT NULL
);

-- ─────────────────────────────────────────────────────────
--  PASSWORD RESET TOKENS  (local-dev mode)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token           TEXT    NOT NULL UNIQUE,
    expires_at      TEXT    NOT NULL,
    used            INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────
--  ADDRESSES
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS addresses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label           TEXT    NOT NULL DEFAULT 'Home',
    line1           TEXT    NOT NULL,
    line2           TEXT,
    city            TEXT    NOT NULL,
    state           TEXT    NOT NULL,
    postal_code     TEXT    NOT NULL,
    country         TEXT    NOT NULL DEFAULT 'IN',
    is_default      INTEGER NOT NULL DEFAULT 0
                            CHECK(is_default IN (0,1)),
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────
--  PAYMENT METHODS  (gateway tokens / references)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_methods (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            TEXT    NOT NULL
                            CHECK(type IN ('card','upi','netbanking','wallet','cod')),
    display_name    TEXT    NOT NULL,
    provider        TEXT,
    token           TEXT,
    is_default      INTEGER NOT NULL DEFAULT 0
                            CHECK(is_default IN (0,1)),
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────
--  PRODUCTS
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    description     TEXT,
    sku             TEXT    UNIQUE,
    category        TEXT,
    product_type    TEXT    DEFAULT 'shop' CHECK(product_type IN ('shop', 'apparel')),
    tags            TEXT    DEFAULT '[]',   -- JSON array stored as text
    price           REAL    NOT NULL CHECK(price >= 0),
    discount_pct    REAL    NOT NULL DEFAULT 0
                            CHECK(discount_pct >= 0 AND discount_pct <= 100),
    stock           INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
    image_url       TEXT,
    badge           TEXT,
    sizes           TEXT    DEFAULT '[]',   -- JSON: ["S","M","L","XL"]
    colors          TEXT    DEFAULT '[]',   -- JSON: ["Red","Blue"]
    is_active       INTEGER NOT NULL DEFAULT 1
                            CHECK(is_active IN (0,1)),
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────
--  CART
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cart_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity        INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
    size            TEXT,
    color           TEXT,
    added_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, product_id, size, color)
);

-- ─────────────────────────────────────────────────────────
--  WISHLIST / LIKED PRODUCTS
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS liked_products (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    liked_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, product_id)
);

-- ─────────────────────────────────────────────────────────
--  ADMINS
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    email           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash   TEXT    NOT NULL,
    role            TEXT    NOT NULL DEFAULT 'manager'
                            CHECK(role IN ('superadmin','manager','analyst')),
    is_active       INTEGER NOT NULL DEFAULT 1,
    last_login      TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────
--  ADMIN SESSIONS
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id        INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    refresh_token   TEXT    NOT NULL UNIQUE,
    ip_address      TEXT,
    is_valid        INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at      TEXT    NOT NULL
);

-- ─────────────────────────────────────────────────────────
--  PROMOCODES
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promocodes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    description     TEXT,
    discount_type   TEXT    NOT NULL
                            CHECK(discount_type IN ('flat','percent')),
    discount_value  REAL    NOT NULL CHECK(discount_value > 0),
    min_order_value REAL    NOT NULL DEFAULT 0,
    max_discount    REAL,                   -- cap for percent promos
    max_uses        INTEGER,                -- NULL = unlimited
    uses_count      INTEGER NOT NULL DEFAULT 0,
    valid_from      TEXT    NOT NULL,
    valid_until     TEXT    NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_by      INTEGER REFERENCES admins(id),
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────
--  ORDERS
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    order_ref       TEXT    NOT NULL UNIQUE,  -- human-readable e.g. KLY-20240101-0001
    user_id         INTEGER NOT NULL REFERENCES users(id),
    address_id      INTEGER REFERENCES addresses(id),
    promocode_id    INTEGER REFERENCES promocodes(id),
    subtotal        REAL    NOT NULL,
    discount_amount REAL    NOT NULL DEFAULT 0,
    tax_amount      REAL    NOT NULL DEFAULT 0,
    total_amount    REAL    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending','confirmed','processing','shipped','delivered','cancelled','refunded')),
    notes           TEXT,
    razorpay_order_id TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id      INTEGER REFERENCES products(id),
    product_name    TEXT    NOT NULL,   -- snapshot at purchase time
    product_sku     TEXT,
    unit_price      REAL    NOT NULL,
    discount_pct    REAL    NOT NULL DEFAULT 0,
    quantity        INTEGER NOT NULL,
    size            TEXT,
    color           TEXT,
    subtotal        REAL    NOT NULL
);

-- ─────────────────────────────────────────────────────────
--  PAYMENT HISTORY
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_history (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id            INTEGER NOT NULL REFERENCES orders(id),
    user_id             INTEGER NOT NULL REFERENCES users(id),
    payment_method_type TEXT    NOT NULL,
    razorpay_order_id   TEXT,
    razorpay_payment_id TEXT,
    razorpay_signature  TEXT,
    amount              REAL    NOT NULL,
    currency            TEXT    NOT NULL DEFAULT 'INR',
    status              TEXT    NOT NULL DEFAULT 'pending'
                                CHECK(status IN ('pending','success','failed','refunded')),
    failure_reason      TEXT,
    paid_at             TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────
--  AUDIT LOG
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id        INTEGER REFERENCES admins(id),
    action          TEXT    NOT NULL,
    target_type     TEXT,
    target_id       INTEGER,
    details         TEXT,           -- JSON blob
    ip_address      TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────
--  INDEXES
-- ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status         ON users(status);
CREATE INDEX IF NOT EXISTS idx_sessions_user        ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token       ON sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_addr_user            ON addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_pm_user              ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_products_active      ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_category    ON products(category);
CREATE INDEX IF NOT EXISTS idx_cart_user            ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_liked_user           ON liked_products(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user          ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order    ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_user         ON payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_order        ON payment_history(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_admin          ON audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_promocodes_code      ON promocodes(code);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user    ON password_reset_tokens(user_id);
