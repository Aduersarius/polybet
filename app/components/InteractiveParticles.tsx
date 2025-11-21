'use client';

import { useEffect, useState } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { Container, Engine } from '@tsparticles/engine';

interface InteractiveParticlesProps {
    interactive?: boolean;
    zIndex?: number;
    id?: string;
}

export function InteractiveParticles({ interactive = true, zIndex = 0, id = "tsparticles" }: InteractiveParticlesProps) {
    const [init, setInit] = useState(false);

    useEffect(() => {
        initParticlesEngine(async (engine: Engine) => {
            await loadSlim(engine);
        }).then(() => {
            setInit(true);
        });
    }, []);

    if (!init) return null;

    return (
        <Particles
            id={id}
            className="fixed inset-0 pointer-events-none"
            options={{
                background: {
                    color: {
                        value: "transparent",
                    },
                },
                fpsLimit: 120,
                interactivity: {
                    detectsOn: "window",
                    events: {
                        onHover: {
                            enable: interactive,
                            mode: "repulse", // Sparks fly away
                        },
                        resize: {
                            enable: true,
                            delay: 0.5
                        },
                    },
                    modes: {
                        repulse: {
                            distance: 100,
                            duration: 0.4,
                        },
                    },
                },
                particles: {
                    color: {
                        value: ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff", "#ff00ff", "#ffffff"], // Vivid + White
                    },
                    links: {
                        enable: false, // No links for sparks
                    },
                    move: {
                        direction: "top", // Flowing upwards
                        enable: true,
                        outModes: {
                            default: "out", // Particles flow out of screen
                        },
                        random: false,
                        speed: 0.5, // Gentle flow
                        straight: false,
                    },
                    number: {
                        density: {
                            enable: true,
                            // area: 800,
                        },
                        value: 70, // Optimal count
                    },
                    opacity: {
                        value: { min: 0.3, max: 0.8 },
                        animation: {
                            enable: true,
                            speed: 1, // Gentle flicker
                            sync: false,
                            mode: "auto",
                            startValue: "random",
                            destroy: "none"
                        }
                    },
                    shape: {
                        type: "circle",
                    },
                    size: {
                        value: { min: 1, max: 3 },
                    },
                    // Add a trail effect for "spark" feel?
                    effect: {
                        fill: true,
                        close: true
                    }
                },
                detectRetina: true,
            }}
            style={{
                zIndex: zIndex,
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
            }}
        />
    );
}
