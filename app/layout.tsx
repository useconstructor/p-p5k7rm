import type { Metadata } from 'next';
import Script from 'next/script';
import '@fontsource-variable/public-sans';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
export const metadata: Metadata = {
  title: 'Inventario AWS Frontend',
  description: 'Gestión interna de productos y existencias. Busca, edita y ajusta tu inventario con precisión.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}{process.env.NEXT_PUBLIC_CONSTRUCTOR_API && process.env.NEXT_PUBLIC_PROJECT_ID && <Script src={process.env.NEXT_PUBLIC_CONSTRUCTOR_API + '/v1/projects/' + process.env.NEXT_PUBLIC_PROJECT_ID + '/analytics/script.js'} strategy="afterInteractive" />}</body></html>;
}
