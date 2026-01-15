"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LegacyUserProfileRedirect({ params }: { params: Promise<{ address: string }> }) {
    const resolvedParams = use(params);
    const router = useRouter();

    useEffect(() => {
        if (!resolvedParams?.address) return;
        router.replace(`/profile?address=${resolvedParams.address}`);
    }, [resolvedParams?.address, router]);

    return null;
}
