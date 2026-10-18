
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

    onlineMessageTimer = setTimeout(() => {
        connectionMessage.hidden = true;
    }, 4000);
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

/* ===========================# File Preview Function #=========================== */

const previewModal = document.getElementById("file-preview-modal");
const previewFileName = document.getElementById("preview-file-name");
const previewContent = document.getElementById("preview-content");
const previewMessage = document.getElementById("preview-message");
const previewClose = document.getElementById("preview-close");
const previewFileSize = document.getElementById("preview-file-size");
const previewPrevious = document.getElementById("preview-previous");
const previewNext = document.getElementById("preview-next");
const previewDownloadButton = document.getElementById("preview-download");
const previewMenuToggle = document.getElementById("preview-menu-toggle");
const previewMenu = document.getElementById("preview-menu");
const previewDetailsAction = document.getElementById("preview-details-action");

let previewFiles = [];
let currentPreviewItems = previewFiles;
let currentPreviewIndex = -1;
let isPreviewNavigationActive = true;

function openFilePreview(file, items = previewFiles) {

    currentPreviewItems = items;

    isPreviewNavigationActive = true;

    currentPreviewIndex = currentPreviewItems.findIndex(
        item => item.id === file.id
    );

    previewPrevious.disabled = currentPreviewIndex <= 0;

    previewNext.disabled =
        currentPreviewIndex < 0 ||
        currentPreviewIndex >= currentPreviewItems.length - 1;

    // Show the modal.
    previewModal.hidden = false;

    // Display the selected filename.
    previewFileName.textContent = file.name;

    previewFileSize.textContent = formatFileSize(file.size);

    // Remove the previous file's content.
    previewContent.replaceChildren();

    // Hide any previous message.
    previewMessage.hidden = true;
    previewMessage.textContent = "";

    // Build the preview API URL.
    const previewUrl = `/api/files/${file.id}/preview`;

    // Display the appropriate content.
    if (file.file_type === "image") {

        const image = document.createElement("img");

        image.src = previewUrl;
        image.alt = file.name;

        previewContent.appendChild(image);

    } else if (file.file_type === "pdf") {

        const pdf = document.createElement("iframe");

        pdf.src = previewUrl;
        pdf.title = file.name;

        previewContent.appendChild(pdf);

        pdf.addEventListener("load", () => {
            isPreviewNavigationActive = false;
        });

    } else if (file.file_type === "video") {
        const video = document.createElement("video");

        video.src = previewUrl;
        video.controls = true;
        video.autoplay = true;
        video.tabIndex = 0;

        previewContent.appendChild(video);

        video.addEventListener("pointerdown", () => {
            isPreviewNavigationActive = false;
        });

        video.addEventListener("keydown", (event) => {
            event.stopPropagation();
        });

    } else if (file.file_type === "audio") {

        const audio = document.createElement("audio");

        audio.src = previewUrl;
        audio.controls = true;
        audio.autoplay = true;

        previewContent.appendChild(audio);

    } else {

        showPreviewMessage(
            "Preview not supported. Please download this file."
        );

    }
}

