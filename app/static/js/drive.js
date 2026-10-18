
/* ===========================# Messaging system #=========================== */

// Save a one-time message before navigating to another page.
function redirectWithMessage(url, message, type = "info") {
    sessionStorage.setItem(
        "pendingFlashMessage",
        JSON.stringify({
            message: message,
            type: type
        })
    );

    window.location.replace(url);
}

//message system
const messageContainer = document.querySelector("#message-container");

function showMessage(message, type = "success") {
    const messageBox = document.createElement("div");
    messageBox.className = `form-message ${type}`;

    const messageText = document.createElement("span");
    messageText.className = "message-text";
    messageText.textContent = message;

    const closeButton = document.createElement("button");
    closeButton.className = "message-close";
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Close notification");

    messageBox.append(messageText, closeButton);
    messageContainer.appendChild(messageBox);

    let messageTimer;

    function removeMessage() {
        clearTimeout(messageTimer);
        messageBox.remove();
    }

    closeButton.addEventListener("click", removeMessage);

    messageTimer = setTimeout(removeMessage, 5000);
}


/* ===========================# Drive State #=========================== */

let currentFolderId = null;
let folderHistory = [];

let selectedFolder = null;
let selectedFile = null;

let modalMode = "create";
let deleteMode = null;

let copyDestinationId = null;
let copyDestinationHistory = [];
let copyItemType = null;

let moveDestinationId = null;
let moveDestinationHistory = [];
let moveItemType = null;

let searchTimeout = null;
let isSearchActive = false;
let folderBeforeSearch = null;

let allSearchFiles = [];
let allSearchFolders = [];
let activeSearchType = "all";

/* ============================
   Trash Navigation State
============================ */

let currentTrashFolderId = null;
let trashFolderHistory = [];


/* ===========================# File Type #=========================== */

function getFileIcon(fileType) {
    const icons = {
        image: "image",
        video: "movie",
        audio: "audio_file",
        pdf: "picture_as_pdf",
        document: "description",
        spreadsheet: "table_chart",
        presentation: "slideshow",
        text: "text_snippet",
        code: "code",
        archive: "folder_zip",
        other: "insert_drive_file"
    };

    return icons[fileType] || icons.other;
}

/* ===========================# User info Page #=========================== */

const welcome = document.getElementById("welcome");

if (welcome) {
    fetch("/api/auth/me")
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            return response.json();
        })
        .then(data => {
            if (data.error) {
                redirectWithMessage(
                    "/signin",
                    "Your session has expired. Please sign in again.",
                    "warning"
                );
                return;
            }

            welcome.textContent = `Hi, ${data.username}`;

            // Check email verification status
            const actionRequiredBtn = document.getElementById("action-required-btn");

            if (actionRequiredBtn) {
                actionRequiredBtn.hidden = data.email_verified === true;
            }

        })
        .catch(error => {
            console.error("Failed to load user information:", error);

            showConnectionMessage(
                "Unable to connect to the server. Please check your connection and try again.",
                "offline"
            );
        });
}

/* ===========================# Account sectting #=========================== */
async function loadAccountCard() {
    const firstName = document.getElementById("account-first-name");
    const secondName = document.getElementById("account-second-name");
    const email = document.getElementById("account-email");
    const emailStatus = document.getElementById("account-email-status");

    try {
        const response = await fetch("/api/auth/me", {
            method: "GET",
            credentials: "same-origin"
        });

        const user = await response.json();

        if (!response.ok) {
            throw new Error(user.error || "Unable to load account information");
        }

        firstName.textContent = user.first_name || "Not provided";
        secondName.textContent = user.second_name || "Not provided";
        email.textContent = user.email || "Not provided";

        if (user.email_verified) {
            emailStatus.textContent = "Verified";
            emailStatus.className = "verification-status verified";
        } else {
            emailStatus.textContent = "Not verified";
            emailStatus.className = "verification-status unverified";
        }

    } catch (error) {
        console.error("Failed to load account:", error);

        firstName.textContent = "Unavailable";
        secondName.textContent = "Unavailable";
        email.textContent = "Unavailable";
        emailStatus.textContent = "Unavailable";
        emailStatus.className = "verification-status";
    }
}

/* ===========================# Logout Page #=========================== */

const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
    logoutButton.addEventListener("click", async function () {
        logoutButton.disabled = true;

        try {
            const response = await fetch("/api/auth/logout", {
                method: "POST"
            });

            const data = await response.json();

            if (response.ok) {

                sessionStorage.removeItem("driveNavigation");

                redirectWithMessage(
                    "/signin",
                    data.message || "You have been signed out successfully.",
                    "success"
                );

            } else {
                logoutButton.disabled = false;
                console.error("Logout failed:", data);
            }
        } catch (error) {
            logoutButton.disabled = false;
            console.error("Logout request failed:", error);
        }
    });
}

/* ===========================# Activity Check Page #=========================== */

let activityDetected = false;
let serverConnectionState = "unknown";

const ACTIVITY_INTERVAL = 5 * 60 * 1000; // 5 minutes

function markActivity() {
    activityDetected = true;
}

["mousemove", "keydown", "click", "scroll", "touchstart"].forEach(event => {
    document.addEventListener(event, markActivity, {
        passive: true
    });
});

setInterval(async () => {

    // Remember whether the user has been active.
    const wasActive = activityDetected;

    // Reset the flag for the next interval.
    activityDetected = false;

    try {

        // Check the server every five minutes.
        // Send an activity update only when the user was active.
        const response = await fetch(
            wasActive ? "/api/auth/activity" : "/api/auth/me",
            {
                method: wasActive ? "POST" : "GET",
                cache: "no-store"
            }
        );

        if (response.status === 401) {

            redirectWithMessage(
                "/signin",
                "Your session has expired. Please sign in again.",
                "warning"
            );

            return;
        }

        if (!response.ok) {

            if (serverConnectionState !== "unavailable") {
                showConnectionMessage(
                    "The server is having a problem. Please try again shortly.",
                    "offline"
                );
            }

            serverConnectionState = "unavailable";
            return;
        }

        const data = await response.json();

        if (data.error) {

            redirectWithMessage(
                "/signin",
                "Your session has expired. Please sign in again.",
                "warning"
            );

            return;
        }

        // If the server was unavailable, announce recovery.
        if (serverConnectionState === "unavailable") {
            showConnectionMessage(
                "Connection restored.",
                "online"
            );
        }

        serverConnectionState = "available";


    } catch (error) {

        console.error("Server connection check failed:", error);

        if (serverConnectionState !== "unavailable") {
            showConnectionMessage(
                "Unable to reach the server. Check your internet connection or try again later.",
                "offline"
            );
        }

        serverConnectionState = "unavailable";

    }

}, ACTIVITY_INTERVAL);


/* ===========================# Save Navigation State #===========================# */

function saveFolderNavigation() {

    sessionStorage.setItem(
        "driveNavigation",
        JSON.stringify({
            currentFolderId: currentFolderId,
            folderHistory: folderHistory
        })
    );
}


/* ===========================# Restore Navigation State #=========================== */

function restoreFolderNavigation() {

    const saved =
        sessionStorage.getItem("driveNavigation");

    if (!saved) {
        loadFolders(null);
        return;
    }

    try {

        const navigation = JSON.parse(saved);

        folderHistory = navigation.folderHistory || [];

        const savedFolderId = navigation.currentFolderId ?? null;

        loadFolders(savedFolderId);

    } catch (error) {

        console.error("Failed to restore folder navigation:", error);

        folderHistory = [];

        currentFolderId = null;

        sessionStorage.removeItem("driveNavigation");

        loadFolders(null);
    }
}


/* ===========================# Back Button #=========================== */

const backButton = document.getElementById("back-button");

if (backButton) {

    backButton.addEventListener("click", () => {


        if (folderHistory.length === 0) {
            return;
        }

        folderHistory.pop();

        const previousFolder =
            folderHistory.length > 0
                ? folderHistory[folderHistory.length - 1]
                : null;

        loadFolders(previousFolder ? previousFolder.id : null);
    });
}

/* ===========================# Breadcrumb #=========================== */

function updateBreadcrumb() {

    const breadcrumb = document.getElementById("breadcrumb");

    if (!breadcrumb) {
        return;
    }

    breadcrumb.innerHTML = "";

    /* ------------------------- My Drive ------------------------- */

    const home = document.createElement("button");
    home.className = "home-button";

    const homeIcon = document.createElement("span");
    homeIcon.className = "material-symbols-rounded";
    homeIcon.textContent = "hard_drive";

    const homeName = document.createElement("span");
    homeName.className = "home-label";
    homeName.textContent = "My Drive";

    home.appendChild(homeIcon);
    home.appendChild(homeName);

    home.addEventListener("click", () => {

        folderHistory = [];

        saveFolderNavigation();

        loadFolders(null);
    });

    breadcrumb.appendChild(home);


    /* ------------------------- Folder Path ------------------------- */

    folderHistory.forEach((folder, index) => {

        const separator = document.createElement("span");

        separator.textContent = " / ";

        breadcrumb.appendChild(separator);


        const folderButton = document.createElement("button");

        folderButton.textContent = folder.name;

        folderButton.addEventListener("click", () => {

            /* Keep this folder and everything before it. */

            folderHistory = folderHistory.slice(0, index + 1);

            loadFolders(folder.id);
        });

        breadcrumb.appendChild(folderButton);
    });
}


/* ===========================# Folders & Files List #=========================== */

