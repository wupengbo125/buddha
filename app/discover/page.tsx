import { Nav } from '@/components/Nav';
import { PracticeDiscover } from '@/components/PracticeDiscover';

export default async function DiscoverPage() {
  return <div className="flex min-h-[100dvh] flex-col"><Nav /><PracticeDiscover /></div>;
}