// Display file size.
function formatFileSize(bytes) {
    if (bytes == null || !Number.isFinite(Number(bytes)) || Number(bytes) < 0) {
        return "Size unavailable";
    }

    bytes = Number(bytes);

    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// downlaod file.
previewDownloadButton.addEventListener("click", () => {

    // Make sure a file is currently open.
    if (
        currentPreviewIndex < 0 ||
        currentPreviewIndex >= currentPreviewItems.length
    ) {
        return;
    }

    const file = currentPreviewItems[currentPreviewIndex];

    // Download the selected file.
    window.location.href = `/api/files/${file.id}/download`;

});

// Display a message inside the preview.
function showPreviewMessage(message) {

    previewContent.replaceChildren();

    previewMessage.textContent = message;
    previewMessage.hidden = false;

    previewContent.appendChild(previewMessage);

}


// Close the preview.
function closeFilePreview() {

    previewModal.hidden = true;

    // Stop audio or video playback and release the previous content.
    previewContent.replaceChildren();

}


// Close button.
previewClose.addEventListener("click", closeFilePreview);


// Close when clicking the dark background.
previewModal.addEventListener("click", (event) => {

    if (event.target === previewModal) {
        closeFilePreview();
    }

});


document.addEventListener("keydown", (event) => {

    // Only handle shortcuts when the preview is open.
    if (previewModal.hidden) {
        return;
    }

    // Escape closes the topmost UI first.
    if (event.key === "Escape") {

        if (!previewDetailsModal.hidden) {
            previewDetailsModal.hidden = true;
            return;
        }

        if (!previewMenu.hidden) {
            closePreviewMenu();
            return;
        }

        closeFilePreview();
        return;
    }

    const target = event.target;

    const isInteractiveElement = target.closest(
        "input, textarea, select, button, a, video, audio, iframe, [contenteditable='true']"
    );

    if (!isPreviewNavigationActive) return;

    if (event.key === "ArrowLeft") {
        if (currentPreviewIndex > 0) {
            openFilePreview(
                currentPreviewItems[currentPreviewIndex - 1],
                currentPreviewItems
            );
        }
        return;
    }

    if (event.key === "ArrowRight") {
        if (
            currentPreviewIndex >= 0 &&
            currentPreviewIndex < currentPreviewItems.length - 1
        ) {
            openFilePreview(
                currentPreviewItems[currentPreviewIndex + 1],
                currentPreviewItems
            );
        }
    }

});

previewPrevious.addEventListener("click", () => {
    isPreviewNavigationActive = true;

    const previousIndex = currentPreviewIndex - 1;

    if (previousIndex >= 0) {
        openFilePreview(
            currentPreviewItems[previousIndex],
            currentPreviewItems
        );
    }
});

previewNext.addEventListener("click", () => {
    isPreviewNavigationActive = true;

    if (
        currentPreviewIndex >= 0 &&
        currentPreviewIndex < currentPreviewItems.length - 1
    ) {
        openFilePreview(
            currentPreviewItems[currentPreviewIndex + 1],
            currentPreviewItems
        );
    }
});

// Open or close the More options menu.
previewMenuToggle.addEventListener("click", (event) => {
    event.stopPropagation();

    const isOpen = !previewMenu.hidden;

    previewMenu.hidden = isOpen;
    previewMenuToggle.setAttribute("aria-expanded", String(!isOpen));
});


// Close the menu when clicking outside it.
document.addEventListener("click", (event) => {

    if (
        !previewMenu.hidden &&
        !previewMenu.contains(event.target) &&
        !previewMenuToggle.contains(event.target)
    ) {
        closePreviewMenu();
    }

});


// Close the menu and update its accessibility state.
function closePreviewMenu() {
    previewMenu.hidden = true;
    previewMenuToggle.setAttribute("aria-expanded", "false");
}


// Close the menu with Escape.
document.addEventListener("keydown", (event) => {

    if (event.key === "Escape" && !previewMenu.hidden) {
        closePreviewMenu();
    }

});


/* #===========================# File detail popup #===========================# */
const previewDetailsModal = document.getElementById("preview-details-modal");
const previewDetailsClose = document.getElementById("preview-details-close");

const detailsFileName = document.getElementById("details-file-name");
const detailsFileSize = document.getElementById("details-file-size");
const detailsFileType = document.getElementById("details-file-type");
const detailsFileId = document.getElementById("details-file-id");

// Open File details for the currently previewed file.
previewDetailsAction.addEventListener("click", () => {

    if (
        currentPreviewIndex < 0 ||
        currentPreviewIndex >= previewFiles.length
    ) {
        return;
    }

    const file = previewFiles[currentPreviewIndex];

    detailsFileName.textContent = file.name;
    detailsFileSize.textContent = formatFileSize(file.size);
    detailsFileType.textContent = file.file_type;
    detailsFileId.textContent = file.id;

    previewDetailsModal.hidden = false;

    closePreviewMenu();

});


// Close File details.
previewDetailsClose.addEventListener("click", () => {
    previewDetailsModal.hidden = true;
});


// Close File details by clicking its backdrop.
previewDetailsModal.addEventListener("click", (event) => {

    if (event.target === previewDetailsModal) {
        previewDetailsModal.hidden = true;
    }

});

/* #===========================# Content changer #===========================# */
const sidebarButtons = document.querySelectorAll(
    ".left-sidebar .sidebar-menu-button[data-section]"
);

const cards = document.querySelectorAll(
    ".grid-container .card[data-section]"
);

const sections = document.querySelectorAll(
    ".holder .drive-section"
);


// Function to change the active section
function changeSection(sectionId, clickedButton = null) {

    // Find the matching section
    const selectedSection = document.querySelector(
        `.holder .drive-section#${sectionId}`
    );

    // Check whether the section exists
    if (!selectedSection) {
        console.error(`Section not found: ${sectionId}`);
        return;
    }

    // Hide all sections
    sections.forEach(section => {
        section.classList.remove("active");
    });

    // Deactivate all sidebar buttons
    sidebarButtons.forEach(button => {
        button.classList.remove("active");
    });

    // Show the selected section
    selectedSection.classList.add("active");

    // Activate the corresponding sidebar button
    const matchingSidebarButton = document.querySelector(
        `.left-sidebar .sidebar-menu-button[data-section="${sectionId}"]`
    );

    if (matchingSidebarButton) {
        matchingSidebarButton.classList.add("active");
    }

    // Load Trash when its section opens
    if (sectionId === "trash") {
        trashFolderHistory = [];
        loadTrashFolder();
    }

    if (sectionId === "images") {
        loadImages();
    }

    if (sectionId === "documents") {
        loadDocuments();
    }

    if (sectionId === "videos") {
        loadVideos();
    }

    if (sectionId === "gallery") {
        loadGallery();
    }

    // console.log("Showing section:", sectionId);
}


// Sidebar button clicks
sidebarButtons.forEach(button => {
    button.addEventListener("click", () => {
        changeSection(button.dataset.section, button);
    });
});


// Card clicks
cards.forEach(card => {
    card.addEventListener("click", () => {
        changeSection(card.dataset.section);
    });
});


/* ===========================# permanent deletion Popup Menu #=========================== */
function showConfirm({
    title = "Are you sure?",
    message = "Do you want to continue?",
    confirmText = "Confirm",
    cancelText = "Cancel",
    danger = false
} = {}) {
    const modal = document.getElementById("confirm-modal");
    const titleElement = document.getElementById("confirm-title");
    const messageElement = document.getElementById("confirm-message");
    const acceptButton = document.getElementById("confirm-accept-button");
    const cancelButton = document.getElementById("confirm-cancel-button");

    if (!modal || !titleElement || !messageElement ||
        !acceptButton || !cancelButton) {
        console.error("Confirmation modal elements not found.");
        return Promise.resolve(false);
    }

    // Set the popup content
    titleElement.textContent = title;
    messageElement.textContent = message;
    acceptButton.textContent = confirmText;
    cancelButton.textContent = cancelText;

    // Set the confirmation button's appearance
    acceptButton.style.backgroundColor = danger ? "#dc2626" : "";
    acceptButton.style.borderColor = danger ? "#dc2626" : "";
    acceptButton.style.color = danger ? "#ffffff" : "";

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");

    return new Promise(resolve => {
        let finished = false;

        function closeModal(result) {
            if (finished) return;
            finished = true;

            modal.classList.remove("open");
            modal.setAttribute("aria-hidden", "true");

            acceptButton.removeEventListener("click", onAccept);
            cancelButton.removeEventListener("click", onCancel);
            modal.removeEventListener("click", onOverlayClick);
            document.removeEventListener("keydown", onKeyDown);

            resolve(result);
        }

        function onAccept() {
            closeModal(true);
        }

        function onCancel() {
            closeModal(false);
        }

        function onOverlayClick(event) {
            if (event.target === modal) {
                closeModal(false);
            }
        }

        function onKeyDown(event) {
            if (event.key === "Escape") {
                closeModal(false);
            } else if (event.key === "Enter") {
                event.preventDefault();
                closeModal(true);
            }
        }

        acceptButton.addEventListener("click", onAccept);
        cancelButton.addEventListener("click", onCancel);
        modal.addEventListener("click", onOverlayClick);
        document.addEventListener("keydown", onKeyDown);

        cancelButton.focus();
    });
}

/* #===========================# Account updater #===========================# */
const accountEditButton = document.getElementById("account-edit-button");
const accountEditModal = document.getElementById("account-edit-modal");
const accountEditForm = document.getElementById("account-edit-form");

const accountModalClose = document.getElementById("account-modal-close");
const accountEditCancel = document.getElementById("account-edit-cancel");
const accountEditConfirm = document.getElementById("account-edit-confirm");

const editFirstName = document.getElementById("edit-first-name");
const editSecondName = document.getElementById("edit-second-name");
const editEmail = document.getElementById("edit-email");

const accountFormMessage = document.getElementById("account-form-message");

function openAccountEditModal() {
    // Copy the current card values into the form.
    editFirstName.value =
        document.getElementById("account-first-name").textContent;

    editSecondName.value =
        document.getElementById("account-second-name").textContent;

    editEmail.value =
        document.getElementById("account-email").textContent;

    accountFormMessage.textContent = "";
    accountEditConfirm.disabled = false;
    accountEditConfirm.textContent = "Confirm changes";

    accountEditModal.hidden = false;
    editFirstName.focus();
}

function closeAccountEditModal() {
    accountEditModal.hidden = true;
    accountEditForm.reset();
    accountFormMessage.textContent = "";
}

accountEditButton.addEventListener("click", openAccountEditModal);
accountModalClose.addEventListener("click", closeAccountEditModal);
accountEditCancel.addEventListener("click", closeAccountEditModal);

// Close when clicking the dark overlay, but not the popup itself.
accountEditModal.addEventListener("click", event => {
    if (event.target === accountEditModal) {
        closeAccountEditModal();
    }
});

// Close when pressing Escape.
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !accountEditModal.hidden) {
        closeAccountEditModal();
    }
});

