// public/js/pages/checkout.js

let currentShippingCost = 0;
let currentSubtotal = 0;
let currentCart = [];

// Tampilkan ringkasan pesanan
async function displayOrderSummary() {
    try {
        // Ambil cart dari database/user (bukan dari session)
        currentCart = await getCart();
        const container = document.getElementById('orderSummary');
        
        if (!container) return;
        
        currentSubtotal = currentCart.reduce((s, i) => s + (i.price * i.quantity), 0);
        
        if (currentCart.length === 0) {
            container.innerHTML = '<p style="text-align:center">🛒 Keranjang kosong</p>';
            document.getElementById('shippingInfo')?.remove();
            return;
        }
        
        // Tampilkan ringkasan
        container.innerHTML = `
            ${currentCart.map((item) => `
                <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem">
                    <span>${escapeHtml(item.name)} x ${item.quantity}</span>
                    <span>${formatRupiah(item.price * item.quantity)}</span>
                </div>
            `).join('')}
            <hr>
            <div style="display:flex; justify-content:space-between; margin:0.5rem 0">
                <span>Subtotal</span>
                <span id="subtotalAmount">${formatRupiah(currentSubtotal)}</span>
            </div>
            <div style="display:flex; justify-content:space-between" id="shippingRow">
                <span>Ongkos Kirim</span>
                <span id="shippingAmount">Menghitung...</span>
            </div>
            <hr>
            <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:1.2rem">
                <span>Total</span>
                <span id="totalAmount">${formatRupiah(currentSubtotal)}</span>
            </div>
        `;
        
        // Hitung ongkir setelah cart ditampilkan
        await calculateShippingFromUser();
        
    } catch (error) {
        console.error('Error in displayOrderSummary:', error);
        document.getElementById('orderSummary').innerHTML = '<p style="color:red">Error loading cart</p>';
    }
}

// Hitung ongkir dari data user
async function calculateShippingFromUser() {
    const user = getUser();
    if (!user) return;
    
    const province = user.provinsi;
    
    if (!province) {
        const shippingElement = document.getElementById('shippingAmount');
        if (shippingElement) {
            shippingElement.innerHTML = '<span style="color: #e74c3c;">Lengkapi provinsi di profil</span>';
        }
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/shipping/calculate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ province, total_amount: currentSubtotal })
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentShippingCost = result.data.shipping_cost;
            
            const shippingElement = document.getElementById('shippingAmount');
            const totalElement = document.getElementById('totalAmount');
            
            if (shippingElement) {
                if (result.data.is_free) {
                    shippingElement.innerHTML = '<span style="color: #27ae60;">Gratis Ongkir! 🎉</span>';
                } else if (result.data.discount_percent > 0) {
                    shippingElement.innerHTML = `${formatRupiah(result.data.shipping_cost)} <small style="color:#27ae60">(Diskon ${result.data.discount_percent}%)</small>`;
                } else {
                    shippingElement.innerHTML = formatRupiah(result.data.shipping_cost);
                }
            }
            
            const total = currentSubtotal + currentShippingCost;
            if (totalElement) {
                totalElement.innerHTML = formatRupiah(total);
            }
            
            showShippingInfo(result.data);
        }
    } catch (error) {
        console.error('Error calculating shipping:', error);
        const shippingElement = document.getElementById('shippingAmount');
        if (shippingElement) {
            shippingElement.innerHTML = '<span style="color:#e74c3c">Gagal hitung ongkir</span>';
        }
    }
}

// Tampilkan info ongkir
function showShippingInfo(shippingData) {
    let infoDiv = document.getElementById('shippingInfo');
    if (!infoDiv) {
        const summaryDiv = document.querySelector('.cart-summary');
        if (summaryDiv) {
            infoDiv = document.createElement('div');
            infoDiv.id = 'shippingInfo';
            const button = summaryDiv.querySelector('.btn-primary');
            if (button) summaryDiv.insertBefore(infoDiv, button);
            else summaryDiv.appendChild(infoDiv);
        }
    }
    
    if (!infoDiv) return;
    
    let statusClass = '';
    let discountHtml = '';
    
    if (shippingData.is_free) {
        statusClass = 'free';
        discountHtml = '<p>✨ Selamat! Anda mendapatkan GRATIS ONGKIR ✨</p>';
    } else if (shippingData.discount_percent > 0) {
        statusClass = 'discount';
        discountHtml = `<p>🎉 Diskon ongkir ${shippingData.discount_percent}% 🎉</p>`;
    }
    
    infoDiv.innerHTML = `
        <div class="shipping-info-card ${statusClass}">
            <p><strong>🚚 Zona Pengiriman:</strong> ${shippingData.zone_name}</p>
            <p><strong>⏱️ Estimasi Tiba:</strong> ${shippingData.estimated_days}</p>
            <p><strong>📍 Berdasarkan alamat:</strong> ${getUser()?.provinsi || '-'}</p>
            ${discountHtml}
            <small style="color:#666">*Ongkir dihitung berdasarkan provinsi di profil Anda</small>
        </div>
    `;
}

