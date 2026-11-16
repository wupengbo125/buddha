import { notFound } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { PracticeDiscover } from '@/components/PracticeDiscover';

export default async function PublicPracticePage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (kind !== 'practices') notFound();
  return <div className="flex min-h-[100dvh] flex-col"><Nav /><PracticeDiscover id={id} /></div>;
}
