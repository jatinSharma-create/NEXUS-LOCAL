import { candidatesRepo, TRASH_RETENTION_DAYS } from '@/modules/data';
import { AppShell } from '@/components/AppShell';
import { RestoreCandidateButton } from '@/components/RestoreCandidateButton';

export const dynamic = 'force-dynamic';

export default async function TrashPage() {
  await candidatesRepo.purgeExpiredCandidates();
  const items = await candidatesRepo.listTrash();

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
