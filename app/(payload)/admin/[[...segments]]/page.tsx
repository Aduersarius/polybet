import configPromise from '../../../payload.config.ts';
import { RootPage, generatePageMetadata } from '@payloadcms/next/views';
import { Metadata } from 'next';

type Args = {
    params: Promise<{
        segments: string[];
    }>;
    searchParams: Promise<{
        [key: string]: string | string[];
    }>;
};

export const generateMetadata = async ({ params, searchParams }: Args): Promise<Metadata> => {
    const config = await configPromise;
    console.log('Payload config in generateMetadata:', config);
    return generatePageMetadata({ config: config as any, params, searchParams });
};

const Page = async ({ params, searchParams }: Args) => {
    const config = await configPromise;
    console.log('Payload config in Page:', config);
    return RootPage({ config: config as any, params, searchParams, importMap: {} as any }); // Cast to any to bypass type check for now
};

export default Page;
