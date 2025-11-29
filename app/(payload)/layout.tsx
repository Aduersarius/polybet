import configPromise from '@payload-config';
import { RootLayout, handleServerFunctions } from '@payloadcms/next/layouts';
import { importMap } from './admin/importMap';

import '@payloadcms/next/css';

const Layout = ({ children }: { children: React.ReactNode }) => (
    <RootLayout
        config={configPromise}
        importMap={importMap}
        serverFunction={handleServerFunctions as any}
    >
        {children}
    </RootLayout>
);

export default Layout;
