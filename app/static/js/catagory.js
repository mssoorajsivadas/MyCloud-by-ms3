// ==========================
// MyCloud images
// ==========================
async function loadImages() {
    try {
        const response = await fetch("/api/browse/images");
        const images = await response.json();

        if (!response.ok) {
            if (handleVerificationRequired(images)) {
                return;
            }

            showMessage(
                images.error ||
                images.message ||
                "Failed to load image.",
                "error"
            );

            return;
        }

        const imageList = document.getElementById("image-list");

        imageList.innerHTML = "";

        const imageFiles = images.filter(
            file => file.file_type === "image"
        );

        if (imageFiles.length === 0) {
            imageList.innerHTML = `
        <div class="empty-gallery-message">
            <span class="material-symbols-rounded">image</span>
            <p>No images here</p>
        </div>`;
            return;
        }

        imageFiles.forEach(file => {
            const fileElement = document.createElement("div");
            fileElement.className = "files";
            fileElement.style.cursor = "pointer";

            // Open the existing file preview
            fileElement.addEventListener("click", () => {
                openFilePreview(file, imageFiles);
            });

            // Display image thumbnail
            if (file.thumbnail_name) {
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

            // Display filename
            const fileName = document.createElement("span");
            fileName.className = "file-label";
            fileName.textContent = file.name;

            fileElement.appendChild(fileName);

            // Reuse existing context menu
            fileElement.addEventListener("contextmenu", event => {
                event.preventDefault();
                showFileContextMenu(event, file);
            });

            imageList.appendChild(fileElement);
        });

    } catch (error) {
        console.error("Failed to load images:", error);
    }
}

// ==========================
// MyCloud documents
// ==========================
async function loadDocuments() {
    try {
        const response = await fetch("/api/browse/documents");
        const documents = await response.json();

        if (!response.ok) {
            if (handleVerificationRequired(documents)) {
                return;
            }

            showMessage(
                documents.error ||
                documents.message ||
                "Failed to load Document.",
                "error"
            );

            return;
        }

        const documentList = document.getElementById("document-list");

        documentList.innerHTML = "";

        const documentFiles = documents.filter(file =>
            file.file_type === "pdf" ||
            file.file_type === "document"
        );

        if (documentFiles.length === 0) {
            documentList.innerHTML = `
        <div class="empty-gallery-message">
            <span class="material-symbols-rounded">docs</span>
            <p>No document here</p>
        </div>`;
            return;
        }

        // Reuse your existing file rendering style
        documentFiles.forEach(file => {
            const fileElement = document.createElement("div");
            fileElement.className = "files";
            fileElement.style.cursor = "pointer";

            fileElement.addEventListener("click", () => {
                openFilePreview(file, documentFiles);
            });

            // Show thumbnail for files that support it
            if (
                file.thumbnail_name &&
                (file.file_type === "pdf")
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

            // Show filename
            const fileName = document.createElement("span");
            fileName.className = "file-label";
            fileName.textContent = file.name;

            fileElement.appendChild(fileName);

            // Reuse your existing context menu
            fileElement.addEventListener("contextmenu", event => {
                event.preventDefault();
                showFileContextMenu(event, file);
            });

            documentList.appendChild(fileElement);
        });

    } catch (error) {
        console.error("Failed to load documents:", error);
    }
}

// ==========================
// MyCloud videos
// ==========================
async function loadVideos() {
    try {
        const response = await fetch("/api/browse/videos");
        const videos = await response.json();

        if (!response.ok) {
            if (handleVerificationRequired(videos)) {
                return;
            }

            showMessage(
                videos.error ||
                videos.message ||
                "Failed to load videos.",
                "error"
            );

            return;
        }

        const videoList = document.getElementById("video-list");

        videoList.innerHTML = "";

        const videoFiles = videos.filter(
            file => file.file_type === "video"
        );

        if (videoFiles.length === 0) {
            videoList.innerHTML = `
        <div class="empty-gallery-message">
            <span class="material-symbols-rounded">animated_images</span>
            <p>No videos here</p>
        </div>`;
            return;
        }

        videoFiles.forEach(file => {
            const fileElement = document.createElement("div");
            fileElement.className = "files";
            fileElement.style.cursor = "pointer";

            // Display the video thumbnail when available.
            if (file.thumbnail_name) {
                const thumbnail = document.createElement("img");
                thumbnail.className = "file-thumbnail";
                thumbnail.src = `/api/files/${file.id}/thumbnail`;
                thumbnail.alt = "";
                thumbnail.loading = "lazy";

                thumbnail.addEventListener("error", () => {
                    const icon = document.createElement("span");
                    icon.className = "material-symbols-rounded";
                    icon.textContent = getFileIcon(file.file_type);
                    thumbnail.replaceWith(icon);
                }, { once: true });

                fileElement.appendChild(thumbnail);
            } else {
                const icon = document.createElement("span");
                icon.className = "material-symbols-rounded";
                icon.textContent = getFileIcon(file.file_type);
                fileElement.appendChild(icon);
            }

            const fileName = document.createElement("span");
            fileName.className = "file-label";
            fileName.textContent = file.name;
            fileElement.appendChild(fileName);

            fileElement.addEventListener("click", () => {
                openFilePreview(file, videoFiles);
            });

            fileElement.addEventListener("contextmenu", event => {
                event.preventDefault();
                showFileContextMenu(event, file);
            });

            videoList.appendChild(fileElement);
        });

    } catch (error) {
        console.error("Failed to load videos:", error);
    }
}


// ==========================
// MyCloud Gallery
// ==========================

const galleryGrid = document.getElementById("gallery-grid");
const galleryMessage = document.getElementById("gallery-message");
const galleryFilters = document.querySelectorAll(".gallery-filter");

let galleryItems = [];
let currentGalleryFilter = "all";

function getThumbnailUrl(file) {
    return `/api/files/${file.id}/thumbnail`;
}

function getMediaUrl(file) {
    return `/api/files/${file.id}/preview`;
}

function formatGallerySize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) {
        return "";
    }

    if (bytes === 0) {
        return "0 B";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1
    );

    return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
}

