# 📦 Deployment Commands - Backend Git Push & Frontend APK Build

---

## 🔄 BACKEND: Git Push Command

### **Quick Command (Copy & Paste):**
```bash
cd c:\Users\aditi\Downloads\geocrime_backend\geocrime_backend && git add -A && git commit -m "Production deployment - ready for Render" && git push
```

### **Step by Step:**

**Step 1: Navigate to backend folder**
```bash
cd c:\Users\aditi\Downloads\geocrime_backend\geocrime_backend
```

**Step 2: Add all changes**
```bash
git add -A
```

**Step 3: Commit with message**
```bash
git commit -m "Production deployment - ready for Render"
```

**Step 4: Push to GitHub**
```bash
git push
```

### **Or in one line:**
```bash
cd c:\Users\aditi\Downloads\geocrime_backend\geocrime_backend && git add -A && git commit -m "Production deployment - ready for Render" && git push
```

### **Verify push successful:**
```bash
git log --oneline -5
```

---

## 📱 FRONTEND: Build APK Command

### **Prerequisites (First Time Only):**
```bash
# Check if Flutter is installed
flutter --version

# If not installed, download from: https://flutter.dev/docs/get-started/install/windows
```

### **Quick Command (Copy & Paste):**
```bash
cd C:\Users\aditi\Desktop\geo_app && flutter clean && flutter pub get && flutter build apk --release
```

### **Step by Step:**

**Step 1: Navigate to Flutter project**
```bash
cd C:\Users\aditi\Desktop\geo_app
```

**Step 2: Clean previous builds**
```bash
flutter clean
```

**Step 3: Get dependencies**
```bash
flutter pub get
```

**Step 4: Build APK (Release Mode)**
```bash
flutter build apk --release
```

### **Or in one line:**
```bash
cd C:\Users\aditi\Desktop\geo_app && flutter clean && flutter pub get && flutter build apk --release
```

---

## ⏱️ Build Time Expectations

| Task | Time | Command |
|------|------|---------|
| Git add/commit/push | 1-5 min | `git add -A && git commit && git push` |
| Flutter clean | 1-2 min | `flutter clean` |
| Flutter pub get | 2-3 min | `flutter pub get` |
| Build APK (Release) | 5-10 min | `flutter build apk --release` |
| **Total APK build** | **10-15 min** | All above combined |

---

## 📍 Output Locations

### **Git:**
- Pushed to: `https://github.com/aditigg204/geocrime-backend-`
- Verify: Check GitHub commits

### **APK File:**
- Location: `C:\Users\aditi\Desktop\geo_app\build\app\outputs\flutter-apk\app-release.apk`
- Size: Usually 30-50 MB
- Install: Copy to phone or use Android Studio device manager

---

## ✅ Complete Deployment Sequence (Do This)

### **Option 1: Sequential (One after another)**

**Terminal 1: Push Backend**
```bash
cd c:\Users\aditi\Downloads\geocrime_backend\geocrime_backend
git add -A
git commit -m "Production deployment - ready for Render"
git push
# Wait for push to complete (1-2 min)
```

**Terminal 2: Build Frontend APK**
```bash
cd C:\Users\aditi\Desktop\geo_app
flutter clean
flutter pub get
flutter build apk --release
# Wait for build to complete (10-15 min)
```

### **Option 2: Parallel (Both at same time)**

**Open Terminal 1:**
```bash
cd c:\Users\aditi\Downloads\geocrime_backend\geocrime_backend && git add -A && git commit -m "Production deployment - ready for Render" && git push
```

**Open Terminal 2 (Meanwhile):**
```bash
cd C:\Users\aditi\Desktop\geo_app && flutter clean && flutter pub get && flutter build apk --release
```

---

## 🔍 Verify Everything Worked

### **Backend - Check Git:**
```bash
cd c:\Users\aditi\Downloads\geocrime_backend\geocrime_backend
git log --oneline -3
```
Should show latest commit at top.

### **Frontend - Check APK:**
```bash
dir "C:\Users\aditi\Desktop\geo_app\build\app\outputs\flutter-apk\"
```
Should show `app-release.apk` file (size 30-50 MB).

---

## 🚨 Troubleshooting

### **Git Push Fails:**
```bash
# Check connection
git status

# If conflicts, resolve first
git pull

# Try push again
git push
```

### **Flutter Build Fails:**
```bash
# Check Flutter setup
flutter doctor

# Fix any issues shown

# Retry build
flutter clean
flutter pub get
flutter build apk --release
```

### **Flutter Not Found:**
```bash
# Add Flutter to PATH or download from:
# https://flutter.dev/docs/get-started/install/windows

# Then verify:
flutter --version
```

---

## 📤 After Build: Install APK on Phone

### **Method 1: Android Device Connected**
```bash
cd C:\Users\aditi\Desktop\geo_app
flutter install
```

### **Method 2: Manual Install**
1. Copy `app-release.apk` to phone
2. Open file manager on phone
3. Tap APK file
4. Install (allow unknown sources if needed)

### **Method 3: Android Emulator**
```bash
# Start emulator first, then:
cd C:\Users\aditi\Desktop\geo_app
flutter install
```

---

## ✨ QUICK COPY-PASTE COMMANDS

### **Just Push Backend:**
```
cd c:\Users\aditi\Downloads\geocrime_backend\geocrime_backend && git add -A && git commit -m "Production deployment - ready for Render" && git push
```

### **Just Build APK:**
```
cd C:\Users\aditi\Desktop\geo_app && flutter clean && flutter pub get && flutter build apk --release
```

### **Do Both (Sequential):**
```
cd c:\Users\aditi\Downloads\geocrime_backend\geocrime_backend && git add -A && git commit -m "Production deployment" && git push && echo "Backend pushed!" && cd C:\Users\aditi\Desktop\geo_app && flutter clean && flutter pub get && flutter build apk --release && echo "APK built!"
```

---

## 🎯 Checklist Before Running

- [ ] Backend `.env` has production database URL
- [ ] Backend JWT_SECRET is set
- [ ] Frontend API_URL points to production backend
- [ ] Flutter SDK installed (`flutter --version` works)
- [ ] Both projects have no uncommitted changes
- [ ] Enough disk space (500 MB+ for builds)

---

## 📊 What Gets Deployed

### **Backend to GitHub:**
- Source code
- All controllers, routes, services
- Database schema (Prisma)
- Config files
- ML integration scripts

### **Frontend APK:**
- Flutter app (Android)
- All screens, UI, logic
- Maps integration
- Socket.io client
- Geolocation services

---

## 🚀 Next Steps After Deployment

1. **Backend:**
   - Deploy from GitHub to Render
   - Configure environment variables
   - Run database migrations
   - Test health endpoint

2. **Frontend:**
   - Install APK on test device
   - Connect to backend URL
   - Test login, reporting, dashboard
   - Distribute APK to users

---

**You're ready to deploy!** Execute the commands above to push both backend and build APK. 🚀