async function loadFolders(parentId = null) {

    try {

        /* ------------------------- Folder API ------------------------- */

        let folderUrl = "/api/folders/";

        if (parentId !== null) {
            folderUrl += `?parent_id=${parentId}`;
        }

        const response = await fetch(folderUrl);
        const folder = await response.json();

        if (!response.ok) {
            if (handleVerificationRequired(folder)) {
                return;
            }

            console.log(folder.error || folder.message);
            return;
        }

        /* ------------------------- File API ------------------------- */

        const fileResponse = await fetch(
            parentId === null
                ? "/api/files/"
                : `/api/files/?folder_id=${parentId}`
        );

        const files = await fileResponse.json();

        if (!fileResponse.ok) {
            if (handleVerificationRequired(files)) {
                return;
            }

            console.log(files.error || files.message);
            return;
        }

        /* ------------------------- Update Current Folder ------------------------- */

        currentFolderId = parentId;

        saveFolderNavigation();


        /* ------------------------- Folder & File List -------------------------- */

        const folderList = document.getElementById("folder-list");

        const fileList = document.getElementById("file-list");


        /* ------------------------Clear previous content------------------------- */

        folderList.innerHTML = "";

        fileList.innerHTML = "";

        // Hide search information when browsing folders normally.
        const resultsInfo = document.getElementById("search-results-info");
        const emptyMessage = document.getElementById("search-empty-message");

        if (resultsInfo) resultsInfo.hidden = true;
        if (emptyMessage) emptyMessage.hidden = true;

        // Hide the search filter menu.
        if (searchFilterMenu) {
            searchFilterMenu.hidden = true;
            searchFilterDropdown.hidden = true;
            searchFilterToggle.setAttribute("aria-expanded", "false");
        }


        /* --------------------------- Display Folders -------------------------- */

        folder.forEach(folder => {

            const folderElement = document.createElement("button");
            folderElement.className = "folders";


            const folderIcon = document.createElement("span");
            folderIcon.className = "material-symbols-rounded";
            folderIcon.textContent = "folder";


            const folderName = document.createElement("span");
            folderName.className = "folders-label";
            folderName.textContent = folder.name;


            folderElement.appendChild(folderIcon);
            folderElement.appendChild(folderName);


            folderElement.addEventListener("click", () => {

                folderHistory.push({

                    id: folder.id,
                    name: folder.name

                });

                loadFolders(folder.id);

            });

            folderElement.addEventListener("contextmenu", (event) => {

                event.preventDefault();

                showFolderContextMenu(event, folder);

            });

            folderList.appendChild(folderElement);

        });

        /* --------------------------- Display Files -------------------------- */

        previewFiles = [...files];

        files.forEach(file => {

            const fileElement = document.createElement("div");
            fileElement.className = "files";

            fileElement.style.cursor = "pointer";

            fileElement.addEventListener("click", () => {
                openFilePreview(file);
            });

            /* --------------------------- File Preview -------------------------- */

            if (
                file.thumbnail_name &&
                (
                    file.file_type === "image" ||
                    file.file_type === "pdf" ||
                    file.file_type === "video"
                )
            ) {

                const thumbnail = document.createElement("img");

                thumbnail.className = "file-thumbnail";

                thumbnail.src = `/api/files/${file.id}/thumbnail`;

                thumbnail.alt = "";

                thumbnail.loading = "lazy";

                thumbnail.addEventListener("error", () => {

                    const fileIcon = document.createElement("span");

                    fileIcon.className = "material-symbols-rounded";

                    fileIcon.textContent = getFileIcon(file.file_type);

                    thumbnail.replaceWith(fileIcon);

                }, { once: true });

                fileElement.appendChild(thumbnail);

            } else {

                const fileIcon = document.createElement("span");

                fileIcon.className = "material-symbols-rounded";

                fileIcon.textContent = getFileIcon(file.file_type);

                fileElement.appendChild(fileIcon);

            }

            /* --------------------------- File Name -------------------------- */

            const fileName = document.createElement("span");

            fileName.className = "file-label";

            fileName.textContent = file.name;

            /* --------------------------- Context Menu -------------------------- */

            fileElement.addEventListener("contextmenu", (event) => {

                event.preventDefault();

                showFileContextMenu(event, file);

            });

            fileElement.appendChild(fileName);

            fileList.appendChild(fileElement);

        });



        updateBreadcrumb();

    } catch (error) {

        console.error(

            "Failed to load folders/files:",
            error
        );
    }

}


/* ===========================# Create Folders #=========================== */

const createFolderButton = document.getElementById("New-folder-button");

const createFolderModal = document.getElementById("create-folder-modal");

if (createFolderButton) {

    createFolderButton.addEventListener("click", () => {

        modalMode = "create";

        document.getElementById("folder-modal-title").textContent = "Create Folder";

        document.getElementById("submit-folder-name").textContent = "Create";

        const folderNameInput = document.getElementById("folder-name");

        folderNameInput.value = "";

        createFolderModal.classList.add("open");

        addMenu.classList.remove("open");

        folderNameInput.focus();
        folderNameInput.select();

    });

}

// Close when clicking outside popup
createFolderModal.addEventListener("click", (event) => {

    if (event.target === createFolderModal) {

        createFolderModal.classList.remove("open");

    }

});

/* #=========================# File Upload #==========================# */

const fileInput = document.getElementById("file-input");
const uploadFileButton = document.getElementById("upload-file-button");

let isUploading = false;

// Open the file manager.
uploadFileButton.addEventListener("click", () => {
    if (isUploading) return;

    addMenu.classList.remove("open");
    fileInput.click();
});

// File picker and drag-and-drop will both use this function.
async function uploadFiles(files) {
    if (isUploading || files.length === 0) {
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
                if (!event.lengthComputable) return;

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

        if (status === 207) {
            uploadProgressText.textContent = "Upload completed with errors.";

            showMessage(
                `${data.successful_count} uploaded, ${data.failed_count} failed.`,
                "error"
            );

            console.log("Failed files:", data.failed);

            await loadFolders(currentFolderId);
            return;
        }

        if (status !== 200 && status !== 201) {
            uploadProgressText.textContent = "Upload failed.";

            showMessage(
                data.message || data.error || "File upload failed.",
                "error"
            );

            return;
        }

        uploadProgressFill.style.width = "100%";
        uploadProgressPercent.textContent = "100%";
        uploadProgressBar.setAttribute("aria-valuenow", "100");
        uploadProgressText.textContent = "Upload complete!";

        showMessage(
            data.message ||
            `${data.successful_count ?? files.length} file(s) uploaded successfully.`,
            "success"
        );

        await loadFolders(currentFolderId);

    } catch (error) {
        console.error("UPLOAD ERROR:", error);
        uploadProgressText.textContent = "Upload failed.";

        showMessage(
            error.message || "Something went wrong while uploading files.",
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
}

// Upload files selected through the file manager.
fileInput.addEventListener("change", async () => {
    const files = Array.from(fileInput.files);

    if (files.length === 0) return;

    await uploadFiles(files);
});

/* #=========================# Folder Upload #==========================# */
const uploadFolderButton = document.getElementById("upload-folder-button");
const folderInput = document.getElementById("folder-input");

uploadFolderButton.addEventListener("click", () => {
    if (isUploading) {
        showMessage("Please wait for the current upload to finish.");
        return;
    }
    addMenu.classList.remove("open");
    folderInput.click();
});

folderInput.addEventListener("change", async () => {
    const files = Array.from(folderInput.files);

    if (files.length === 0) {
        return;
    }

    // Every file must have a relative path supplied by the folder picker.
    const filesWithoutPaths = files.filter(
        file => !file.webkitRelativePath
    );

    if (filesWithoutPaths.length > 0) {
        showMessage("Could not read the selected folder structure.");
        folderInput.value = "";
        return;
    }

    await uploadFolderFiles(files);

    // Allow selecting the same folder again later.
    folderInput.value = "";
});

async function uploadFolderFiles(files) {
    if (isUploading) {
        showMessage("An upload is already in progress.");
        return;
    }

    isUploading = true;

    const progressContainer = document.getElementById(
        "upload-progress-container"
    );
    const progressText = document.getElementById("upload-progress-text");
    const progressPercent = document.getElementById("upload-progress-percent");
    const progressBar = document.getElementById("upload-progress-bar");
    const progressFill = document.getElementById("upload-progress-fill");

    const formData = new FormData();

    // Send each file and its matching relative path.
    for (const file of files) {
        formData.append("files", file);
        formData.append("relative_paths", file.webkitRelativePath);
    }

    // Upload into the current folder when one is open.
    if (currentFolderId !== null && currentFolderId !== undefined) {
        formData.append("parent_id", String(currentFolderId));
    }

    // Show the existing upload progress UI.
    if (progressContainer) {
        progressContainer.hidden = false;
    }

    if (progressText) {
        progressText.textContent = "Uploading folder...";
    }

    if (progressPercent) {
        progressPercent.textContent = "0%";
    }

    if (progressBar) {
        progressBar.setAttribute("aria-valuenow", "0");
    }

    if (progressFill) {
        progressFill.style.width = "0%";
    }

    try {
        const response = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.open("POST", "/api/folders/upload");

            // Track the upload progress in the browser.
            xhr.upload.addEventListener("progress", event => {
                if (!event.lengthComputable) {
                    return;
                }

                const percent = Math.round(
                    (event.loaded / event.total) * 100
                );

                if (progressPercent) {
                    progressPercent.textContent = `${percent}%`;
                }

                if (progressText) {
                    progressText.textContent = "Uploading folder...";
                }

                if (progressFill) {
                    progressFill.style.width = `${percent}%`;
                }

                if (progressBar) {
                    progressBar.setAttribute(
                        "aria-valuenow",
                        String(percent)
                    );
                }
            });

            xhr.addEventListener("load", () => {
                let data;

                try {
                    data = JSON.parse(xhr.responseText);
                } catch {
                    reject(new Error("The server returned an invalid response."));
                    return;
                }

                resolve({
                    status: xhr.status,
                    data
                });
            });

            xhr.addEventListener("error", () => {
                reject(new Error("Network error during folder upload."));
            });

            xhr.addEventListener("abort", () => {
                reject(new Error("Folder upload was cancelled."));
            });

            // Do not set Content-Type manually.
            // The browser must add the multipart boundary.
            xhr.send(formData);
        });

        if (response.status === 201) {
            if (progressText) {
                progressText.textContent = "Folder uploaded successfully.";
            }

            if (progressPercent) {
                progressPercent.textContent = "100%";
            }

            if (progressFill) {
                progressFill.style.width = "100%";
            }

            showMessage(
                `Folder uploaded: ${response.data.folder_count} folders and ${response.data.file_count} files.`
            );

            // Refresh the currently open location.
            await loadFolders(currentFolderId);
            await loadFiles(currentFolderId);
        } else if (
            response.status === 403 &&
            response.data.error === "email_verification_required"
        ) {
            showMessage(response.data.message);
        } else {
            showMessage(
                response.data.error || "Folder upload failed."
            );
        }
    } catch (error) {
        console.error("Folder upload failed:", error);
        showMessage(error.message || "Folder upload failed.");
    } finally {
        isUploading = false;

        // Hide the progress UI after a short delay.
        setTimeout(() => {
            if (progressContainer) {
                progressContainer.hidden = true;
            }
        }, 1200);
    }
}