async function loadGallery() {
    galleryMessage.textContent = "Loading your gallery...";
    galleryGrid.replaceChildren();

    try {
        const [imagesResponse, videosResponse] = await Promise.all([
            fetch("/api/browse/images", { credentials: "same-origin" }),
            fetch("/api/browse/videos", { credentials: "same-origin" })
        ]);

        if (!imagesResponse.ok || !videosResponse.ok) {
            throw new Error(
                `Gallery API error: images ${imagesResponse.status}, videos ${videosResponse.status}`
            );
        }

        const [images, videos] = await Promise.all([
            imagesResponse.json(),
            videosResponse.json()
        ]);

        galleryItems = [
            ...images
                .filter(file => file.file_type === "image")
                .map(file => ({ ...file, file_type: "image" })),

            ...videos
                .filter(file => file.file_type === "video")
                .map(file => ({ ...file, file_type: "video" }))
        ];

        // Keep the alphabetical order returned by your APIs.
        galleryItems.sort((a, b) =>
            a.name.localeCompare(b.name)
        );

        renderGallery();
    } catch (error) {
        console.error("Gallery loading failed:", error);
        galleryMessage.textContent =
            "Couldn't load your gallery. Please refresh and try again.";
    }
}

function createGalleryCard(file) {
    const card = document.createElement("article");
    card.className = "gallery-card";
    card.dataset.type = file.file_type;

    const mediaContainer = document.createElement("div");
    mediaContainer.className = "gallery-card-media";

    const thumbnail = document.createElement("img");
    thumbnail.className = "gallery-thumbnail";
    thumbnail.src = getThumbnailUrl(file);
    thumbnail.alt = file.name;
    thumbnail.loading = "lazy";
    thumbnail.decoding = "async";

    thumbnail.addEventListener("error", () => {
        thumbnail.classList.add("thumbnail-error");
        thumbnail.alt = `Thumbnail unavailable: ${file.name}`;
    });

    mediaContainer.appendChild(thumbnail);

    // Open media using MyCloud's existing preview system.
    const openButton = document.createElement("button");
    openButton.className = "gallery-image-open";
    openButton.type = "button";
    openButton.setAttribute("aria-label", `Open ${file.name}`);

    openButton.addEventListener("click", () => {
        const mediaItems = galleryItems.filter(
            item =>
                item.file_type === "image" ||
                item.file_type === "video"
        );

        openFilePreview(file, mediaItems);
    });

    mediaContainer.appendChild(openButton);

    card.appendChild(mediaContainer);

    return card;
}

function renderGallery() {
    galleryGrid.replaceChildren();

    const filteredItems = galleryItems.filter(file =>
        currentGalleryFilter === "all" ||
        file.file_type === currentGalleryFilter
    );

    if (filteredItems.length === 0) {
        galleryMessage.textContent =
            currentGalleryFilter === "all"
                ? "Your gallery is empty."
                : `No ${currentGalleryFilter}s found.`;
        return;
    }

    galleryMessage.textContent = "";

    const fragment = document.createDocumentFragment();

    filteredItems.forEach(file => {
        fragment.appendChild(createGalleryCard(file));
    });

    galleryGrid.appendChild(fragment);
}

function openGalleryImage(file) {
    const overlay = document.createElement("div");
    overlay.className = "gallery-viewer";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", file.name);

    const image = document.createElement("img");
    image.src = getMediaUrl(file);
    image.alt = file.name;

    const closeButton = document.createElement("button");
    closeButton.className = "gallery-viewer-close";
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Close image viewer");

    function closeViewer() {
        overlay.remove();
        document.removeEventListener("keydown", onKeyDown);
    }

    function onKeyDown(event) {
        if (event.key === "Escape") {
            closeViewer();
        }
    }

    closeButton.addEventListener("click", closeViewer);

    overlay.addEventListener("click", event => {
        if (event.target === overlay) {
            closeViewer();
        }
    });

    overlay.append(image, closeButton);
    document.body.appendChild(overlay);
    closeButton.focus();

    document.addEventListener("keydown", onKeyDown);
}

galleryFilters.forEach(button => {
    button.addEventListener("click", () => {
        galleryFilters.forEach(filter => {
            filter.classList.remove("active");
        });

        button.classList.add("active");
        currentGalleryFilter = button.dataset.filter;

        renderGallery();
    });
});

document.addEventListener("DOMContentLoaded", loadGallery);