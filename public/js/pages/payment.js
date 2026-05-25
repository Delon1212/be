// public/js/pages/payment.js

let orderData = null;

function getOrderId() {
    return new URLSearchParams(window.location.search).get('order_id');
}

function salinTeks(teks, tombol) {
    navigator.clipboard.writeText(teks).then(() => {
        const teksAsli = tombol.innerText;
        tombol.innerText = '✅ Tersalin';
        tombol.style.background = '#28a745';
        setTimeout(() => {
            tombol.innerText = teksAsli;
            tombol.style.background = '#d4af37';
        }, 1200);
    });
}


// Load data user ke form
function loadUserData() {
    const user = getUser();
    if (!user) return;
    
    console.log('Loading user data for payment:', user);
    
    // Isi nama pengirim dengan nama user
    const namaPengirimField = document.getElementById('nama_pengirim');
    if (namaPengirimField) {
        namaPengirimField.value = user.full_name || user.username || '';
    }
    
    // Tampilkan info user
    const userInfoDiv = document.getElementById('userInfo');
    if (userInfoDiv) {
        userInfoDiv.innerHTML = `
            <div style="background: rgba(212, 175, 55, 0.1); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <p><strong>👤 Pembayaran atas nama:</strong> ${escapeHtml(user.full_name || user.username)}</p>
                <p><strong>📧 Email:</strong> ${escapeHtml(user.email)}</p>
                <p><strong>📱 Telepon:</strong> ${escapeHtml(user.phone || 'Belum diisi')}</p>
            </div>
        `;
    }
}

// Load detail order
async function loadOrderDetail() {
    const orderId = getOrderId();
    if (!orderId) {
        showNotification('Order ID tidak ditemukan!', 'error');
        setTimeout(() => window.location.href = '/pages/orders.html', 1500);
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}`);
        const data = await response.json();
        
        if (response.ok && data.order) {
            orderData = data;
            document.getElementById('order_id').value = orderId;
            document.getElementById('total_bayar').value = formatRupiah(data.order.total_amount);
            document.getElementById('jumlah_transfer').value = data.order.total_amount;
            document.getElementById('tanggal_transfer').value = new Date().toISOString().split('T')[0];
            
            // Tampilkan deadline
            const expiresAt = new Date(data.order.expires_at);
            const deadlineDiv = document.getElementById('deadlineInfo');
            if (deadlineDiv) {
                deadlineDiv.innerHTML = `
                    <div style="background: rgba(212, 175, 55, 0.1); padding: 0.8rem; border-radius: 8px; margin-bottom: 1rem; border-left: 4px solid #ffc107;">
                        <p><strong>⏰ Batas Pembayaran:</strong> ${expiresAt.toLocaleString('id-ID')}</p>
                        <p><small style="color: #856404;">⚠️ Jika melebihi batas waktu, pesanan akan otomatis dibatalkan!</small></p>
                    </div>
                `;
            }
        } else {
            showNotification('Order tidak ditemukan!', 'error');
            setTimeout(() => window.location.href = '/pages/orders.html', 1500);
        }
    } catch (error) {
        console.error('Error loading order:', error);
        showNotification('Gagal memuat detail order!', 'error');
    }
}

// Preview bukti transfer
function previewBuktiTransfer(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('buktiPreview');
            if (preview) {
                preview.innerHTML = `<img src="${e.target.result}" style="max-width: 100%; max-height: 200px; margin-top: 0.5rem; border-radius: 8px;">`;
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// Submit payment confirmation
async function submitPayment(e) {
    e.preventDefault();
    
    const user = getUser();
    if (!user) {
        showNotification('Silakan login terlebih dahulu!', 'error');
        window.location.href = '/pages/login.html';
        return;
    }
    
    const orderId = getOrderId();
    if (!orderId) {
        showNotification('Order ID tidak ditemukan!', 'error');
        return;
    }
    
    // Ambil data form
    const nama_pengirim = document.getElementById('nama_pengirim')?.value.trim();
    const bank_pengirim = document.getElementById('bank_pengirim')?.value;
    const jumlah_transfer = document.getElementById('jumlah_transfer')?.value;
    const tanggal_transfer = document.getElementById('tanggal_transfer')?.value;
    const bukti_transfer = document.getElementById('bukti_transfer')?.files[0];
    
    // Validasi
    if (!nama_pengirim) {
        showNotification('Nama pengirim harus diisi!', 'error');
        return;
    }
    if (!bank_pengirim) {
        showNotification('Bank pengirim harus dipilih!', 'error');
        return;
    }
    if (!jumlah_transfer || jumlah_transfer <= 0) {
        showNotification('Jumlah transfer tidak valid!', 'error');
        return;
    }
    if (!tanggal_transfer) {
        showNotification('Tanggal transfer harus diisi!', 'error');
        return;
    }
    if (!bukti_transfer) {
        showNotification('Bukti transfer harus diunggah!', 'error');
        return;
    }
    
    // Validasi file
    if (bukti_transfer.size > 10 * 1024 * 1024) {
        showNotification('Ukuran file maksimal 10MB!', 'error');
        return;
    }
    
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(bukti_transfer.type)) {
        showNotification('Format file harus JPG, JPEG, atau PNG!', 'error');
        return;
    }
    
    // Siapkan FormData
    const formData = new FormData();
    formData.append('order_id', orderId);
    formData.append('user_id', user.user_id);
    formData.append('nama_pengirim', nama_pengirim);
    formData.append('bank_pengirim', bank_pengirim);
    formData.append('jumlah_transfer', jumlah_transfer);
    formData.append('tanggal_transfer', tanggal_transfer);
    formData.append('total_belanja', orderData?.order?.total_amount || '0');
    formData.append('items', JSON.stringify(orderData?.items || []));
    formData.append('bukti_transfer', bukti_transfer);
    
    // Disable button
    const submitBtn = document.querySelector('#paymentForm button[type="submit"]');
    const originalText = submitBtn?.innerHTML;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Mengirim...';
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/payment-confirmations`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('✅ Konfirmasi pembayaran berhasil dikirim!');
            setTimeout(() => {
                window.location.href = '/pages/orders.html';
            }, 2000);
        } else {
            showNotification(data.error || 'Gagal mengirim konfirmasi!', 'error');
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

// Event listeners
document.getElementById('paymentForm')?.addEventListener('submit', submitPayment);
document.getElementById('bukti_transfer')?.addEventListener('change', function() {
    previewBuktiTransfer(this);
});

// Inisialisasi
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadUserData();      // Load data user ke form
    loadOrderDetail();   // Load detail order
    updateCartCount();   // Update keranjang
});