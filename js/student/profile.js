/* Student profile page controller. */

document.documentElement.dataset.cecPage = "student-profile";

document.addEventListener("DOMContentLoaded", function () {

    const dashboardHome = document.getElementById("dashboardHome");

    if (!dashboardHome) {
        return;
    }

    dashboardHome.innerHTML = `
        <div class="profile-header">
            <h1>Profile & Contact</h1>
            <p>Manage your student profile and account.</p>
        </div>

        <div class="profile-logout-section">
            <h2>Account</h2>

            <p>
                When you are finished using the CEC Portal,
                you can safely log out of your account.
            </p>

            <button type="button" id="profileLogoutBtn" class="profile-logout-btn">
                ↪ Logout
            </button>
        </div>
    `;

    const profileLogoutBtn = document.getElementById("profileLogoutBtn");

    if (profileLogoutBtn) {
        profileLogoutBtn.addEventListener("click", function () {

            const confirmLogout = confirm(
                "Are you sure you want to logout?"
            );

            if (confirmLogout) {
                localStorage.removeItem("cecCurrentUser");
                window.location.href = "index.html";
            }

        });
    }

});