// public/js/pages/products.js

// Data slideshow untuk setiap produk
const slideshowData = {};

let allProductsData = [];
let currentFilters = {
    keyword: '',
    priceRange: '',
    sort: 'newest'
};

// Load all products
async function loadAllProducts() {
    const container = document.getElementById('productsContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Memuat produk...</p></div>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/products`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const products = await response.json();
        allProductsData = products;
        
        if (products.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>📦 Belum ada produk.</p></div>`;
            return;
        }
        
        await displayProductsWithImages(products);
        
    } catch (error) {
        console.error('Error loading products:', error);
        container.innerHTML = `<div class="error-state"><p>❌ Gagal memuat produk: ${error.message}</p><button class="btn btn-secondary" onclick="loadAllProducts()">🔄 Coba Lagi</button></div>`;
    }
}

// Search products
async function searchProducts() {
    const keyword = document.getElementById('searchInput')?.value.trim() || '';
    const priceRange = document.getElementById('priceFilter')?.value || '';
    const sort = document.getElementById('sortFilter')?.value || 'newest';
    
    currentFilters = { keyword, priceRange, sort };
    
    const container = document.getElementById('productsContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Mencari produk...</p></div>';
    
    // Build URL
    let url = `${API_BASE_URL}/api/products/search?`;
    if (keyword) url += `q=${encodeURIComponent(keyword)}&`;
    if (priceRange) {
        const [min, max] = priceRange.split('-');
        url += `min_price=${min}&max_price=${max}&`;
    }
    if (sort) url += `&sort=${sort}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            await displayProductsWithImages(data.products);
            updateSearchInfo(data);
        } else {
            container.innerHTML = '<div class="error-state"><p>Gagal mencari produk</p></div>';
        }
    } catch (error) {
        console.error('Error searching products:', error);
        container.innerHTML = '<div class="error-state"><p>Terjadi kesalahan saat mencari</p></div>';
    }
}

