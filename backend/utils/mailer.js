/**
 * mailer.js — Kalyra Email Service (Resend)
 *
 * Uses the Resend API for all transactional emails.
 * Falls back to console logging when RESEND_API_KEY is not set (local dev).
 */

const { Resend } = require('resend');

const FROM        = process.env.RESEND_FROM || 'onboarding@resend.dev';
const APP_URL     = process.env.APP_URL     || 'http://localhost:8000';
const DEV_MODE    = !process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_YOUR_KEY_HERE';

let resend;
if (!DEV_MODE) {
  resend = new Resend(process.env.RESEND_API_KEY);
}

// ── Shared email base layout ─────────────────────────────
function baseLayout(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f0ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f0ea;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
          <!-- Header -->
          <tr>
            <td style="background:#1a1a1a;border-radius:16px 16px 0 0;padding:28px 36px;text-align:center;">
              <span style="font-size:26px;font-weight:700;letter-spacing:0.08em;color:#B89B71;">KALYRA</span>
              <p style="margin:4px 0 0;font-size:11px;letter-spacing:0.2em;color:#888;text-transform:uppercase;">Timeless Craft</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:36px 36px 28px;border-left:1px solid #ece8e0;border-right:1px solid #ece8e0;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#fdf8f2;border:1px solid #ece8e0;border-radius:0 0 16px 16px;padding:20px 36px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
                © ${new Date().getFullYear()} Kalyra. All rights reserved.<br>
                You received this email because you have an account with us.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Internal send helper ────────────────────────────────
async function sendEmail({ to, subject, html }) {
  if (DEV_MODE) {
    console.log('\n─────────────────────────────────────────────────');
    console.log(`📧  [DEV] Email → ${to}`);
    console.log(`    Subject: ${subject}`);
    console.log('─────────────────────────────────────────────────\n');
    return { dev: true };
  }
  const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) throw new Error(`Resend error: ${error.message}`);
  return data;
}

// ─────────────────────────────────────────────────────────
//  sendOtp(email, otp, name?)
// ─────────────────────────────────────────────────────────
async function sendOtp(email, otp, name = '') {
  const subject = `Your Kalyra verification code: ${otp}`;
  const greeting = name ? `Hi ${name.split(' ')[0]},` : 'Hi there,';

  const html = baseLayout('Verify your email — Kalyra', `
    <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a;font-weight:700;">Verify your email</h1>
    <p style="margin:0 0 28px;font-size:15px;color:#666;line-height:1.6;">${greeting} use the code below to complete your Kalyra account setup. It expires in <strong>10 minutes</strong>.</p>

    <div style="text-align:center;margin:0 0 32px;">
      <div style="display:inline-block;background:#fdf8f2;border:2px dashed #B89B71;border-radius:16px;padding:24px 48px;">
        <span style="font-size:42px;font-weight:800;letter-spacing:0.18em;color:#1a1a1a;font-family:'Courier New',monospace;">${otp}</span>
      </div>
      <p style="margin:14px 0 0;font-size:12px;color:#aaa;letter-spacing:0.05em;">ONE-TIME VERIFICATION CODE</p>
    </div>

    <div style="background:#fff8f0;border-left:3px solid #B89B71;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#888;line-height:1.5;">
        🔒 Never share this code with anyone. Kalyra will never ask for it via phone or chat.
      </p>
    </div>

    <p style="margin:0;font-size:13px;color:#bbb;">If you didn't request this, you can safely ignore this email.</p>
  `);

  return sendEmail({ to: email, subject, html });
}

// ─────────────────────────────────────────────────────────
//  sendWelcomeEmail(user)
// ─────────────────────────────────────────────────────────
async function sendWelcomeEmail(user) {
  const subject = `Welcome to Kalyra, ${user.name.split(' ')[0]}! ✨`;

  const html = baseLayout('Welcome to Kalyra', `
    <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a;font-weight:700;">Welcome, ${user.name.split(' ')[0]}! 🎉</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
      Your Kalyra account is ready. Explore our curated collection of handcrafted artisan goods — made with care, delivered with love.
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${APP_URL}/shop"
         style="display:inline-block;background:#B89B71;color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:0.04em;">
        Start Shopping →
      </a>
    </div>

    <div style="display:flex;gap:0;margin-top:28px;border:1px solid #ece8e0;border-radius:12px;overflow:hidden;">
      ${[
        ['🛍️', 'Curated Collections', 'Handpicked artisan pieces'],
        ['📦', 'Fast Delivery', 'Ships across India'],
        ['💛', 'Easy Returns', '7-day return policy'],
      ].map(([icon, title, sub]) => `
        <div style="flex:1;padding:16px;text-align:center;border-right:1px solid #ece8e0;">
          <div style="font-size:22px;margin-bottom:6px;">${icon}</div>
          <div style="font-size:13px;font-weight:600;color:#222;">${title}</div>
          <div style="font-size:11px;color:#aaa;margin-top:2px;">${sub}</div>
        </div>
      `).join('')}
    </div>
  `);

  return sendEmail({ to: user.email, subject, html });
}