/* ===========================# Folders Context Menu #=========================== */

function showFolderContextMenu(event, folder) {

    event.preventDefault();

    rightClickMenu.classList.remove("open");

    closeContextMenus();

    selectedFolder = folder;
    selectedFile = null;

    const contextMenu = document.getElementById("folder-context-menu");

    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;

    contextMenu.style.display = "block";
}

document.addEventListener("click", (event) => {

    const foldercontextMenu = document.getElementById("folder-context-menu");

    if (!foldercontextMenu.contains(event.target)) {
        foldercontextMenu.style.display = "none";
    }

});

/* ===========================# File Context Menu #=========================== */

function showFileContextMenu(event, file) {

    event.preventDefault();

    rightClickMenu.classList.remove("open");

    closeContextMenus();

    selectedFile = file;
    selectedFolder = null;

    const contextMenu = document.getElementById("file-context-menu");

    contextMenu.style.left = `${event.clientX}px`;

    contextMenu.style.top = `${event.clientY}px`;

    contextMenu.style.display = "block";

}

document.addEventListener("click", (event) => {

    const filecontextMenu = document.getElementById("file-context-menu");

    if (!filecontextMenu.contains(event.target)) {
        filecontextMenu.style.display = "none";
    }

});

/* ===========================# Close Context Menu #=========================== */

function closeContextMenus() {

    const folderMenu = document.getElementById("folder-context-menu");

    const fileMenu = document.getElementById("file-context-menu");

    if (folderMenu) {

        folderMenu.style.display = "none";

    }

    if (fileMenu) {

        fileMenu.style.display = "none";

    }
}


/*======================== moues =============================== */
const folderArea = document.getElementById("folder-list");
const fileArea = document.getElementById("file-list");
const freespace = document.getElementById("freespace");

const rightClickMenu =
    document.getElementById("add-menu");


function showRightClickMenu(event) {

    event.preventDefault();

    rightClickMenu.classList.add("open");

    rightClickMenu.style.position = "fixed";

    rightClickMenu.style.left =
        event.clientX + "px";

    rightClickMenu.style.top =
        event.clientY + "px";
}


/* Empty folder area */

folderArea.addEventListener("contextmenu", function (event) {

    if (event.target === folderArea) {

        const foldercontextMenu = document.getElementById("folder-context-menu");

        if (!foldercontextMenu.contains(event.target)) {
            foldercontextMenu.style.display = "none";
        }

        const filecontextMenu = document.getElementById("file-context-menu");

        if (!filecontextMenu.contains(event.target)) {
            filecontextMenu.style.display = "none";
        }

        showRightClickMenu(event);

    }

});


/* Empty file area */

fileArea.addEventListener("contextmenu", function (event) {

    if (event.target === fileArea) {

        const foldercontextMenu = document.getElementById("folder-context-menu");

        if (!foldercontextMenu.contains(event.target)) {
            foldercontextMenu.style.display = "none";
        }

        const filecontextMenu = document.getElementById("file-context-menu");

        if (!filecontextMenu.contains(event.target)) {
            filecontextMenu.style.display = "none";
        }


        showRightClickMenu(event);

    }

});

const freeSpace = document.getElementById("freespace");

freeSpace.addEventListener("contextmenu", function (event) {
    event.preventDefault();

    // Close folder/file context menus
    closeContextMenus();

    // Open Add menu
    rightClickMenu.classList.add("open");

    // Position it where we right-clicked
    rightClickMenu.style.position = "fixed";
    rightClickMenu.style.left = event.clientX + "px";
    rightClickMenu.style.top = event.clientY + "px";
});


/* =========================
   Close Add Menu
   ========================= */

document.addEventListener("mousedown", function (event) {

    if (rightClickMenu.contains(event.target)) {
        return;
    }

    const folderMenu =
        document.getElementById("folder-context-menu");

    const fileMenu =
        document.getElementById("file-context-menu");


    // Clicking inside any menu:
    // DON'T close it before its button gets the click event.
    if (
        rightClickMenu.contains(event.target) ||
        (folderMenu && folderMenu.contains(event.target)) ||
        (fileMenu && fileMenu.contains(event.target))
    ) {
        return;
    }

    if (event.button === 0 || event.button === 1) {
        closeAllMenus();
    }

    // Left click
    if (event.button === 0) {

        rightClickMenu.classList.remove("open");

    }

    // Middle click
    if (event.button === 1) {

        rightClickMenu.classList.remove("open");

    }

});

function closeAllMenus() {

    // Close Add menu
    rightClickMenu.classList.remove("open");

    // Close folder context menu
    const folderMenu =
        document.getElementById("folder-context-menu");

    if (folderMenu) {
        folderMenu.style.display = "none";
    }

    // Close file context menu
    const fileMenu =
        document.getElementById("file-context-menu");

    if (fileMenu) {
        fileMenu.style.display = "none";
    }
}


/* #===========================# FolderCM ( Open Folder ) #===========================# */

const openFolderButton = document.getElementById("open-folder");

openFolderButton.addEventListener("click", async () => {

    if (!selectedFolder) {
        return;
    }

    try {

        folderHistory.push({
            id: selectedFolder.id,
            name: selectedFolder.name
        });

        loadFolders(selectedFolder.id);

        selectedFolder = null;

        document.getElementById("folder-context-menu").style.display = "none";

    } catch (error) {

        console.error(
            "Opening folder failed:",
            error
        );

        showMessage(
            "Something went wrong.",
            "error"
        );

    }

});


/* #=========================# FileCM ( Download File ) #==========================# */

const downloadFileButton = document.getElementById("download-file");

downloadFileButton.addEventListener("click", () => {

    if (!selectedFile) {
        return;
    }

    try {

        window.location.href = `/api/files/${selectedFile.id}/download`;

        selectedFile = null;

        document.getElementById("file-context-menu").style.display = "none";

    } catch (error) {

        console.error(
            "Failed download file:",
            error
        );

        showMessage(
            "Something went wrong.",
            "error"
        );

    }

});


/* #===========================# FolderCM ( Rename Folder ) #===========================# */

const renameFolderButton = document.getElementById("rename-folder");

if (renameFolderButton) {

    renameFolderButton.addEventListener("click", () => {

        if (!selectedFolder) {
            return;
        }

        modalMode = "rename-folder";

        document.getElementById("folder-modal-title").textContent = "Rename Folder";

        document.getElementById("submit-folder-name").textContent = "Rename";

        const folderNameInput = document.getElementById("folder-name");

        folderNameInput.value = selectedFolder.name;

        createFolderModal.classList.add("open");

        document.getElementById("folder-context-menu").style.display = "none";

        folderNameInput.focus();
        folderNameInput.select();


    });

}


/* #===========================# FileCM ( Rename File ) #===========================# */

const renamefileButton = document.getElementById("rename-file");

if (renamefileButton) {

    renamefileButton.addEventListener("click", () => {

        if (!selectedFile) {
            return;
        }

        modalMode = "rename-file";

        document.getElementById("folder-modal-title").textContent = "Rename File";

        document.getElementById("submit-folder-name").textContent = "Rename";

        const folderNameInput = document.getElementById("folder-name");

        folderNameInput.value = selectedFile.name;

        createFolderModal.classList.add("open");

        document.getElementById("file-context-menu").style.display = "none";

        folderNameInput.focus();
        folderNameInput.select();

    });

}


/* #=========================# Popup Working Area #==========================# */

const submitFolderForm = document.getElementById("create-folder-form");

if (submitFolderForm) {

    submitFolderForm.addEventListener("submit", async event => {

        event.preventDefault();

        const folderNameInput = document.getElementById("folder-name");

        const name = folderNameInput.value.trim();

        if (!name) {
            return;
        }

        /* ========================= CREATE FOLDER ========================= */

        if (modalMode === "create") {

            try {

                const response = await fetch("/api/folders/", {

                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({

                        name: name,

                        parent_id: currentFolderId

                    })

                });

                const data = await response.json();

                if (!response.ok) {

                    showMessage(
                        data.message ||
                        data.error ||
                        "Failed to create folder.",
                        "error"
                    );

                    return;
                }

                showMessage(
                    data.message,
                    "success"
                );

                folderNameInput.value = "";

                createFolderModal.classList.remove("open");

                await loadFolders(currentFolderId);

            } catch (error) {

                console.error(

                    "Create folder failed:",
                    error

                );

                showMessage(

                    "Something went wrong.",
                    "error"

                );

            }

            return;

        }

        /* ========================= RENAME FOLDER ========================= */

        if (modalMode === "rename-folder") {

            if (!selectedFolder) {
                return;
            }

            try {

                const response = await fetch(`/api/folders/${selectedFolder.id}`, {

                    method: "PATCH",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        name: name

                    })

                });

                const data = await response.json();

                if (!response.ok) {

                    showMessage(

                        data.error ||
                        data.message ||
                        "Failed to rename folder.",
                        "error"

                    );

                    return;
                }

                showMessage(

                    data.message ||
                    "Folder renamed successfully.",
                    "success"

                );

                selectedFolder = null;

                folderNameInput.value = "";

                createFolderModal.classList.remove("open");

                await loadFolders(currentFolderId);

            } catch (error) {

                console.error(

                    "Folder rename failed:",
                    error

                );

                showMessage(

                    "Something went wrong.",
                    "error"

                );


            }

        }

        /* ========================= RENAME FILE ========================= */

        if (modalMode === "rename-file") {

            if (!selectedFile) {
                return;
            }

            try {

                const response = await fetch(`/api/files/${selectedFile.id}`, {

                    method: "PATCH",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        name: name

                    })

                });

                const data = await response.json();

                if (!response.ok) {

                    showMessage(

                        data.error ||
                        data.message ||
                        "Failed to rename file.",
                        "error"

                    );

                    return;
                }

                showMessage(

                    data.message ||
                    "File renamed successfully.",
                    "success"

                );

                createFolderModal.classList.remove("open");

                selectedFile = null;

                await loadFolders(currentFolderId);

            } catch (error) {

                console.error(

                    "Folder rename failed:",
                    error

                );

                showMessage(

                    "Something went wrong.",
                    "error"

                );


            }

        }

    });
}


