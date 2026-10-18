# MyCloud by ms3 v2.0.0 
############![App Icon](https://github.com/mssoorajsivadas/MyCloud-by-ms3/blob/61eb2fbf9a4bac51db41cc0edc9a78adba642bd9/app/static/assets/images/logo/mycloud-logo-v1.svg)

Build your own cloud using MyCloud by ms3 project. A modern, high-performance, and secure cloud storage and file management system designed for seamless synchronization, sharing, and real-time collaboration.

![Image](https://github.com/mssoorajsivadas/MyCloud-by-ms3/blob/17d8aa8935d8e9af98a6c8566668a922d753bb21/app.jpg)

---
## ✨ Features

- 🔐 **Authentication & Security**
  - Hashed Password and Secure Session
  - Email Verification.
  - Session-based authentication

- 📁 **File & Folder Management**
  - Drag-and-drop file upload with chunking and resume capabilities.
  - Advanced search with full-text indexing, tags, and dynamic filters.
  - File versioning and trash/recovery management.

- ⚡ **Performance & Storage Integration**
  - Multi-provider backend storage (S3, Google Cloud Storage, Azure Blob, or Local Drive).
  - Fast thumbnail generation and streaming media playback.
  - Deduplication to optimize storage utilization.
 
-  **Other Features**
  - Light and dark theme support.
  - A friendly interface.
  - Multiple File and Folder Upload.
  - Storage analyzer.
  - Gallery interface similar to pinterest layout (Masonry layout).
  - Thumbnail support for many images type and videos types including pdf thumbnail.
  - Supported preview are images, videos, pdf and other documents.
  - Icon support all known format.  
 
---
## 🛠️ Architecture & Tech Stack

- **Frontend:** HTML / js, CSS
- **Backend:**  Python (Flask)
- **Database:** SQLlite 
- **Object Storage:** Local Storage

---

## 🚀 Getting Started

### Installation
1. **Clone the repository:**
   ```bash
   git clone https://github.com/mssoorajsivadas/MyCloud-by-ms3.git
   cd MyCloud-by-ms3
   ```
   
2. **Install dependencies:**  
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables:**
   Copy `.env.example` to `.env` in `app` directories and update the variables:
   ```
   export MAIL_USERNAME="xxxxxxxxxxxx@xxxx.xxx"
   export MAIL_PASSWORD="xxxx xxxx xxxx xxxx"
   ```

4. **Start the Application:**
   ```bash
   python run.py
   ```

