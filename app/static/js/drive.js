
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

        files.forEach(file => {

            const fileElement = document.createElement("div");
            fileElement.className = "files";

            const fileIcon = document.createElement("span");
            fileIcon.className = "material-symbols-rounded";
            fileIcon.textContent = getFileIcon(file.file_type);

            const fileName = document.createElement("span");
            fileName.className = "file-label";
            fileName.textContent = file.name;


            fileElement.addEventListener("contextmenu", (event) => {

                event.preventDefault();

                showFileContextMenu(event, file);
            });

            fileElement.appendChild(fileIcon);

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


uploadFileButton.addEventListener("click", () => {

    addMenu.classList.remove("open");

    fileInput.click();

});

fileInput.addEventListener("change", async () => {

    if (fileInput.files.length === 0) {
        return;
    }

    const file = fileInput.files[0];

    const formData = new FormData();

    formData.append("file", file);

    if (currentFolderId !== null) {
        formData.append(
            "folder_id",
            currentFolderId
        );
    }

    try {


        const response = await fetch(
            "/api/files/",
            {
                method: "POST",
                body: formData
            }
        );

        console.log("Response status:", response.status);

        const data = await response.json();

        if (!response.ok) {

            showMessage(
                data.message ||
                data.error || "File upload failed.",
                "error"
            );

            return;
        }

        showMessage(
            data.message || "File uploaded successfully.",
            "success"
        );

        fileInput.value = "";

        await loadFolders(currentFolderId);

    } catch (error) {

        console.error("UPLOAD ERROR:", error);

        showMessage(
            "Something went wrong while uploading the file.",
            "error"
        );
    }
});


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
            alert(data.error);
            return;
        }

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
            alert(data.error);
            return;
        }

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
            alert(data.error);
            return;
        }

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
            alert(data.error);
            return;
        }

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

















/* #===========================# Start Drive #===========================# */

restoreFolderNavigation();

/* #===========================# End Drive #===========================# */