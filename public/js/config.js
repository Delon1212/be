// Konfigurasi API
const API_BASE_URL = '';


const APP_CONFIG = {
    name: 'Delon Store',
    currency: 'Rp',
    shippingCost: 15000,
    freeShippingMin: 500000,
    discountShippingMin: 250000,
    discountPercent: 50,
    bankAccounts: [
        { bank: 'BCA', accountNumber: '1234567890', accountName: 'Delon Store' },
        { bank: 'Mandiri', accountNumber: '0987654321', accountName: 'Delon Store' },
        { bank: 'BRI', accountNumber: '1122334455', accountName: 'Delon Store' }
    ]
};

// Format Rupiah
function formatRupiah(angka) {
    if (angka === undefined || angka === null) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(angka);
}

// Notifikasi
function showNotification(message, type = 'success') {
    const oldNotifications = document.querySelectorAll('.notification');
    oldNotifications.forEach(notif => notif.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `<div>${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'} ${message}</div>`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// User management
function saveUser(userData) {
    if (!userData) return;
    localStorage.setItem('user', JSON.stringify(userData));
}

function getUser() {
    try {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    } catch (error) {
        console.error('Error parsing user data:', error);
        localStorage.removeItem('user');
        return null;
    }
}

function isLoggedIn() {
    return getUser() !== null;
}

function logout() {
    localStorage.removeItem('user');
    showNotification('Logout berhasil!');
    setTimeout(() => {
        window.location.href = '/pages/login.html';
    }, 1000);
}

// ============ HELPER GAMBAR (TIDAK TERGANTUNG VIA.PLACEHOLDER) ============

// Data URL placeholder (offline, tidak perlu koneksi internet)
const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="250" viewBox="0 0 300 250"%3E%3Crect width="300" height="250" fill="%23f0f0f0"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-family="Arial, sans-serif" font-size="14"%3ENo Image%3C/text%3E%3C/svg%3E';

// Get product image URL (single - untuk backward compatibility)
function getProductImageUrl(foto) {
    if (foto && foto.trim() !== '') {
        if (foto.startsWith('http')) return foto;
        return `/uploads/${foto}`;
    }
    return PLACEHOLDER_IMAGE;
}

// Get profile image URL
function getProfileImageUrl(user) {
    if (!user) return PLACEHOLDER_IMAGE;
    if (user.foto && user.foto.trim() !== '') {
        if (user.foto.startsWith('http')) return user.foto;
        return `/uploads/${user.foto}`;
    }
    const name = encodeURIComponent(user.full_name || user.username || 'User');
    return `https://ui-avatars.com/api/?background=c5a059&color=fff&name=${name}&size=100&rounded=true`;
}

// ============ HELPER MULTIPLE IMAGES ============

// Get all images for a product from API
async function getProductImages(productId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/products/${productId}/images`);
        const images = await response.json();
        return images;
    } catch (error) {
        console.error('Error fetching product images:', error);
        return [];
    }
}

// Get primary image from images array
function getPrimaryImage(images) {
    if (!images || images.length === 0) return null;
    const primary = images.find(img => img.is_primary === 1);
    return primary || images[0];
}

// Get all image URLs from images array
function getAllImageUrls(images) {
    if (!images || images.length === 0) return [PLACEHOLDER_IMAGE];
    return images.map(img => `/uploads/${img.image_url}`);
}

// Get image URL from image object
function getImageUrl(image) {
    if (!image) return PLACEHOLDER_IMAGE;
    if (image.image_url) return `/uploads/${image.image_url}`;
    return PLACEHOLDER_IMAGE;
}

// Get product display image (primary or first image)
async function getProductDisplayImage(productId, fallbackFoto) {
    try {
        const images = await getProductImages(productId);
        const primaryImage = getPrimaryImage(images);
        if (primaryImage) {
            return `/uploads/${primaryImage.image_url}`;
        }
    } catch (error) {
        console.error('Error getting product display image:', error);
    }
    return getProductImageUrl(fallbackFoto);
}

// Generate thumbnail gallery HTML
function generateThumbnailGallery(images, onClickCallback) {
    if (!images || images.length <= 1) return '';
    
    return `
        <div class="product-thumbnails">
            ${images.map((img, index) => `
                <img src="/uploads/${img.image_url}" 
                     class="thumbnail ${img.is_primary ? 'active' : ''}"
                     data-image-id="${img.image_id}"
                     onclick="${onClickCallback}(this, '${img.image_id}')"
                     onerror="this.src='${PLACEHOLDER_IMAGE}'">
            `).join('')}
        </div>
    `;
}

// Generate main product image HTML with gallery
function generateProductGallery(images, mainImageUrl) {
    const hasGallery = images && images.length > 1;
    
    return `
        <div class="product-image-container">
            <img class="product-main-image" 
                 src="${mainImageUrl}" 
                 alt="Product image"
                 onerror="this.src='${PLACEHOLDER_IMAGE}'">
            ${hasGallery ? generateThumbnailGallery(images, 'changeProductImage') : ''}
        </div>
    `;
}

// Animasi slideOut
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);