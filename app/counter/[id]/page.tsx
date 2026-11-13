import { requirePageSession } from '@/lib/guard';
import { Nav } from '@/components/Nav';
import { CounterDetail } from '@/components/CounterDetail';

export default async function CounterPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession();
  const { id } = await params;
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Nav />
      <CounterDetail id={id} />
    </div>
  );
}
