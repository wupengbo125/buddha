import { Nav } from '@/components/Nav';
import { PracticeDiscover } from '@/components/PracticeDiscover';

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  return <div className="flex min-h-[100dvh] flex-col"><Nav /><PracticeDiscover kind={kind === 'collections' ? 'collections' : 'practices'} /></div>;
}