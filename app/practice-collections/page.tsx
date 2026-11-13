import { Nav } from '@/components/Nav';
import { PracticeLibrary } from '@/components/PracticeLibrary';
import { requirePageSession } from '@/lib/guard';

export default async function PracticeCollectionsPage() {
  await requirePageSession();
  return <div className="flex min-h-[100dvh] flex-col"><Nav /><PracticeLibrary kind="collections" /></div>;
}