import type { Metadata } from 'next';
import { SettingsView } from '@/features/host/settings/settings-view';

export const metadata: Metadata = { title: 'Settings' };

/** The layout has loaded the property and its settings already. */
export default function SettingsPage() {
  return <SettingsView />;
}
