// public/js/pages/admin.js

let allOrders = [];
let currentFilter = 'all';
let currentUser = null;

// Cek apakah user adalah admin
async function checkAdminAccess() {
    currentUser = getUser();
    if (!currentUser) {
        window.location.href = '/pages/login.html';
        return false;
    }
    
    if (currentUser.role !== 'admin') {
        showNotification('⛔ Akses ditolak! Halaman ini hanya untuk admin.', 'error');
        setTimeout(() => {
            window.location.href = '/';
        }, 1500);
        return false;
    }
    
    return true;
}

// Load semua pesanan
async function loadOrders() {
    const tbody = document.getElementById('ordersBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center"><div class="loading-spinner"></div><p>Memuat data...</p></td></tr>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/orders?user_id=${currentUser.user_id}`);
        
        if (response.status === 403) {
            showNotification('Akses ditolak! Anda bukan admin.', 'error');
            window.location.href = '/';
            return;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const orders = await response.json();
        console.log('Orders loaded:', orders.length);
        
        allOrders = orders;
        updateStats(orders);
        displayOrders(orders);
        
    } catch (error) {
        console.error('Error loading orders:', error);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">❌ Gagal memuat data</td></tr>';
    }
}

// Update statistik
function updateStats(orders) {
    const total = orders.length;
    const pending = orders.filter(o => o.status === 'pending').length;
    const paid = orders.filter(o => o.status === 'paid').length;
    const processing = orders.filter(o => o.status === 'processing').length;
    const shipped = orders.filter(o => o.status === 'shipped').length;
    const delivered = orders.filter(o => o.status === 'delivered').length;
    
    const totalEl = document.getElementById('totalOrders');
    const pendingEl = document.getElementById('pendingOrders');
    const paidEl = document.getElementById('paidOrders');
    const processingEl = document.getElementById('processingOrders');
    const shippedEl = document.getElementById('shippedOrders');
    const deliveredEl = document.getElementById('deliveredOrders');
    
    if (totalEl) totalEl.textContent = total;
    if (pendingEl) pendingEl.textContent = pending;
    if (paidEl) paidEl.textContent = paid;
    if (processingEl) processingEl.textContent = processing;
    if (shippedEl) shippedEl.textContent = shipped;
    if (deliveredEl) deliveredEl.textContent = delivered;
}

// Filter berdasarkan status (dipanggil dari stat card)
function filterByStatus(status) {
    const filterBtn = document.querySelector(`.filter-btn[data-status="${status}"]`);
    if (filterBtn) {
        filterBtn.click();
    }
}

// Tampilkan pesanan di tabel
function displayOrders(orders) {
    const tbody = document.getElementById('ordersBody');
    if (!tbody) return;
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">📭 Tidak ada pesanan</td></tr>';
        return;
    }
    
    tbody.innerHTML = orders.map(order => `
        <tr data-order-id="${order.order_id}">
            <td><strong>${order.order_number || order.order_id}</strong></td>
            <td>${formatDate(order.created_at)}</td>
            <td id="user-${order.user_id}">Loading...</td>
            <td>${formatRupiah(order.total_amount)}</td>
            <td>
                <select class="status-select" onchange="updateOrderStatus('${order.order_id}', this.value)">
                    <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>⏳ Menunggu Bayar</option>
                    <option value="paid" ${order.status === 'paid' ? 'selected' : ''}>✅ Dibayar</option>
                    <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>🔄 Diproses</option>
                    <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>📦 Dikirim</option>
                    <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>🎉 Selesai</option>
                    <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>❌ Dibatalkan</option>
                </select>
            </td>
            <td id="payment-status-${order.order_id}">Loading...</td>
            <td id="payment-image-${order.order_id}">-</td>
            <td>
                <button class="btn-icon btn-view" onclick="toggleDetail('${order.order_id}')" title="Lihat Detail">📋</button>
            </td>
        </tr>
        <tr id="detail-${order.order_id}" class="detail-row">
            <td colspan="8">
                <div class="detail-content" id="detail-content-${order.order_id}">
                    <div class="loading-spinner"></div>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Load data untuk setiap order
    orders.forEach(order => {
        loadUserInfo(order.user_id);
        loadPaymentInfo(order.order_id);
        loadOrderDetail(order.order_id);
    });
}

// Load info user
async function loadUserInfo(userId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/users/${userId}`);
        const user = await response.json();
        const userCell = document.getElementById(`user-${userId}`);
        if (userCell) {
            userCell.innerHTML = `
                <div>
                    <strong>${escapeHtml(user.full_name || user.username)}</strong><br>
                    <small style="color:#666">${escapeHtml(user.email)}</small>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading user:', error);
        const userCell = document.getElementById(`user-${userId}`);
        if (userCell) userCell.innerHTML = '<span style="color:#999">User not found</span>';
    }
}

// Load info pembayaran
async function loadPaymentInfo(orderId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/payment-confirmations/order/${orderId}`);
        const payments = await response.json();
        
        const statusCell = document.getElementById(`payment-status-${orderId}`);
        const imageCell = document.getElementById(`payment-image-${orderId}`);
        
        if (payments.length > 0) {
            const payment = payments[0];
            const statusClass = payment.status === 'pending' ? 'status-pending' : 
                               payment.status === 'verified' ? 'status-paid' : 'status-cancelled';
            const statusText = payment.status === 'pending' ? 'Menunggu Verifikasi' :
                              payment.status === 'verified' ? 'Terverifikasi' : 'Ditolak';
            
            if (statusCell) {
                statusCell.innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;
            }
            
            if (imageCell && payment.bukti_transfer) {
                imageCell.innerHTML = `<img src="/uploads/${payment.bukti_transfer}" class="payment-image" onclick="showImageModal('/uploads/${payment.bukti_transfer}')">`;
            }
        } else {
            if (statusCell) statusCell.innerHTML = '<span class="status-badge status-pending">Belum Konfirmasi</span>';
            if (imageCell) imageCell.innerHTML = '-';
        }
    } catch (error) {
        console.error('Error loading payment:', error);
    }
}

