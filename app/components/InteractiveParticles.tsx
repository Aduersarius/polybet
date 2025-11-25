'use client';

import { useEffect, useState } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { Container, Engine } from '@tsparticles/engine';

interface InteractiveParticlesProps {
    interactive?: boolean;
    zIndex?: number;
    id?: string;
    variant?: 'default' | 'simple';
}

export function InteractiveParticles({
    interactive = true,
    zIndex = 0,
    id = "tsparticles",
    variant = 'default'
}: InteractiveParticlesProps) {
    const [init, setInit] = useState(false);

    useEffect(() => {
        initParticlesEngine(async (engine: Engine) => {
            await loadSlim(engine);
        }).then(() => {
            setInit(true);
        });
    }, []);

    if (!init) return null;

    const isSimple = variant === 'simple';

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
                            mode: "repulse",
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
                        value: isSimple
                            ? "#ffffff"
                            : ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff", "#ff00ff", "#ffffff"],
                    },
                    links: {
                        enable: false,
                    },
                    move: {
                        direction: isSimple ? "none" : "top",
                        enable: true,
                        outModes: {
                            default: "out",
                        },
                        random: isSimple, // Random movement for simple, straight for default
                        speed: 0.5,
                        straight: !isSimple,
                    },
                    number: {
                        density: {
                            enable: true,
                        },
                        value: isSimple ? 100 : 140,
                    },
                    opacity: {
                        value: { min: isSimple ? 0.1 : 0.3, max: isSimple ? 0.5 : 0.8 },
                        animation: {
                            enable: true,
                            speed: 1,
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
