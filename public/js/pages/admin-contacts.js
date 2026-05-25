// public/js/pages/admin-contacts.js

let currentUser = null;

// Cek akses admin
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

// Load semua pesan kontak
async function loadContacts() {
    const container = document.getElementById('contactsList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Memuat pesan...</p></div>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/contacts?user_id=${currentUser.user_id}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const contacts = await response.json();
        displayContacts(contacts);
        updateStats(contacts);
        
    } catch (error) {
        console.error('Error loading contacts:', error);
        container.innerHTML = '<div class="empty-state">❌ Gagal memuat pesan. Silakan refresh halaman.</div>';
    }
}

// Update statistik
function updateStats(contacts) {
    const unread = contacts.filter(c => c.status === 'unread').length;
    const unreadEl = document.getElementById('unreadCount');
    const totalEl = document.getElementById('totalCount');
    
    if (unreadEl) unreadEl.innerHTML = `${unread} Belum dibaca`;
    if (totalEl) totalEl.innerHTML = `${contacts.length} Total`;
}

// Tampilkan daftar pesan
function displayContacts(contacts) {
    const container = document.getElementById('contactsList');
    
    if (!container) return;
    
    if (contacts.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i>📭 Belum ada pesan masuk</div>';
        return;
    }
    
    container.innerHTML = contacts.map(contact => `
        <div class="contact-card ${contact.status}" id="contact-${contact.id}">
            <div class="contact-header">
                <div class="contact-info">
                    <h3><i class="fas fa-user"></i> ${escapeHtml(contact.name)}</h3>
                    <p><i class="fas fa-envelope"></i> ${escapeHtml(contact.email)}</p>
                    <p><i class="fas fa-clock"></i> ${formatDate(contact.created_at)}</p>
                </div>
                <div>
                    <span class="contact-status status-${contact.status}">
                        ${getStatusText(contact.status)}
                    </span>
                </div>
            </div>
            <div class="contact-message">
                <i class="fas fa-comment" style="color: #c5a059; margin-right: 8px;"></i>
                ${escapeHtml(contact.message)}
            </div>
            <div class="contact-actions">
                ${contact.status === 'unread' ? `<button class="btn-sm btn-sm-primary" onclick="markAsRead(${contact.id})"><i class="fas fa-check"></i> Tandai Dibaca</button>` : ''}
                ${contact.status !== 'replied' ? `<button class="btn-sm btn-sm-secondary" onclick="replyToContact(${contact.id}, '${escapeHtml(contact.email)}', '${escapeHtml(contact.name)}')"><i class="fas fa-reply"></i> Balas Email</button>` : ''}
                <button class="btn-sm btn-sm-danger" onclick="deleteContact(${contact.id})"><i class="fas fa-trash"></i> Hapus</button>
            </div>
        </div>
    `).join('');
}

// Dapatkan teks status
function getStatusText(status) {
    const statusMap = {
        'unread': 'Belum dibaca',
        'read': 'Sudah dibaca',
        'replied': 'Sudah dibalas'
    };
    return statusMap[status] || status;
}

// Tandai pesan sebagai sudah dibaca
async function markAsRead(contactId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/contacts/${contactId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                status: 'read',
                user_id: currentUser.user_id 
            })
        });
        
        if (response.ok) {
            showNotification('✅ Pesan ditandai sudah dibaca', 'success');
            loadContacts();
        } else {
            const data = await response.json();
            showNotification(data.error || 'Gagal mengupdate status', 'error');
        }
    } catch (error) {
        console.error('Error marking as read:', error);
        showNotification('Terjadi kesalahan!', 'error');
    }
}

// Balas email
function replyToContact(contactId, email, name) {
    const subject = encodeURIComponent(`Balasan dari Delon Store - Pesan Anda telah kami terima`);
    const body = encodeURIComponent(`Halo ${name},

Terima kasih telah menghubungi Delon Store.

Kami telah menerima pesan Anda dan akan segera merespon.

Salam,
Delon Store

---
Email ini dikirim secara otomatis dari sistem.`);
    
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    
    // Update status menjadi replied
    fetch(`${API_BASE_URL}/api/contacts/${contactId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            status: 'replied',
            user_id: currentUser.user_id 
        })
    }).then(() => {
        setTimeout(() => loadContacts(), 1000);
    }).catch(err => console.error(err));
}

// Hapus pesan
async function deleteContact(contactId) {
    if (!confirm('Yakin ingin menghapus pesan ini? Tindakan ini tidak dapat dibatalkan.')) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/contacts/${contactId}?user_id=${currentUser.user_id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('🗑 Pesan berhasil dihapus', 'success');
            loadContacts();
        } else {
            const data = await response.json();
            showNotification(data.error || 'Gagal menghapus pesan', 'error');
        }
    } catch (error) {
        console.error('Error deleting contact:', error);
        showNotification('Terjadi kesalahan!', 'error');
    }
}

// Format tanggal
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Ekspos fungsi ke global
window.markAsRead = markAsRead;
window.replyToContact = replyToContact;
window.deleteContact = deleteContact;

// Inisialisasi
document.addEventListener('DOMContentLoaded', async () => {
    const isAdmin = await checkAdminAccess();
    if (!isAdmin) return;
    
    loadContacts();
    updateCartCount();
    
    if (typeof updateUIByRole === 'function') {
        updateUIByRole();
    }
});