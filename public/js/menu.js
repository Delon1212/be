// public/js/menu.js

// Fungsi untuk update navbar berdasarkan role user
function updateNavbarByRole() {
    const user = getUser();
    const navLinks = document.getElementById('navLinks');
    if (!navLinks) return;
    
    // Cek apakah sudah ada link admin
    const existingAdminLink = navLinks.querySelector('a[href="/pages/admin.html"]');
    
    if (user && user.role === 'admin') {
        // Jika user adalah admin dan belum ada link admin, tambahkan
        if (!existingAdminLink) {
            const adminLink = document.createElement('a');
            adminLink.href = '/pages/admin.html';
            adminLink.innerHTML = '👑 Admin Panel';
            adminLink.style.fontWeight = 'bold';
            adminLink.style.color = '#c5a059';
            
            // Cari link Pesanan untuk posisi penempatan
            const ordersLink = navLinks.querySelector('a[href="/pages/orders.html"]');
            if (ordersLink && ordersLink.nextSibling) {
                ordersLink.insertAdjacentElement('afterend', adminLink);
            } else {
                // Jika tidak ada, tambahkan sebelum logout
                const logoutLink = navLinks.querySelector('a[onclick="logout()"]');
                if (logoutLink) {
                    navLinks.insertBefore(adminLink, logoutLink);
                } else {
                    navLinks.appendChild(adminLink);
                }
            }
        }
    } else {
        // Jika bukan admin atau tidak login, hapus link admin jika ada
        if (existingAdminLink) {
            existingAdminLink.remove();
        }
    }
}

// Floating Admin Button (opsional)
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

// Update semua komponen yang bergantung pada role
function updateUIByRole() {
    updateNavbarByRole();
    updateAdminFloatingButton();
}

// Event listener untuk DOM
document.addEventListener('DOMContentLoaded', () => {
    const hamburger = document.getElementById('hamburgerBtn');
    const navLinks = document.getElementById('navLinks');
    const overlay = document.getElementById('menuOverlay');
    
    // Update UI berdasarkan role user
    updateUIByRole();
    
    if (!hamburger || !navLinks) return;
    
    let isOpen = false;
    let isAnimating = false;
    
    function closeMenu() {
        if (!isOpen || isAnimating) return;
        isAnimating = true;
        isOpen = false;
        navLinks.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        hamburger.classList.remove('active');
        document.body.style.overflow = '';
        setTimeout(() => { isAnimating = false; }, 300);
    }
    
    function toggleMenu() {
        if (isAnimating) return;
        isAnimating = true;
        isOpen = !isOpen;
        navLinks.classList.toggle('active', isOpen);
        if (overlay) overlay.classList.toggle('active', isOpen);
        hamburger.classList.toggle('active', isOpen);
        document.body.style.overflow = isOpen ? 'hidden' : '';
        if (isOpen && typeof updateCartCount === 'function') updateCartCount();
        setTimeout(() => { isAnimating = false; }, 300);
    }
    
    // Hapus event listener yang mungkin double
    hamburger.removeEventListener('click', toggleMenu);
    hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();
    });
    
    if (overlay) {
        overlay.removeEventListener('click', closeMenu);
        overlay.addEventListener('click', closeMenu);
    }
    
    // Event listener untuk link di dalam menu (tutup menu setelah klik)
    const links = navLinks.querySelectorAll('a');
    links.forEach(link => {
        link.addEventListener('click', () => {
            // Jangan tutup menu jika hanya ingin update UI
            setTimeout(() => {
                if (window.innerWidth <= 768) {
                    closeMenu();
                }
            }, 100);
        });
    });
    
    // Gunakan throttle untuk resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (window.innerWidth > 768 && isOpen) {
                closeMenu();
            }
        }, 150);
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            closeMenu();
        }
    });
});

// Ekspos fungsi ke global agar bisa dipanggil dari auth.js
window.updateUIByRole = updateUIByRole;
window.updateNavbarByRole = updateNavbarByRole;
