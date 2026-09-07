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
    } catch (err) {
        goToLogin();
    }
})();

document.querySelector("#logoutButton").addEventListener("click", goToLogin);
