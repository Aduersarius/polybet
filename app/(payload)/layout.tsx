import configPromise from '@payload-config';
import { RootLayout } from '@payloadcms/next/layouts';
import { importMap } from './admin/importMap';
import { serverFunction } from './actions';

import '@payloadcms/next/css';

const Layout = ({ children }: { children: React.ReactNode }) => (
    <RootLayout
        config={configPromise}
        importMap={importMap}
        serverFunction={serverFunction}
    >
        {children}
    </RootLayout>
);

export default Layout;
