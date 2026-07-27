import { query } from '@/lib/db';
import { AppShell } from '@/components/AppShell';
import { RestoreCandidateButton } from '@/components/RestoreCandidateButton';
import type { TrashCandidateItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TRASH_RETENTION_DAYS = 30;

async function purgeExpired() {
  await query(
    `DELETE FROM candidates
     WHERE deleted_at IS NOT NULL
       AND deleted_at < NOW() - ($1::INT * INTERVAL '1 day')`,
    [TRASH_RETENTION_DAYS]
  );
}

async function getTrash(): Promise<(TrashCandidateItem & { days_left: number })[]> {
  const result = await query<TrashCandidateItem & { days_left: number }>(
    `SELECT id, name, email, phone, deleted_at,
            GREATEST(
              0,
              CEIL(EXTRACT(EPOCH FROM (deleted_at + ($1::INT * INTERVAL '1 day') - NOW())) / 86400.0)
            )::INT AS days_left
     FROM candidates
     WHERE deleted_at IS NOT NULL
       AND deleted_at > NOW() - ($1::INT * INTERVAL '1 day')
     ORDER BY deleted_at DESC`,
    [TRASH_RETENTION_DAYS]
  );
  return result.rows;
}

export default async function TrashPage() {
  await purgeExpired();
  const items = await getTrash();

  return (
    <AppShell title="Trash">
      <p className="text-sm text-muted mb-6">
        Soft-deleted candidates stay here for {TRASH_RETENTION_DAYS} days, then are permanently
        removed.
      </p>

      {items.length === 0 ? (
        <div className="nexus-panel px-6 py-16 text-center">
          <p className="text-foreground">Trash is empty.</p>
        </div>
      ) : (
        <div className="nexus-panel overflow-hidden">
          <table className="nexus-table min-w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Deleted</th>
                <th>Days left</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="font-medium whitespace-nowrap">{item.name}</td>
                  <td className="font-mono text-xs whitespace-nowrap">{item.phone}</td>
                  <td className="text-muted whitespace-nowrap">
                    {new Date(item.deleted_at).toLocaleString()}
                  </td>
                  <td className="text-muted whitespace-nowrap">{item.days_left}</td>
                  <td className="text-right">
                    <RestoreCandidateButton candidateId={item.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