// Load data user ke form alamat
function loadUserAddress() {
    const user = getUser();
    if (!user) return;
    
    const addressField = document.getElementById('address');
    const provinceField = document.getElementById('province');
    const cityField = document.getElementById('city');
    const postalCodeField = document.getElementById('postalCode');
    
    if (addressField && user.address) addressField.value = user.address;
    if (provinceField && user.provinsi) {
        provinceField.value = user.provinsi;
        provinceField.readOnly = true;
        provinceField.style.backgroundColor = 'none';
    }
    if (cityField && user.kota) cityField.value = user.kota;
    if (postalCodeField && user.kode_pos) postalCodeField.value = user.kode_pos;
    
    const userInfo = document.getElementById('userInfo');
    if (userInfo) {
        userInfo.innerHTML = `
            <div style="background: none ; padding: 0.8rem; border-radius: 8px; margin-bottom: 0.5rem;">
                <p><strong>👤 Checkout sebagai:</strong> ${escapeHtml(user.full_name || user.username)}</p>
                <p><strong>📧 Email:</strong> ${escapeHtml(user.email)}</p>
                <p><strong>📱 Telepon:</strong> ${escapeHtml(user.phone || 'Belum diisi')}</p>
                <p><strong>📍 Provinsi:</strong> ${escapeHtml(user.provinsi || 'Belum diisi')}</p>
                <p><small style="color:#666">*Ongkir dihitung berdasarkan provinsi di profil Anda</small></p>
            </div>
        `;
    }
}

// Proses checkout
async function processCheckout() {
    const user = getUser();
    
    // Ambil cart terbaru dari database
    const cart = await getCart();
    
    console.log('Cart items for checkout:', cart);
    
    if (!user) {
        showNotification('Silakan login terlebih dahulu!', 'error');
        window.location.href = '/pages/login.html';
        return;
    }
    
    if (!cart || cart.length === 0) {
        showNotification('Keranjang belanja kosong!', 'error');
        window.location.href = '/pages/cart.html';
        return;
    }
    
    // Ambil data dari form
    const address = document.getElementById('address')?.value.trim();
    const province = document.getElementById('province')?.value;
    const city = document.getElementById('city')?.value.trim();
    const postalCode = document.getElementById('postalCode')?.value.trim();
    
    if (!address) {
        showNotification('Alamat harus diisi!', 'error');
        document.getElementById('address')?.focus();
        return;
    }
    if (!province) {
        showNotification('Provinsi harus diisi!', 'error');
        return;
    }
    if (!city) {
        showNotification('Kota harus diisi!', 'error');
        document.getElementById('city')?.focus();
        return;
    }
    if (!postalCode) {
        showNotification('Kode pos harus diisi!', 'error');
        document.getElementById('postalCode')?.focus();
        return;
    }
    
    const subtotal = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
    const total = subtotal + currentShippingCost;
    
    const orderData = {
        user_id: user.user_id,
        total_amount: total,
        address: address,
        province: province,
        city: city,
        postalCode: postalCode,
        items: cart.map(item => ({
            product_id: item.id,
            product_name: item.name,
            price_per_item: item.price,
            quantity: item.quantity,
            subtotal: item.price * item.quantity
        }))
    };
    
    const submitBtn = document.querySelector('#checkoutForm button[type="submit"]');
    const originalText = submitBtn?.innerHTML;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Memproses...';
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(`✅ Pesanan berhasil dibuat! Batas bayar 24 jam.`, 'success');
            
            // Clear cart setelah checkout berhasil
            if (typeof clearCart === 'function') {
                await clearCart();
            }
            
            updateCartCount();
            
            setTimeout(() => {
                window.location.href = `/pages/payment-confirmation.html?order_id=${data.order_id}`;
            }, 2000);
        } else {
            showNotification(data.error || 'Gagal membuat pesanan!', 'error');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Terjadi kesalahan pada server!', 'error');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Inisialisasi
document.addEventListener('DOMContentLoaded', async () => {
    checkAuth();
    loadUserAddress();
    await displayOrderSummary();
    updateCartCount();
});

// Ekspos fungsi ke global
window.processCheckout = processCheckout;