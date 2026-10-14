# KayaTo Mobile

Flutter mobile client for the KayaTo API. It supports account creation and login, a MongoDB-backed dashboard, task creation and completion, project planning, teams, chat with `@Kaya`, bill reminders, theme switching, persistent sessions, and accessible native notifications.

## Run on the Android emulator

Start the backend first:

```powershell
cd "C:\Users\Administrator\Desktop\TASK MANAGEMENT SYSTEM\kayato-backend"
npm run dev
```

Then run the app:

```powershell
cd "C:\Users\Administrator\Desktop\TASK MANAGEMENT SYSTEM\kayato-mobile"
flutter pub get
flutter run -d emulator-5554
```

The Android emulator automatically uses `http://10.0.2.2:5000/api`, which points to the Windows host. For a physical phone, expose the backend on the local network and pass its URL:

```powershell
flutter run --dart-define=API_URL=http://YOUR_PC_IP:5000/api
```

Allow port 5000 through Windows Firewall and keep the phone and computer on the same network.

## Mobile push notifications

KayaTo mobile uses Firebase Cloud Messaging. Pass your Firebase app values as dart defines:

```powershell
flutter run --dart-define=API_URL=http://10.0.2.2:5000/api --dart-define=FIREBASE_API_KEY=... --dart-define=FIREBASE_APP_ID=... --dart-define=FIREBASE_MESSAGING_SENDER_ID=... --dart-define=FIREBASE_PROJECT_ID=...
```

Enable Mobile push from the app Settings screen. On iOS, also enable Push Notifications and Background Modes (Remote notifications) for Runner in Xcode, then upload an APNs authentication key in Firebase.
