import configPromise from '@payload-config';
import { RootLayout } from '@payloadcms/next/layouts';
import { importMap } from './admin/importMap';
import { serverFunction } from './actions';
import '@payloadcms/next/css';

export { metadata } from '@payloadcms/next/layouts';

export default async function PayloadLayout({ children }: { children: React.ReactNode }) {
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
