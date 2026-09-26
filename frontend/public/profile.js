function goToLogin() {
    storageApi.logout();
    window.location.href = "login.html";
}

(async function loadProfile() {
    if (!storageApi.isLoggedIn()) {
        goToLogin();
        return;
    }

    try {
        const user = await storageApi.whoami();
        document.querySelector("#username").innerText = user.username;
        document.querySelector("#email").innerText = user.email;
        // The accounts API doesn't track a phone number, so #phone is left at
        // its static placeholder text.

        // Now -- and only now -- that the session is confirmed, drop the user
        // back on the page they left off on. restoreLastPage() lives in
        // script.js, which index.html loads before this file.
        restoreLastPage();
    } catch (err) {
        goToLogin();
    }
})();

// The only way out is the button in the header's nav bar.
document.querySelector("#headerLogoutButton").addEventListener("click", goToLogin);