/* #===========================# F&FCM ( Copy ) #===========================# */

/*------------------------ Copy Folder ---------------------------*/
const copyFolderButton = document.getElementById("copy-folder");

copyFolderButton.addEventListener("click", () => {

    if (!selectedFolder) {
        return;
    }

    copyItemType = "folder";

    copyDestinationHistory = [];

    loadCopyFolders(null);

    document.getElementById("copy-dialog").style.display = "block";

    document.getElementById("folder-context-menu").style.display = "none";
});

/*------------------------ Copy Folder ---------------------------*/

const copyFileButton = document.getElementById("copy-file");

copyFileButton.addEventListener("click", () => {

    if (!selectedFile) {
        return;
    }

    copyItemType = "file";

    copyDestinationHistory = [];

    loadCopyFolders(null);

    document.getElementById("copy-dialog").style.display = "block";

    document.getElementById("file-context-menu").style.display = "none";
});

/*------------------------ Div Location ---------------------------*/

async function loadCopyFolders(parentId = null) {

    copyDestinationId = parentId;

    const response = await fetch(
        parentId === null
            ? "/api/folders/"
            : `/api/folders/?parent_id=${parentId}`
    );

    const folders = await response.json();

    if (!response.ok) {
        alert(folders.error);
        return;
    }

    const folderList = document.getElementById("copy-folder-list");

    folderList.innerHTML = "";

    folders.forEach(folder => {

        const folderButton = document.createElement("button");

        const folderbuttonIcon = document.createElement("span");
        folderbuttonIcon.className = "material-symbols-rounded";
        folderbuttonIcon.textContent = "folder";

        const folderbuttonName = document.createElement("span");
        folderbuttonName.className = "folder-button-label";
        folderbuttonName.textContent = `${folder.name}`;

        folderButton.appendChild(folderbuttonIcon);
        folderButton.appendChild(folderbuttonName);

        folderButton.addEventListener("click", () => {

            copyDestinationHistory.push({
                id: folder.id,
                name: folder.name
            });

            loadCopyFolders(folder.id);
        });

        folderList.appendChild(folderButton);
    });
    updateCopyBreadcrumb();
}

/*------------------------Div Back Button---------------------------*/

const copyBackButton = document.getElementById("copy-back-button");

copyBackButton.addEventListener("click", () => {

    if (copyDestinationHistory.length === 0) {
        return;
    }

    copyDestinationHistory.pop();

    const previousFolder =
        copyDestinationHistory.length > 0
            ? copyDestinationHistory[
            copyDestinationHistory.length - 1
            ]
            : null;

    loadCopyFolders(
        previousFolder
            ? previousFolder.id
            : null
    );

});

/*------------------------Copy Dialog breadcrumb---------------------------*/

function updateCopyBreadcrumb() {

    const breadcrumb = document.getElementById("copy-breadcrumb");

    breadcrumb.innerHTML = "";

    const home = document.createElement("button");

    home.textContent = "My Drive";

    home.addEventListener("click", () => {

        copyDestinationHistory = [];

        loadCopyFolders(null);
    });

    breadcrumb.appendChild(home);

    copyDestinationHistory.forEach((folder, index) => {

        const separator = document.createElement("span");

        separator.textContent = " / ";

        breadcrumb.appendChild(separator);

        const folderButton =
            document.createElement("button");

        folderButton.textContent = folder.name;

        folderButton.addEventListener("click", () => {

            copyDestinationHistory =
                copyDestinationHistory.slice(0, index + 1);

            loadCopyFolders(folder.id);
        });

        breadcrumb.appendChild(folderButton);
    });
}

/*------------------------ Cancel Copy Dialog ---------------------------*/

const cancelCopyButton = document.getElementById("cancel-copy");

cancelCopyButton.addEventListener("click", () => {

    document.getElementById("copy-dialog").style.display = "none";

});

const closedialog = document.getElementById("copy-dialog");

closedialog.addEventListener("click", (event) => {

    if (event.target === closedialog) {

        closedialog.style.display = "none";

    }

});

/*------------------------ Copy Here Button-------------------------*/

const confirmCopyButton = document.getElementById("confirm-copy");

confirmCopyButton.addEventListener("click", async () => {


    /* ========================= COPY FOLDER ========================= */
    if (copyItemType === "folder") {

        if (!selectedFolder) {
            return;
        }

        const response = await fetch(
            `/api/folders/${selectedFolder.id}/copy`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    parent_id: copyDestinationId
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            showMessage(
                data.error || data.message || "Something went wrong.",
                "error"
            );
            return;
        }

        showMessage(
            data.message ||
            "Folder copy successfully.",
            "success"
        );

        document.getElementById(
            "copy-dialog"
        ).style.display = "none";

        selectedFolder = null;

        loadFolders(currentFolderId);

        return;
    }

    /* ========================= COPY FILE ========================= */
    if (copyItemType === "file") {

        if (!selectedFile) {
            return;
        }

        const response = await fetch(
            `/api/files/${selectedFile.id}/copy`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    folder_id: copyDestinationId
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            showMessage(
                data.error || data.message || "Something went wrong.",
                "error"
            );
            return;
        }

        showMessage(
            data.message ||
            "File copy successfully.",
            "success"
        );

        document.getElementById(
            "copy-dialog"
        ).style.display = "none";

        selectedFile = null;

        loadFolders(currentFolderId);
    }

});


/* #===========================# F&FCM ( Move ) #===========================# */

/*------------------------ Move Folder ---------------------------*/
const moveFolderButton = document.getElementById("move-folder");

moveFolderButton.addEventListener("click", () => {

    if (!selectedFolder) {
        return;
    }

    moveItemType = "folder";

    moveDestinationHistory = [];

    loadMoveFolders(null);

    document.getElementById("move-dialog").style.display = "block";

    document.getElementById("folder-context-menu").style.display = "none";
});

/*------------------------ Move File ---------------------------*/
const moveFileButton = document.getElementById("move-file");

moveFileButton.addEventListener("click", () => {

    if (!selectedFile) {
        return;
    }

    moveItemType = "file";

    moveDestinationHistory = [];

    loadMoveFolders(null);

    document.getElementById("move-dialog").style.display = "block";

    document.getElementById("file-context-menu").style.display = "none";
});

/*------------------------Div Location---------------------------*/

async function loadMoveFolders(parentId = null) {

    moveDestinationId = parentId;

    const response = await fetch(
        parentId === null
            ? "/api/folders/"
            : `/api/folders/?parent_id=${parentId}`
    );

    const folders = await response.json();

    if (!response.ok) {
        alert(folders.error);
        return;
    }

    const folderList = document.getElementById("move-folder-list");

    folderList.innerHTML = "";

    folders.forEach(folder => {

        const folderButton = document.createElement("button");

        const folderbuttonIcon = document.createElement("span");
        folderbuttonIcon.className = "material-symbols-rounded";
        folderbuttonIcon.textContent = "folder";

        const folderbuttonName = document.createElement("span");
        folderbuttonName.className = "folder-button-label";
        folderbuttonName.textContent = `${folder.name}`;

        folderButton.appendChild(folderbuttonIcon);
        folderButton.appendChild(folderbuttonName);

        folderButton.addEventListener("click", () => {

            moveDestinationHistory.push({
                id: folder.id,
                name: folder.name
            });

            loadMoveFolders(folder.id);
        });

        folderList.appendChild(folderButton);
    });

    updateMoveBreadcrumb();
}

/*------------------------Div Back Button---------------------------*/

const moveBackButton = document.getElementById("move-back-button");

moveBackButton.addEventListener("click", () => {

    if (moveDestinationHistory.length === 0) {
        return;
    }

    moveDestinationHistory.pop();

    const previousFolder =
        moveDestinationHistory.length > 0
            ? moveDestinationHistory[
            moveDestinationHistory.length - 1
            ]
            : null;

    loadMoveFolders(
        previousFolder
            ? previousFolder.id
            : null
    );
});

/*------------------------Move Dialog breadcrumb---------------------------*/

function updateMoveBreadcrumb() {

    const breadcrumb = document.getElementById("move-breadcrumb");

    breadcrumb.innerHTML = "";

    const home = document.createElement("button");

    home.textContent = "My Drive";

    home.addEventListener("click", () => {

        moveDestinationHistory = [];

        loadMoveFolders(null);
    });

    breadcrumb.appendChild(home);

    moveDestinationHistory.forEach((folder, index) => {

        const separator = document.createElement("span");

        separator.textContent = " / ";

        breadcrumb.appendChild(separator);

        const folderButton =
            document.createElement("button");

        folderButton.textContent = folder.name;

        folderButton.addEventListener("click", () => {

            moveDestinationHistory =
                moveDestinationHistory.slice(0, index + 1);

            loadMoveFolders(folder.id);
        });

        breadcrumb.appendChild(folderButton);
    });
}

/*------------------------ Cancel Move Dialog ---------------------------*/

const cancelMoveButton = document.getElementById("cancel-move");

cancelMoveButton.addEventListener("click", () => {

    document.getElementById("move-dialog").style.display = "none";
});

const closemovedialog = document.getElementById("move-dialog");

closemovedialog.addEventListener("click", (event) => {

    if (event.target === closemovedialog) {

        closemovedialog.style.display = "none";

    }

});


/*------------------------ Move Here Button-------------------------*/

