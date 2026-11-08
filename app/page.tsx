import { requirePageSession } from '@/lib/guard';
import { Nav } from '@/components/Nav';
import { ChantClient } from '@/components/ChantClient';

export default async function HomePage() {
  await requirePageSession();
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Nav />
      <ChantClient />
    </div>
  );
}
