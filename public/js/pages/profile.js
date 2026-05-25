function loadProfile() {
    const user = getUser();
    if (!user) return;
    
    document.getElementById('profileName').textContent = user.full_name || user.username;
    document.getElementById('profileEmail').textContent = user.email;
    document.getElementById('profilePhone').textContent = user.phone || 'Belum diisi';
    document.getElementById('profileAvatar').src = getProfileImageUrl(user);
    
    document.getElementById('full_name').value = user.full_name || '';
    document.getElementById('phone').value = user.phone || '';
    document.getElementById('provinsi').value = user.provinsi || '';
    document.getElementById('kota').value = user.kota || '';
    document.getElementById('kode_pos').value = user.kode_pos || '';
    document.getElementById('address').value = user.address || '';
}

function previewProfilePhoto(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const avatar = document.getElementById('profileAvatar');
            if (avatar) avatar.src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function updateProfileAction(e) {
    e.preventDefault();
    const user = getUser();
    if (!user) return;
    
    const formData = new FormData();
    formData.append('username', user.username);
    formData.append('email', user.email);
    formData.append('full_name', document.getElementById('full_name').value);
    formData.append('phone', document.getElementById('phone').value);
    formData.append('provinsi', document.getElementById('provinsi').value);
    formData.append('kota', document.getElementById('kota').value);
    formData.append('kode_pos', document.getElementById('kode_pos').value);
    formData.append('address', document.getElementById('address').value);
    
    const foto = document.getElementById('foto').files[0];
    if (foto) {
        if (foto.size > 2 * 1024 * 1024) {
            showNotification('Ukuran foto maksimal 2MB!', 'error');
            return;
        }
        formData.append('foto', foto);
    }
    
    const submitBtn = document.querySelector('#profileForm button[type="submit"]');
    const originalText = submitBtn?.innerHTML;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '⏳ Menyimpan...'; }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/users/${user.user_id}`, {
            method: 'PUT',
            body: formData
        });
        const data = await response.json();
        
        if (response.ok) {
            const userRes = await fetch(`${API_BASE_URL}/api/users/${user.user_id}`);
            const newUser = await userRes.json();
            saveUser(newUser);
            showNotification('Profil berhasil diupdate!');
            loadProfile();
            document.getElementById('foto').value = '';
        } else {
            showNotification(data.error || 'Gagal update!', 'error');
        }
    } catch (error) {
        showNotification('Error server!', 'error');
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalText; }
    }
}

document.getElementById('profileForm')?.addEventListener('submit', updateProfileAction);
document.getElementById('foto')?.addEventListener('change', function() { previewProfilePhoto(this); });

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadProfile();
    updateCartCount();
});