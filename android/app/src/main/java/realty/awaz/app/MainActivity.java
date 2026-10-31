package realty.awaz.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * AWaz Realty: a thin native shell around the web app on GitHub Pages.
 * The web app updates itself daily; this shell only needs rebuilding for native changes.
 * With no connection on first launch it falls back to the copy bundled in assets/www.
 */
public class MainActivity extends Activity {

    private static final String APP_URL = BuildConfig.APP_URL;
    private static final String OFFLINE_URL = "file:///android_asset/www/index.html";
    private static final long STALE_MS = 6L * 60 * 60 * 1000; // reload after 6 hours in the background

    private WebView web;
    private boolean usingOffline = false;
    private long loadedAt = 0;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0B0B0C"));
        // Keep content clear of the status and navigation bars (edge-to-edge on Android 15+).
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int l, t, r, b;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                l = i.left; t = i.top; r = i.right; b = i.bottom;
            } else {
                l = insets.getSystemWindowInsetLeft(); t = insets.getSystemWindowInsetTop();
                r = insets.getSystemWindowInsetRight(); b = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(l, t, r, b);
            return insets;
        });

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0B0B0C"));
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " AWazRealtyApp/" + BuildConfig.VERSION_NAME);

        web.addJavascriptInterface(new Bridge(this), "AndroidBridge");
        web.setWebViewClient(new Client());

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else load(APP_URL);
    }

    private void load(String url) {
        loadedAt = System.currentTimeMillis();
        web.loadUrl(url);
    }

    private boolean isOwn(String url) {
        return url.startsWith(APP_URL) || url.startsWith("file:///android_asset/");
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            String url = req.getUrl().toString();
            if (isOwn(url)) return false;
            openExternal(url);
            return true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            // No connection and nothing cached yet: show the bundled copy.
            if (req.isForMainFrame() && !usingOffline) {
                usingOffline = true;
                view.loadUrl(OFFLINE_URL);
            }
        }
    }

    void openExternal(String url) {
        try {
            Intent i;
            if (url.startsWith("intent:")) {
                i = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
            } else if (url.startsWith("tel:")) {
                i = new Intent(Intent.ACTION_DIAL, Uri.parse(url));
            } else if (url.startsWith("mailto:")) {
                i = new Intent(Intent.ACTION_SENDTO, Uri.parse(url));
            } else {
                i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException | java.net.URISyntaxException e) {
            Toast.makeText(this, "No app on this phone can open that link", Toast.LENGTH_SHORT).show();
        }
    }

    /** Called from the web app as window.AndroidBridge.* */
    public class Bridge {
        private final Context ctx;
        Bridge(Context c) { ctx = c; }

        @JavascriptInterface
        public void openExternal(String url) { runOnUiThread(() -> MainActivity.this.openExternal(url)); }

        @JavascriptInterface
        public void share(String text, String title) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                if (title != null) i.putExtra(Intent.EXTRA_SUBJECT, title);
                startActivity(Intent.createChooser(i, title == null ? "Share" : title));
            });
        }

        @JavascriptInterface
        public void copy(String text) {
            ClipboardManager cm = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("AWaz Realty", text));
        }

        @JavascriptInterface
        public void addContact(String name, String phone, String email, String company, String title) {
            runOnUiThread(() -> {
                Intent i = new Intent(ContactsContract.Intents.Insert.ACTION);
                i.setType(ContactsContract.RawContacts.CONTENT_TYPE);
                i.putExtra(ContactsContract.Intents.Insert.NAME, name);
                i.putExtra(ContactsContract.Intents.Insert.PHONE, phone);
                i.putExtra(ContactsContract.Intents.Insert.EMAIL, email);
                i.putExtra(ContactsContract.Intents.Insert.COMPANY, company);
                i.putExtra(ContactsContract.Intents.Insert.JOB_TITLE, title);
                try { startActivity(i); } catch (ActivityNotFoundException e) {
                    Toast.makeText(ctx, "No contacts app found", Toast.LENGTH_SHORT).show();
                }
            });
        }

        /** Saves a text file to Downloads (Android 10+), otherwise shares it. */
        @JavascriptInterface
        public void saveFile(String name, String content, String mime) {
            if (Build.VERSION.SDK_INT >= 29) {
                try {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = ctx.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri != null) {
                        try (OutputStream os = ctx.getContentResolver().openOutputStream(uri)) {
                            if (os != null) os.write(content.getBytes(StandardCharsets.UTF_8));
                        }
                        runOnUiThread(() -> {
                            Toast.makeText(ctx, "Saved to Downloads: " + name, Toast.LENGTH_LONG).show();
                            Intent i = new Intent(Intent.ACTION_SEND);
                            i.setType(mime);
                            i.putExtra(Intent.EXTRA_STREAM, uri);
                            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            startActivity(Intent.createChooser(i, "Send " + name));
                        });
                        return;
                    }
                } catch (Exception ignored) { }
            }
            share(content, name);
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.appBack ? window.appBack() : false)", result -> {
            if (!"true".equals(result)) {
                if (web.canGoBack()) web.goBack(); else MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        // Pick up the morning's fresh data if the app sat in the background for a while.
        if (loadedAt > 0 && System.currentTimeMillis() - loadedAt > STALE_MS) {
            usingOffline = false;
            load(APP_URL);
        }
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }
}
