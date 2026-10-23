package app.firefit.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * FireFIT's Fire TV shell: a full-screen WebView that loads the React TV app.
 *
 * - Dev:  adb shell am start -n app.firefit.tv/.MainActivity --es url "http://<laptop-ip>:5173/tv.html"
 * - Prod: BuildConfig.FIREFIT_URL (CloudFront), set with -PfirefitUrl at build time.
 * - Debug the page from desktop Chrome at chrome://inspect/#devices.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WebView.setWebContentsDebuggingEnabled(true)
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false // the phone's video autoplays
            webChromeClient = WebChromeClient()
            webViewClient = WebViewClient() // keep navigation inside the shell
            addJavascriptInterface(Host(), "FireFitHost")
            isFocusable = true
            isFocusableInTouchMode = true
        }
        setContentView(web)
        web.requestFocus()
        web.loadUrl(intent.getStringExtra("url") ?: BuildConfig.FIREFIT_URL)
    }

    // Back on the remote goes to the web app; the library screen calls FireFitHost.exit().
    @Deprecated("Fire OS 7/8 (API 28/30) still routes Back here")
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        web.evaluateJavascript("window.dispatchEvent(new Event('tv-back'))", null)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    inner class Host {
        @JavascriptInterface
        fun exit() = runOnUiThread { finish() }
    }
}
