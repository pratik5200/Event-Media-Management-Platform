# 📸 EventHub.io: Complete Developer Guide & Architecture Deep Dive

> **A secure, real-time platform for managing event media with AI-powered search.**

![Live Demo](https://img.shields.io/badge/Live_Demo-Online-success?style=for-the-badge)
![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-black?style=for-the-badge&logo=vercel)
![Render](https://img.shields.io/badge/Hosted_on-Render-46E3B7?style=for-the-badge&logo=render)

## 🎯 The Problem Statement
Managing digital media across large events is often fragmented. Event organizers and attendees struggle with secure access, slow uploads, and the inability to quickly find specific photos. 

**The Solution:** EventHub is a highly available, secure, real-time media management platform. It allows users to securely authenticate, organize media into private folders, and leverage AI tags for global image searches—all wrapped in a fast, lightweight, decoupled architecture.

---

## 🛠️ Tech Stack & Architecture Explained

### 1. The Frontend (Client-Side)
* **Core:** Pure HTML5, CSS3, and Vanilla JavaScript.
    * *Why:* To keep the application incredibly lightweight and fast. Bypassing heavy frameworks like React means zero build times and instant page loads.
* **Hosting:** Vercel (Edge Network).
    * *Why:* Vercel provides out-of-the-box global CDN caching and seamless integration with GitHub for continuous deployment.
* **Analytics:** Vercel Web Analytics.
    * *Why:* Injected directly into the `<head>` of HTML files to provide privacy-friendly, real-time traffic monitoring without the bloat of Google Analytics.

### 2. The Backend (Server-Side)
* **Core:** Python with **FastAPI**.
    * *Why:* FastAPI is built on modern Python features, making it one of the fastest frameworks available. It natively supports asynchronous programming (`async/await`), which is crucial for handling multiple users simultaneously.
* **Database:** PostgreSQL (via SQLAlchemy ORM).
    * *Why:* Relational data structure is perfect for linking Users to their specific Event Folders and Media.
* **Hosting:** Render (Web Service).
    * *Why:* Render offers native Python hosting and automated deployments directly from GitHub.

### 3. APIs & Integrations
* **Real-Time Protocol:** WebSockets (via Uvicorn).
    * *Why:* For live notifications without forcing the user to refresh the page.
* **Email Provider:** Google Apps Script API (Custom Proxy).
    * *Why:* A custom-engineered solution to bypass strict SMTP port firewalls on free cloud hosting tiers.
* **Keep-Alive Bot:** Cron-job.org.
    * *Why:* To automatically ping the backend every 10 minutes, preventing Render's servers from entering sleep mode.

---

## 💻 Local Installation & Setup Guide

### 1. Backend Setup (FastAPI)
```bash
# Clone the repository
git clone [https://github.com/yourusername/event-media-management-platform.git](https://github.com/yourusername/event-media-management-platform.git)
cd event-media-management-platform/backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
