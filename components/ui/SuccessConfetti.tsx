'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

interface Particle {
    id: number;
    x: number;
    y: number;
    rotation: number;
    scale: number;
    type: 'coin' | 'bill' | 'confetti';
    color: string;
    velocityX: number;
    velocityY: number;
}

interface SuccessConfettiProps {
    /** Whether to show the animation */
    isActive: boolean;
    /** Callback when animation completes */
    onComplete?: () => void;
    /** Origin position (defaults to center of screen) */
    originX?: number;
    originY?: number;
    /** Duration in ms (default 1200) */
    duration?: number;
}

const PARTICLE_COUNT = 24;

const COLORS = [
    '#10b981', // emerald
    '#3b82f6', // blue
    '#8b5cf6', // purple
    '#f59e0b', // amber
    '#fbbf24', // yellow (gold)
    '#22c55e', // green
];

const COIN_COLORS = ['#fbbf24', '#f59e0b', '#fcd34d']; // Gold tones

function generateParticles(originX: number, originY: number): Particle[] {
    const particles: Particle[] = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Distribute particles in a cone burst pattern
        const angle = (Math.random() * Math.PI * 2); // Full circle
        const speed = 150 + Math.random() * 250; // Varied speeds
        const velocityX = Math.cos(angle) * speed;
        const velocityY = Math.sin(angle) * speed - 100; // Bias upward

        // Decide particle type
        const typeRoll = Math.random();
        let type: 'coin' | 'bill' | 'confetti';
        if (typeRoll < 0.35) {
            type = 'coin';
        } else if (typeRoll < 0.55) {
            type = 'bill';
        } else {
            type = 'confetti';
        }

        particles.push({
            id: i,
            x: originX,
            y: originY,
            rotation: Math.random() * 360,
            scale: 0.6 + Math.random() * 0.6,
            type,
            color: type === 'coin' 
                ? COIN_COLORS[Math.floor(Math.random() * COIN_COLORS.length)]
                : COLORS[Math.floor(Math.random() * COLORS.length)],
            velocityX,
            velocityY,
        });
    }

    return particles;
}

function CoinIcon({ color, size }: { color: string; size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill={color} />
            <circle cx="12" cy="12" r="8" fill={color} stroke="#000" strokeOpacity="0.2" strokeWidth="0.5" />
            <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#78350f">$</text>
        </svg>
    );
}

function BillIcon({ color, size }: { color: string; size: number }) {
    return (
        <svg width={size * 1.5} height={size} viewBox="0 0 36 24" fill="none">
            <rect x="1" y="1" width="34" height="22" rx="2" fill={color} stroke="#000" strokeOpacity="0.15" />
            <rect x="4" y="4" width="28" height="16" rx="1" fill={color} fillOpacity="0.8" />
            <circle cx="18" cy="12" r="5" fill={color} stroke="#000" strokeOpacity="0.2" />
            <text x="18" y="15" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#065f46">$</text>
        </svg>
    );
}

function ConfettiPiece({ color, size }: { color: string; size: number }) {
    const shapes = ['circle', 'square', 'rect'];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];

    if (shape === 'circle') {
        return <div className="rounded-full" style={{ width: size, height: size, backgroundColor: color }} />;
    }
    if (shape === 'square') {
        return <div className="rounded-sm" style={{ width: size, height: size, backgroundColor: color }} />;
    }
    return <div className="rounded-sm" style={{ width: size * 1.5, height: size * 0.5, backgroundColor: color }} />;
}

export function SuccessConfetti({
    isActive,
    onComplete,
    originX,
    originY,
    duration = 1200,
}: SuccessConfettiProps) {
    const [particles, setParticles] = useState<Particle[]>([]);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (isActive) {
            // Use provided origin or center of viewport
            const x = originX ?? window.innerWidth / 2;
            const y = originY ?? window.innerHeight / 2;
            setParticles(generateParticles(x, y));

            // Clear particles after animation
            const timer = setTimeout(() => {
                setParticles([]);
                onComplete?.();
            }, duration + 200);

            return () => clearTimeout(timer);
        } else {
            setParticles([]);
        }
    }, [isActive, originX, originY, duration, onComplete]);

    if (!mounted) return null;

    const content = (
        <AnimatePresence>
            {particles.length > 0 && (
                <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
                    {particles.map((particle) => (
                        <motion.div
                            key={particle.id}
                            initial={{
                                x: particle.x,
                                y: particle.y,
                                scale: 0,
                                rotate: particle.rotation,
                                opacity: 1,
                            }}
                            animate={{
                                x: particle.x + particle.velocityX,
                                y: particle.y + particle.velocityY + 300, // Gravity effect
                                scale: particle.scale,
                                rotate: particle.rotation + (Math.random() > 0.5 ? 360 : -360),
                                opacity: 0,
                            }}
                            transition={{
                                duration: duration / 1000,
                                ease: [0.25, 0.46, 0.45, 0.94], // easeOutQuad
                            }}
                            className="absolute"
                            style={{
                                left: 0,
                                top: 0,
                                transformOrigin: 'center center',
                            }}
                        >
                            {particle.type === 'coin' && (
                                <CoinIcon color={particle.color} size={20 * particle.scale} />
                            )}
                            {particle.type === 'bill' && (
                                <BillIcon color={particle.color} size={16 * particle.scale} />
                            )}
                            {particle.type === 'confetti' && (
                                <ConfettiPiece color={particle.color} size={8 * particle.scale} />
                            )}
                        </motion.div>
                    ))}
                </div>
            )}
        </AnimatePresence>
    );

    // Portal to document.body to ensure it renders above everything
    return createPortal(content, document.body);
}

// Hook for easy usage
export function useSuccessConfetti() {
    const [isActive, setIsActive] = useState(false);
    const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

    const trigger = useCallback((buttonRef?: React.RefObject<HTMLButtonElement | null>) => {
        if (buttonRef?.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setOrigin({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            });
        } else {
            setOrigin(null);
        }
        setIsActive(true);
    }, []);

    const onComplete = useCallback(() => {
        setIsActive(false);
        setOrigin(null);
    }, []);

    return {
        isActive,
        originX: origin?.x,
        originY: origin?.y,
        trigger,
        onComplete,
    };
}
