import configPromise from '@payload-config';
import { RootLayout } from '@payloadcms/next/layouts';
import { importMap } from './admin/importMap';
import { serverFunction } from './actions';
import '@payloadcms/next/css';

export { metadata } from '@payloadcms/next/layouts';

export default async function PayloadLayout({ children }: { children: React.ReactNode }) {
    // Try to initialize Payload database on layout load
    try {
        // Call the setup endpoint if we're in production and tables might not exist
        if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL) {
            const setupResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/setup-payload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (setupResponse.ok) {
                console.log('Payload database setup completed');
            }
        }
    } catch (error) {
        console.warn('Payload database setup failed:', error);
        // Continue anyway - the admin might still work
    }

    return (
        <RootLayout
            config={configPromise}
            importMap={importMap}
            serverFunction={serverFunction}
        >
            {children}
        </RootLayout>
    );
}