const confirmMoveButton = document.getElementById("confirm-move");

confirmMoveButton.addEventListener("click", async () => {

    /* ========================= MOVE FOLDER ========================= */
    if (moveItemType === "folder") {

        if (!selectedFolder) {
            return;
        }

        const response = await fetch(
            `/api/folders/${selectedFolder.id}/move`,
            {
                method: "PATCH",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    parent_id: moveDestinationId
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            showMessage(
                data.error || data.message || "Something went wrong.",
                "error"
            );
            return;
        }

        showMessage(
            data.message ||
            "Folder move successfully.",
            "success"
        );

        document.getElementById(
            "move-dialog"
        ).style.display = "none";

        selectedFolder = null;

        loadFolders(currentFolderId);

        return;
    }

    /* ========================= MOVE FILE ========================= */
    if (moveItemType === "file") {

        if (!selectedFile) {
            return;
        }

        const response = await fetch(
            `/api/files/${selectedFile.id}/move`,
            {
                method: "PATCH",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    folder_id: moveDestinationId
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            showMessage(
                data.error || data.message || "Something went wrong.",
                "error"
            );
            return;
        }

        showMessage(
            data.message ||
            "File move successfully.",
            "success"
        );

        document.getElementById(
            "move-dialog"
        ).style.display = "none";

        selectedFile = null;

        loadFolders(currentFolderId);
    }

});


/* #===========================# F&FCM ( Delete ) #===========================# */

const deleteConfirmModal =
    document.getElementById("delete-confirm-modal");

const deleteConfirmMessage =
    document.getElementById("delete-confirm-message");

const confirmDeleteButton =
    document.getElementById("confirm-delete-button");

const cancelDeleteButton =
    document.getElementById("cancel-delete-button");

const closeDeleteModal =
    document.getElementById("close-delete-modal");


/*------------------------ Delete Folder ---------------------------*/

const deleteFolderButton = document.getElementById("delete-folder");

deleteFolderButton.addEventListener("click", () => {

    if (!selectedFolder) {
        return;
    }

    deleteMode = "folder";

    deleteConfirmMessage.textContent =
        `Delete "${selectedFolder.name}" and everything inside it?`;

    deleteConfirmModal.classList.add("open");

    document.getElementById(
        "folder-context-menu"
    ).style.display = "none";
});

/*------------------------ Delete File ---------------------------*/

const deleteFileButton = document.getElementById("delete-file");

deleteFileButton.addEventListener("click", () => {

    if (!selectedFile) {
        return;
    }

    deleteMode = "file";

    deleteConfirmMessage.textContent =
        `Delete "${selectedFile.name}"?`;

    deleteConfirmModal.classList.add("open");

    document.getElementById(
        "file-context-menu"
    ).style.display = "none";
});

/*------------------------ Delete Folder or File ---------------------------*/

confirmDeleteButton.addEventListener("click", async () => {

    if (!deleteMode) {
        return;
    }

    try {

        let response;

        /* ========================= DELETE FOLDER ========================= */

        if (deleteMode === "folder") {

            if (!selectedFolder) {
                return;
            }

            response = await fetch(
                `/api/folders/${selectedFolder.id}`,
                {
                    method: "DELETE"
                }
            );

        }

        /* ========================= DELETE FILE ========================= */

        if (deleteMode === "file") {

            if (!selectedFile) {
                return;
            }

            response = await fetch(
                `/api/files/${selectedFile.id}`,
                {
                    method: "DELETE"
                }
            );

        }

        const data = await response.json();

        if (!response.ok) {

            showMessage(
                data.error ||
                data.message ||
                "Failed to delete.",
                "error"
            );

            return;
        }

        /* ========================= SUCCESS ========================= */

        showMessage(
            data.message ||
            "Deleted successfully.",
            "success"
        );

        selectedFolder = null;
        selectedFile = null;
        deleteMode = null;

        deleteConfirmModal.classList.remove("open");

        await loadFolders(currentFolderId);

    } catch (error) {

        console.error(
            "Delete failed:",
            error
        );

        showMessage(
            "Something went wrong.",
            "error"
        );

    }

});

cancelDeleteButton.addEventListener("click", () => {

    deleteMode = null;

    deleteConfirmModal.classList.remove("open");

});

closeDeleteModal.addEventListener("click", () => {

    deleteMode = null;

    deleteConfirmModal.classList.remove("open");

});

deleteConfirmModal.addEventListener("click", (event) => {

    if (event.target === deleteConfirmModal) {

        deleteMode = null;

        deleteConfirmModal.classList.remove("open");
    }

});


/* ============================== ACTION REQUIRED MESSAGER ============================ */

const actionRequiredPopup = document.getElementById("action-required-message");
const actionRequiredBtn = document.getElementById("action-required-btn");
const actionRequiredClose = document.getElementById("action-required-close");

const actionRequiredPopupContent = actionRequiredPopup.querySelector(".popup");

// Show the initial popup content
actionRequiredBtn.addEventListener("click", () => {
    showActionRequiredContent();
    actionRequiredPopup.hidden = false;
});

// Close using the × button
actionRequiredClose.addEventListener("click", () => {
    actionRequiredPopup.hidden = true;
});

// Close when clicking outside the popup
actionRequiredPopup.addEventListener("click", (event) => {
    if (event.target === actionRequiredPopup) {
        actionRequiredPopup.hidden = true;
    }
});

// Create the initial popup content
function showActionRequiredContent() {
    actionRequiredPopupContent.innerHTML = `
        <button type="button" class="popup-close" id="action-required-close">
            &times;
        </button>

        <h2 class="action-tittle">Action Required</h2>

        <p class="action-content">
            Please verify your email address to continue using all features
            of your Cloud Drive.
        </p>

        <div class="popup-actions">
            <button type="button" id="action-required-later">
                Do Later
            </button>

            <button type="button" id="verify-email-btn">
                Verify Email
            </button>
        </div>
    `;

    // Reconnect the × button because the content was recreated
    actionRequiredPopupContent
        .querySelector("#action-required-close")
        .addEventListener("click", () => {
            actionRequiredPopup.hidden = true;
        });

    // Do Later closes the popup
    actionRequiredPopupContent
        .querySelector("#action-required-later")
        .addEventListener("click", () => {
            actionRequiredPopup.hidden = true;
        });

    // Verify Email sends the request
    actionRequiredPopupContent
        .querySelector("#verify-email-btn")
        .addEventListener("click", sendVerificationEmail);
}

// Send the verification email
async function sendVerificationEmail() {
    const verifyButton = actionRequiredPopupContent.querySelector("#verify-email-btn");

    verifyButton.disabled = true;
    verifyButton.textContent = "Sending...";

    try {
        const response = await fetch("/api/auth/resend-verification", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Unable to send the verification email.");
        }

        // Replace the old content with the success message
        actionRequiredPopupContent.innerHTML = `
            <button type="button" class="popup-close" id="action-required-close">
                &times;
            </button>

            <h2 class="action-tittle">Verification Email Sent</h2>

            <p class="action-content">
                A verification link has been sent to your registered email
                address. Please check your inbox.
            </p>

            <div class="popup-actions">
                <button type="button" id="verification-success-close">
                    Close
                </button>
            </div>
        `;

        // Close and refresh the page
        function closeSuccessPopup() {
            actionRequiredPopup.hidden = true;
            window.location.reload();
        }

        actionRequiredPopupContent
            .querySelector("#action-required-close")
            .addEventListener("click", closeSuccessPopup);

        actionRequiredPopupContent
            .querySelector("#verification-success-close")
            .addEventListener("click", closeSuccessPopup);

    } catch (error) {
        // Keep the initial popup and display the error
        const oldError = actionRequiredPopupContent.querySelector(".verification-error");

        if (oldError) {
            oldError.remove();
        }

        const errorMessage = document.createElement("p");
        errorMessage.className = "verification-error";
        errorMessage.textContent = error.message;
        errorMessage.style.color = "#d93025";

        actionRequiredPopupContent.querySelector(".popup-actions")
            .before(errorMessage);

        verifyButton.disabled = false;
        verifyButton.textContent = "Verify Email";
    }
}

/* #===========================# Search Bar for MyDrive #===========================# */

const searchToggle = document.getElementById("search-toggle");
const searchBar = document.getElementById("search-bar");
const searchInput = document.getElementById("drive-search-input");
const searchClose = document.getElementById("search-close");
const myDriveButton = document.querySelector(
    '.sidebar-menu-button[data-section="mydrive"]'
);

searchInput.addEventListener("focus", () => {
    myDriveButton.click();
});

searchToggle.addEventListener("click", () => {
    if (searchBar.classList.contains("is-open")) {
        searchClose.click();
        return;
    }

    isSearchActive = false;

    searchBar.classList.add("is-open");
    searchFilterMenu.hidden = false;

    searchToggle.setAttribute("aria-expanded", "true");
    searchInput.focus();
});

searchClose.addEventListener("click", () => {
    clearTimeout(searchTimeout);

    searchFilterMenu.hidden = true;
    searchFilterDropdown.hidden = true;

    searchFilterToggle.setAttribute("aria-expanded", "false");
    searchToggle.setAttribute("aria-expanded", "false");

    searchInput.value = "";
    searchBar.classList.remove("is-open");
    searchToggle.setAttribute("aria-expanded", "false");

    isSearchActive = false;

    const folderToRestore = folderBeforeSearch ?? currentFolderId;
    folderBeforeSearch = null;

    loadFolders(folderToRestore);
    searchToggle.focus();
});

searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);

    const query = searchInput.value.trim();

    if (!query) {
        isSearchActive = false;

        // Return to the folder that was open before searching.
        loadFolders(folderBeforeSearch ?? currentFolderId);

        folderBeforeSearch = null;
        return;
    }

    // Save the current folder only when starting a new search.
    if (!isSearchActive && folderBeforeSearch === null) {
        folderBeforeSearch = currentFolderId;
    }

    searchTimeout = setTimeout(() => {
        searchFilesAndFolders(query);
    }, 300);
});

