import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ThemeRoot } from '@/features/host/shell/theme';
import { THEME_COOKIE, themeFrom } from '@/features/host/shell/theme-cookie';

export const metadata: Metadata = {
  title: { default: 'Front desk', template: '%s · Front desk · Stay Flow' },
  robots: { index: false },
};

export default async function HostLayout({ children }: LayoutProps<'/host'>) {
  const theme = themeFrom((await cookies()).get(THEME_COOKIE)?.value);
  return <ThemeRoot initial={theme}>{children}</ThemeRoot>;
}
