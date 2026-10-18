/* 
#===========================#

    Signup Page       

#===========================#
*/
const registerForm = document.getElementById("signup-form");

if (registerForm) {
    registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const firstName = document.getElementById("first-name").value.trim();
        const secondName = document.getElementById("second-name").value.trim();
        const email = document.getElementById("email").value.trim();
        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirm-password").value;

        // Check that passwords match
        if (password !== confirmPassword) {
            showMessage("Passwords do not match", "error");
            return;
        }

        try {
            const response = await fetch("/api/auth/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    first_name: firstName,
                    second_name: secondName,
                    email: email,
                    username: username,
                    password: password
                })
            });

            const data = await response.json();

            if (response.ok) {
                showMessage(data.message, "success");

                registerForm.reset();

                setTimeout(() => {
                    window.location.href = "/signin";
                }, 1000);

            } else {
                showMessage(
                    data.error || data.message || "Registration failed",
                    "error"
                );
            }

        } catch (error) {
            console.error("Registration request failed:", error);

            showMessage(
                "Unable to connect to the server. Please try again.",
                "error"
            );
        }
    });
}

/* 
#===========================#

    Signin Page       

#===========================#
*/
const loginForm = document.getElementById("signin-form");

if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const login = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value;

        if (!login || !password) {
            showMessage("Please enter your username/email and password.", "error");
            return;
        }

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    login: login,
                    password: password
                })
            });

            const data = await response.json();

            if (response.ok) {
                showMessage(data.message, "success");
                loginForm.reset();
                window.location.href = "/drive";
            } else {
                showMessage(
                    data.message || data.error || "Login failed.",
                    "error"
                );
            }
        } catch (error) {
            console.error("Login request failed:", error);
            showMessage("Unable to connect to the server. Please try again.", "error");
        }
    });
}

/* 
#===========================#

    Theme Changer       

#===========================#
*/
const themeToggle = document.querySelector("#theme-toggle");
const themeIcon = document.querySelector("#theme-icon");
const themeLabel = document.querySelector("#theme-label");

// Read the saved theme, or use light mode by default.
let currentTheme = localStorage.getItem("theme") || "light";

// Apply the selected theme.
function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);

    currentTheme = theme;

    // Update the button to show the opposite action.
    if (theme === "dark") {
        themeIcon.textContent = "light_mode";
        themeLabel.textContent = "Light mode";
        themeToggle.setAttribute("aria-label", "Switch to light theme");
    } else {
        themeIcon.textContent = "dark_mode";
        themeLabel.textContent = "Dark mode";
        themeToggle.setAttribute("aria-label", "Switch to dark theme");
    }

    // Remember the selection.
    localStorage.setItem("theme", theme);
}

// Apply the saved theme when the page loads.
applyTheme(currentTheme);

// Toggle between light and dark when clicked.
themeToggle.addEventListener("click", () => {
    const newTheme = currentTheme === "light" ? "dark" : "light";

    applyTheme(newTheme);
});
