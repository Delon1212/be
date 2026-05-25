// public/js/pages/orders.js

async function loadOrders() {
    const user = getUser();
    if (!user) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/orders/user/${user.user_id}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const orders = await response.json();
        
        const container = document.getElementById('ordersContainer');
        if (!container) return;
        
        if (orders.length === 0) {
            container.innerHTML = `<div style="text-align:center;padding:3rem"><p>Belum ada pesanan</p><a href="/pages/products.html" class="btn btn-primary">Belanja Sekarang</a></div>`;
            return;
        }
        
        container.innerHTML = orders.map(order => `
            <div class="order-card">
                <div class="order-header">
                    <div>
                        <strong>${escapeHtml(order.order_number)}</strong><br>
                        <small>${new Date(order.created_at).toLocaleDateString('id-ID')}</small>
                    </div>
                    <span class="order-status status-${order.status}">${getStatusText(order.status)}</span>
                </div>
                <div id="items-${order.order_id}" class="order-items">
                    <div class="loading"><div class="spinner"></div><p>Memuat item...</p></div>
                </div>
                <div class="order-total">Total: ${formatRupiah(order.total_amount)}</div>
                ${order.status === 'pending' ? `<button class="btn btn-primary" onclick="confirmPayment('${order.order_id}')" style="margin-top:1rem;width:100%">💰 Konfirmasi Pembayaran</button>` : ''}
                ${order.status === 'paid' ? `<div style="margin-top:1rem;padding:0.5rem;background:#e8f5e9;border-radius:8px;text-align:center;color:#2e7d32;">⏳ Menunggu diproses admin</div>` : ''}
                ${order.status === 'delivered' ? `<div style="margin-top:1rem;padding:0.5rem;background:#e8f5e9;border-radius:8px;text-align:center;color:#2e7d32;">✅ Pesanan selesai. Terima kasih!</div>` : ''}
            </div>
        `).join('');
        
        // Load items untuk setiap order
        for (const order of orders) {
            await loadOrderItems(order.order_id);
        }
        
    } catch (error) {
        console.error('Error loading orders:', error);
        const container = document.getElementById('ordersContainer');
        if (container) {
            container.innerHTML = `<div class="error-state"><p>❌ Gagal memuat pesanan</p><button class="btn btn-secondary" onclick="loadOrders()">🔄 Coba Lagi</button></div>`;
        }
        showNotification('Gagal memuat pesanan!', 'error');
    }
}

async function loadOrderItems(orderId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const container = document.getElementById(`items-${orderId}`);
        
        if (container && data.items && data.items.length > 0) {
            container.innerHTML = data.items.map(item => `
                <div class="order-item">
                    <span>📦 ${escapeHtml(item.product_name)} <strong>x ${item.quantity}</strong></span>
                    <span>${formatRupiah(item.subtotal)}</span>
                </div>
            `).join('');
        } else if (container) {
            container.innerHTML = '<div class="order-item"><span>Tidak ada item</span><span>-</span></div>';
        }
    } catch (error) {
        console.error('Error loading order items:', error);
        const container = document.getElementById(`items-${orderId}`);
        if (container) {
            container.innerHTML = '<div class="order-item"><span>Error loading items</span><span>-</span></div>';
        }
    }
}

function getStatusText(status) {
    const map = { 
        pending: '⏳ Menunggu Pembayaran', 
        paid: '✅ Dibayar', 
        processing: '🔄 Diproses', 
        shipped: '📦 Dikirim', 
        delivered: '🎉 Selesai', 
        cancelled: '❌ Dibatalkan' 
    };
    return map[status] || status;
}

function confirmPayment(orderId) {
    if (!orderId) {
        showNotification('Order ID tidak valid!', 'error');
        return;
    }
    window.location.href = `/pages/payment-confirmation.html?order_id=${orderId}`;
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

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadOrders();
    updateCartCount();
});