/* 
#===========================#

    Signup Page       

#===========================#
*/
const registerForm = document.getElementById("signup-form");
if (registerForm) {

    registerForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const firstName = document.getElementById("first-name").value;
        const secondName = document.getElementById("second-name").value;
        const email = document.getElementById("email").value;
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirm-password").value;

        if (password.value !== confirmPassword.value) {

            showMessage(
                "Passwords do not match",
                "error"
            );

            return;
        }

        const response = await fetch("/api/auth/register", {

            method: "POST",
            headers: { "Content-Type": "application/json" },
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

            showMessage(
                data.message,
                "success"
            )

            registerForm.reset();

            setTimeout(() => {
                window.location.href = "/signin";
            }, 1000);

        } else {

            showMessage(
                data.message,
                "error"
            )
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

        const login = document.getElementById("username").value;
        const password = document.getElementById("password").value;

        const response = await fetch("/api/auth/login", {

            method: "POST",
            headers: { "Content-type": "application/json" },
            body: JSON.stringify({
                login: login,
                password: password
            })
        });

        const data = await response.json();

        if (response.ok) {

            showMessage(
                data.message,
                "success"
            )

            loginForm.reset();

            window.location.href = "/drive";


        } else {

            showMessage(
                data.message,
                "error"
            )
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
