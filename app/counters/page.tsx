import { requirePageSession } from '@/lib/guard';
import { redirect } from 'next/navigation';

export default async function CountersPage() {
  await requirePageSession();
  redirect('/practices');
}