// ─────────────────────────────────────────────────────────
//  sendPasswordReset(user, resetToken)
// ─────────────────────────────────────────────────────────
async function sendPasswordReset(user, resetToken) {
  const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;
  const subject  = 'Reset your Kalyra password';

  if (DEV_MODE) {
    console.log('\n─────────────────────────────────────────────────');
    console.log('📧  [DEV] Password Reset');
    console.log(`    To:    ${user.email}`);
    console.log(`    Token: ${resetToken}`);
    console.log(`    URL:   ${resetUrl}`);
    console.log('─────────────────────────────────────────────────\n');
    return { localToken: resetToken, resetUrl };
  }

  const html = baseLayout('Reset your password — Kalyra', `
    <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a;font-weight:700;">Reset your password</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
      Hi ${user.name ? user.name.split(' ')[0] : 'there'}, we received a request to reset the password for your Kalyra account. Click the button below to set a new password.
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${resetUrl}"
         style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:0.04em;">
        Reset Password
      </a>
    </div>

    <div style="background:#fff8f0;border-left:3px solid #e67e22;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#888;line-height:1.5;">
        ⏱ This link expires in <strong>30 minutes</strong>. If you didn't request a reset, your account is safe — just ignore this email.
      </p>
    </div>

    <p style="margin:0;font-size:12px;color:#bbb;">If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${resetUrl}" style="color:#B89B71;word-break:break-all;">${resetUrl}</a>
    </p>
  `);

  return sendEmail({ to: user.email, subject, html });
}

