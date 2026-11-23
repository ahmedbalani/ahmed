import SwiftUI
import WebKit
import UIKit

// The app shows the live site, so changes pushed to GitHub show up without rebuilding.
// Every time the live site loads, the app saves a copy of it. With no internet it shows that saved
// copy (or, before the first successful load, the copy of index.html bundled in the app).
// All of them use the same web address, so your logs (localStorage) are the same either way.
//
// Automatic backup: after every change the page sends its logs here and they're written to
// Files → On My iPhone → Lift → "Lift backups". If the app's storage is ever empty on launch,
// the newest automatic backup is put back.
let siteURL = URL(string: "https://ahmedbalani.github.io/ahmed/")!
let fm = FileManager.default
let documentsDir = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
let backupDir = documentsDir.appendingPathComponent("Lift backups", isDirectory: true)
let latestBackup = backupDir.appendingPathComponent("lift-latest.json")
let offlineCopy = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("offline-index.html")
let appBackground = UIColor(red: 0x12 / 255.0, green: 0x15 / 255.0, blue: 0x1b / 255.0, alpha: 1)

@main
struct LiftApp: App {
    var body: some Scene {
        WindowGroup {
            ZStack {
                Color(appBackground).ignoresSafeArea()
                WebAppView()
            }
            .preferredColorScheme(.dark)
        }
    }
}

struct WebAppView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()                 // keeps logs between launches
        config.allowsInlineMediaPlayback = true              // videos play inside the card
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(context.coordinator, name: "lift")  // backup bridge

        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = appBackground
        web.scrollView.backgroundColor = appBackground
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator

        let refresh = UIRefreshControl()                     // pull down to reload
        refresh.tintColor = .lightGray
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.refresh(_:)), for: .valueChanged)
        web.scrollView.refreshControl = refresh

        context.coordinator.webView = web
        context.coordinator.loadRemote()
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?
        private var usingBundled = false

        func loadRemote() {
            usingBundled = false
            webView?.load(URLRequest(url: siteURL, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 10))
        }

        func loadBundled() {
            guard !usingBundled else { return }
            // Prefer the copy saved the last time the live site loaded; fall back to the built-in one.
            var html = try? String(contentsOf: offlineCopy, encoding: .utf8)
            if html == nil, let file = Bundle.main.url(forResource: "index", withExtension: "html") {
                html = try? String(contentsOf: file, encoding: .utf8)
            }
            guard let html else { return }
            usingBundled = true
            webView?.loadHTMLString(html, baseURL: siteURL)
        }

        // Live site loaded → save today's version of it for offline use.
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard !usingBundled else { return }
            var req = URLRequest(url: siteURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
            req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
            URLSession.shared.dataTask(with: req) { data, response, _ in
                guard let data, (response as? HTTPURLResponse)?.statusCode == 200,
                      let html = String(data: data, encoding: .utf8),
                      html.contains("lift5Logs") else { return }        // only save the real app page
                try? fm.createDirectory(at: offlineCopy.deletingLastPathComponent(), withIntermediateDirectories: true)
                try? data.write(to: offlineCopy, options: .atomic)
            }.resume()
        }

        @objc func refresh(_ sender: UIRefreshControl) {
            loadRemote()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { sender.endRefreshing() }
        }

        // Offline or site down → use the bundled copy.
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            loadBundled()
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                     decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
            if navigationResponse.isForMainFrame,
               let http = navigationResponse.response as? HTTPURLResponse, http.statusCode >= 400 {
                decisionHandler(.cancel)
                loadBundled()
                return
            }
            decisionHandler(.allow)
        }

        // Links that leave the app (e.g. "Open on YouTube") open in Safari / the YouTube app.
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.navigationType == .linkActivated,
               navigationAction.targetFrame?.isMainFrame ?? true,
               let url = navigationAction.request.url, url.host != siteURL.host {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        // target="_blank" links.
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url { UIApplication.shared.open(url) }
            return nil
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
            switch type {
            case "backup": shareBackup(body)
            case "autosave": autosave(body)
            case "ready": if body["empty"] as? Bool == true { restoreIfNeeded() }
            default: break
            }
        }

        // Logs changed → write lift-latest.json plus one file per day (keeps the last 30 days).
        private func autosave(_ body: [String: Any]) {
            guard let json = body["json"] as? String, let data = json.data(using: .utf8) else { return }
            do {
                try fm.createDirectory(at: backupDir, withIntermediateDirectories: true)
                try data.write(to: latestBackup, options: .atomic)
                let day = ISO8601DateFormatter.string(from: Date(), timeZone: .current, formatOptions: [.withFullDate])
                try data.write(to: backupDir.appendingPathComponent("lift-\(day).json"), options: .atomic)
                let daily = (try? fm.contentsOfDirectory(atPath: backupDir.path)) ?? []
                let old = daily.filter { $0.hasPrefix("lift-2") && $0.hasSuffix(".json") }.sorted().dropLast(30)
                for name in old { try? fm.removeItem(at: backupDir.appendingPathComponent(name)) }
                webView?.evaluateJavaScript("window.liftAutosaved && window.liftAutosaved()")
            } catch {}
        }

        // App storage is empty (e.g. iOS cleared it) → put the newest automatic backup back.
        private func restoreIfNeeded() {
            guard let data = try? Data(contentsOf: latestBackup),
                  let json = String(data: data, encoding: .utf8) else { return }
            webView?.callAsyncJavaScript("return window.liftRestore && window.liftRestore(j)",
                                         arguments: ["j": json], in: nil, in: .page, completionHandler: nil)
        }

        // "Save backup" in the page → iOS share sheet (Save to Files, AirDrop, Messages…).
        private func shareBackup(_ body: [String: Any]) {
            guard let json = body["json"] as? String else { return }
            let name = (body["name"] as? String) ?? "lift-backup.json"
            let file = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            do { try json.write(to: file, atomically: true, encoding: .utf8) } catch { return }

            guard let root = UIApplication.shared.connectedScenes
                .compactMap({ ($0 as? UIWindowScene)?.keyWindow })
                .first?.rootViewController else { return }
            var top = root
            while let presented = top.presentedViewController { top = presented }
            let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            share.popoverPresentationController?.sourceView = top.view
            top.present(share, animated: true)
        }
    }
}
