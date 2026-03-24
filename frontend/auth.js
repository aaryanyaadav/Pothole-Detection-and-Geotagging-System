// Configuration
const API_URL = "http://localhost:8001";

// Switch to Login Form
function switchToLogin() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const loginTab = document.getElementById('login-tab');
    const signupTab = document.getElementById('signup-tab');

    loginForm.classList.add('active');
    signupForm.classList.remove('active');
    loginTab.classList.add('active');
    signupTab.classList.remove('active');
}

// Switch to Signup Form
function switchToSignup() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const loginTab = document.getElementById('login-tab');
    const signupTab = document.getElementById('signup-tab');

    signupForm.classList.add('active');
    loginForm.classList.remove('active');
    signupTab.classList.add('active');
    loginTab.classList.remove('active');
}

// Handle Login Form Submission
document.getElementById('login-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    // Validate inputs
    if (!email || !password) {
        showErrorMessage('Please fill in all fields');
        return;
    }

    // Show loading state
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Logging in...';
    submitBtn.disabled = true;

    try {
        // Call backend login endpoint
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        // Store token in localStorage
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userEmail', email);
        localStorage.setItem('userName', data.name || email);

        showSuccessMessage('Login successful! Redirecting...');
        
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);

    } catch (error) {
        console.error('Login error:', error);
        showErrorMessage(error.message || 'Login failed. Please check your email and password.');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        this.reset();
    }
});

// Handle Signup Form Submission
document.getElementById('signup-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;
    const terms = document.querySelector('input[name="terms"]').checked;

    // Validate inputs
    if (!name || !email || !password || !confirm) {
        showErrorMessage('Please fill in all fields');
        return;
    }

    // Validate email format
    if (!isValidEmail(email)) {
        showErrorMessage('Please enter a valid email address');
        return;
    }

    // Check password match
    if (password !== confirm) {
        showErrorMessage('Passwords do not match');
        return;
    }

    // Check password strength
    if (password.length < 6) {
        showErrorMessage('Password must be at least 6 characters long');
        return;
    }

    // Check terms
    if (!terms) {
        showErrorMessage('Please accept the Terms of Service and Privacy Policy');
        return;
    }

    // Show loading state
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating account...';
    submitBtn.disabled = true;

    try {
        // Call backend signup endpoint
        const response = await fetch(`${API_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Signup failed');
        }

        // Store token in localStorage
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userEmail', email);
        localStorage.setItem('userName', name);

        showSuccessMessage('Account created successfully! Redirecting...');

        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);

    } catch (error) {
        console.error('Signup error:', error);
        showErrorMessage(error.message || 'Signup failed. Please try again.');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        this.reset();
    }
});

// Show Success Message
function showSuccessMessage(message) {
    const successMsg = document.getElementById('success-message');
    const successText = document.getElementById('success-text');

    if (!successMsg || !successText) return;

    successText.textContent = message;
    successMsg.classList.add('show');

    // Auto-hide after 3 seconds
    setTimeout(() => {
        successMsg.classList.remove('show');
    }, 3000);
}

// Show Error Message
function showErrorMessage(message) {
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f8d7da;
        color: #721c24;
        padding: 15px 20px;
        border-radius: 4px;
        border: 1px solid #f5c6cb;
        z-index: 1000;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;
    errorMsg.textContent = message;
    document.body.appendChild(errorMsg);

    setTimeout(() => {
        errorMsg.remove();
    }, 5000);
}

// Validate Email Format
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Password strength indicator
document.getElementById('signup-password')?.addEventListener('input', function() {
    const password = this.value;
    let strength = 'weak';

    if (password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)) {
        strength = 'strong';
    } else if (password.length >= 6) {
        strength = 'medium';
    }

    console.log('Password strength:', strength);
});

// Logout function
function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    window.location.href = 'auth.html';
}

// Check if user is logged in
function isLoggedIn() {
    return localStorage.getItem('authToken') !== null;
}

// Get current user email
function getCurrentUserEmail() {
    return localStorage.getItem('userEmail');
}

// Get current user name
function getCurrentUserName() {
    return localStorage.getItem('userName');
}

// Set initial active form
window.addEventListener('DOMContentLoaded', function() {
    switchToLogin();
});
