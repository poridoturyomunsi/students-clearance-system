# Global Deployment Guide - St. Paul Student Clearance & Management System

This guide outlines the process of deploying the **St. Paul School Management System** globally. Following these steps ensures your application is highly available (24/7), secure, and accessible via public HTTPS URLs without requiring a local machine to run.

---

## Architectural Overview

The application has been decoupled into three independent, cloud-native components:

```mermaid
graph TD
    Client[Web Browser / Mobile Client] -->|HTTPS| Frontend[Vercel Frontend]
    Frontend -->|API Calls + JWT Auth| Backend[Express.js Backend on Render/Railway]
    Backend -->|SQL Queries| DB[(Cloud MySQL Database)]
    Backend -->|Media Uploads| Cloudinary[Cloudinary CDN]
```

1. **Frontend**: React & Vite application hosted on **Vercel** (Static Site Hosting with SPA routing).
2. **Backend**: Express.js server hosted on **Render** or **Railway** (Node.js runtime container).
3. **Database**: Managed MySQL instance hosted on **Railway**, **Aiven**, or **Supabase (via connection string)**.
4. **Cloud Storage**: Passport photos and signatures are automatically stored in **Cloudinary** and served via its global CDN.

---

## Deployment Checklist

### Step 1: Database Migration to Cloud MySQL

You need a MySQL-compatible database instance in the cloud. We recommend **Railway MySQL** or **Aiven for MySQL**.

