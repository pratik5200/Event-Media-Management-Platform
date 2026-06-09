# 📸 EventHub.io: Complete Developer Guide & Architecture Deep Dive

> A fully decoupled, production-ready event media platform built with **Vanilla HTML/JS** on the frontend and **FastAPI + PostgreSQL** on the backend. This guide walks you through every phase from zero to live deployment — written so that a complete beginner can follow it step by step.

---

## 📋 Table of Contents

1. [Project Architecture Overview](#1-project-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Frontend Setup](#3-frontend-setup)
4. [Backend Setup](#4-backend-setup)
5. [Database Setup — Neon (Serverless PostgreSQL)](#5-database-setup--neon-serverless-postgresql)
6. [Security & Authentication](#6-security--authentication)
7. [OTP Verification — Deep Dive & Troubleshooting](#7-otp-verification--deep-dive--troubleshooting)
8. [APIs & Integrations](#8-apis--integrations)
9. [Cloud Storage — AWS S3 Integration](#9-cloud-storage--aws-s3-integration)
10. [Real-Time Systems & High Availability](#10-real-time-systems--high-availability)
11. [API Security & Auditing](#11-api-security--auditing)
12. [Analytics & Production Polish](#12-analytics--production-polish)
13. [Deployment](#13-deployment)
14. [Common Pitfalls & Warnings](#14-common-pitfalls--warnings)

---

## 1. Project Architecture Overview

EventHub uses a **completely decoupled architecture**. The frontend and backend live in separate directories, are deployed on separate platforms, and communicate exclusively through JSON API endpoints.

```
eventhub/
├── frontend/        ← Vanilla HTML, CSS, JS      →  Deployed on Vercel
└── backend/         ← FastAPI + PostgreSQL        →  Deployed on Render
                         │
                         ├── Neon (PostgreSQL DB)  →  Serverless cloud database
                         └── AWS S3 (File Storage) →  Media/image file storage
```

**Key Design Principles:**
- The frontend **never** renders server-side code. All dynamic content is handled by JavaScript using the browser's native DOM.
- The backend **never** trusts the frontend for security. Every sensitive endpoint validates the caller's identity independently.
- All secrets (passwords, API keys, DB URLs) live in environment variables — **never** in your code.

---

## 2. Prerequisites

You will also need free accounts on:
- [GitHub](https://github.com) — code hosting
- [Vercel](https://vercel.com) — frontend deployment
- [Render](https://render.com) — backend deployment
- [Neon](https://neon.tech) — serverless PostgreSQL database
- [AWS](https://aws.amazon.com/free) — S3 cloud file storage (free tier)
- [cron-job.org](https://cron-job.org) — keep-alive scheduler
- [Google Account](https://accounts.google.com) — email proxy via Google Apps Script

---

## 3. Frontend Setup

The frontend uses **pure HTML/CSS/JS** — no React, no npm, no build step. This keeps setup time under 5 minutes.

### Step 1 — Create the Project Structure

```bash
mkdir eventhub-frontend
cd eventhub-frontend
touch index.html login.html style.css script.js
```

### Step 2 — Write the Core HTML Boilerplate

Inside each HTML file, use this standard structure. Always link CSS in the `<head>` and JavaScript at the bottom of `<body>` so the page loads visually before scripts run.

**`index.html`**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EventHub.io - Dashboard</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>

    <!-- Your page content goes here -->

    <script src="script.js"></script>
</body>
</html>
```

> ⚠️ Repeat this same boilerplate for `login.html` — just change the `<title>`.

### Step 3 — Set Up the API Gateway in JavaScript

At the very top of your `script.js`, add this dynamic environment switcher. It automatically points to your local test server when developing and your live Render server when in production — without you changing anything manually.

```javascript
// script.js — Dynamic Environment Gatekeeper
const IS_LOCAL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

const API_BASE_URL = IS_LOCAL
    ? "http://localhost:10000"
    : "https://your-backend-api.onrender.com"; // ← Replace with your actual Render URL
```

### Step 4 — Write Async API Calls

When fetching data from the backend, always use `async/await` with proper error handling so the UI gives the user feedback if something goes wrong.

```javascript
async function fetchEventFolders() {
    const folderContainer = document.getElementById("folder-grid");

    try {
        const response = await fetch(`${API_BASE_URL}/folders`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            }
        });

        if (!response.ok) throw new Error("Failed to pull folder records.");

        const data = await response.json();
        renderFolderUI(data.folders);

    } catch (error) {
        console.error("Architecture Sync Error:", error);
        folderContainer.innerHTML = `<p class="error-msg">Could not load folders. Please check your connection.</p>`;
    }
}
```

### Step 5 — Run Locally

1. Open the `eventhub-frontend` folder in VS Code.
2. Install the **Live Server** extension (search in the Extensions panel).
3. Right-click `index.html` → select **"Open with Live Server"**.
4. Your site is now live at `http://localhost:5500` and auto-refreshes on every save.

---

## 4. Backend Setup

### Step 1 — Initialize the Environment

Create a dedicated backend directory and set up a Python virtual environment to keep your project dependencies isolated from the rest of your system.

```bash
mkdir backend
cd backend

# Create the virtual environment
python -m venv venv

# Activate it — Mac/Linux:
source venv/bin/activate

# Activate it — Windows:
venv\Scripts\activate
```

> 💡 You will see `(venv)` appear in your terminal prompt when the environment is active. Always activate it before running any Python commands.

### Step 2 — Install Dependencies

Create a `requirements.txt` file inside the `backend/` folder with these exact contents:

```
fastapi==0.110.0
uvicorn==0.28.0
sqlalchemy==2.0.28
psycopg2-binary==2.9.9
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.9
pydantic==2.6.4
requests==2.31.0
websockets==12.0
```

Then install everything in one command:

```bash
pip install -r requirements.txt
```

### Step 3 — Create the Database Models

Create `models.py`. This file tells SQLAlchemy (your database toolkit) how to create your tables in PostgreSQL. Each Python class maps directly to one database table.

```python
# models.py
from sqlalchemy import Column, Integer, String, ForeignKey, Text
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

class Media(Base):
    __tablename__ = "media"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    ai_tags = Column(Text, default="")   # Stores comma-separated AI tags
    user_id = Column(Integer, ForeignKey("users.id"))
```

### Step 4 — Create the Database Connector

Create `database.py`. This manages the connection pool to your PostgreSQL database.

```python
# database.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/eventhub")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### Step 5 — Create the Main Application

Create `main.py`. This is the heart of your backend — it starts the server, handles CORS, and defines your API endpoints.

```python
# main.py
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import models
from database import engine, get_db

app = FastAPI(title="EventHub API")

# CORS: Allow your frontend (on Vercel) to communicate with this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://your-frontend-app.vercel.app",  # ← Replace with your Vercel URL
        "http://localhost:5500"                   # ← Your local dev server
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Authentication guard — verifies JWT tokens on protected routes
def get_current_user(db: Session = Depends(get_db)):
    # Full JWT verification logic goes here (see Section 5)
    pass

# Example protected endpoint
@app.get("/media/search/tags", status_code=status.HTTP_200_OK)
def search_photos_by_ai(
    tag: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)   # ← Enforces authentication
):
    search_results = db.query(models.Media).filter(
        models.Media.ai_tags.ilike(f"%{tag}%")
    ).all()

    if not search_results:
        return {"message": f"No photos found with the AI tag: {tag}", "results": []}
    return {"message": "Success", "results": search_results}
```

### Step 6 — Configure Environment Variables

**Never** hardcode secrets directly in your code. Create a `.env` file in the `backend/` directory:

```
# Database (Neon — see Section 5 for how to get this)
DATABASE_URL=postgresql://your_db_user:your_db_password@your_neon_host.neon.tech/your_db_name?sslmode=require

# JWT signing key — make this long and random
SECRET_KEY=your_super_secret_jwt_signing_key_here

# Google Apps Script email proxy URL (see Section 8)
GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_APP_SCRIPT_ID/exec

# AWS S3 credentials (see Section 9)
AWS_ACCESS_KEY_ID=your_iam_access_key_id
AWS_SECRET_ACCESS_KEY=your_iam_secret_access_key
AWS_REGION=ap-south-1
S3_BUCKET_NAME=eventhub-media
```

> ⚠️ **CRITICAL:** Add `.env` to your `.gitignore` file immediately. Never commit this file to GitHub. If your `SECRET_KEY` is ever exposed publicly, regenerate it immediately.

### Step 7 — Run the Backend Locally

```bash
uvicorn main:app --reload --port 10000
```

Your API is now running at `http://localhost:10000`. Visit `http://localhost:10000/docs` to see the auto-generated interactive API documentation.

---

## 5. Database Setup — Neon (Serverless PostgreSQL)

Instead of managing your own PostgreSQL server, we use **Neon** — a fully serverless, cloud-hosted PostgreSQL database. It is free to start, scales automatically, and integrates perfectly with Render. This is the recommended approach for scalability and industry relevance.

### Why Neon?

| Feature | Local PostgreSQL | Neon |
|---------|-----------------|------|
| Setup time | 20–30 minutes | 2 minutes |
| Requires local install | Yes | No |
| Accessible from Render | Only with port-forwarding | Yes, out of the box |
| Free tier | N/A | 0.5 GB storage free |
| Scales automatically | No | Yes |

### Step 1 — Create a Neon Account and Database

1. Go to [neon.tech](https://neon.tech) and sign up for a free account.
2. Click **New Project**.
3. Give your project a name (e.g., `eventhub`).
4. Select the **AWS region closest to your users** (e.g., `ap-south-1` for India, `us-east-1` for USA).
5. Click **Create Project**.

> ⚠️ **Common Stuck Point:** Do not skip the region selection. If your Render backend is in `us-east-1` but your Neon database is in `eu-central-1`, every database query adds 150ms+ of latency. Always match regions.

### Step 2 — Get Your Connection String

After creating the project, Neon will show you a **Connection Details** panel.

1. Click the **Connection string** tab.
2. Select **Pooled connection** (this is important — it handles multiple concurrent connections efficiently).
3. Copy the string. It will look like this:

```
postgresql://eventhub_owner:AbCdEfGh123@ep-cool-rain-12345.ap-south-1.aws.neon.tech/eventhub?sslmode=require
```

4. Paste it as the value of `DATABASE_URL` in your `.env` file:

```
DATABASE_URL=postgresql://eventhub_owner:AbCdEfGh123@ep-cool-rain-12345.ap-south-1.aws.neon.tech/eventhub?sslmode=require
```

> ⚠️ **The `?sslmode=require` is not optional.** Neon enforces SSL on all connections. If you remove this flag, your backend will refuse to connect and throw a `connection refused` error with no helpful message.

### Step 3 — Add `python-dotenv` to Load Your `.env` File

Add this to your `requirements.txt`:

```
python-dotenv==1.0.1
```

Then at the very top of `database.py`, load the `.env` file before reading `DATABASE_URL`:

```python
# database.py
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

load_dotenv()  # ← This reads your .env file into os.getenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set. Check your .env file.")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### Step 4 — Create Your Tables (Run Migrations)

After your models are defined in `models.py`, run this once to create all the tables in Neon:

```python
# run_migrations.py  (run this file once, then you can delete it)
from database import engine
from models import Base

Base.metadata.create_all(bind=engine)
print("All tables created successfully in Neon.")
```

```bash
python run_migrations.py
```

Go back to the Neon console → click **Tables** in the left sidebar. You should see your `users` and `media` tables appear there.

### Step 5 — Add the Connection String to Render

When deploying to Render (Section 13), add your `DATABASE_URL` as an environment variable in the Render dashboard. Render will inject it into your running server automatically — your code does not change between local and production.

### ⚠️ Where Beginners Get Stuck with Neon

**Problem 1 — "SSL connection required" error**
```
sqlalchemy.exc.OperationalError: could not connect to server: SSL connection required
```
Fix: Make sure your `DATABASE_URL` ends with `?sslmode=require`.

**Problem 2 — Connection works locally but times out on Render**
Cause: You copied the **direct connection string** instead of the **pooled connection string**. Direct connections have a limit of ~100 simultaneous connections. Render uses the pooled one to handle bursts.
Fix: In the Neon console → Connection Details → switch to **Pooled connection** and copy that string.

**Problem 3 — Tables exist in Neon but queries return nothing**
Cause: You ran `Base.metadata.create_all()` but forgot to actually insert any seed data.
Fix: Use the Neon console's **SQL Editor** tab to run `SELECT * FROM users;` and verify the table is there and populated.

**Problem 4 — "password authentication failed for user" on Render**
Cause: You copy-pasted the connection string into Render but a special character in the password (like `@`, `#`, or `%`) broke the URL parsing.
Fix: In the Neon console → reset your database password to one containing only letters and numbers. Then update your `.env` and Render environment variable.

---

## 6. Security & Authentication

### Step 1 — Secure Password Hashing

Never store raw passwords. Use `passlib` with the `bcrypt` algorithm to convert passwords into a one-way hash before saving to the database.

```python
# auth.py
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
```

### Step 2 — JWT Token Generation

Generate stateless session tokens (JWTs) so users don't need to re-login on every request. These tokens expire automatically after 60 minutes.

```python
# auth.py (continued)
from datetime import datetime, timedelta
from jose import jwt

SECRET_KEY = "your-highly-secure-jwt-secret-string"   # Load from .env in production!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
```

### Step 3 — Multi-Factor OTP Flow

When a user registers or performs a sensitive action:
1. Generate a secure random 6-digit OTP code.
2. Save it in a temporary database table with a **5-minute expiration timestamp**.
3. Email it to the user via the Google Apps Script proxy (see Section 8).
4. On form submission, verify the code matches and has not expired before proceeding.

---

## 7. OTP Verification — Deep Dive & Troubleshooting

OTP (One-Time Password) verification is one of the most common places where beginners get completely stuck. This section walks through the full implementation and every problem you are likely to hit.

### How the Full OTP Flow Works

```
User submits email
      ↓
Backend generates a 6-digit code
      ↓
Backend saves code + expiry time to DB (Neon)
      ↓
Backend calls Google Apps Script proxy → Google sends email
      ↓
User checks inbox, enters code in the form
      ↓
Backend checks: does the code match? is it still within 5 minutes?
      ↓
     YES → proceed to login/register
      NO → return error "Invalid or expired OTP"
```

### Step 1 — Add an OTP Table to Your Models

```python
# models.py (add this class)
from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime, timedelta

class OTPVerification(Base):
    __tablename__ = "otp_verification"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=False, index=True)
    otp_code = Column(String(6), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Integer, default=0)   # 0 = unused, 1 = used
```

After adding this, re-run your migrations:
```bash
python run_migrations.py
```

### Step 2 — Generate and Store the OTP

```python
# In your auth or routes file
import random
import string
from datetime import datetime, timedelta

def generate_otp() -> str:
    return ''.join(random.choices(string.digits, k=6))

def store_otp(db, email: str, otp: str):
    # Delete any existing unused OTPs for this email first
    db.query(OTPVerification).filter(
        OTPVerification.email == email,
        OTPVerification.is_used == 0
    ).delete()

    otp_record = OTPVerification(
        email=email,
        otp_code=otp,
        expires_at=datetime.utcnow() + timedelta(minutes=5)
    )
    db.add(otp_record)
    db.commit()
```

### Step 3 — Verify the OTP

```python
def verify_otp(db, email: str, submitted_otp: str) -> bool:
    record = db.query(OTPVerification).filter(
        OTPVerification.email == email,
        OTPVerification.otp_code == submitted_otp,
        OTPVerification.is_used == 0
    ).first()

    if not record:
        return False  # Code not found or already used

    if datetime.utcnow() > record.expires_at:
        return False  # Code expired

    # Mark as used so it cannot be reused
    record.is_used = 1
    db.commit()
    return True
```

### ⚠️ Every OTP Problem Beginners Face — and How to Fix Them

**Problem 1 — User never receives the email**

This is the most common issue. Go through this checklist in order:

- Check the **Google Apps Script execution logs**: In your script project, click **Executions** in the left panel. If there are no executions, your FastAPI backend never called the script. If there are failed executions, read the error message there.
- Check if `GOOGLE_SCRIPT_URL` in your `.env` is the correct deployed URL and not the editor URL. The deployed URL looks like `https://script.google.com/macros/s/AKfycb.../exec`. The editor URL will not work.
- Check your **Gmail Sent folder**. If the email appears there, the script ran fine — the email is in the user's spam folder.
- Tell the user to check their **spam/junk folder**. Google Apps Script emails are plain-text with no unsubscribe link, which spam filters flag aggressively.

**Problem 2 — "Script function not found: doPost"**

Cause: You deployed the script before writing the `doPost` function, or you made edits after deploying without creating a new deployment.
Fix: In Google Apps Script → **Deploy → Manage Deployments → Edit (pencil icon) → Version: New Version → Deploy**.

> ⚠️ **Critical:** Every time you change the Apps Script code, you must create a **New Version** deployment. Editing the code and saving does NOT update the live deployed version automatically.

**Problem 3 — OTP works in testing but users report it expired immediately**

Cause: Your server clock and the user's device clock are out of sync, or you are comparing times in different timezones.
Fix: Always use `datetime.utcnow()` consistently on both the store and verify sides. Never mix `datetime.now()` (local time) with `datetime.utcnow()` (UTC).

```python
# WRONG — mixes local and UTC time
expires_at=datetime.now() + timedelta(minutes=5)    # stores local time
if datetime.utcnow() > record.expires_at:           # compares with UTC

# CORRECT — both UTC
expires_at=datetime.utcnow() + timedelta(minutes=5)
if datetime.utcnow() > record.expires_at:
```

**Problem 4 — Same OTP can be used multiple times**

Cause: You forgot to mark the OTP as used after successful verification.
Fix: Set `record.is_used = 1` and call `db.commit()` immediately after a successful verification (Step 3 above). Do not skip this line.

**Problem 5 — "Authorization has been denied" from Google Apps Script**

Cause: You set **Who has access** to `Only myself` when deploying.
Fix: Go back to Apps Script → **Deploy → Manage Deployments → Edit → Who has access: Anyone** → Deploy a New Version.

**Problem 6 — OTP verification endpoint returns 422 Unprocessable Entity**

Cause: Your frontend is sending the OTP as a number (integer) but your FastAPI model expects a string.
Fix: Always convert the OTP input to a string before sending:

```javascript
const payload = {
    email: emailInput.value,
    otp: String(otpInput.value)   // ← Always send as string, not number
};
```

**Problem 7 — Old OTPs pile up in the database**

Cause: Every login attempt generates a new OTP record but old ones are never deleted.
Fix: The `store_otp()` function in Step 2 deletes existing unused OTPs for that email before inserting a new one. Always use that pattern.

**Problem 8 — User requests a new OTP but the old one still arrives and works**

Cause: Multiple valid OTP records exist for the same email simultaneously.
Fix: Same as above — always delete existing records before inserting a new one.

---

## 8. APIs & Integrations

### Part A — Google Apps Script Email Proxy

Free hosting platforms like Render **block outbound SMTP email ports** (25, 465, 587) to prevent spam. The workaround is to route emails through Google's infrastructure via a simple Apps Script.

#### Deploy the Google Script

1. Go to [script.google.com](https://script.google.com) and log in.
2. Click **New Project** and replace all default code with:

```javascript
function doPost(e) {
    try {
        var data = JSON.parse(e.postData.contents);
        var recipient = data.email;
        var subject = "EventHub.io - Your Security Verification Code";
        var body = "Your One-Time Password (OTP) for authentication is: " + data.otp;

        GmailApp.sendEmail(recipient, subject, body);

        return ContentService
            .createTextOutput(JSON.stringify({ "status": "success" }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch(error) {
        return ContentService
            .createTextOutput(JSON.stringify({ "status": "error", "message": error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}
```

3. Click **Deploy → New Deployment**.
4. Set type to **Web App**.
5. Set **Execute as: Me** and **Who has access: Anyone**.
6. Click **Deploy**, authorise with your Google account, and **copy the Web App URL**.
7. Paste this URL as `GOOGLE_SCRIPT_URL` in your backend `.env` file.

#### Trigger the Proxy from FastAPI

```python
# In your backend auth logic
import requests

GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/YOUR_DEPLOYED_ID/exec"

def send_otp_via_proxy(user_email: str, generated_otp: str):
    payload = {
        "email": user_email,
        "otp": generated_otp
    }
    response = requests.post(GOOGLE_SCRIPT_URL, json=payload)
    return response.json()
```

> ⚠️ **Warning for Others:** If email works on your local machine but silently hangs in cloud deployment, it is **not a code bug** — it is an infrastructure-level port block. Do not change your Python; use the proxy above.

---

## 9. Cloud Storage — AWS S3 Integration

Storing uploaded images and media files on your Render server's local disk is **not scalable** — the files disappear every time Render redeploys your service. The industry-standard solution is to upload files directly to **AWS S3**, which stores them permanently and serves them globally via CDN.

> 💡 This integration significantly increases the scalability and industry relevance of the project.

### Why AWS S3?

| Concern | Local Server Storage | AWS S3 |
|---------|---------------------|--------|
| Survives redeploys | No — files deleted | Yes — permanent |
| Scales with traffic | No | Yes — CDN delivery |
| Free tier | N/A | 5 GB free for 12 months |
| Industry standard | No | Yes |

### Step 1 — Create an AWS Account and S3 Bucket

1. Go to [aws.amazon.com/free](https://aws.amazon.com/free) and sign up. The free tier gives you 5 GB of S3 storage for 12 months.
2. In the AWS Console search bar, type **S3** and open the S3 service.
3. Click **Create bucket**.
4. Fill in:
   - **Bucket name:** `eventhub-media` (must be globally unique — add your name if taken)
   - **AWS Region:** Same region as your Neon database and Render service
   - **Block Public Access:** Leave **all boxes checked** for now (we will use pre-signed URLs instead)
5. Click **Create bucket**.

### Step 2 — Create an IAM User with S3 Permissions

Never use your root AWS account credentials in code. Create a dedicated IAM user with limited permissions.

1. In the AWS Console, search for **IAM** and open it.
2. Click **Users → Create user**.
3. Give it a name like `eventhub-backend`.
4. Click **Next → Attach policies directly**.
5. Search for and select **AmazonS3FullAccess**.
6. Click **Create user**.
7. Open the newly created user → click **Security credentials** → **Create access key**.
8. Select **Application running outside AWS** → click **Next → Create access key**.
9. **Copy both the Access Key ID and Secret Access Key immediately** — you cannot view the secret again after closing this page.

### Step 3 — Add AWS Credentials to Your `.env` File

```
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=ap-south-1
S3_BUCKET_NAME=eventhub-media
```

### Step 4 — Install the AWS SDK

Add `boto3` to your `requirements.txt`:

```
boto3==1.34.69
```

Then run:
```bash
pip install -r requirements.txt
```

### Step 5 — Write the S3 Upload Helper

Create `s3_helper.py` in your backend directory:

```python
# s3_helper.py
import boto3
import os
import uuid
from dotenv import load_dotenv

load_dotenv()

s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION")
)

BUCKET_NAME = os.getenv("S3_BUCKET_NAME")

def upload_file_to_s3(file_bytes: bytes, original_filename: str, content_type: str) -> str:
    """
    Uploads a file to S3 and returns its public URL.
    Generates a unique filename to prevent overwriting.
    """
    unique_filename = f"{uuid.uuid4()}_{original_filename}"

    s3_client.put_object(
        Bucket=BUCKET_NAME,
        Key=unique_filename,
        Body=file_bytes,
        ContentType=content_type
    )

    # Construct the S3 URL
    region = os.getenv("AWS_REGION")
    url = f"https://{BUCKET_NAME}.s3.{region}.amazonaws.com/{unique_filename}"
    return url

def generate_presigned_url(s3_key: str, expiry_seconds: int = 3600) -> str:
    """
    Generates a temporary URL to access a private S3 file.
    Useful for serving private media to authenticated users only.
    """
    url = s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": BUCKET_NAME, "Key": s3_key},
        ExpiresIn=expiry_seconds
    )
    return url
```

### Step 6 — Add a File Upload Endpoint in FastAPI

```python
# In main.py
from fastapi import UploadFile, File
from s3_helper import upload_file_to_s3

@app.post("/media/upload")
async def upload_media(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Read file contents into memory
    file_bytes = await file.read()

    # Validate file type — only allow images
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only image files are allowed.")

    # Upload to S3
    s3_url = upload_file_to_s3(file_bytes, file.filename, file.content_type)

    # Save the S3 URL to your database
    media_record = models.Media(
        filename=file.filename,
        s3_url=s3_url,
        user_id=current_user.id
    )
    db.add(media_record)
    db.commit()

    return {"message": "Upload successful", "url": s3_url}
```

> ⚠️ Also add an `s3_url` column to your `Media` model in `models.py`:
> ```python
> s3_url = Column(String, nullable=True)
> ```
> Then re-run `python run_migrations.py`.

### Step 7 — Call the Upload Endpoint from Your Frontend

```javascript
async function uploadMediaFile(file) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_BASE_URL}/media/upload`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`
            // Do NOT set Content-Type here — the browser sets it automatically for FormData
        },
        body: formData
    });

    const data = await response.json();
    return data.url;   // The permanent S3 URL
}
```

### ⚠️ Where Beginners Get Stuck with AWS S3

**Problem 1 — "Access Denied" when uploading**
Cause: Your IAM user does not have the correct permissions, or you are using the wrong credentials.
Fix: In IAM → your user → check the attached policies include `AmazonS3FullAccess`. Also double-check that `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in your `.env` match exactly what AWS showed you (no extra spaces).

**Problem 2 — Upload succeeds but the file URL returns 403 Forbidden when opened in browser**
Cause: S3 bucket has "Block all public access" enabled (which is correct for security). The file exists but is private.
Fix: Use `generate_presigned_url()` from `s3_helper.py` to generate a temporary URL when serving the file to authenticated users instead of exposing the raw S3 URL.

**Problem 3 — "NoRegionError: You must specify a region"**
Cause: `AWS_REGION` is not set in your `.env` or not loaded before boto3 initialises.
Fix: Make sure `load_dotenv()` is called at the top of `s3_helper.py` before the `boto3.client(...)` line.

**Problem 4 — File uploads work locally but fail on Render**
Cause: AWS credentials are in your `.env` file locally but not added to Render's environment variables.
Fix: In the Render dashboard → your service → **Environment** → add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and `S3_BUCKET_NAME` as separate environment variables.

**Problem 5 — Content-Type header breaks multipart upload from frontend**
Cause: You manually set `"Content-Type": "multipart/form-data"` in your fetch headers.
Fix: Remove the `Content-Type` header entirely when sending `FormData`. The browser sets the correct boundary automatically — if you override it, the server cannot parse the file.

---

## 10. Real-Time Systems & High Availability

### Part A — WebSocket Real-Time Notifications

WebSockets allow the server to **push** data to the browser instantly without the browser constantly polling for updates.

#### Backend — Connection Manager

Create `app/websocket.py`:

```python
# app/websocket.py
from fastapi import WebSocket
from typing import List

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()
```

Mount the WebSocket endpoint in `main.py`:

```python
from fastapi import WebSocket, WebSocketDisconnect

@app.websocket("/ws/notifications")
async def live_notification_tunnel(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            client_data = await websocket.receive_text()
            # Process and broadcast real-time events here
    except WebSocketDisconnect:
        print("A client dropped from the live notification loop.")
```

#### Frontend — Auto-Reconnect Client

Add this to `script.js`. If the browser tab goes to sleep or the connection drops, this code automatically reconnects when the user returns.

```javascript
let socket;
const wsUrl = "wss://your-backend-api.onrender.com/ws/notifications";

function connectWebSocket() {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log("WebSocket Connection Established.");
    };

    socket.onmessage = (event) => {
        const notification = JSON.parse(event.data);
        displayLiveNotification(notification.message);
    };

    socket.onclose = () => {
        console.warn("WebSocket closed. Retrying in 5 seconds...");
        setTimeout(() => {
            connectWebSocket(); // Self-healing reconnect
        }, 5000);
    };
}

connectWebSocket();
```

> ⚠️ **Browser Background Tab Throttling (Error 1011):** Chrome and Safari put background tabs to sleep, which causes the server to drop the WebSocket connection. The self-healing reconnect loop above handles this automatically — no page reload needed.

### Part B — Keep-Alive Heartbeat (Prevent Cold Starts)

Render's free tier **spins down your server after 15 minutes of inactivity**. The next visitor will wait 50+ seconds for it to wake up. Fix this with a free cron job.

1. Go to [cron-job.org](https://cron-job.org) and register a free account.
2. Click **Create Cronjob** and fill in:
   - **Title:** `EventHub Backend Keep-Alive Monitor`
   - **URL:** `https://your-api.onrender.com/docs`
   - **Schedule:** Every **10 minutes**
3. Click **Create**.

Your server will now stay warm 24/7 at zero cost.

---

## 11. API Security & Auditing

### Step 1 — Audit Your Own API

Open Postman and test every backend endpoint **without** including an `Authorization` header. Any endpoint that returns real data without a token is a security leak.

### Step 2 — Inject Global Authentication Guards

Protect every sensitive route using FastAPI's `Depends()` system. This forces the server to verify the caller's token before executing any database query.

```python
from fastapi import Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security_bouncer = HTTPBearer()

@app.get("/media/search/tags")
def secure_ai_tag_search(
    tag_query: str,
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(security_bouncer)  # ← Token required
):
    token = credentials.credentials
    # Validate the token. Raise HTTP 401 if invalid.
    user_record = verify_jwt_token_or_raise_error(token, db)

    return db.query(models.Media).filter(
        models.Media.ai_tags.contains(tag_query)
    ).all()
```

> ⚠️ **The Security Illusion:** Hiding a button on the login screen does **not** protect your API. Attackers use tools like `curl` and Postman — they never touch your frontend. Always enforce security at the server level.

**Verification step:** Open your browser DevTools → Network tab → confirm that unauthenticated requests return an explicit `401 Unauthorized` response.

---

## 12. Analytics & Production Polish

### Step 1 — Enable Vercel Web Analytics

1. Go to your Vercel project dashboard → click the **Analytics** tab.
2. Click **Enable Web Analytics** (select the free Hobby tier).
3. Select **"Other"** or **"HTML"** from the framework dropdown.
4. Copy the provided `<script>` tag.

### Step 2 — Add the Tracking Script to Every HTML File

Paste the script into the `<head>` of **both** `index.html` **and** `login.html`:

```html
<head>
    <meta charset="UTF-8">
    <title>EventHub</title>
    <script defer src="/_vercel/insights/script.js"></script>
</head>
```

> ⚠️ **Multi-Page Telemetry Fragmentation:** If you only add analytics to `index.html`, you will have **zero visibility** into how many users drop off on the login page. Add the script to every standalone HTML file.

### Step 3 — Verify on Multiple Devices

After deploying, open your live site on both your phone and computer to confirm that the analytics dashboard registers real-time page hits from both devices.

---

## 13. Deployment

### Deploy the Frontend to Vercel

1. Push your frontend to GitHub (see below).
2. Go to [vercel.com](https://vercel.com) → log in with GitHub.
3. Click **Add New Project** → import your repository.
4. On the configuration screen:
   - **Framework Preset:** Select **Other** ← This is critical. Do NOT select Next.js or React.
   - **Build Command:** Leave **blank**.
   - **Output Directory:** Leave **blank**.
5. Click **Deploy**. Your site goes live on a `.vercel.app` domain instantly.

### Deploy the Backend to Render

1. Go to [render.com](https://render.com) → click **New Web Service**.
2. Connect your GitHub repository.
3. Fill in the runtime settings:
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port 10000`
4. Click **Advanced → Add Environment Variable** and paste each line from your `.env` file one by one.
5. Click **Deploy**.

### Push Code to GitHub

```bash
# First time setup
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main

# All future updates
git add .
git commit -m "Describe what you changed"
git push origin main
```

> 💡 Every time you push to `main`, both Vercel and Render will automatically detect the change and redeploy your app — no manual steps needed.

---

## 14. Common Pitfalls & Warnings

A summary of every known issue encountered during development, so you don't repeat them.

| # | Problem | Cause | Fix |
|---|---------|-------|-----|
| 1 | **CORS Error** — Browser blocks frontend ↔ backend communication | Browsers block cross-origin requests by default | Add `CORSMiddleware` in `main.py` with your exact Vercel URL |
| 2 | **Never use `allow_origins=["*"]`** in production | Allows any website to call your API | Always specify the exact frontend URL |
| 3 | **Broken images/assets on Vercel** | Hardcoded absolute paths like `/images/logo.png` | Use relative paths: `./images/logo.png` |
| 4 | **Emails work locally but hang in cloud** | Render blocks SMTP ports 25, 465, 587 | Use the Google Apps Script email proxy |
| 5 | **WebSocket drops (Error 1011)** | Browser sleeps background tabs | Implement the self-healing reconnect loop in JS |
| 6 | **50-second cold start on Render** | Free tier spins down after 15 min idle | Set up a cron-job.org heartbeat every 10 minutes |
| 7 | **API routes return data without login** | Security only enforced in the UI, not the server | Add `Depends(security_bouncer)` to every protected route |
| 8 | **Analytics missing for some pages** | Script only added to `index.html` | Add the Vercel Insights script to **every** HTML file |
| 9 | **Secret keys exposed in GitHub** | `.env` file committed accidentally | Add `.env` to `.gitignore` before your first commit |
| 10 | **Neon connection refused on Render** | Missing `?sslmode=require` in DATABASE_URL | Always append `?sslmode=require` to your Neon connection string |
| 11 | **Neon: "password auth failed"** | Special character in DB password broke URL parsing | Reset Neon password to letters+numbers only, update Render env var |
| 12 | **Neon: slow queries in production** | Wrong region — DB and server are on different continents | Match Neon region to your Render region when creating the project |
| 13 | **OTP user never receives email** | Wrong `GOOGLE_SCRIPT_URL` or wrong deployment version | Check Apps Script Executions log; ensure you deployed a New Version after last code change |
| 14 | **OTP always shows "expired"** | Mixed `datetime.now()` and `datetime.utcnow()` | Use `datetime.utcnow()` everywhere — both when storing and verifying |
| 15 | **OTP can be reused** | `is_used` flag never set after verification | Set `record.is_used = 1` and `db.commit()` immediately on successful verify |
| 16 | **AWS S3 upload: "Access Denied"** | IAM user missing S3 permissions | Attach `AmazonS3FullAccess` policy to your IAM user |
| 17 | **S3 URL returns 403 in browser** | Bucket is private (correct) but raw URL used | Use `generate_presigned_url()` to serve files to authenticated users |
| 18 | **S3 upload fails on Render** | AWS credentials not added to Render environment | Add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME` to Render env vars |
| 19 | **Multipart upload broken: 422 error** | Manually setting `Content-Type: multipart/form-data` header | Remove that header — let the browser set it automatically with the correct boundary |

---

## ✅ Final Checklist Before Going Live

- [ ] `.env` is in `.gitignore` and never committed to GitHub
- [ ] CORS `allow_origins` contains your exact Vercel URL (not `*`)
- [ ] All asset paths are relative (`./images/...` not `/images/...`)
- [ ] Neon `DATABASE_URL` ends with `?sslmode=require`
- [ ] Neon region matches your Render service region
- [ ] `run_migrations.py` has been run — tables visible in Neon console
- [ ] Google Apps Script proxy is deployed with **Who has access: Anyone**
- [ ] `GOOGLE_SCRIPT_URL` in `.env` points to the deployed `/exec` URL (not the editor URL)
- [ ] OTP uses `datetime.utcnow()` consistently for both storing and verifying
- [ ] OTP marks `is_used = 1` after successful verification
- [ ] AWS IAM user has `AmazonS3FullAccess` policy attached
- [ ] `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME` are all in `.env` and in Render env vars
- [ ] S3 files are served via presigned URLs (not raw S3 links) for authenticated content
- [ ] WebSocket auto-reconnect is implemented in `script.js`
- [ ] Cron-job.org heartbeat is active and pinging every 10 minutes
- [ ] Every API endpoint returns `401` when called without a token
- [ ] Vercel Analytics script is in the `<head>` of **every** HTML file
- [ ] You have clicked through the live site on both desktop and mobile

---


