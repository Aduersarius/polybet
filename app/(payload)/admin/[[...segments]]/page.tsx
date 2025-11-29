import configPromise from '@payload-config';
import { RootPage, generatePageMetadata } from '@payloadcms/next/views';
import { Metadata } from 'next';
import { importMap } from '../importMap';

type Args = {
    params: Promise<{
        segments: string[];
    }>;
    searchParams: Promise<{
        [key: string]: string | string[];
    }>;
};

export const generateMetadata = async ({ params, searchParams }: Args): Promise<Metadata> => {
    console.log('Payload config promise in generateMetadata:', configPromise);
    console.log('Payload config promise type:', typeof configPromise);
    console.log('Payload config promise is undefined:', configPromise === undefined);
    if (configPromise === undefined) {
        console.error('Payload config is undefined - check @payload-config import and environment variables');
    }
    return generatePageMetadata({ config: configPromise, params, searchParams });
};

const Page = async ({ params, searchParams }: Args) => {
    console.log('Payload config promise in Page:', configPromise);
    console.log('Payload config promise type:', typeof configPromise);
    console.log('Payload config promise is undefined:', configPromise === undefined);
    if (configPromise === undefined) {
        console.error('Payload config is undefined - check @payload-config import and environment variables');
        // Return error page or fallback
        return <div>Payload configuration error - check server logs</div>;
    }
    return RootPage({ config: configPromise, params, searchParams, importMap });
};

export default Page;