// Display products with images
async function displayProductsWithImages(products) {
    const container = document.getElementById('productsContainer');
    if (!container) return;
    
    if (products.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem; display: block;"></i>
                <p>Produk tidak ditemukan</p>
                <button class="btn btn-secondary" onclick="resetFilters()">Reset Filter</button>
            </div>
        `;
        return;
    }
    
    // Load images untuk setiap produk secara paralel
    const productsWithImages = await Promise.all(products.map(async (product) => {
        try {
            const images = await getProductImages(product.product_id);
            return {
                ...product,
                images: images || [],
                primaryImage: getPrimaryImage(images || [])
            };
        } catch (error) {
            console.error(`Error loading images for product ${product.product_id}:`, error);
            return {
                ...product,
                images: [],
                primaryImage: null
            };
        }
    }));
    
    container.innerHTML = productsWithImages.map(product => {
        // Siapkan data slideshow untuk produk ini
        const galleryImages = [];
        
        // Kumpulkan semua gambar
        if (product.primaryImage) {
            galleryImages.push({
                url: getImageUrl(product.primaryImage),
                caption: product.name_product
            });
        } else if (product.foto) {
            galleryImages.push({
                url: getProductImageUrl(product.foto),
                caption: product.name_product
            });
        }
        
        if (product.images && product.images.length > 0) {
            product.images.forEach(img => {
                if (!img.is_primary) {
                    galleryImages.push({
                        url: getImageUrl(img),
                        caption: product.name_product
                    });
                }
            });
        }
        
        // Jika tidak ada gambar sama sekali, tambah placeholder
        if (galleryImages.length === 0) {
            galleryImages.push({
                url: PLACEHOLDER_IMAGE,
                caption: product.name_product
            });
        }
        
        // Simpan data slideshow
        slideshowData[product.product_id] = {
            images: galleryImages,
            currentIndex: 0,
            total: galleryImages.length
        };
        
        // Generate HTML untuk gallery
        const hasMultiple = galleryImages.length > 1;
        
        return `
            <div class="product-card" data-product-id="${product.product_id}">
                <div class="product-slideshow">
                    <div class="slideshow-slides">
                        <div class="slideshow-wrapper" id="slideshow-${product.product_id}">
                            ${galleryImages.map((img, idx) => `
                                <div class="slideshow-slide">
                                    <img src="${img.url}" 
                                         alt="${escapeHtml(product.name_product)}"
                                         data-index="${idx}"
                                         loading="lazy"
                                         onclick="openProductLightbox('${product.product_id}', ${idx})"
                                         onerror="this.src='${PLACEHOLDER_IMAGE}'; this.onerror=null;">
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ${hasMultiple ? `
                        <button class="slideshow-btn slideshow-btn-prev" onclick="event.stopPropagation(); slideProduct('${product.product_id}', -1)">&#10094;</button>
                        <button class="slideshow-btn slideshow-btn-next" onclick="event.stopPropagation(); slideProduct('${product.product_id}', 1)">&#10095;</button>
                        <div class="slideshow-dots" id="dots-${product.product_id}">
                            ${galleryImages.map((_, idx) => `<span class="slideshow-dot ${idx === 0 ? 'active' : ''}" onclick="event.stopPropagation(); goToSlide('${product.product_id}', ${idx})"></span>`).join('')}
                        </div>
                    ` : ''}
                    <div class="image-count-badge">
                        <i class="fas fa-images"></i> ${galleryImages.length}
                    </div>
                </div>
                <div class="product-info">
                    <h3 class="product-title">${escapeHtml(product.name_product)}</h3>
                    <p class="product-description">${escapeHtml(product.deskripsi || 'Tidak ada deskripsi')}</p>
                    <p class="product-price">${formatRupiah(product.harga_pcs)}</p>
                    <p class="product-stock">Stok: ${product.stok_barang} pcs</p>
                    <button class="btn btn-primary" onclick="addToCart('${product.product_id}', '${escapeHtml(product.name_product)}', ${product.harga_pcs}, ${product.stok_barang})">
                         Tambah ke Keranjang
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Update search info display
function updateSearchInfo(data) {
    const searchInfo = document.getElementById('searchInfo');
    const searchResultText = document.getElementById('searchResultText');
    
    if (searchInfo && searchResultText) {
        if (data.keyword && data.keyword !== '') {
            searchInfo.style.display = 'flex';
            searchResultText.innerHTML = `🔍 Menampilkan ${data.count} hasil untuk "${escapeHtml(data.keyword)}"`;
        } else {
            searchInfo.style.display = 'none';
        }
    }
}

// Reset all filters
function resetFilters() {
    const searchInput = document.getElementById('searchInput');
    const priceFilter = document.getElementById('priceFilter');
    const sortFilter = document.getElementById('sortFilter');
    
    if (searchInput) searchInput.value = '';
    if (priceFilter) priceFilter.value = '';
    if (sortFilter) sortFilter.value = 'newest';
    
    currentFilters = { keyword: '', priceRange: '', sort: 'newest' };
    
    // Reload all products
    loadAllProducts();
    
    const searchInfo = document.getElementById('searchInfo');
    if (searchInfo) searchInfo.style.display = 'none';
}

// Clear search
function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    resetFilters();
}

// Initialize search events
function initSearchEvents() {
    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('searchInput');
    const priceFilter = document.getElementById('priceFilter');
    const sortFilter = document.getElementById('sortFilter');
    const resetBtn = document.getElementById('resetFilterBtn');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    
    if (searchBtn) searchBtn.addEventListener('click', searchProducts);
    if (priceFilter) priceFilter.addEventListener('change', searchProducts);
    if (sortFilter) sortFilter.addEventListener('change', searchProducts);
    if (resetBtn) resetBtn.addEventListener('click', resetFilters);
    if (clearSearchBtn) clearSearchBtn.addEventListener('click', clearSearch);
    
    // Search on Enter key
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchProducts();
        });
    }
}

// Fungsi untuk slideshow
function slideProduct(productId, direction) {
    const data = slideshowData[productId];
    if (!data || data.total <= 1) return;
    
    data.currentIndex = (data.currentIndex + direction + data.total) % data.total;
    updateSlideshow(productId, data.currentIndex);
}

function goToSlide(productId, index) {
    const data = slideshowData[productId];
    if (!data) return;
    
    if (index < 0 || index >= data.total) return;
    
    data.currentIndex = index;
    updateSlideshow(productId, data.currentIndex);
}

function updateSlideshow(productId, index) {
    const data = slideshowData[productId];
    if (!data) return;
    
    const wrapper = document.getElementById(`slideshow-${productId}`);
    const dots = document.getElementById(`dots-${productId}`);
    
    if (wrapper) {
        wrapper.style.transform = `translateX(-${index * 100}%)`;
    }
    
    if (dots) {
        const dotElements = dots.querySelectorAll('.slideshow-dot');
        dotElements.forEach((dot, i) => {
            if (i === index) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    }
}

// Fungsi untuk membuka lightbox
function openProductLightbox(productId, index) {
    const data = slideshowData[productId];
    if (!data || !data.images || data.images.length === 0) return;
    
    const validIndex = Math.min(index, data.images.length - 1);
    
    const lightboxImages = data.images.map(img => ({
        url: img.url,
        caption: img.caption
    }));
    
    if (typeof lightbox !== 'undefined' && lightbox && lightbox.open) {
        lightbox.open(lightboxImages, validIndex, data.images[validIndex]?.caption || '');
    } else {
        window.open(lightboxImages[validIndex].url, '_blank');
    }
}

// Function to change product image when thumbnail clicked
function changeProductImage(thumbnail, imageId) {
    const productCard = thumbnail.closest('.product-card');
    const mainImage = productCard?.querySelector('.product-main-image');
    
    if (mainImage && thumbnail.src) {
        mainImage.style.opacity = '0.5';
        setTimeout(() => {
            mainImage.src = thumbnail.src;
            mainImage.style.opacity = '1';
        }, 150);
    }
    
    const thumbnails = productCard?.querySelectorAll('.thumbnail');
    if (thumbnails) {
        thumbnails.forEach(thumb => thumb.classList.remove('active'));
        thumbnail.classList.add('active');
    }
}

// Helper function untuk mendapatkan URL gambar
function getImageUrl(image) {
    if (!image) return PLACEHOLDER_IMAGE;
    if (image.image_url) return `/uploads/${image.image_url}`;
    if (image.url) return image.url;
    return PLACEHOLDER_IMAGE;
}

// Escape HTML function
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Refresh products (untuk admin)
async function refreshProducts() {
    await loadAllProducts();
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadAllProducts();
    updateCartCount();
    initSearchEvents();
});

// Ekspos fungsi ke global
window.changeProductImage = changeProductImage;
window.slideProduct = slideProduct;
window.goToSlide = goToSlide;
window.openProductLightbox = openProductLightbox;
window.refreshProducts = refreshProducts;
window.searchProducts = searchProducts;
window.resetFilters = resetFilters;
window.clearSearch = clearSearch;