'use client';

import { useState, useEffect } from 'react';

interface UserAvatarProps {
    src: string | null;
    alt: string;
    fallback: string; // The character(s) to show
    className?: string; // Classes for size, rounded, border, etc.
    fallbackClass?: string; // Optional specific classes for the fallback div (colors etc)
}

export function UserAvatar({ src, alt, fallback, className = "w-8 h-8", fallbackClass }: UserAvatarProps) {
    const [error, setError] = useState(false);

    // Reset error when src changes (e.g. reused component)
    useEffect(() => {
        setError(false);
    }, [src]);

    if (src && !error) {
        return (
            <img
                src={src}
                alt={alt}
                className={`${className} object-cover`}
                onError={() => setError(true)}
            />
        );
    }

    // Default fallback styling if no specific class provided
    const defaultFallbackClass = "bg-gradient-to-br from-blue-500 to-purple-600 text-white flex items-center justify-center font-bold";

    return (
        <div className={`${className} ${fallbackClass || defaultFallbackClass}`}>
            {fallback}
        </div>
    );
}
