
// public/js/cart.js

// ============ CART MANAGEMENT WITH DATABASE PER USER ============

// Ambil cart dari localStorage (cache) 
async function getCart() {
    const user = getUser();
    if (!user) return [];
    return JSON.parse(localStorage.getItem(`cart_${user.user_id}`)) || [];
}

// Ambil cart secara synchronous (untuk tampilan cepat)
function getCartSync() {
    const user = getUser();
    if (!user) return [];
    return JSON.parse(localStorage.getItem(`cart_${user.user_id}`)) || [];
}

// Load cart dari database saat login atau refresh
async function loadCartFromDatabase() {
    const user = getUser();
    if (!user) return [];
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/cart/${user.user_id}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const cartItems = await response.json();
        
        // Konversi format database ke format cart lokal
        const localCart = cartItems.map(item => ({
            id: item.product_id,
            name: item.product_name,
            price: parseInt(item.price),
            quantity: item.quantity,
            stock: item.stock,
            cart_id: item.cart_id
        }));
        
        // Simpan ke localStorage dengan prefix user_id
        localStorage.setItem(`cart_${user.user_id}`, JSON.stringify(localCart));
        updateCartCount();
        return localCart;
    } catch (error) {
        console.error('Error loading cart from database:', error);
        return JSON.parse(localStorage.getItem(`cart_${user.user_id}`)) || [];
    }
}

// Save cart ke localStorage (tanpa sync ke database dulu)
async function saveCart(cart) {
    const user = getUser();
    if (!user) return;
    
    // Simpan ke localStorage dengan prefix user_id
    localStorage.setItem(`cart_${user.user_id}`, JSON.stringify(cart));
    updateCartCount();
}

// Update cart count di navbar
function updateCartCount() {
    const user = getUser();
    if (!user) {
        document.querySelectorAll('#cartCount').forEach(el => {
            if (el) el.textContent = '0';
        });
        return;
    }
    
    const cart = JSON.parse(localStorage.getItem(`cart_${user.user_id}`)) || [];
    const count = cart.reduce((total, item) => total + (item.quantity || 0), 0);
    document.querySelectorAll('#cartCount').forEach(el => {
        if (el) el.textContent = count;
    });
}

