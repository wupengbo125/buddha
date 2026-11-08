import { requirePageSession } from '@/lib/guard';
import { Nav } from '@/components/Nav';
import { SettingsClient } from '@/components/SettingsClient';

export default async function SettingsPage() {
  await requirePageSession();
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Nav />
      <SettingsClient />
    </div>
  );
}
