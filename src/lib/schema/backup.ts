import * as z from 'zod';
import { timestampSchema } from './common.ts';
import { userDataSchema } from './userData.ts';

/** A backup file (`openrep-backup-YYYY-MM-DD.json`) holding all user data. */
export const backupSchema = z.object({
  app: z.literal('openrep'),
  kind: z.literal('backup'),
  formatVersion: z.literal(1),
  exportedAt: timestampSchema,
  data: userDataSchema,
});
export type Backup = z.infer<typeof backupSchema>;