// Sync item ke database (dipanggil saat add/update)
async function syncCartItemToDatabase(item, user) {
    try {
        // Cek apakah item sudah ada di database
        const checkResponse = await fetch(`${API_BASE_URL}/api/cart/check/${user.user_id}/${item.id}`);
        const existingItem = await checkResponse.json();
        
        if (existingItem.exists && existingItem.cart_id) {
            // Update quantity
            const updateResponse = await fetch(`${API_BASE_URL}/api/cart/${existingItem.cart_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    quantity: item.quantity,
                    user_id: user.user_id 
                })
            });
            
            if (updateResponse.ok && !item.cart_id) {
                item.cart_id = existingItem.cart_id;
            }
            return updateResponse.ok;
        } else {
            // Tambah item baru
            const addResponse = await fetch(`${API_BASE_URL}/api/cart`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user.user_id,
                    product_id: item.id,
                    product_name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    stock: item.stock
                })
            });
            
            const data = await addResponse.json();
            if (addResponse.ok && data.cart_id) {
                item.cart_id = data.cart_id;
                // Update localStorage dengan cart_id
                const cart = getCartSync();
                const index = cart.findIndex(i => i.id === item.id);
                if (index !== -1) {
                    cart[index].cart_id = data.cart_id;
                    localStorage.setItem(`cart_${user.user_id}`, JSON.stringify(cart));
                }
            }
            return addResponse.ok;
        }
    } catch (error) {
        console.error('Error syncing cart item:', error);
        return false;
    }
}

// Add to cart
async function addToCart(product_id, product_name, price, stock) {
    console.log('addToCart called:', { product_id, product_name, price, stock });
    
    if (!isLoggedIn()) {
        showNotification('Silakan login terlebih dahulu!', 'error');
        setTimeout(() => window.location.href = '/pages/login.html', 1500);
        return;
    }
    
    const user = getUser();
    
    if (stock <= 0) {
        showNotification('Stok produk habis!', 'error');
        return;
    }
    
    // Ambil cart lokal
    const currentCart = getCartSync();
    const existingItem = currentCart.find(item => item.id === product_id);
    
    if (existingItem) {
        // Cek stok
        if (existingItem.quantity + 1 > stock) {
            showNotification('Stok tidak mencukupi!', 'error');
            return;
        }
        
        // Update quantity di lokal
        existingItem.quantity++;
        await saveCart(currentCart);
        
        // Sync ke database
        await syncCartItemToDatabase(existingItem, user);
        
        showNotification(`Jumlah ${product_name} ditambahkan! (${existingItem.quantity})`, 'success');
        updateCartCount();
        return;
    }
    
    // Tambah item baru dengan quantity = 1
    const newItem = {
        id: product_id,
        name: product_name,
        price: price,
        quantity: 1,
        stock: stock,
        cart_id: null
    };
    
    currentCart.push(newItem);
    await saveCart(currentCart);
    
    // Sync ke database untuk mendapatkan cart_id
    const syncSuccess = await syncCartItemToDatabase(newItem, user);
    
    if (syncSuccess) {
        // Update localStorage dengan cart_id yang baru
        const updatedCart = getCartSync();
        const itemIndex = updatedCart.findIndex(i => i.id === product_id);
        if (itemIndex !== -1 && newItem.cart_id) {
            updatedCart[itemIndex].cart_id = newItem.cart_id;
            localStorage.setItem(`cart_${user.user_id}`, JSON.stringify(updatedCart));
        }
        showNotification(`${product_name} ditambahkan ke keranjang!`, 'success');
    } else {
        showNotification('Gagal menambahkan ke keranjang!', 'error');
    }
    
    updateCartCount();
}

// Update cart quantity
async function updateCartQuantity(cartId, quantity, stock, productId) {
    if (quantity > stock) {
        showNotification('Stok tidak mencukupi!', 'error');
        return false;
    }
    
    if (quantity < 1) {
        return removeFromCart(cartId);
    }
    
    const user = getUser();
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/cart/${cartId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                quantity: quantity,
                user_id: user.user_id 
            })
        });
        
        if (response.ok) {
            // Update local cache
            const cart = getCartSync();
            const itemIndex = cart.findIndex(item => item.cart_id === cartId);
            if (itemIndex !== -1) {
                cart[itemIndex].quantity = quantity;
                localStorage.setItem(`cart_${user.user_id}`, JSON.stringify(cart));
                updateCartCount();
            }
            return true;
        } else {
            const data = await response.json();
            showNotification(data.error || 'Gagal mengupdate keranjang!', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error updating cart:', error);
        showNotification('Terjadi kesalahan!', 'error');
        return false;
    }
}

// Remove from cart
async function removeFromCart(cartId) {
    const user = getUser();
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/cart/${cartId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.user_id })
        });
        
        if (response.ok) {
            // Update local cache
            const cart = getCartSync();
            const newCart = cart.filter(item => item.cart_id !== cartId);
            localStorage.setItem(`cart_${user.user_id}`, JSON.stringify(newCart));
            updateCartCount();
            showNotification('Item dihapus dari keranjang', 'success');
            return true;
        } else {
            showNotification('Gagal menghapus item!', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error removing from cart:', error);
        showNotification('Terjadi kesalahan!', 'error');
        return false;
    }
}

// Clear cart after checkout
async function clearCart() {
    const user = getUser();
    if (!user) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/cart/clear/${user.user_id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.user_id })
        });
        
        if (response.ok) {
            localStorage.removeItem(`cart_${user.user_id}`);
            updateCartCount();
            console.log('Cart cleared successfully');
        }
    } catch (error) {
        console.error('Error clearing cart:', error);
    }
}

// Load cart saat halaman dimuat (jika user login)
async function initCart() {
    if (isLoggedIn()) {
        await loadCartFromDatabase();
    } else {
        updateCartCount();
    }
}

// Panggil initCart saat DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initCart();
    updateCartCount();
});

// Update cart saat user berubah (login/logout)
window.addEventListener('storage', (e) => {
    if (e.key === 'user') {
        initCart();
    }
});

// Ekspos fungsi ke global untuk digunakan di halaman lain
window.getCart = getCart;
window.getCartSync = getCartSync;
window.addToCart = addToCart;
window.updateCartQuantity = updateCartQuantity;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.updateCartCount = updateCartCount;
window.loadCartFromDatabase = loadCartFromDatabase;
