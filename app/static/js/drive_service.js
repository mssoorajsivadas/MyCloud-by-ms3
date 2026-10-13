
/* ===========================# Page Offline or Online Finder #=========================== */
const connectionMessage = document.getElementById("connection-message");

let onlineMessageTimer;

function showConnectionMessage(message, type) {
    if (!connectionMessage) return;

    clearTimeout(onlineMessageTimer);

    connectionMessage.textContent = message;
    connectionMessage.className = `connection-message ${type}`;
    connectionMessage.hidden = false;

    // Automatically hide the connection-restored message.
    if (type === "online") {
        onlineMessageTimer = setTimeout(() => {
            connectionMessage.hidden = true;
        }, 4000);
    }
}

function hideConnectionMessage() {
    if (!connectionMessage) return;

    clearTimeout(onlineMessageTimer);
    connectionMessage.hidden = true;
}

window.addEventListener("offline", () => {
    showConnectionMessage(
        "You're offline. Some features may not be available.",
        "offline"
    );
});

window.addEventListener("online", () => {
    showConnectionMessage(
        "Connection restored.",
        "online"
    );
});

// Handle the case where the page opens while already offline.
if (!navigator.onLine) {
    showConnectionMessage(
        "You're offline. Some features may not be available.",
        "offline"
    );
}


/* ===========================# Side Bar Function #=========================== */
const container = document.querySelector(".container");

const leftToggle = document.getElementById("left-sidebar-toggle");

const rightToggle = document.getElementById("right-sidebar-toggle");

// Restore LEFT sidebar state
const leftSavedState = localStorage.getItem("leftSidebarCollapsed");

if (leftSavedState === "true") {
    container.classList.add("left-sidebar-collapsed");
}

// Restore RIGHT sidebar state
const rightSavedState = localStorage.getItem("rightSidebarCollapsed");

if (rightSavedState === "true") {
    container.classList.add("right-sidebar-collapsed");
}

// LEFT sidebar button
leftToggle.addEventListener("click", () => {

    container.classList.toggle("left-sidebar-collapsed");

    const isLeftCollapsed = container.classList.contains("left-sidebar-collapsed");

    localStorage.setItem(
        "leftSidebarCollapsed",
        isLeftCollapsed
    );

});

// RIGHT sidebar button
rightToggle.addEventListener("click", () => {

    container.classList.toggle("right-sidebar-collapsed");

    const isRightCollapsed = container.classList.contains("right-sidebar-collapsed");

    localStorage.setItem(
        "rightSidebarCollapsed",
        isRightCollapsed
    );
});


/* ===========================# Theme Changer #=========================== */
// Color theme changer
const themeToggle = document.querySelector("#theme-toggle");
const themeIcon = document.querySelector("#theme-icon");

// Read the saved theme, or use light mode by default.
let currentTheme = localStorage.getItem("theme") || "light";

// Apply the selected theme.
function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);

    currentTheme = theme;

    // Update the button to show the opposite action.
    if (theme === "dark") {
        themeIcon.textContent = "light_mode";
        themeToggle.setAttribute("aria-label", "Switch to light theme");
    } else {
        themeIcon.textContent = "dark_mode";
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


/* ===========================# Account Menu #=========================== */
// account menu open
const accountButton = document.querySelector("#account-button");
const accountMenu = document.querySelector("#account-menu");

accountButton.addEventListener("click", () => {
    accountMenu.classList.toggle("open");
});

document.addEventListener("click", (event) => {

    if (!accountMenu.contains(event.target) &&
        !accountButton.contains(event.target)) {

        accountMenu.classList.remove("open");

    }

});


/* ===========================# Add Button #=========================== */
//add button menu
const addButton = document.getElementById("add-button");

const addMenu = document.getElementById("add-menu");

/*
    Open / close New menu
*/
addButton.addEventListener("click", (event) => {

    event.stopPropagation();

    addMenu.style.position = "";
    addMenu.style.left = "";
    addMenu.style.top = "";

    addMenu.classList.toggle("open");

});

/*
    Close menu when clicking outside
*/
document.addEventListener("click", (event) => {

    if (!addMenu.contains(event.target) &&
        !addButton.contains(event.target)) {

        addMenu.classList.remove("open");

    }

});


/* ===========================# Popup Menu #=========================== */

//popup menu 
const closeFolderModal =
    document.querySelector("#close-folder-modal");

const cancelFolderButton =
    document.querySelector("#cancel-folder-button");

// Close popup
closeFolderModal.addEventListener("click", () => {

    createFolderModal.classList.remove("open");

});

// Cancel
cancelFolderButton.addEventListener("click", () => {

    createFolderModal.classList.remove("open");

});


/* ===========================# Copy Dialog Close Function #=========================== */
const closeCopyDialog =
    document.getElementById("close-copy-dialog");

if (closeCopyDialog) {
    closeCopyDialog.addEventListener("click", () => {
        document.getElementById("copy-dialog").style.display = "none";
    });
}

const closeMoveDialog =
    document.getElementById("close-move-dialog");

if (closeMoveDialog) {
    closeMoveDialog.addEventListener("click", () => {
        document.getElementById("move-dialog").style.display = "none";
    });
}
