// Checkout logic

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verify Authentication
    if (!KalyraToken.isLoggedIn()) {
        // Must be logged in to checkout (simplified flow)
        showToast('Please log in to checkout', 'error');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        return;
    }

    // 2. Load Cart
    const items = KalyraCart.getLocal();
    if (!items || items.length === 0) {
        showToast('Your cart is empty', 'error');
        setTimeout(() => {
            window.location.href = 'shop.html';
        }, 2000);
        return;
    }

    // 3. Render Order Summary
    const itemsContainer = document.getElementById('checkout-items');
    let subtotal = 0;
    
    itemsContainer.innerHTML = '';
    items.forEach(item => {
        // Product price * quantity. 
        // Note: product price should be stored in cart or fetched, assuming KalyraCart stores it.
        // Fallback to 0 if not present, but real app should fetch from API to verify.
        const price = item.price || 0;
        const lineTotal = price * item.quantity;
        subtotal += lineTotal;

        const row = document.createElement('div');
        row.className = 'checkout-item-row';
        row.innerHTML = `
            <span>${item.name || 'Product ' + item.product_id} x ${item.quantity}</span>
            <span>${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(lineTotal)}</span>
        `;
        itemsContainer.appendChild(row);
    });

    document.getElementById('summary-subtotal').textContent = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(subtotal);
    document.getElementById('summary-total').textContent = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(subtotal);

    // 4. Handle Place Order
    document.getElementById('place-order-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        const btn = e.target;
        const errorEl = document.getElementById('checkout-error');
        errorEl.style.display = 'none';

        // Validate form
        const line1 = document.getElementById('address-line1').value.trim();
        const city = document.getElementById('address-city').value.trim();
        const state = document.getElementById('address-state').value.trim();
        const zip = document.getElementById('address-zip').value.trim();
        const country = document.getElementById('address-country').value;
        
        if (!line1 || !city || !state || !zip) {
            errorEl.textContent = 'Please fill in all required shipping fields.';
            errorEl.style.display = 'block';
            return;
        }

        // Get selected payment method
        const paymentMethod = document.querySelector('input[name="payment_method"]:checked').value;

        btn.disabled = true;
        btn.textContent = 'Processing...';

        try {
            // First, save the address
            const addressRes = await fetch('http://localhost:3000/api/v1/user/addresses', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${KalyraToken.get()}`
                },
                body: JSON.stringify({
                    label: 'Home',
                    line1,
                    city,
                    state,
                    postal_code: zip,
                    country
                })
            });
            const addressData = await addressRes.json();
            
            if (!addressData.success) {
                throw new Error(addressData.message || 'Failed to save address');
            }

            const addressId = addressData.data.id;

            // Prepare order items
            const orderItems = items.map(i => ({
                product_id: i.product_id,
                quantity: i.quantity,
                size: i.size,
                color: i.color
            }));

            // Create Order
            const orderRes = await fetch('http://localhost:3000/api/v1/orders', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${KalyraToken.get()}`
                },
                body: JSON.stringify({
                    items: orderItems,
                    address_id: addressId,
                    payment_method: paymentMethod
                })
            });
            const orderData = await orderRes.json();

            if (orderData.success) {
                if (paymentMethod !== 'cod') {
                    // Initialize Razorpay
                    const initRes = await fetch('http://localhost:3000/api/v1/payments/initiate', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${KalyraToken.get()}`
                        },
                        body: JSON.stringify({
                            order_id: orderData.data.order.id
                        })
                    });
                    const initData = await initRes.json();

                    if (!initData.success) {
                        throw new Error(initData.message || 'Failed to initiate payment');
                    }

                    const options = {
                        key: initData.data.key_id,
                        amount: initData.data.amount,
                        currency: initData.data.currency,
                        name: "Kalyra",
                        description: "Order " + initData.data.order_ref,
                        order_id: initData.data.razorpay_order_id,
                        prefill: initData.data.prefill,
                        handler: async function (response) {
                            try {
                                const verifyRes = await fetch('http://localhost:3000/api/v1/payments/webhook', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${KalyraToken.get()}`
                                    },
                                    body: JSON.stringify({
                                        razorpay_order_id: response.razorpay_order_id,
                                        razorpay_payment_id: response.razorpay_payment_id,
                                        razorpay_signature: response.razorpay_signature
                                    })
                                });
                                const verifyData = await verifyRes.json();
                                if (verifyData.success) {
                                    await KalyraCart.clear();
                                    showToast('Payment successful!', 'success');
                                    setTimeout(() => { window.location.href = 'profile.html'; }, 2000);
                                } else {
                                    throw new Error(verifyData.message || 'Payment verification failed');
                                }
                            } catch (err) {
                                console.error(err);
                                showToast(err.message || 'Payment verification failed', 'error');
                                btn.disabled = false;
                                btn.textContent = 'Place Order';
                            }
                        },
                        modal: {
                            ondismiss: function() {
                                KalyraCart.clear().then(() => {
                                    showToast('Payment cancelled. You can complete it from your profile.', 'error');
                                    setTimeout(() => { window.location.href = 'profile.html'; }, 2000);
                                });
                            }
                        }
                    };
                    const rzp = new window.Razorpay(options);
                    rzp.on('payment.failed', function (response){
                        showToast(response.error.description || 'Payment failed', 'error');
                        btn.disabled = false;
                        btn.textContent = 'Place Order';
                    });
                    rzp.open();
                } else {
                    // COD flow
                    await KalyraCart.clear();
                    showToast('Order placed successfully!', 'success');
                    setTimeout(() => {
                        window.location.href = 'profile.html'; // Or order success page
                    }, 2000);
                }
            } else {
                throw new Error(orderData.message || 'Failed to place order');
            }

        } catch (err) {
            console.error(err);
            errorEl.textContent = err.message || 'An error occurred while placing your order. Please try again.';
            errorEl.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Place Order';
        }
    });
});
