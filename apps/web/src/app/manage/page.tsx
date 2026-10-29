import type { Metadata } from 'next';
import { ManageView } from '@/features/manage/manage-view';

export const metadata: Metadata = {
  title: 'Your booking',
  // The page is a guest's private booking; the token in its address never reaches the server.
  robots: { index: false },
  referrer: 'no-referrer',
};

export default function ManagePage() {
  return <ManageView />;
}
