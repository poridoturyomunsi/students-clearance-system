# Database Connection Issue - Fix Steps

## Issue Summary
The application is running in Cloud Production mode but the database connection failed. The error indicates that:
- The backend Express server is not properly initialized with database credentials
- Environment variables (DATABASE_URL or DB_HOST/DB_USER/etc) are not configured

## Root Causes
1. ✅ **FIXED**: Missing `.env` file with database credentials
2. **REQUIRED**: Backend Express server must be running
3. **REQUIRED**: MySQL server must be accessible at the configured host:port
4. **REQUIRED**: Database `student_clearance` must exist and be initialized

## Quick Fix Steps

### Step 1: Verify MySQL is Running
**Windows Command Prompt (as Administrator):**
```powershell
# Check if MySQL service is running
Get-Service MySQL* | Format-Table -AutoSize

# If not running, start it
Start-Service MySQL80  # or your MySQL version
```

Alternatively, open MySQL Workbench or MySQL Command Line Client to verify connectivity.

### Step 2: Verify Database Exists
```sql
-- Run this in MySQL to verify the database exists
SHOW DATABASES;

-- You should see: student_clearance in the list
-- If it doesn't exist, restore from backup:
-- source c:\Users\Student\Downloads\Students Clearance Cards\student_clearance_backup.sql
```

### Step 3: Start the Backend Server
Open a terminal in the project root and run:
```bash
npm install  # If dependencies are missing
npm run server
```

Expected output:
```
Express API Server listening on 0.0.0.0:3000
Database initialized successfully
```

### Step 4: Test the Connection
In your browser, navigate to:
```
http://localhost:3000/api/config-status
```

Expected response:
```json
{
  "dbConnected": true,
  "config": {
    "host": "localhost",
    "port": 3306,
    "database": "student_clearance",
    "user": "root"
  }
}
```

### Step 5: Start the Frontend
In a new terminal, run:
```bash
npm run dev
```

Or for Electron:
```bash
npm run electron:dev
```

## Troubleshooting

### Error: "Connection refused at 127.0.0.1:3306"
- MySQL server is not running
- Start MySQL service: `Start-Service MySQL80` (Windows)
- Or start MySQL from XAMPP/WAMP control panel

### Error: "Unknown database 'student_clearance'"
- Import the backup file:
```sql
mysql -u root -p < student_clearance_backup.sql
```

### Error: "Access denied for user 'root'@'localhost'"
- Wrong credentials in .env file
- Update the password in .env if different from 'root123'

### Frontend still shows database error
- Ensure backend is running on http://localhost:3000
- Check browser console for network errors (F12 -> Console)
- Clear browser cache and reload (Ctrl+Shift+Delete)
- Restart backend server

## Environment Variables Reference

The `.env` file now contains:
- **DATABASE_URL**: Direct MySQL connection string
- **VITE_API_URL**: Frontend API endpoint (http://localhost:3000)
- **NODE_ENV**: development (change to production for deployment)
- **PORT**: Backend server port (3000)

## If Still Having Issues

1. Check Express server logs for detailed error messages
2. Verify MySQL credentials in .env match your MySQL installation
3. Ensure no firewall is blocking port 3000 and 3306
4. Try accessing MySQL directly:
   ```
   mysql -h localhost -P 3306 -u root -p -e "SELECT 1"
   ```
5. Check if another service is using port 3000:
   ```powershell
   netstat -ano | findstr :3000
   ```