// Load detail order
// Load detail order - DIPERBAIKI
async function loadOrderDetail(orderId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}`);
        const data = await response.json();
        const detailDiv = document.getElementById(`detail-content-${orderId}`);
        
        if (detailDiv && data.items && data.items.length > 0) {
            // Format alamat dengan lebih baik
            const addressLines = [];
            if (data.order.address) addressLines.push(data.order.address);
            if (data.order.kota) addressLines.push(data.order.kota);
            if (data.order.provinsi) addressLines.push(data.order.provinsi);
            if (data.order.kode_pos) addressLines.push(data.order.kode_pos);
            
            const addressHtml = addressLines.length > 0 
                ? addressLines.join(', ')
                : '<span style="color: #e74c3c;">⚠️ Alamat tidak tersedia</span>';
            
            detailDiv.innerHTML = `
                <h4>📦 Detail Pesanan #${data.order.order_number || orderId}</h4>
                <table class="items-table">
                    <thead>
                        <tr><th>Produk</th><th>Jumlah</th><th>Harga</th><th>Subtotal</th></tr>
                    </thead>
                    <tbody>
                        ${data.items.map(item => `
                            <tr>
                                <td>${escapeHtml(item.product_name)}</td>
                                <td>${item.quantity}</td>
                                <td>${formatRupiah(item.price_per_item)}</td>
                                <td>${formatRupiah(item.subtotal)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="address-info" style="background: #f1f5f9; padding: 1rem; border-radius: 8px; margin-top: 1rem;">
                    <strong>📍 Alamat Pengiriman:</strong><br>
                    ${addressHtml}
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading order detail:', error);
        const detailDiv = document.getElementById(`detail-content-${orderId}`);
        if (detailDiv) {
            detailDiv.innerHTML = '<p style="color:#e74c3c">❌ Gagal memuat detail pesanan</p>';
        }
    }
}
// Update status pesanan
async function updateOrderStatus(orderId, newStatus) {
    if (!currentUser) {
        showNotification('Silakan login terlebih dahulu!', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                status: newStatus,
                user_id: currentUser.user_id 
            })
        });
        
        if (response.ok) {
            showNotification(`✅ Status pesanan berhasil diubah`, 'success');
            refreshData();
        } else {
            const data = await response.json();
            showNotification(data.error || 'Gagal mengubah status', 'error');
            refreshData();
        }
    } catch (error) {
        console.error('Error updating status:', error);
        showNotification('Error server!', 'error');
        refreshData();
    }
}

// Toggle detail row
function toggleDetail(orderId) {
    const detailRow = document.getElementById(`detail-${orderId}`);
    if (detailRow) {
        detailRow.classList.toggle('show');
    }
}

// Tampilkan modal gambar
function showImageModal(src) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    if (modal && modalImg) {
        modal.style.display = 'flex';
        modalImg.src = src;
    }
}

// Tutup modal
function closeModal() {
    const modal = document.getElementById('imageModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Filter pesanan
function filterOrders(status) {
    currentFilter = status;
    const filtered = status === 'all' ? allOrders : allOrders.filter(o => o.status === status);
    displayOrders(filtered);
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.status === status) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Refresh data
function refreshData() {
    loadOrders();
}

// Format tanggal
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

// Escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Event listener untuk filter
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        filterOrders(btn.dataset.status);
    });
});

// Ekspos fungsi ke global
window.updateOrderStatus = updateOrderStatus;
window.toggleDetail = toggleDetail;
window.showImageModal = showImageModal;
window.closeModal = closeModal;
window.filterByStatus = filterByStatus;
window.refreshData = refreshData;

// Inisialisasi
document.addEventListener('DOMContentLoaded', async () => {
    const isAdmin = await checkAdminAccess();
    if (!isAdmin) return;
    
    await loadOrders();
    updateCartCount();
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
});