async function searchFilesAndFolders(query) {
    try {
        const response = await fetch(
            `/api/browse/search?q=${encodeURIComponent(query)}`
        );

        const data = await response.json();

        if (!response.ok) {
            if (handleVerificationRequired(data)) {
                return;
            }

            console.error(
                data.error || "Search failed."
            );

            return;
        }

        allSearchFiles = data.files;
        allSearchFolders = data.folders;
        activeSearchType = "all";

        document.querySelectorAll(".search-filter-option").forEach(option => {
            option.classList.toggle("active", option.dataset.type === "all");
        });

        searchFilterToggle.querySelectorAll("span")[1].textContent = "Filter";

        searchFilterDropdown.hidden = true;
        searchFilterToggle.setAttribute("aria-expanded", "false");

        applySearchFilter();

    } catch (error) {
        console.error("Search failed:", error);
    }
}



function displaySearchResults(files, folders) {
    const folderList = document.getElementById("folder-list");
    const fileList = document.getElementById("file-list");

    folderList.innerHTML = "";
    fileList.innerHTML = "";

    const resultsInfo = document.getElementById("search-results-info");
    const resultsTitle = document.getElementById("search-results-title");
    const resultsCount = document.getElementById("search-results-count");
    const emptyMessage = document.getElementById("search-empty-message");

    const query = searchInput.value.trim();

    if (resultsInfo && resultsTitle && resultsCount && emptyMessage) {
        resultsTitle.textContent = `Results for "${query}"`;

        resultsCount.textContent =
            `${files.length} ${files.length === 1 ? "file" : "files"} · ` +
            `${folders.length} ${folders.length === 1 ? "folder" : "folders"}`;

        resultsInfo.hidden = false;
        emptyMessage.hidden = files.length > 0 || folders.length > 0;
    }

    // Show matching folders
    folders.forEach(folder => {
        const folderElement = document.createElement("button");
        folderElement.className = "folders";

        const folderIcon = document.createElement("span");
        folderIcon.className = "material-symbols-rounded";
        folderIcon.textContent = "folder";

        const folderName = document.createElement("span");
        folderName.className = "folders-label";
        folderName.textContent = folder.name;

        folderElement.appendChild(folderIcon);
        folderElement.appendChild(folderName);

        folderElement.addEventListener("click", async () => {
            await openSearchResultFolder(folder);
        });

        folderElement.addEventListener("contextmenu", event => {
            event.preventDefault();
            showFolderContextMenu(event, folder);
        });

        folderList.appendChild(folderElement);
    });

    // Keep preview navigation limited to the displayed search results
    previewFiles = [...files];

    // Show matching files
    files.forEach(file => {
        const fileElement = document.createElement("div");
        fileElement.className = "files";
        fileElement.style.cursor = "pointer";

        if (
            file.thumbnail_name &&
            ["image", "pdf", "video"].includes(file.file_type)
        ) {
            const thumbnail = document.createElement("img");
            thumbnail.className = "file-thumbnail";
            thumbnail.src = `/api/files/${file.id}/thumbnail`;
            thumbnail.alt = "";
            thumbnail.loading = "lazy";

            thumbnail.addEventListener("error", () => {
                const fileIcon = document.createElement("span");
                fileIcon.className = "material-symbols-rounded";
                fileIcon.textContent = getFileIcon(file.file_type);
                thumbnail.replaceWith(fileIcon);
            }, { once: true });

            fileElement.appendChild(thumbnail);
        } else {
            const fileIcon = document.createElement("span");
            fileIcon.className = "material-symbols-rounded";
            fileIcon.textContent = getFileIcon(file.file_type);
            fileElement.appendChild(fileIcon);
        }

        const fileName = document.createElement("span");
        fileName.className = "file-label";
        fileName.textContent = file.name;

        fileElement.appendChild(fileName);

        fileElement.addEventListener("click", () => {
            openFilePreview(file);
        });

        fileElement.addEventListener("contextmenu", event => {
            event.preventDefault();
            showFileContextMenu(event, file);
        });

        fileList.appendChild(fileElement);
    });
}

// Add the keyboard shortcuts
async function openSearchResultFolder(folder) {
    clearTimeout(searchTimeout);

    try {
        const response = await fetch(
            `/api/browse/folders/${folder.id}/path`
        );

        const data = await response.json();

        if (!response.ok) {
            if (handleVerificationRequired(data)) return;

            console.error(data.error || "Failed to load folder path.");
            return;
        }

        if (!Array.isArray(data.path)) {
            console.error("Invalid folder path response.");
            return;
        }

        // Rebuild the breadcrumb from root to selected folder.
        folderHistory = data.path;

        searchInput.value = "";
        searchBar.classList.remove("is-open");
        searchToggle.setAttribute("aria-expanded", "false");

        isSearchActive = false;

        folderBeforeSearch = null;

        // Load the selected folder and save its navigation state.
        await loadFolders(folder.id);

    } catch (error) {
        console.error("Failed to open search result folder:", error);
    }
}

document.addEventListener("keydown", event => {
    const isTyping =
        event.target instanceof HTMLElement &&
        (
            event.target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)
        );

    // Ctrl + K: Open search
    if (
        event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "k"
    ) {
        event.preventDefault();

        if (!searchBar.classList.contains("is-open")) {
            searchBar.classList.add("is-open");
            searchToggle.setAttribute("aria-expanded", "true");
            searchFilterMenu.hidden = false;
        }

        searchInput.focus();
        return;
    }

    // Escape: Close search and restore the previous folder
    if (event.key === "Escape" && searchBar.classList.contains("is-open")) {
        event.preventDefault();
        searchClose.click();
        return;
    }

    // Enter: Run search immediately
    if (
        event.key === "Enter" &&
        searchBar.classList.contains("is-open") &&
        document.activeElement === searchInput &&
        !event.isComposing
    ) {
        event.preventDefault();

        clearTimeout(searchTimeout);

        const query = searchInput.value.trim();

        if (query) {
            searchFilesAndFolders(query);
        }
    }
});

// Search filters
function applySearchFilter() {
    const files = activeSearchType === "all"
        ? allSearchFiles
        : allSearchFiles.filter(
            file => file.file_type === activeSearchType
        );

    const folders = activeSearchType === "all"
        ? allSearchFolders
        : [];

    displaySearchResults(files, folders);
}

const searchFilterMenu = document.getElementById("search-filter-menu");
const searchFilterToggle = document.getElementById("search-filter-toggle");
const searchFilterDropdown = document.getElementById("search-filter-dropdown");

searchFilterToggle.addEventListener("click", () => {
    searchFilterDropdown.hidden = !searchFilterDropdown.hidden;

    searchFilterToggle.setAttribute(
        "aria-expanded",
        String(!searchFilterDropdown.hidden)
    );
});

document.querySelectorAll(".search-filter-option").forEach(button => {
    button.addEventListener("click", () => {
        activeSearchType = button.dataset.type;

        document.querySelectorAll(".search-filter-option").forEach(option => {
            option.classList.toggle("active", option === button);
        });

        // Update the dropdown button's label.
        searchFilterToggle.querySelectorAll("span")[1].textContent =
            button.textContent.trim();

        searchFilterDropdown.hidden = true;
        searchFilterToggle.setAttribute("aria-expanded", "false");

        applySearchFilter();
    });
});

// Close the menu when clicking outside it.
document.addEventListener("click", event => {
    if (!searchFilterMenu.contains(event.target)) {
        searchFilterDropdown.hidden = true;
        searchFilterToggle.setAttribute("aria-expanded", "false");
    }
});

/* #===========================# Trash #===========================# */

