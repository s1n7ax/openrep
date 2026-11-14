package io.github.s1n7ax.openrep;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

/**
 * Receives text shared to OpenRep with Android's share sheet (ACTION_SEND of
 * text, or of a text or JSON file; see AndroidManifest.xml) and hands it to the
 * web app as a "shared" event: src/lib/shareTarget.ts. BridgeActivity passes
 * the launch intent here too, so a share that launches the app arrives the
 * same way; it is kept until the web app listens.
 */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {

    /**
     * Largest shared file read, in bytes: one more than the app accepts as a
     * plan (MAX_PLAN_FILE_BYTES in src/lib/planFile.ts), so a larger file is
     * reported as too large rather than cut short.
     */
    private static final int MAX_BYTES = 5 * 1024 * 1024 + 1;

    private final Executor reader = Executors.newSingleThreadExecutor();

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        // A recreated activity gets its launch intent again: show the share once.
        getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
        // Reopened from Recents, Android hands over the share that once launched the task.
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return;
        // A shared file may come from a slow provider: never read it on the main thread.
        reader.execute(() -> {
            JSObject share = new JSObject();
            String text = sharedText(intent);
            // null tells the web app the share could not be read.
            share.put("text", text == null ? JSObject.NULL : text);
            notifyListeners("shared", share, true);
        });
    }

    /** The shared text, else the content of the shared file; null when neither can be read. */
    private String sharedText(Intent intent) {
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (text != null && text.length() > 0) return text.toString();
        Uri uri = streamOf(intent);
        if (uri == null) return null;
        try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            if (input == null) return null;
            return read(input);
        } catch (IOException | SecurityException error) {
            Logger.error("ShareTarget", "Could not read the shared file", error);
            return null;
        }
    }

    /** The typed getter is used from API 34 only: API 33's has a platform bug (as in IntentCompat). */
    @SuppressWarnings("deprecation")
    private static Uri streamOf(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            return intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
        }
        return intent.getParcelableExtra(Intent.EXTRA_STREAM);
    }

    /** Reads at most MAX_BYTES of input as UTF-8. */
    private static String read(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        while (total < MAX_BYTES) {
            int count = input.read(buffer, 0, Math.min(buffer.length, MAX_BYTES - total));
            if (count == -1) break;
            output.write(buffer, 0, count);
            total += count;
        }
        return new String(output.toByteArray(), StandardCharsets.UTF_8);
    }
}
