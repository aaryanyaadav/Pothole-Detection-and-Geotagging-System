// Dashboard Configuration
const API_URL = "http://localhost:8001";

// Get current user info from localStorage
const userEmail = localStorage.getItem('userEmail');
const userName = localStorage.getItem('userName');
const authToken = localStorage.getItem('authToken');

// Redirect to login if not authenticated
if (!authToken || !userEmail) {
    window.location.href = 'auth.html';
}

// Initialize dashboard
window.addEventListener('DOMContentLoaded', async () => {
    await loadUserProfile();
    setupEventListeners();
});

// Load user profile from backend
async function loadUserProfile() {
    try {
        console.log("Fetching profile from:", `${API_URL}/user/profile`);
        const response = await fetch(`${API_URL}/user/profile`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            console.error("Profile fetch failed:", response.status, response.statusText);
            if (response.status === 401) {
                // Token expired or invalid
                console.warn("Token expired, logging out...");
                logout();
                return;
            }
            throw new Error('Failed to load profile');
        }

        const user = await response.json();
        console.log("Profile data received:", user);

        // Update greeting
        const greetingEl = document.getElementById('userGreeting');
        if (greetingEl) greetingEl.textContent = `Manage your account settings for ${user.name}`;

        // Update Summary Card
        const summaryName = document.getElementById('nameDisplay');
        const summaryEmail = document.getElementById('emailDisplay');
        const summaryJoin = document.getElementById('joinDateDisplay');
        const summaryInit = document.getElementById('summary-initial');

        if (summaryName) summaryName.textContent = user.name;
        if (summaryEmail) summaryEmail.textContent = user.email;
        if (summaryInit) summaryInit.textContent = (user.name || 'U').charAt(0).toUpperCase();

        if (summaryJoin && user.created_at) {
            const joinDate = new Date(user.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            summaryJoin.textContent = `Member since ${joinDate}`;
        }

        // Populate form fields
        if (document.getElementById('fullName')) document.getElementById('fullName').value = user.name || '';
        if (document.getElementById('phone')) document.getElementById('phone').value = user.phone || '';
        if (document.getElementById('address')) document.getElementById('address').value = user.address || '';
        if (document.getElementById('city')) document.getElementById('city').value = user.city || '';
        if (document.getElementById('state')) document.getElementById('state').value = user.state || '';
        // Note: Zipcode field might be missing in new layout if not explicitly added, check existence
        if (document.getElementById('zipcode')) document.getElementById('zipcode').value = user.zipcode || '';
        if (document.getElementById('bio')) document.getElementById('bio').value = user.bio || '';

        console.log('✓ Profile loaded successfully');
    } catch (error) {
        console.error('Error loading profile:', error);
        showAlert('Failed to load profile. Please refresh the page.', 'error');
    }
}

// Setup form event listeners
function setupEventListeners() {
    // Profile form submission
    document.getElementById('profileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateProfile();
    });

    // Password form submission
    document.getElementById('passwordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await changePassword();
    });
}

// Update user profile
async function updateProfile() {
    const submitBtn = document.querySelector('#profileForm button[type="submit"]');
    const originalText = submitBtn.textContent;

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving...";
        submitBtn.style.opacity = "0.7";

        // Safe getter helper
        const getValue = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };

        const profileData = {
            name: getValue('fullName'),
            phone: getValue('phone'),
            address: getValue('address'),
            city: getValue('city'),
            state: getValue('state'),
            zipcode: getValue('zipcode'),
            bio: getValue('bio')
        };

        // Validate name is not empty
        if (!profileData.name.trim()) {
            showAlert('Full name is required', 'error');
            return;
        }

        const response = await fetch(`${API_URL}/user/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(profileData)
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        showAlert('Profile updated successfully!', 'success');
        console.log('✓ Profile updated');

        // Update header and local storage immediately
        if (profileData.name) {
            localStorage.setItem('userName', profileData.name);
            const headerName = document.getElementById('user-name-display');
            if (headerName) headerName.textContent = profileData.name;
        }

    } catch (error) {
        console.error('Error updating profile:', error);
        showAlert(error.message || 'Failed to update profile', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        submitBtn.style.opacity = "1";
    }
}

// Change password
async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const submitBtn = document.querySelector('#passwordForm button[type="submit"]');
    const originalText = submitBtn.textContent;

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        showAlert('Please fill in all password fields', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showAlert('New password must be at least 6 characters', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showAlert('Passwords do not match', 'error');
        return;
    }

    if (currentPassword === newPassword) {
        showAlert('New password must be different from current password', 'error');
        return;
    }

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = "Updating...";
        submitBtn.style.opacity = "0.7";

        const response = await fetch(`${API_URL}/user/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                currentPassword,
                newPassword
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to change password');
        }

        showAlert('Password changed successfully!', 'success');
        document.getElementById('passwordForm').reset();
        console.log('✓ Password changed');
    } catch (error) {
        console.error('Error changing password:', error);
        showAlert(error.message || 'Failed to change password', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        submitBtn.style.opacity = "1";
    }
}

// Delete account
async function deleteAccount() {
    const confirmed = confirm(
        'Are you sure you want to delete your account? This action cannot be undone.\n\n' +
        'All your data will be permanently deleted.'
    );

    if (!confirmed) return;

    const finalConfirm = prompt(
        'Type "DELETE" to confirm account deletion:'
    );

    if (finalConfirm !== 'DELETE') {
        showAlert('Account deletion cancelled', 'info');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/user/profile`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to delete account');
        }

        showAlert('Account deleted. Redirecting to home...', 'success');
        setTimeout(() => {
            logout();
        }, 2000);
    } catch (error) {
        console.error('Error deleting account:', error);
        showAlert(error.message || 'Failed to delete account', 'error');
    }
}

// Logout
function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    window.location.href = 'index.html';
}

// Show Toast Notification
function showAlert(message, type = 'info') {
    // Remove existing toasts to prevent stacking too many
    const existing = document.querySelectorAll('.toast-notification');
    existing.forEach(e => e.remove());

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;

    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto-remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