accountEditForm.addEventListener("submit", async event => {
    event.preventDefault();

    const payload = {
        first_name: editFirstName.value.trim(),
        second_name: editSecondName.value.trim(),
        email: editEmail.value.trim()
    };

    if (
        !payload.first_name ||
        !payload.second_name ||
        !payload.email
    ) {
        accountFormMessage.textContent = "Please fill in all fields.";
        return;
    }

    accountEditConfirm.disabled = true;
    accountEditConfirm.textContent = "Saving...";
    accountFormMessage.textContent = "";

    try {
        const response = await fetch("/api/auth/me/profile", {
            method: "PATCH",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {

            showMessage(
                result.error || result.message || "Unable to update your account.",
                "error"
            );
            return
        }

        const user = result.user;

        document.getElementById("account-first-name").textContent =
            user.first_name;

        document.getElementById("account-second-name").textContent =
            user.second_name;

        document.getElementById("account-email").textContent =
            user.email;

        const emailStatus = document.getElementById("account-email-status");

        if (user.email_verified) {
            emailStatus.textContent = "Verified";
            emailStatus.className = "verification-status verified";
        } else {
            emailStatus.textContent = "Not verified";
            emailStatus.className = "verification-status unverified";
        }

        closeAccountEditModal();

        // Changing email may require verification before it can be trusted.
        if (result.email_changed) {

            showMessage(
                result.message ||
                "Your account was updated. Please verify your new email address.",
                "success"
            );

        }
    } catch (error) {
        accountFormMessage.textContent = error.message;
    } finally {
        accountEditConfirm.disabled = false;
        accountEditConfirm.textContent = "Confirm changes";
    }
});

/* #===========================# Progress bar #===========================# */

const uploadProgressContainer = document.getElementById(
    "upload-progress-container"
);

const uploadProgressText = document.getElementById(
    "upload-progress-text"
);

const uploadProgressPercent = document.getElementById(
    "upload-progress-percent"
);

const uploadProgressBar = document.getElementById(
    "upload-progress-bar"
);

const uploadProgressFill = document.getElementById(
    "upload-progress-fill"
);

// Prevent multiple simultaneous uploads.


uploadFileButton.addEventListener("click", () => {
    if (isUploading) {
        return;
    }

    addMenu.classList.remove("open");
    fileInput.click();
});

fileInput.addEventListener("change", async () => {
    if (isUploading) {
        return;
    }

    const files = Array.from(fileInput.files);

    if (files.length === 0) {
        return;
    }

    isUploading = true;
    uploadFileButton.disabled = true;

    const formData = new FormData();

    files.forEach(file => {
        formData.append("files", file);
    });

    if (currentFolderId !== null) {
        formData.append("folder_id", currentFolderId);
    }

    uploadProgressContainer.hidden = false;
    uploadProgressText.textContent = `Uploading ${files.length} file(s)...`;
    uploadProgressPercent.textContent = "0%";
    uploadProgressFill.style.width = "0%";
    uploadProgressBar.setAttribute("aria-valuenow", "0");

    try {
        const result = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.open("POST", "/api/files/");

            xhr.upload.addEventListener("progress", event => {
                if (!event.lengthComputable) {
                    return;
                }

                const percent = Math.round(
                    (event.loaded / event.total) * 100
                );

                uploadProgressFill.style.width = `${percent}%`;
                uploadProgressPercent.textContent = `${percent}%`;
                uploadProgressBar.setAttribute(
                    "aria-valuenow",
                    String(percent)
                );
            });

            xhr.addEventListener("load", () => {
                let data;

                try {
                    data = JSON.parse(xhr.responseText);
                } catch {
                    reject(new Error("Invalid server response."));
                    return;
                }

                resolve({
                    status: xhr.status,
                    data
                });
            });

            xhr.addEventListener("error", () => {
                reject(new Error("Network error during upload."));
            });

            xhr.send(formData);
        });

        const { status, data } = result;

        if (status === 201 || status === 207) {
            uploadProgressFill.style.width = "100%";
            uploadProgressPercent.textContent = "100%";
            uploadProgressBar.setAttribute("aria-valuenow", "100");
            uploadProgressText.textContent = "Upload complete!";

            if (status === 207) {
                showMessage(
                    `${data.successful_count} uploaded, ${data.failed_count} failed.`,
                    "error"
                );

                console.log("Failed files:", data.failed);
            } else {
                showMessage(
                    data.message || "Files uploaded successfully.",
                    "success"
                );
            }

            await loadFolders(currentFolderId);
        } else {
            uploadProgressText.textContent = "Upload failed.";

            showMessage(
                data.message || data.error || "File upload failed.",
                "error"
            );
        }
    } catch (error) {
        console.error("UPLOAD ERROR:", error);
        uploadProgressText.textContent = "Upload failed.";

        showMessage(
            "Something went wrong while uploading files.",
            "error"
        );
    } finally {
        isUploading = false;
        uploadFileButton.disabled = false;
        fileInput.value = "";

        setTimeout(() => {
            uploadProgressContainer.hidden = true;
        }, 1500);
    }
});

