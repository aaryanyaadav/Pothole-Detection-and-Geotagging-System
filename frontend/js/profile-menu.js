// Profile Menu Handler
// Manages user profile dropdown in header

// Check if user is logged in and update header
function initializeProfileMenu() {
    const authToken = localStorage.getItem('authToken');
    const userEmail = localStorage.getItem('userEmail');
    const userName = localStorage.getItem('userName');

    const profileMenu = document.querySelector('.profile-menu');
    const loginLink = document.getElementById('login-link');
    const userNameDisplay = document.getElementById('user-name-display');
    const dropdownUserEmail = document.getElementById('dropdown-user-email');
    const profileBtn = document.getElementById('profile-btn');

    // Action buttons
    const cameraBtn = document.getElementById('camera-action-btn');
    const mapBtn = document.getElementById('map-action-btn');

    if (authToken && userEmail) {
        // User is logged in
        loginLink.style.display = 'none';
        profileMenu.style.display = 'block';

        // Enable action buttons
        if (cameraBtn) {
            cameraBtn.disabled = false;
            cameraBtn.style.opacity = '1';
            cameraBtn.style.cursor = 'pointer';
        }
        if (mapBtn) {
            mapBtn.disabled = false;
            mapBtn.style.opacity = '1';
            mapBtn.style.cursor = 'pointer';
        }

        // Set user name in button
        userNameDisplay.textContent = userName || userEmail.split('@')[0];

        // Set email in dropdown header
        dropdownUserEmail.textContent = userEmail;
    } else {
        // User is not logged in
        loginLink.style.display = 'block';
        profileMenu.style.display = 'none';

        // Disable action buttons
        if (cameraBtn) {
            cameraBtn.disabled = true;
            cameraBtn.style.opacity = '0.5';
            cameraBtn.style.cursor = 'not-allowed';
            cameraBtn.title = 'Login required to use camera';
        }
        if (mapBtn) {
            mapBtn.disabled = true;
            mapBtn.style.opacity = '0.5';
            mapBtn.style.cursor = 'not-allowed';
            mapBtn.title = 'Login required to use map';
        }
    }

    // Setup dropdown toggle
    if (profileBtn) {
        profileBtn.addEventListener('click', toggleProfileDropdown);
    }
}

// Toggle profile dropdown
function toggleProfileDropdown(e) {
    e.preventDefault();
    e.stopPropagation(); // Prevent immediate bubbling to document

    const dropdown = document.getElementById('profile-dropdown');
    dropdown.classList.toggle('show');

    // Close dropdown when clicking outside
    // Remove existing listener first to avoid duplicates
    document.removeEventListener('click', closeDropdownOnClickOutside);
    document.addEventListener('click', closeDropdownOnClickOutside);
}

// Close dropdown when clicking outside
function closeDropdownOnClickOutside(e) {
    const dropdown = document.getElementById('profile-dropdown');
    // Check if the click happened inside the profile menu container
    const profileMenu = e.target.closest('.profile-menu');

    if (!profileMenu) {
        // Clicked outside the menu entirely
        if (dropdown && dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
            document.removeEventListener('click', closeDropdownOnClickOutside);
        }
    }
}

// Edit profile (inline or modal)
function editProfile() {
    // Show inline profile editor in modal or navigate to dashboard
    window.location.href = 'dashboard.html';
}

// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userName');
        window.location.href = 'index.html';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializeProfileMenu);
