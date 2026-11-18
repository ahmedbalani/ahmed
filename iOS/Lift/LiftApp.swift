import SwiftUI
import WebKit
import UIKit

// The app shows the live site, so changes pushed to GitHub show up without rebuilding.
// If there's no internet, it falls back to the copy of index.html bundled in the app.
// Both use the same web address, so your logs (localStorage) are the same either way.
let siteURL = URL(string: "https://ahmedbalani.github.io/ahmed/")!
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
            guard !usingBundled,
                  let file = Bundle.main.url(forResource: "index", withExtension: "html"),
                  let html = try? String(contentsOf: file, encoding: .utf8) else { return }
            usingBundled = true
            webView?.loadHTMLString(html, baseURL: siteURL)
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

        // "Save backup" in the page → iOS share sheet (Save to Files, AirDrop, Messages…).
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any],
                  body["type"] as? String == "backup",
                  let json = body["json"] as? String else { return }
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