/* #===========================# drag and drop #===========================# */
const dragDropOverlay = document.getElementById("drag-drop-overlay");

let dragCounter = 0;

function containsFiles(event) {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
}

document.addEventListener("dragenter", event => {
    if (!containsFiles(event)) return;

    event.preventDefault();

    dragCounter++;
    dragDropOverlay.classList.add("visible");
});

document.addEventListener("dragover", event => {
    if (!containsFiles(event)) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
});

document.addEventListener("dragleave", event => {
    if (!containsFiles(event)) return;

    dragCounter = Math.max(0, dragCounter - 1);

    if (dragCounter === 0) {
        dragDropOverlay.classList.remove("visible");
    }
});

dragDropOverlay.addEventListener("dragover", event => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
});

// Read files and nested folders from the dropped items.
async function readDroppedItems(dataTransferItems) {
    const files = [];
    let containsFolder = false;

    async function readEntry(entry, parentPath = "") {
        if (entry.isFile) {
            const file = await new Promise((resolve, reject) => {
                entry.file(resolve, reject);
            });

            // Preserve the relative path required by the folder-upload API.
            Object.defineProperty(file, "webkitRelativePath", {
                value: parentPath + file.name
            });

            files.push(file);
            return;
        }

        if (entry.isDirectory) {
            containsFolder = true;

            const reader = entry.createReader();

            // readEntries() may return results in batches.
            while (true) {
                const entries = await new Promise((resolve, reject) => {
                    reader.readEntries(resolve, reject);
                });

                if (entries.length === 0) break;

                for (const childEntry of entries) {
                    await readEntry(
                        childEntry,
                        parentPath + entry.name + "/"
                    );
                }
            }
        }
    }

    async function readItem(item) {
        if (typeof item.webkitGetAsEntry !== "function") {
            return;
        }

        const entry = item.webkitGetAsEntry();

        if (entry) {
            await readEntry(entry);
        }
    }

    for (const item of Array.from(dataTransferItems || [])) {
        if (item.kind !== "file") continue;
        await readItem(item);
    }

    return { files, containsFolder };
}

