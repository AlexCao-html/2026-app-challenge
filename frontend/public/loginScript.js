const usernameField = document.querySelector("#usernameField");
const usernameInput = document.querySelector("#username");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const errorMessage = document.querySelector("#errorMessage");
const signInButton = document.querySelector("#signInButton");
const toggleModeLink = document.querySelector("#toggleMode");
const formTitle = document.querySelector("#formTitle");

let mode = "login";

function setError(message) {
    errorMessage.textContent = message || "";
}

async function handleSubmit() {
    setError("");
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
        if (mode === "signup") {
            const username = usernameInput.value.trim();
            await storageApi.signup({ username, email, password });
        }
        await storageApi.login({ email, password });
        window.location.href = "index.html";
    } catch (err) {
        if (err instanceof ApiError) {
            setError(err.detail);
        } else {
            setError("Could not reach the server. Is the API running?");
        }
    }
}

signInButton.addEventListener("click", handleSubmit);

toggleModeLink.addEventListener("click", (event) => {
    event.preventDefault();
    mode = mode === "login" ? "signup" : "login";
    usernameField.classList.toggle("hidden", mode !== "signup");
    formTitle.textContent = mode === "signup" ? "Sign Up" : "Login";
    signInButton.textContent = mode === "signup" ? "Sign Up" : "Sign In";
    toggleModeLink.textContent =
        mode === "signup" ? "Already have an account? Log in" : "Don't have an account? Sign up";
    setError("");
});
