import { requirePageSession } from '@/lib/guard';
import { Nav } from '@/components/Nav';
import { CountersClient } from '@/components/CountersClient';

export default async function CountersPage() {
  await requirePageSession();
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Nav />
      <CountersClient />
    </div>
  );
}