dragDropOverlay.addEventListener("drop", async event => {
    event.preventDefault();
    event.stopPropagation();

    dragCounter = 0;
    dragDropOverlay.classList.remove("visible");

    if (isUploading) {
        showMessage("Please wait for the current upload to finish.", "error");
        return;
    }

    try {
        const result = await readDroppedItems(event.dataTransfer.items);

        console.log("Items dropped:", result.files.length);

        if (result.files.length === 0) {
            showMessage("No files were detected.", "error");
            return;
        }

        if (result.containsFolder) {
            await uploadFolderFiles(result.files);
        } else {
            await uploadFiles(result.files);
        }
    } catch (error) {
        console.error("Could not read dropped items:", error);
        showMessage("Could not read the dropped folder or files.", "error");
    }
});

document.addEventListener("drop", event => {
    if (!containsFiles(event)) return;

    event.preventDefault();

    dragCounter = 0;
    dragDropOverlay.classList.remove("visible");
});

/* #===========================# storage #===========================# */
function formatStorageSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) {
        return "Unknown";
    }

    if (bytes === 0) {
        return "0 B";
    }

    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    const unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));
    const index = Math.min(unitIndex, units.length - 1);

    const size = bytes / Math.pow(1024, index);

    return `${size.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}


async function loadStorageInfo() {
    const elements = {
        systemUsed: document.getElementById("mycloud-storage-used"),
        diskTotal: document.getElementById("disk-total"),
        diskAvailable: document.getElementById("disk-available"),
        userUsed: document.getElementById("user-storage-used"),
        otherUsed: document.getElementById("other-storage-used")
    };

    try {
        const response = await fetch("/api/files/storage", {
            method: "GET",
            credentials: "same-origin"
        });

        if (!response.ok) {
            throw new Error(`Storage request failed: ${response.status}`);
        }

        const data = await response.json();

        // Update the HTML with the values returned by the backend.
        elements.systemUsed.textContent = formatStorageSize(
            data.mycloud_system_storage.used_bytes
        );

        elements.diskTotal.textContent = formatStorageSize(
            data.disk_storage.total_bytes
        );

        elements.diskAvailable.textContent = formatStorageSize(
            data.disk_storage.available_bytes
        );

        elements.userUsed.textContent = formatStorageSize(
            data.user_storage.used_bytes
        );

        elements.otherUsed.textContent = formatStorageSize(
            data.other_storage.used_bytes
        );

    } catch (error) {
        console.error("Could not load storage information:", error);

        // Show an error instead of leaving "Loading..." on the page.
        Object.values(elements).forEach(element => {
            if (element) {
                element.textContent = "Unavailable";
            }
        });
    }
}


// Load storage information when the page is ready.
document.addEventListener("DOMContentLoaded", loadStorageInfo);