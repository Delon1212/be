// public/js/pages/home.js

// FAQ Toggle
function initFaqToggle() {
    document.querySelectorAll('.faq-question').forEach(question => {
        question.addEventListener('click', () => {
            const faqItem = question.parentElement;
            faqItem.classList.toggle('active');
        });
    });
}

// Copy Nomor Rekening
function initCopyAccount() {
    document.querySelectorAll('.btn-copy').forEach(btn => {
        btn.addEventListener('click', async () => {
            const accountNumber = btn.getAttribute('data-account');
            if (accountNumber) {
                try {
                    await navigator.clipboard.writeText(accountNumber);
                    showNotification('✅ Nomor rekening telah disalin!', 'success');
                } catch (err) {
                    showNotification('❌ Gagal menyalin, silakan salin manual', 'error');
                }
            }
        });
    });
}

// Fill contact form with user data (otomatis isi dari user yang login)
function fillContactFormWithUserData() {
    const user = getUser();
    const nameInput = document.getElementById('contactName');
    const emailInput = document.getElementById('contactEmail');
    
    if (user) {
        // Isi nama dari full_name atau username
        if (nameInput && user.full_name) {
            nameInput.value = user.full_name;
        } else if (nameInput && user.username) {
            nameInput.value = user.username;
        }
        
        // Isi email
        if (emailInput && user.email) {
            emailInput.value = user.email;
        }
        
        // Jika user sudah login, tampilkan info bahwa data sudah terisi otomatis
        const formNote = document.getElementById('contactFormNote');
        if (formNote) {
            formNote.innerHTML = '<small style="color: #27ae60;"><i class="fas fa-check-circle"></i> Nama dan email sudah terisi otomatis dari akun Anda.</small>';
        }
    } else {
        // Jika belum login, tampilkan pesan untuk login
        const formNote = document.getElementById('contactFormNote');
        if (formNote) {
            formNote.innerHTML = '<small style="color: #e74c3c;"><i class="fas fa-info-circle"></i> <a href="/pages/login.html" style="color: #e74c3c;">Login</a> untuk mengisi nama dan email otomatis.</small>';
        }
    }
}

// Contact Form Submit
function initContactForm() {
    const contactForm = document.getElementById('contactForm');
    if (!contactForm) return;
    
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        let name = document.getElementById('contactName')?.value.trim();
        let email = document.getElementById('contactEmail')?.value.trim();
        const message = document.getElementById('contactMessage')?.value.trim();
        
        // Jika user sudah login dan field kosong, gunakan data user
        const user = getUser();
        if (user) {
            if (!name) {
                name = user.full_name || user.username;
                const nameInput = document.getElementById('contactName');
                if (nameInput) nameInput.value = name;
            }
            if (!email) {
                email = user.email;
                const emailInput = document.getElementById('contactEmail');
                if (emailInput) emailInput.value = email;
            }
        }
        
        if (!name) {
            showNotification('Nama harus diisi!', 'error');
            document.getElementById('contactName')?.focus();
            return;
        }
        
        if (!email) {
            showNotification('Email harus diisi!', 'error');
            document.getElementById('contactEmail')?.focus();
            return;
        }
        
        if (!message) {
            showNotification('Pesan harus diisi!', 'error');
            document.getElementById('contactMessage')?.focus();
            return;
        }
        
        // Validasi email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showNotification('Format email tidak valid!', 'error');
            return;
        }
        
        const submitBtn = contactForm.querySelector('button[type="submit"]');
        const originalText = submitBtn?.innerHTML;
        
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '⏳ Mengirim...';
        }
        
        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, message })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showNotification('✅ Pesan Anda telah terkirim! Kami akan segera merespon.', 'success');
                // Reset hanya message field, nama dan email tetap
                document.getElementById('contactMessage').value = '';
            } else {
                showNotification(data.error || 'Gagal mengirim pesan!', 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showNotification('Terjadi kesalahan! Silakan coba lagi.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        }
    });
}

// Smooth scroll untuk anchor link
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#' || href === '') return;
            
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Inisialisasi semua fungsi
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    updateCartCount();
    
    // Update navbar untuk admin
    if (typeof updateUIByRole === 'function') {
        updateUIByRole();
    }
    
    // Inisialisasi komponen home
    initFaqToggle();
    initCopyAccount();
    fillContactFormWithUserData(); // Isi form dengan data user
    initContactForm();
    initSmoothScroll();
});