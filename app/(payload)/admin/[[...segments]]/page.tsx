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
    return generatePageMetadata({ config: configPromise, params, searchParams });
};

const Page = async ({ params, searchParams }: Args) => {
    console.log('Payload config promise in Page:', configPromise);
    return RootPage({ config: configPromise, params, searchParams, importMap: {} }); // Cast to any to bypass type check for now
};

export default Page;
