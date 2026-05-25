// public/js/pages/cart-page.js

let currentCart = [];
let currentShippingCost = 0;
let currentSubtotal = 0;

// Load cart page (async untuk database)
async function loadCartPage() {
    currentCart = await getCart();
    const container = document.getElementById('cartContainer');
    const summaryContainer = document.getElementById('cartSummary');
    
    if (!container) return;
    
    if (currentCart.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:3rem;">
            <p>🛒 Keranjang kosong</p>
            <a href="/pages/products.html" class="btn btn-primary">Belanja Sekarang</a>
        </div>`;
        if (summaryContainer) summaryContainer.innerHTML = '';
        return;
    }
    
    // Tampilkan cart dengan cart_id sebagai identifier
    container.innerHTML = currentCart.map((item) => `
        <div class="cart-item" data-cart-id="${item.cart_id}">
            <div class="cart-item-info">
                <h4>${escapeHtml(item.name)}</h4>
                <p class="cart-item-price">${formatRupiah(item.price)}</p>
                <small class="cart-item-stock">Stok: ${item.stock}</small>
            </div>
            <div class="cart-item-actions">
                <button class="btn btn-secondary" onclick="updateQty('${item.cart_id}', ${item.quantity - 1}, ${item.stock}, '${item.id}')">-</button>
                <span class="cart-item-quantity">${item.quantity}</span>
                <button class="btn btn-secondary" onclick="updateQty('${item.cart_id}', ${item.quantity + 1}, ${item.stock}, '${item.id}')">+</button>
                <button class="btn btn-danger" onclick="removeItem('${item.cart_id}')">Hapus</button>
            </div>
        </div>
    `).join('');
    
    // Hitung subtotal
    currentSubtotal = currentCart.reduce((s, i) => s + (i.price * i.quantity), 0);
    
    // Tampilkan ringkasan sementara
    summaryContainer.innerHTML = `
        <div class="cart-summary">
            <h3>🛍️ Ringkasan Belanja</h3>
            <div class="summary-row">
                <span>Subtotal</span>
                <span id="cartSubtotal">${formatRupiah(currentSubtotal)}</span>
            </div>
            <div class="summary-row">
                <span>Ongkos Kirim</span>
                <span id="cartShipping">Menghitung...</span>
            </div>
            <hr>
            <div class="summary-row total">
                <span>Total</span>
                <span id="cartTotal">${formatRupiah(currentSubtotal)}</span>
            </div>
            <button class="btn btn-primary checkout-btn" onclick="checkoutPage()">
                ✅ Lanjut ke Checkout
            </button>
            <a class="shopee shopee-primary" href="https://id.shp.ee/pFmznLes">masuk ke shopee</a>
        </div>
    `;
    
    // Hitung ongkir berdasarkan provinsi user
    await calculateShippingForCart();
}

// Hitung ongkir untuk tampilan di keranjang
async function calculateShippingForCart() {
    const user = getUser();
    if (!user) return;
    
    const province = user.provinsi;
    
    if (!province) {
        const shippingElement = document.getElementById('cartShipping');
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
            
            const shippingElement = document.getElementById('cartShipping');
            const totalElement = document.getElementById('cartTotal');
            
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
        }
    } catch (error) {
        console.error('Error calculating shipping for cart:', error);
        const shippingElement = document.getElementById('cartShipping');
        if (shippingElement) {
            shippingElement.innerHTML = '<span style="color:#e74c3c">Gagal hitung ongkir</span>';
        }
    }
}

// Update quantity (menggunakan cart_id dari database)
async function updateQty(cartId, newQty, stock, productId) {
    if (newQty < 1) {
        const confirmDelete = confirm('Yakin ingin menghapus item ini?');
        if (confirmDelete) {
            await removeItem(cartId);
        }
        return;
    }
    
    if (newQty > stock) {
        showNotification(`Stok tidak mencukupi! Tersisa ${stock} pcs.`, 'error');
        return;
    }
    
    const success = await updateCartQuantity(cartId, newQty, stock, productId);
    if (success) {
        await loadCartPage(); // Reload halaman cart (akan menghitung ulang ongkir)
        updateCartCount();
    }
}

// Remove item dari cart
async function removeItem(cartId) {
    const success = await removeFromCart(cartId);
    if (success) {
        await loadCartPage();
        updateCartCount();
        showNotification('Item berhasil dihapus', 'success');
    }
}

// Fungsi checkout
async function checkoutPage() {
    const cart = await getCart();
    if (cart.length === 0) {
        showNotification('Keranjang belanja kosong!', 'error');
        return;
    }
    window.location.href = '/pages/checkout.html';
}

// Clear all cart (opsional, untuk testing)
async function clearAllCart() {
    const confirmClear = confirm('Yakin ingin mengosongkan seluruh keranjang?');
    if (confirmClear) {
        await clearCart();
        await loadCartPage();
        updateCartCount();
        showNotification('Keranjang berhasil dikosongkan', 'success');
    }
}

// Escape HTML untuk keamanan
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Inisialisasi halaman
document.addEventListener('DOMContentLoaded', async () => {
    checkAuth();
    await loadCartPage();
    updateCartCount();
});

// Ekspos fungsi ke global
window.updateQty = updateQty;
window.removeItem = removeItem;
window.checkoutPage = checkoutPage;
window.clearAllCart = clearAllCart;