import { getPayload } from 'payload';
import config from '@payload-config';

export default async function PayloadLayout({ children }: { children: React.ReactNode }) {
    await getPayload({ config });
    return children;
}
