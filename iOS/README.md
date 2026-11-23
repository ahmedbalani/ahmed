# Lift — iPhone app

A small iPhone app that shows your workout site (https://ahmedbalani.github.io/ahmed/) full-screen with its own icon.
If there's no internet, it uses a copy of the app saved inside it.

## First install (free Apple ID)

1. **Get the files on your Mac:** on github.com/ahmedbalani/ahmed tap **Code → Download ZIP**, then unzip it.
2. Open **iOS/Lift.xcodeproj** (double-click it). Xcode opens.
3. In the left sidebar click **Lift** (blue icon at the top) → **Signing & Capabilities**.
   Under **Team**, choose **Add an Account…**, sign in with your Apple ID, then pick **"Ahmed Balani (Personal Team)"**.
   If it says the bundle ID is taken, change `com.ahmedbalani.lift` to something like `com.ahmedbalani.lift2`.
4. Plug your iPhone into the Mac with a cable. Tap **Trust** on the phone if it asks.
5. On the iPhone: **Settings → Privacy & Security → Developer Mode → On** (the phone restarts).
6. In Xcode's top bar, pick your iPhone from the device list, then press the **▶ Run** button.
7. The first time, the phone will block the app. Go to **Settings → General → VPN & Device Management**,
   tap your Apple ID, and tap **Trust**. Then open **Lift** from your home screen.

## Every 7 days
With a free Apple ID the app stops opening after 7 days. Plug the phone in, open the project, press **▶ Run** again.
Your logs stay as long as you **don't delete the app**.

## Your logs
The app keeps its own logs, separate from Safari. To move logs from Safari into the app:
in Safari tap **Save backup**, then in the app tap **Restore** and pick that file.

## Updating
Changes pushed to `index.html` on GitHub show up in the app automatically (pull down to refresh).
The app also saves the latest site every time it loads, so it works offline with the newest version.
`iOS/Lift/index.html` is only the very-first-launch fallback; the tests fail if it differs from `index.html`.

The project on the Mac (Desktop › ahmed-main) is a git copy of GitHub: in Xcode use **Integrate → Pull** to get changes.

## Backups
The iPhone app saves your logs automatically to **Files → On My iPhone → Lift → Lift backups**
(`lift-latest.json` plus one file per day for 30 days). If the app's storage is ever empty, it restores the latest one by itself.
Deleting the app deletes these too, so for a copy that survives that, tap **Save backup** → Save to Files → iCloud Drive now and then.
