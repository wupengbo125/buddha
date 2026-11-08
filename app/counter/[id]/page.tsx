import { requirePageSession } from '@/lib/guard';
import { Nav } from '@/components/Nav';
import { CounterDetail } from '@/components/CounterDetail';

export default async function CounterPage({ params }: { params: { id: string } }) {
  await requirePageSession();
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Nav />
      <CounterDetail id={params.id} />
    </div>
  );
}
