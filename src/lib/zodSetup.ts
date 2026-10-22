/**
 * Zod settings for the app; `main.ts` imports this first. Zod's JIT-compiled
 * parsers use `new Function`, which the app's Content-Security-Policy
 * forbids: even the probe for it is reported as a policy violation. The
 * interpreted parsers are fast enough for the catalog and user data.
 */
import * as z from 'zod';

z.config({ jitless: true });
