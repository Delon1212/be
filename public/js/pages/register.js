document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userData = {
        username: document.getElementById('username').value,
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
        full_name: document.getElementById('full_name').value,
        phone: document.getElementById('phone').value
    };
    await register(userData);
});

if (isLoggedIn()) window.location.href = '/';