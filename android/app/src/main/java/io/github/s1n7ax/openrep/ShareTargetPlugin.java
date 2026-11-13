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

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String text = sharedText(intent);
        if (text == null) return;
        JSObject share = new JSObject();
        share.put("text", text);
        notifyListeners("shared", share, true);
        // A recreated activity gets its launch intent again: show the share once.
        getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
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

    @SuppressWarnings("deprecation")
    private static Uri streamOf(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
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
