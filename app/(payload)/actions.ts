'use server';

import { handleServerFunctions } from '@payloadcms/next/layouts';

export const serverFunction = async (args: any) => {
    return handleServerFunctions(args);
};
