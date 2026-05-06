# PostgreSQL Connection Troubleshooting

## Current Connection Error
```
Error: P1000: Authentication failed against database server
```

This means your `.env` DATABASE_URL is not matching your PostgreSQL credentials.

---

## ✅ Steps to Fix

### 1. **Verify PostgreSQL is Running**

Check Services (Windows):
```powershell
Get-Service | findstr -i postgres
```

Should show: `postgresql-x64-15` or similar with status `Running`

If not running, open Services and start PostgreSQL.

---

### 2. **Verify Your Password**

The current `.env` has:
```
DATABASE_URL="postgresql://postgres:Aditi11234@127.0.0.1:5432/GeoCrime?schema=public"
```

**Verify password in pgAdmin:**
1. Open pgAdmin (should be in taskbar or system tray)
2. Right-click on server in left panel → Properties
3. Check **Password** tab if exists
4. Or try connecting: Server → Properties → Connection settings

---

### 3. **Test Connection with pgAdmin**

If pgAdmin connects successfully, use the EXACT password shown in pgAdmin settings.

---

### 4. **Update .env with Correct Password**

If password is different, update:
```env
DATABASE_URL="postgresql://postgres:YOUR_EXACT_PASSWORD@127.0.0.1:5432/GeoCrime?schema=public"
```

Then retry:
```powershell
npx prisma db push
```

---

### 5. **Alternative: Reset PostgreSQL Password**

If you forgot password:

**Via pgAdmin:**
1. Right-click server → Properties
2. Click "Password" tab
3. Set new password

**Then update .env with new password**

---

## 💡 Common Issues

| Issue | Fix |
|---|---|
| `127.0.0.1` not working | Try `localhost` instead |
| Port not `5432` | Check pgAdmin Server → Properties → Connection |
| Database `GeoCrime` doesn't exist | Create via pgAdmin: Databases → Create → Database |
| `postgres` user locked | Check PostgreSQL configuration |

---

## 📝 What I Need From You

Can you provide:
1. **PostgreSQL password** you set during installation?
2. **Exact connection string** from pgAdmin Server properties?
3. **Database name** you created (is it really `GeoCrime`)?

Once you confirm, I'll update `.env` and test the connection.

---

## Quick Test

Try this in PowerShell (requires PostgreSQL tools installed):
```powershell
psql -U postgres -h 127.0.0.1 -d GeoCrime -c "SELECT 1"
```

If this works, the connection is valid.
