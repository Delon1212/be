// public/js/auth.js

// Login
async function login(username, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const userResponse = await fetch(`${API_BASE_URL}/api/users/${data.user.user_id}`);
            const completeUser = await userResponse.json();
            saveUser(completeUser);
            
            // ✅ TAMBAHKAN: Load cart dari database setelah login
            if (typeof loadCartFromDatabase === 'function') {
                await loadCartFromDatabase();
            }
            
            // Update UI berdasarkan role (navbar & floating button)
            if (typeof window.updateUIByRole === 'function') {
                window.updateUIByRole();
            }
            
            showNotification(`Login berhasil! Selamat datang ${completeUser.full_name || username}`);
            
            // Redirect berdasarkan role
            setTimeout(() => {
                if (completeUser.role === 'admin') {
                    window.location.href = '/pages/admin.html';
                } else {
                    window.location.href = '/';
                }
            }, 1000);
        } else {
            showNotification(data.error || 'Login gagal!', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Terjadi kesalahan!', 'error');
    }
}

// Register
async function register(userData) {
    try {
        const formData = new FormData();
        Object.keys(userData).forEach(key => {
            if (userData[key]) formData.append(key, userData[key]);
        });
        
        // User baru selalu memiliki role 'user'
        formData.append('role', 'user');
        
        const response = await fetch(`${API_BASE_URL}/api/users`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Registrasi berhasil! Silakan login.');
            setTimeout(() => {
                window.location.href = '/pages/login.html';
            }, 1500);
        } else {
            showNotification(data.error || 'Registrasi gagal!', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Terjadi kesalahan!', 'error');
    }
}

// Save user to localStorage
function saveUser(userData) {
    if (!userData) return;
    localStorage.setItem('user', JSON.stringify(userData));
}

// Get user from localStorage
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

// Check if user is logged in
function isLoggedIn() {
    return getUser() !== null;
}

// Check if user is admin
function isAdmin() {
    const user = getUser();
    return user && user.role === 'admin';
}

// Check auth with admin protection
function checkAuth() {
    const currentPath = window.location.pathname;
    const isAuthPage = currentPath.includes('login') || currentPath.includes('register');
    const isAdminPage = currentPath.includes('/pages/admin.html');
    const isContactsPage = currentPath.includes('/pages/admin-contacts.html');
    
    // Jika belum login dan bukan halaman auth, redirect ke login
    if (!isLoggedIn() && !isAuthPage) {
        window.location.href = '/pages/login.html';
        return false;
    }
    
    // Jika sudah login tapi di halaman auth, redirect ke home
    if (isLoggedIn() && isAuthPage) {
        window.location.href = '/';
        return false;
    }
    
    // PROTEKSI HALAMAN ADMIN
    if ((isAdminPage || isContactsPage) && !isAdmin()) {
        showNotification('⛔ Akses ditolak! Hanya untuk admin.', 'error');
        setTimeout(() => {
            window.location.href = '/';
        }, 1500);
        return false;
    }
    
    return true;
}

// Update navbar berdasarkan role (sembunyikan/tampilkan menu admin)
function updateNavbarByRole() {
    const user = getUser();
    const navLinks = document.getElementById('navLinks');
    if (!navLinks) return;
    
    // Cek apakah sudah ada link admin
    const existingAdminLink = navLinks.querySelector('a[href="/pages/admin.html"]');
    const existingContactsLink = navLinks.querySelector('a[href="/pages/admin-contacts.html"]');
    
    if (user && user.role === 'admin') {
        // Tambahkan link admin panel jika belum ada
        if (!existingAdminLink) {
            const adminLink = document.createElement('a');
            adminLink.href = '/pages/admin.html';
            adminLink.innerHTML = '👑 Admin Panel';
            adminLink.style.fontWeight = 'bold';
            adminLink.style.color = '#c5a059';
            
            const logoutLink = navLinks.querySelector('a[onclick="logout()"]');
            if (logoutLink) {
                navLinks.insertBefore(adminLink, logoutLink);
            } else {
                navLinks.appendChild(adminLink);
            }
        }
        
        // Tambahkan link pesan masuk jika belum ada
        if (!existingContactsLink) {
            const contactsLink = document.createElement('a');
            contactsLink.href = '/pages/admin-contacts.html';
            contactsLink.innerHTML = '📧 Pesan Masuk';
            
            const adminLink = navLinks.querySelector('a[href="/pages/admin.html"]');
            if (adminLink) {
                adminLink.insertAdjacentElement('afterend', contactsLink);
            } else {
                navLinks.appendChild(contactsLink);
            }
        }
    } else {
        // Hapus link admin untuk non-admin
        if (existingAdminLink) existingAdminLink.remove();
        if (existingContactsLink) existingContactsLink.remove();
    }
}

// Update floating admin button
function updateAdminFloatingButton() {
    const user = getUser();
    let adminFab = document.getElementById('adminFab');
    
    if (user && user.role === 'admin') {
        if (!adminFab) {
            adminFab = document.createElement('button');
            adminFab.id = 'adminFab';
            adminFab.className = 'admin-fab';
            adminFab.innerHTML = '👑';
            adminFab.title = 'Admin Panel';
            adminFab.onclick = () => window.location.href = '/pages/admin.html';
            document.body.appendChild(adminFab);
        }
        adminFab.style.display = 'flex';
    } else {
        if (adminFab) {
            adminFab.style.display = 'none';
        }
    }
}

// Update all UI components based on role
function updateUIByRole() {
    updateNavbarByRole();
    updateAdminFloatingButton();
}

// ✅ TAMBAHKAN: Clear cart user saat logout
function clearUserCart() {
    const user = getUser();
    if (user) {
        localStorage.removeItem(`cart_${user.user_id}`);
    }
}

// Logout
function logout() {
    // Clear cart user yang logout
    clearUserCart();
    localStorage.removeItem('user');
    
    // Update UI setelah logout (hilangkan menu admin)
    if (typeof updateUIByRole === 'function') {
        updateUIByRole();
    }
    
    showNotification('Logout berhasil!');
    setTimeout(() => {
        window.location.href = '/pages/login.html';
    }, 1000);
}

// Inisialisasi UI saat halaman dimuat
document.addEventListener('DOMContentLoaded', () => {
    updateUIByRole();
});

// Ekspos fungsi ke global
window.updateUIByRole = updateUIByRole;
window.updateNavbarByRole = updateNavbarByRole;
window.updateAdminFloatingButton = updateAdminFloatingButton;
window.checkAuth = checkAuth;
window.isAdmin = isAdmin;
window.isLoggedIn = isLoggedIn;
window.getUser = getUser;
window.saveUser = saveUser;
window.logout = logout;
window.login = login;
window.register = register;
window.clearUserCart = clearUserCart;
