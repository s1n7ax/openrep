import type { CapacitorConfig } from '@capacitor/cli';

/** Capacitor configuration for the iOS and Android apps (web assets come from `npm run build`). */
const config: CapacitorConfig = {
  appId: 'io.github.s1n7ax.openrep',
  appName: 'OpenRep',
  webDir: 'dist',
  plugins: {
    // Edge-to-edge: the web view draws under the system bars and the CSS
    // pads content with the safe-area insets (see src/app.css).
    SystemBars: { insetsHandling: 'css' },
  },
};

export default config;