async function loadTrashFolder(folderId = null) {
    const folderList = document.getElementById("trash-folder-list");
    const fileList = document.getElementById("trash-file-list");
    const emptyState = document.getElementById("trash-empty-state");

    try {
        let url = "/api/trash/";

        if (folderId !== null) {
            url = `/api/trash/folder/${folderId}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to load Trash.");
        }

        currentTrashFolderId = folderId;

        folderList.innerHTML = "";
        fileList.innerHTML = "";

        const items = data.items || [];

        const folders = items.filter(item => item.type === "folder");
        const files = items.filter(item => item.type === "file");

        folders.forEach(folder => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "trash-folder-item";
            button.textContent = folder.name;

            button.addEventListener("click", () => {
                trashFolderHistory.push({
                    id: folder.id,
                    name: folder.name
                });

                loadTrashFolder(folder.id);
            });

            folderList.appendChild(button);
        });

        files.forEach(file => {
            const item = document.createElement("div");
            item.className = "trash-file-item";
            item.textContent = file.name;

            fileList.appendChild(item);
        });

        emptyState.hidden = items.length > 0;

        updateTrashBreadcrumb();
        updateTrashBackButton();

    } catch (error) {
        console.error("Error loading Trash:", error);
    }
}

/* #===========================# Trash breadcrumb #===========================# */

function updateTrashBreadcrumb() {
    const breadcrumb = document.getElementById("trash-breadcrumb");
    const backButton = document.getElementById("trash-back-button");

    breadcrumb.innerHTML = "";

    // Trash root
    const trashHome = document.createElement("button");
    trashHome.type = "button";
    trashHome.className = "breadcrumb-home";
    trashHome.textContent = "Trash";

    trashHome.addEventListener("click", () => {
        trashFolderHistory = [];
        loadTrashFolder();
    });

    breadcrumb.appendChild(trashHome);

    // Nested folders
    trashFolderHistory.forEach((folder, index) => {
        const separator = document.createElement("span");
        separator.className = "breadcrumb-separator";
        separator.textContent = "/";
        breadcrumb.appendChild(separator);

        const button = document.createElement("button");
        button.type = "button";
        button.className = "breadcrumb-folder";
        button.textContent = folder.name;

        button.addEventListener("click", () => {
            trashFolderHistory = trashFolderHistory.slice(0, index + 1);
            loadTrashFolder(folder.id);
        });

        breadcrumb.appendChild(button);
    });

    backButton.disabled = trashFolderHistory.length === 0;
}

//back button
document.getElementById("trash-back-button").addEventListener("click", () => {

    if (trashFolderHistory.length === 0) {
        return;
    }

    // Remove the current folder from history.
    trashFolderHistory.pop();

    // Find the parent folder, or return to the Trash root.
    const previousFolder = trashFolderHistory.length > 0
        ? trashFolderHistory[trashFolderHistory.length - 1].id
        : null;

    // Load the previous location.
    loadTrashFolder(previousFolder);

});

function updateTrashBackButton() {
    const backButton = document.getElementById("trash-back-button");

    if (backButton) {
        backButton.disabled = currentTrashFolderId === null;
    }
}



//trash folders and files
async function loadTrashFolder(folderId = null) {

    try {

        /* ------------------------- Trash API ------------------------- */

        let trashUrl = "/api/trash/";

        if (folderId !== null) {
            trashUrl += `folder/${folderId}`;
        }

        const response = await fetch(trashUrl);
        const data = await response.json();

        if (!response.ok) {
            if (handleVerificationRequired(data)) {
                return;
            }

            console.log(data.error || data.message);
            return;
        }

        /* ------------------------- Update Current Folder ------------------------- */

        currentTrashFolderId = folderId;

        /* ------------------------- Folder & File Lists ------------------------- */

        const folderList = document.getElementById("trash-folder-list");
        const fileList = document.getElementById("trash-file-list");
        const emptyState = document.getElementById("trash-empty-state");

        /* ------------------------- Clear Previous Content ------------------------- */

        folderList.innerHTML = "";
        fileList.innerHTML = "";

        /* ------------------------- Display Folders ------------------------- */

        const items = data.items || [];

        const folders = items.filter(item => item.type === "folder");
        const files = items.filter(item => item.type === "file");

        folders.forEach(folder => {

            const folderElement = document.createElement("button");
            folderElement.type = "button";
            folderElement.className = "folders";

            const folderIcon = document.createElement("span");
            folderIcon.className = "material-symbols-rounded";
            folderIcon.textContent = "folder";

            const folderName = document.createElement("span");
            folderName.className = "folders-label";
            folderName.textContent = folder.name;

            if (trashSelectionMode) {
                folderElement.prepend(
                    createTrashCheckbox({
                        ...folder,
                        type: "folder"
                    })
                );
            }

            folderElement.appendChild(folderIcon);
            folderElement.appendChild(folderName);

            folderElement.addEventListener("click", (event) => {

                if (event.target.closest(".trash-item-checkbox")) {
                    return;
                }

                if (trashSelectionMode) {
                    return;
                }

                trashFolderHistory.push({
                    id: folder.id,
                    name: folder.name
                });

                loadTrashFolder(folder.id);

            });

            folderElement.addEventListener("contextmenu", (event) => {
                showTrashContextMenu(event, {
                    ...folder,
                    type: "folder"
                });
            });

            folderList.appendChild(folderElement);

        });

        /* ------------------------- Display Files ------------------------- */

        files.forEach(file => {

            const fileElement = document.createElement("div");
            fileElement.className = "files";
            fileElement.style.cursor = "pointer";


            fileElement.addEventListener("click", (event) => {

                if (event.target.closest(".trash-item-checkbox")) {
                    return;
                }

                if (trashSelectionMode) {
                    return;
                }

                openFilePreview(file);

            });

            // Display thumbnail when supported.
            if (
                file.thumbnail_name &&
                ["image", "pdf", "video"].includes(file.file_type)
            ) {

                const thumbnail = document.createElement("img");
                thumbnail.className = "file-thumbnail";
                thumbnail.src = `/api/files/${file.id}/thumbnail`;
                thumbnail.alt = "";
                thumbnail.loading = "lazy";

                thumbnail.addEventListener("error", () => {

                    const fileIcon = document.createElement("span");
                    fileIcon.className = "material-symbols-rounded";
                    fileIcon.textContent = getFileIcon(file.file_type);

                    thumbnail.replaceWith(fileIcon);

                }, { once: true });

                fileElement.appendChild(thumbnail);

            } else {

                const fileIcon = document.createElement("span");
                fileIcon.className = "material-symbols-rounded";
                fileIcon.textContent = getFileIcon(file.file_type);

                fileElement.appendChild(fileIcon);

            }

            const fileName = document.createElement("span");
            fileName.className = "file-label";
            fileName.textContent = file.name;

            if (trashSelectionMode) {
                fileElement.prepend(
                    createTrashCheckbox({
                        ...file,
                        type: "file"
                    })
                );
            }

            fileElement.addEventListener("contextmenu", (event) => {
                showTrashContextMenu(event, {
                    ...file,
                    type: "file"
                });
            });


            fileElement.appendChild(fileName);
            fileList.appendChild(fileElement);

        });

        /* ------------------------- Empty Trash Message ------------------------- */

        if (emptyState) {
            emptyState.hidden = items.length > 0;
        }

        /* ------------------------- Update Navigation ------------------------- */

        updateTrashBreadcrumb();
        updateTrashBackButton();

    } catch (error) {

        console.error(
            "Failed to load Trash:",
            error
        );

    }

}

/* =========================== Trash Context Menu =========================== */

let trashContextItem = null;

function showTrashContextMenu(event, item) {

    event.preventDefault();

    rightClickMenu.classList.remove("open");

    closeContextMenus();

    trashContextItem = item;

    const contextMenu = document.getElementById("trash-context-menu");

    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;

    contextMenu.style.display = "block";
}

document.addEventListener("click", (event) => {

    const trashContextMenu = document.getElementById("trash-context-menu");

    if (trashContextMenu && !trashContextMenu.contains(event.target)) {
        trashContextMenu.style.display = "none";
    }

});



let trashSelectionMode = false;
let selectedTrashItems = new Set();

//cerate checkbox
function createTrashCheckbox(item) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "trash-item-checkbox";
    checkbox.dataset.id = item.id;
    checkbox.dataset.type = item.type;

    const key = `${item.type}-${item.id}`;

    checkbox.checked = selectedTrashItems.has(key);

    checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
            selectedTrashItems.add(key);
        } else {
            selectedTrashItems.delete(key);
        }
    });

    checkbox.addEventListener("click", event => {
        event.stopPropagation();
    });

    return checkbox;
}


//context menu
document.getElementById("trash-select-item")
    ?.addEventListener("click", async () => {
        trashSelectionMode = true;

        document.getElementById("trash-context-menu").style.display = "none";

        updateTrashSelectionToolbar();

        await loadTrashFolder(currentTrashFolderId);
    });

document.addEventListener("click", (event) => {
    if (!trashSelectionMode) return;

    const trashSection = document.getElementById("trash-section");
    const contextMenu = document.getElementById("trash-context-menu");
    const toolbar = document.getElementById("trash-selection-toolbar");

    if (
        trashSection?.contains(event.target) ||
        contextMenu?.contains(event.target) ||
        toolbar?.contains(event.target)
    ) {
        return;
    }

    trashSelectionMode = false;
    selectedTrashItems.clear();

    const selectAllCheckbox = document.getElementById(
        "trash-select-all-checkbox"
    );

    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }

    updateTrashSelectionToolbar();
    loadTrashFolder(currentTrashFolderId);
});

//get seleted item
function getSelectedTrashItems() {
    return Array.from(selectedTrashItems).map(key => {
        const separatorIndex = key.indexOf("-");
        const type = key.slice(0, separatorIndex);
        const id = Number(key.slice(separatorIndex + 1));

        return { type, id };
    });
}

/* #===========================# restore function #===========================# */

async function restoreSelectedTrashItems() {
    const items = getSelectedTrashItems();

    if (items.length === 0) {
        showMessage(
            "Please select at least one item.",
            "error"
        );
        return;
    }

    try {
        const response = await fetch("/api/trash/restore", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ items })
        });

        const data = await response.json();

        if (!response.ok) {
            if (handleVerificationRequired(data)) {
                return;
            }

            showMessage(
                data.error ||
                data.message ||
                "Failed to restore selected items.",
                "error"
            );
            return;
        }

        selectedTrashItems.clear();
        trashSelectionMode = false;

        trashContextItem = null;

        const selectAllCheckbox = document.getElementById(
            "trash-select-all-checkbox"
        );

        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }

        await loadFolders();

        updateTrashSelectionToolbar();

        await loadTrashFolder(currentTrashFolderId);

        showMessage(
            "Selected items restored successfully.",
            "success"
        );

    } catch (error) {

        showMessage(
            "Unable to connect to the server.",
            "error"
        );
    }
}

document.getElementById("restore-selected-button")
    ?.addEventListener("click", restoreSelectedTrashItems);

document.getElementById("trash-restore-item")
    ?.addEventListener("click", async () => {
        if (!trashContextItem) {
            return;
        }

        const item = {
            type: trashContextItem.type,
            id: trashContextItem.id
        };

        const response = await fetch("/api/trash/restore", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                items: [item]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            if (handleVerificationRequired(data)) {
                return;
            }

            showMessage(
                data.error ||
                data.message ||
                "Failed to restore selected items.",
                "error"
            );
            return;
        }

        selectedTrashItems.clear();
        trashSelectionMode = false;
        trashContextItem = null;

        await loadFolders();

        await loadTrashFolder(currentTrashFolderId);

        showMessage(
            "Selected items restored successfully.",
            "success"
        );
    });

/* #===========================# deletet function #===========================# */
async function permanentlyDeleteTrashItems(items) {
    if (!items || items.length === 0) {
        showMessage(
            "Please select at least one item.",
            "error"
        );
        return;
    }

    const confirmed = await showConfirm({
        title: "Delete permanently?",
        message: `Permanently delete ${items.length} selected item(s)? This action cannot be undone.`,
        confirmText: "Delete permanently",
        cancelText: "Cancel",
        danger: true
    });

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch("/api/trash/permanent", {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ items })
        });

        const data = await response.json();

        if (!response.ok) {
            if (handleVerificationRequired(data)) {
                return;
            }
            showMessage(
                data.error ||
                data.message ||
                "Failed to permanently delete items.",
                "error"
            );

            return;
        }

        const selectAllCheckbox = document.getElementById(
            "trash-select-all-checkbox"
        );

        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }

        updateTrashSelectionToolbar();

        selectedTrashItems.clear();
        trashSelectionMode = false;
        trashContextItem = null;

        await loadTrashFolder(currentTrashFolderId);

        showMessage(
            "Selected items permanently deleted.",
            "success"
        );

    } catch (error) {

        showMessage(
            "Unable to connect to the server.",
            "error"
        );
    }
}

document.getElementById("trash-delete-item")
    ?.addEventListener("click", () => {
        if (!trashContextItem) {
            return;
        }

        permanentlyDeleteTrashItems([
            {
                type: trashContextItem.type,
                id: Number(trashContextItem.id)
            }
        ]);
    });

/* #===========================# Trash helper function #===========================# */
function updateTrashSelectionToolbar() {
    const toolbar = document.getElementById("trash-selection-toolbar");

    if (toolbar) {
        toolbar.hidden = !trashSelectionMode;
    }
}

function selectAllTrashItems(checked) {
    const checkboxes = document.querySelectorAll(
        "#trash-folder-list .trash-item-checkbox, " +
        "#trash-file-list .trash-item-checkbox"
    );

    checkboxes.forEach(checkbox => {
        checkbox.checked = checked;

        const key = `${checkbox.dataset.type}-${checkbox.dataset.id}`;

        if (checked) {
            selectedTrashItems.add(key);
        } else {
            selectedTrashItems.delete(key);
        }
    });
}

document.getElementById("trash-select-all-checkbox")
    ?.addEventListener("change", event => {
        selectAllTrashItems(event.target.checked);
    });

document.getElementById("delete-selected-button")
    ?.addEventListener("click", () => {
        permanentlyDeleteTrashItems(getSelectedTrashItems());
    });

/* #===========================# Empty Trash Button #===========================# */
async function emptyTrash() {
    const trashItems = [
        ...document.querySelectorAll(
            "#trash-folder-list .trash-item-checkbox, " +
            "#trash-file-list .trash-item-checkbox"
        )
    ];

    if (
        document.getElementById("trash-empty-state")?.checkVisibility() &&
        trashItems.length === 0
    ) {
        showMessage("Trash is already empty.", "info");
        return;
    }

    const confirmed = await showConfirm({
        title: "Empty Trash?",
        message: "Permanently delete all files and folders in Trash? This action cannot be undone.",
        confirmText: "Empty Trash",
        cancelText: "Cancel",
        danger: true
    });

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch("/api/trash/empty", {
            method: "DELETE"
        });

        const data = await response.json();

        if (!response.ok) {
            if (handleVerificationRequired(data)) {
                return;
            }

            showMessage(
                data.error ||
                data.message ||
                "Failed to empty Trash.",
                "error"
            );

            return;
        }

        // Clear the current selection.
        selectedTrashItems.clear();
        trashSelectionMode = false;
        trashContextItem = null;

        const selectAllCheckbox = document.getElementById(
            "trash-select-all-checkbox"
        );

        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }

        updateTrashSelectionToolbar();

        // Refresh the Trash view.
        await loadTrashFolder(currentTrashFolderId);

        showMessage(
            data.message || "Trash emptied successfully.",
            "success"
        );

    } catch (error) {
        console.error("Empty Trash failed:", error);

        showMessage(
            "Unable to connect to the server.",
            "error"
        );
    }
}

document.getElementById("empty-trash-button")
    ?.addEventListener("click", emptyTrash);


/* ============================== Change Password ============================ */
const passwordModal = document.getElementById("password-modal-overlay");
const openPasswordModal = document.getElementById("open-password-modal");
const closePasswordModal = document.getElementById("close-password-modal");
const changePasswordForm = document.getElementById("change-password-form");
const passwordMessage = document.getElementById("password-form-message");
const submitPasswordButton = document.getElementById("submit-password-change");

openPasswordModal.addEventListener("click", () => {
    passwordModal.hidden = false;
    document.getElementById("current-password").focus();
});

function closePasswordPopup() {
    passwordModal.hidden = true;
    changePasswordForm.reset();
    passwordMessage.textContent = "";
}

closePasswordModal.addEventListener("click", closePasswordPopup);

passwordModal.addEventListener("click", (event) => {
    if (event.target === passwordModal) {
        closePasswordPopup();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !passwordModal.hidden) {
        closePasswordPopup();
    }
});

changePasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const currentPassword =
        document.getElementById("current-password").value;

    const newPassword =
        document.getElementById("new-password").value;

    const confirmPassword =
        document.getElementById("confirm-password").value;

    if (newPassword !== confirmPassword) {
        passwordMessage.textContent = "The new passwords do not match.";
        return;
    }

    if (currentPassword === newPassword) {
        passwordMessage.textContent =
            "Choose a password different from your current one.";
        return;
    }

    submitPasswordButton.disabled = true;
    submitPasswordButton.textContent = "Updating...";
    passwordMessage.textContent = "";

    try {
        const response = await fetch("/api/auth/change-password", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            })
        });

        const result = await response.json();

        if (!response.ok) {
            passwordMessage.textContent =
                result.error || "Unable to change password.";
            return;
        }

        passwordMessage.textContent =
            result.message || "Password changed successfully.";

        changePasswordForm.reset();

        showMessage(
            result.message || "Password changed successfully.",
            "success"
        );

        setTimeout(() => {
            closePasswordPopup();
        }, 1000);

    } catch (error) {
        passwordMessage.textContent =
            "A network error occurred. Please try again.";
    } finally {
        submitPasswordButton.disabled = false;
        submitPasswordButton.textContent = "Update Password";
    }
});

document.querySelectorAll(".toggle-password").forEach((button) => {
    button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.target);

        if (!input) return;

        const isVisible = input.type === "text";

        input.type = isVisible ? "password" : "text";
        button.textContent = isVisible ? "Show" : "Hide";
        button.setAttribute("aria-pressed", String(!isVisible));

        const fieldName = {
            "current-password": "current",
            "new-password": "new",
            "confirm-password": "confirmation"
        }[input.id];

        button.setAttribute(
            "aria-label",
            `${isVisible ? "Show" : "Hide"} ${fieldName} password`
        );
    });
});

/* #===========================# Account Deletion #===========================# */
const deleteAccountModal = document.getElementById(
    "delete-account-modal"
);

const openDeleteAccountButton = document.getElementById(
    "open-delete-account"
);

const closeDeleteAccountButton = document.getElementById(
    "close-delete-account"
);

const cancelDeleteAccountButton = document.getElementById(
    "cancel-delete-account"
);

const deleteAccountForm = document.getElementById(
    "delete-account-form"
);

const deleteAccountPassword = document.getElementById(
    "delete-account-password"
);

const deleteAccountMessage = document.getElementById(
    "delete-account-message"
);

const confirmDeleteAccountButton = document.getElementById(
    "confirm-delete-account"
);


// Open the popup
openDeleteAccountButton.addEventListener("click", () => {
    deleteAccountModal.classList.add("is-open");
    deleteAccountModal.setAttribute("aria-hidden", "false");

    deleteAccountMessage.textContent = "";
    deleteAccountMessage.className = "delete-account-message";

    deleteAccountPassword.value = "";

    deleteAccountPassword.focus();
});


// Close the popup
function closeDeleteAccountModal() {
    if (confirmDeleteAccountButton.disabled) {
        return;
    }

    deleteAccountModal.classList.remove("is-open");
    deleteAccountModal.setAttribute("aria-hidden", "true");

    deleteAccountPassword.value = "";
    deleteAccountMessage.textContent = "";
    deleteAccountMessage.className = "delete-account-message";
}

closeDeleteAccountButton.addEventListener(
    "click",
    closeDeleteAccountModal
);

cancelDeleteAccountButton.addEventListener(
    "click",
    closeDeleteAccountModal
);


// Close when clicking the backdrop
deleteAccountModal.addEventListener("click", (event) => {
    if (event.target === deleteAccountModal) {
        closeDeleteAccountModal();
    }
});


// Close with Escape
document.addEventListener("keydown", (event) => {
    if (
        event.key === "Escape" &&
        deleteAccountModal.classList.contains("is-open")
    ) {
        closeDeleteAccountModal();
    }
});


// Display a message inside the popup
function showDeleteAccountMessage(message, type) {
    deleteAccountMessage.textContent = message;
    deleteAccountMessage.className =
        `delete-account-message is-visible is-${type}`;
}


// Submit the deletion request
deleteAccountForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const password = deleteAccountPassword.value;

    if (!password) {
        showDeleteAccountMessage(
            "Please enter your current password.",
            "error"
        );
        deleteAccountPassword.focus();
        return;
    }

    confirmDeleteAccountButton.disabled = true;
    cancelDeleteAccountButton.disabled = true;
    closeDeleteAccountButton.disabled = true;

    confirmDeleteAccountButton.textContent = "Deleting account...";

    try {
        const response = await fetch("/api/auth/delete-account", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify({
                password: password
            })
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            showDeleteAccountMessage(
                result.error || "Unable to delete your account. Please try again.",
                "error"
            );
            return;
        }

        showDeleteAccountMessage(
            result.message || "Your account has been deleted successfully.",
            "success"
        );

        showMessage(
            result.message || "Your account has been deleted successfully.",
            "success"
        );

        deleteAccountPassword.value = "";

        // Allow the success message to appear before redirecting.
        setTimeout(() => {
            window.location.replace("/signin");
        }, 1500);

    } catch (error) {
        console.error("Account deletion request failed:", error);

        showDeleteAccountMessage(
            "A network error occurred. Please check your connection and try again.",
            "error"
        );

    } finally {
        // Keep the buttons disabled after a successful deletion.
        // The page will redirect to the login screen.
        if (!deleteAccountMessage.classList.contains("is-success")) {
            confirmDeleteAccountButton.disabled = false;
            cancelDeleteAccountButton.disabled = false;
            closeDeleteAccountButton.disabled = false;

            confirmDeleteAccountButton.textContent =
                "Permanently Delete Account";
        }
    }
});



/* #===========================# Start Drive #===========================# */

restoreFolderNavigation();
loadAccountCard();

/* #===========================# End Drive #===========================# */