// ─────────────────────────────────────────────────────────
//  sendOrderConfirmation(user, order, items)
// ─────────────────────────────────────────────────────────
async function sendOrderConfirmation(user, order, items) {
  const subject   = `Order Confirmed – ${order.order_ref} 🎉`;
  const fmt       = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
  const isOnline  = order.status === 'confirmed' && order.razorpay_order_id;
  const payLabel  = isOnline ? 'Online Payment' : 'Cash on Delivery';

  const itemRows = items.map(item => {
    const effectivePrice = Math.round(item.unit_price * (1 - item.discount_pct / 100) * 100) / 100;
    const lineTotal      = Math.round(effectivePrice * item.quantity * 100) / 100;
    const variantLabel   = [item.size, item.color].filter(Boolean).join(' · ');
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f3f0ea;">
          <div style="font-size:14px;font-weight:600;color:#222;">${item.product_name}</div>
          ${variantLabel ? `<div style="font-size:12px;color:#aaa;margin-top:2px;">${variantLabel}</div>` : ''}
          <div style="font-size:12px;color:#888;margin-top:2px;">Qty: ${item.quantity} × ${fmt(effectivePrice)}</div>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #f3f0ea;text-align:right;font-size:14px;font-weight:600;color:#1a1a1a;white-space:nowrap;">
          ${fmt(lineTotal)}
        </td>
      </tr>`;
  }).join('');

  const html = baseLayout(`Order ${order.order_ref} Confirmed`, `
    <h1 style="margin:0 0 4px;font-size:22px;color:#1a1a1a;font-weight:700;">Order Confirmed! 🎉</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
      Hi ${user.name ? user.name.split(' ')[0] : 'there'}, thank you for your order. We'll get it ready for you shortly.
    </p>

    <!-- Order ref badge -->
    <div style="background:#fdf8f2;border:1px solid #ece8e0;border-radius:12px;padding:16px 20px;margin-bottom:28px;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#aaa;margin-bottom:4px;">Order Reference</div>
        <div style="font-size:17px;font-weight:700;color:#B89B71;letter-spacing:0.06em;">${order.order_ref}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#aaa;margin-bottom:4px;">Payment</div>
        <div style="font-size:13px;font-weight:600;color:#2d6a4f;">${payLabel}</div>
      </div>
    </div>

    <!-- Items table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <thead>
        <tr>
          <th style="text-align:left;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#aaa;padding-bottom:10px;border-bottom:2px solid #f3f0ea;">Item</th>
          <th style="text-align:right;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#aaa;padding-bottom:10px;border-bottom:2px solid #f3f0ea;">Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <!-- Totals -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      ${order.discount_amount > 0 ? `
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#888;">Subtotal</td>
        <td style="text-align:right;font-size:13px;color:#888;">${fmt(order.subtotal)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#2d6a4f;">Discount</td>
        <td style="text-align:right;font-size:13px;color:#2d6a4f;">−${fmt(order.discount_amount)}</td>
      </tr>` : ''}
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#888;">Tax (5% GST)</td>
        <td style="text-align:right;font-size:13px;color:#888;">${fmt(order.tax_amount)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0 4px;font-size:16px;font-weight:700;color:#1a1a1a;border-top:2px solid #f3f0ea;">Total</td>
        <td style="padding:10px 0 4px;text-align:right;font-size:16px;font-weight:700;color:#B89B71;border-top:2px solid #f3f0ea;">${fmt(order.total_amount)}</td>
      </tr>
    </table>

    <!-- Status tracker -->
    <div style="background:#f9f6f1;border-radius:12px;padding:16px 20px;margin-bottom:28px;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#888;margin-bottom:12px;">Order Status</div>
      <div style="display:flex;align-items:center;gap:0;">
        ${['Placed', 'Processing', 'Shipped', 'Delivered'].map((s, i) => {
          const active = i === 0;
          return `<div style="flex:1;text-align:center;">
            <div style="width:20px;height:20px;border-radius:50%;background:${active ? '#B89B71' : '#e0d9cf'};margin:0 auto 4px;display:flex;align-items:center;justify-content:center;">
              ${active ? '<span style="color:#fff;font-size:10px;font-weight:700;">✓</span>' : ''}
            </div>
            <div style="font-size:10px;color:${active ? '#B89B71' : '#bbb'};font-weight:${active ? '600' : '400'};">${s}</div>
          </div>${i < 3 ? '<div style="flex:1;height:2px;background:#e0d9cf;margin-top:10px;max-width:40px;"></div>' : ''}`;
        }).join('')}
      </div>
    </div>

    <div style="text-align:center;">
      <a href="${APP_URL}/orders"
         style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:13px 32px;border-radius:10px;font-size:14px;font-weight:600;letter-spacing:0.04em;">
        Track My Order →
      </a>
    </div>
  `);

  return sendEmail({ to: user.email, subject, html });
}

// ─────────────────────────────────────────────────────────
//  sendOrderStatusUpdate(user, order, status)
// ─────────────────────────────────────────────────────────
async function sendOrderStatusUpdate(user, order, status) {
  const statusLabels = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    processing: 'Processing',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    refunded: 'Refunded'
  };

  const statusLabel = statusLabels[status] || status;
  const subject = `Order Update – ${order.order_ref} is now ${statusLabel} 📦`;
  
  // Highlight active step in tracking bar
  const steps = ['Placed', 'Processing', 'Shipped', 'Delivered'];
  const activeIndex = ['confirmed', 'processing', 'shipped', 'delivered'].indexOf(status);

  let statusSection = '';
  if (['confirmed', 'processing', 'shipped', 'delivered'].includes(status)) {
    statusSection = `
      <!-- Status tracker -->
      <div style="background:#f9f6f1;border-radius:12px;padding:20px 20px 16px;margin-bottom:28px;">
        <div style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#888;margin-bottom:16px;text-align:center;">Delivery Progress</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:0;">
          ${steps.map((s, i) => {
            const active = i <= activeIndex;
            const current = i === activeIndex;
            return `<div style="flex:1;text-align:center;">
              <div style="width:24px;height:24px;border-radius:50%;background:${active ? '#B89B71' : '#e0d9cf'};margin:0 auto 6px;display:flex;align-items:center;justify-content:center;box-shadow:${current ? '0 0 0 4px rgba(184,155,113,0.2)' : 'none'};">
                <span style="color:#fff;font-size:11px;font-weight:700;">${active ? '✓' : ''}</span>
              </div>
              <div style="font-size:10px;color:${active ? '#B89B71' : '#bbb'};font-weight:${active ? '600' : '400'};">${s}</div>
            </div>${i < 3 ? `<div style="flex:1;height:2px;background:${i < activeIndex ? '#B89B71' : '#e0d9cf'};margin-top:12px;max-width:40px;"></div>` : ''}`;
          }).join('')}
        </div>
      </div>
    `;
  } else if (status === 'refunded') {
    statusSection = `
      <div style="background:#f0faf5;border-left:4px solid #2e7d32;border-radius:0 8px 8px 0;padding:16px;margin-bottom:28px;">
        <p style="margin:0;font-size:14px;color:#2e7d32;font-weight:600;line-height:1.5;">Refund Processed</p>
        <p style="margin:6px 0 0;font-size:13px;color:#555;line-height:1.5;">
          Your refund of <strong>₹${Number(order.total_amount).toLocaleString('en-IN')}</strong> has been successfully processed and returned to your original payment method. Depending on your bank, it may take 5-7 business days to reflect in your account.
        </p>
      </div>
    `;
  }

  const statusDescriptions = {
    confirmed: 'Your order has been verified and confirmed. We are starting to package your items.',
    processing: 'Our artisans are handcrafting and compiling your items. We are preparing the package for shipment.',
    shipped: 'Good news! Your package has been handed over to our courier partner and is on its way to you.',
    delivered: 'Your package has been successfully delivered. We hope you love your new Kalyra creation!',
    refunded: 'Your refund has been fully processed.'
  };

  const desc = statusDescriptions[status] || `Your order status has been updated to ${statusLabel}.`;

  const html = baseLayout(`Order ${order.order_ref} Update`, `
    <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a;font-weight:700;">Order Status Update</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
      Hi ${user.name ? user.name.split(' ')[0] : 'there'}, the status of your order <strong>${order.order_ref}</strong> has been updated.
    </p>

    <!-- Update notice card -->
    <div style="background:#fdf8f2;border:1px solid #ece8e0;border-radius:12px;padding:20px;margin-bottom:28px;text-align:center;">
      <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#aaa;margin-bottom:6px;">Current Status</div>
      <div style="font-size:22px;font-weight:700;color:#B89B71;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:12px;">${statusLabel}</div>
      <p style="margin:0 auto;max-width:440px;font-size:14px;color:#555;line-height:1.6;">${desc}</p>
    </div>

    ${statusSection}

    <div style="text-align:center;margin-top:12px;">
      <a href="${APP_URL}/orders"
         style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:13px 32px;border-radius:10px;font-size:14px;font-weight:600;letter-spacing:0.04em;">
        Track My Order →
      </a>
    </div>
  `);

  return sendEmail({ to: user.email, subject, html });
}

// ─────────────────────────────────────────────────────────
//  sendOrderCancellation(user, order)
// ─────────────────────────────────────────────────────────
async function sendOrderCancellation(user, order) {
  const subject = `Order Cancelled – ${order.order_ref} ❌`;
  
  const refundText = order.razorpay_order_id
    ? `Since you paid online, your refund of <strong>₹${Number(order.total_amount).toLocaleString('en-IN')}</strong> will be automatically processed back to your original payment method. This usually takes 5-7 business days depending on your card issuer or bank.`
    : `This order was placed using Cash on Delivery, so no refund is necessary.`;

  const html = baseLayout(`Order ${order.order_ref} Cancelled`, `
    <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a;font-weight:700;">Order Cancelled</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
      Hi ${user.name ? user.name.split(' ')[0] : 'there'}, as requested, your order <strong>${order.order_ref}</strong> has been cancelled.
    </p>

    <!-- Cancellation details card -->
    <div style="background:#fce8e8;border:1px solid #f5c6c3;border-radius:12px;padding:20px;margin-bottom:28px;color:#c00;">
      <h3 style="margin:0 0 8px;font-size:15px;font-weight:700;">Cancellation Confirmation</h3>
      <p style="margin:0;font-size:14px;color:#555;line-height:1.6;">
        Order reference <strong>${order.order_ref}</strong> is now cancelled. We have stopped processing this shipment.
      </p>
    </div>

    <!-- Refund Info -->
    <div style="background:#fdf8f2;border-left:4px solid #B89B71;border-radius:0 8px 8px 0;padding:16px;margin-bottom:28px;">
      <p style="margin:0;font-size:14px;color:#1a1a1a;font-weight:600;line-height:1.5;">Refund & Payment Information</p>
      <p style="margin:6px 0 0;font-size:13px;color:#555;line-height:1.55;">${refundText}</p>
    </div>

    <p style="margin:0 0 20px;font-size:14px;color:#666;line-height:1.6;">
      We hope you will shop with us again soon. If you have any questions or did not request this cancellation, please contact our support team at <a href="mailto:support@kalyra.com" style="color:#B89B71;text-decoration:none;">support@kalyra.com</a>.
    </p>
  `);

  return sendEmail({ to: user.email, subject, html });
}

module.exports = { sendOtp, sendWelcomeEmail, sendPasswordReset, sendOrderConfirmation, sendOrderStatusUpdate, sendOrderCancellation };