1. **Create Database Instance**:
   - Sign up/in to [Railway.app](https://railway.app).
   - Click **New Project** -> **Provision MySQL**.
   - Wait for the database to provision.
2. **Retrieve Connection Details**:
   - In the Railway MySQL service panel, navigate to the **Variables** tab.
   - Copy the `DATABASE_URL` connection string (e.g., `mysql://root:password@containers-us-west.railway.app:3306/railway`).
   - Alternatively, note the host, port, user, password, and database variables.
3. **Auto-Migration Verification**:
   - **No manual import is required!** The Express backend contains built-in migrations. When it starts up and connects to your cloud database for the first time, it automatically creates all required tables (including `students`, `teachers`, `marks`, `fees`, `settings`, `student_accounts`, and `olevel_marks`) and seeds default configurations and administrative accounts.

---

### Step 2: Asset Hosting Setup (Cloudinary)

To store uploaded student passport photos, teacher photos, and signatures in the cloud rather than local files:

1. **Create Account**:
   - Sign up for a free account at [Cloudinary.com](https://cloudinary.com).
2. **Retrieve Configuration Credentials**:
   - Navigate to the Cloudinary Dashboard.
   - Copy your **Cloud Name**, **API Key**, and **API Secret**.
3. **Behavior**:
   - When these environment variables are set on the backend, the server will intercept all Base64 images submitted during registrations or imports, upload them to Cloudinary, and save the CDN URL in the database.
   - If not set, it will fallback to local Base64 storage, which can lead to bloated database tables and slow response times.

---

### Step 3: Backend Deployment (Express.js on Render or Railway)

We recommend deploying the backend service to **Render** or **Railway**. Here is the configuration guide for Render:

1. **Prepare Git Repository**:
   - Commit all changes to a private GitHub repository.
2. **Create Web Service on Render**:
   - Go to [dashboard.render.com](https://dashboard.render.com) and click **New +** -> **Web Service**.
   - Connect your GitHub repository.
3. **Configure Build & Start Settings**:
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run server`
4. **Configure Environment Variables**:
   Under the **Environment** tab, add the following variables:
   
   | Variable | Value / Description | Example |
   | :--- | :--- | :--- |
   | `DATABASE_URL` | Cloud MySQL connection string | `mysql://root:pass@host:3306/db` |
   | `JWT_SECRET` | Long, secure random signing key | `9f6d7a2bc54e3d...` |
   | `ALLOWED_ORIGINS` | Your frontend Vercel domain URL | `https://spss-frontend.vercel.app` |
   | `CLOUDINARY_CLOUD_NAME` | Cloudinary name | `my-school-cloud` |
   | `CLOUDINARY_API_KEY` | Cloudinary key | `1234567890` |
   | `CLOUDINARY_API_SECRET` | Cloudinary secret | `abcdefg_secret...` |
   | `GEMINI_API_KEY` | Google AI Studio Key for Assistant | `AIzaSy...` |
   
5. **Deploy**:
   - Click **Deploy Web Service**. Once built and active, copy the public URL (e.g. `https://spss-backend.onrender.com`).

---

### Step 4: Frontend Deployment (React/Vite on Vercel)

Deploy the React SPA frontend to Vercel:

1. **Create Project on Vercel**:
   - Log in to [Vercel.com](https://vercel.com).
   - Click **Add New...** -> **Project** and select your GitHub repository.
2. **Configure Project Settings**:
   - **Framework Preset**: `Vite` (Vercel will auto-detect this).
   - **Build Command**: `npm run build`
   - **Output Directory**: `build`
3. **Add Environment Variables**:
   Add the following environment variable under the project settings:
   
   - **Key**: `VITE_API_URL`
   - **Value**: The public URL of your deployed backend service (e.g. `https://spss-backend.onrender.com`). *Do not include a trailing slash.*
4. **Deploy**:
   - Click **Deploy**. Vercel will build the React bundle and deploy it globally to a secure HTTPS URL (e.g. `https://spss-frontend.vercel.app`).
   
> [!NOTE]
> The included `vercel.json` file automatically configures the Vercel edge network to route all incoming requests to `/index.html` to ensure that React state-based views load seamlessly when users refresh the page.

---

## Environment Variables Quick-Reference

Use this table as a checklist when configuring your variables on Vercel and your backend cloud host.

```
       +-----------------------------------+
       |     ENVIRONMENT CONFIG CHECKLIST  |
       +-----------------------------------+
       |                                   |
       |  [ ] VITE_API_URL    (Frontend)   |
       |  [ ] DATABASE_URL    (Backend)    |
       |  [ ] JWT_SECRET      (Backend)    |
       |  [ ] ALLOWED_ORIGINS (Backend)    |
       |  [ ] CLOUDINARY_*    (Backend)    |
       |  [ ] GEMINI_API_KEY  (Backend)    |
       |                                   |
       +-----------------------------------+
```

---

## Production Security Measures

The deployed system incorporates the following automated security controls:

*   **HTTPS Enforcement**: All communication between the frontend, backend, and Cloudinary uses TLS encryption.
*   **CORS Whitelisting**: The Express backend restricts access. Only requests coming from domains specified in `ALLOWED_ORIGINS` are processed. Other domains receive a CORS rejection.
*   **Secure Authentication (JWT)**: Login responses issue signed JSON Web Tokens (JWT) with a 24-hour expiration. The client automatically includes this token as a `Bearer` token inside the `Authorization` header for all requests to protected routes.
*   **API Rate Limiting**: 
    *   Global API routes are limited to **1,000 requests per 15 minutes** per IP address.
    *   Auth endpoints (`/api/auth/login`) and AI endpoints (`/api/ai/ask`) are restricted to **100 requests per 15 minutes** to prevent brute-force and resource-exhaustion attacks.

---

## Maintenance & Operations Guide

### 1. Database Connection Verification
You can monitor database health and connectivity status directly through:
- **API Status Route**: Navigate to `https://your-backend-domain.com/api/config-status` to inspect if the database pool is active.
- **Admin Settings Console**: Under the **Database Configuration** tab, click **Test Connection** to execute a diagnostic connection query to verify that credentials remain valid.

### 2. Manual Backup Strategy
To prevent data loss, schedule weekly exports of your MySQL tables:
- **Using CLI Tools (mysqldump)**:
  ```bash
  mysqldump --host=your-cloud-db-host --user=your-db-user --password=your-password --databases school_system > backup.sql
  ```
- **Using Managed Backups**: If using Railway or Aiven, enable automated daily snapshots in your cloud provider console.

### 3. Scaling & Resource Constraints
- **Database Storage Limits**: Since image assets are saved on Cloudinary, the database itself stores only metadata, text records, and URLs. A free 1GB database tier can easily host details for over 50,000 students.
- **Cold Starts**: Render's free tier spins down services after 15 minutes of inactivity. When a user first opens the page, it may take 30-50 seconds for the backend to wake up. For a production institutional environment, upgrading to a starter paid tier ($7/month) keeps the server active 24/7.
