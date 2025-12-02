'use client';

import { useEffect, useState } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { Container, Engine } from '@tsparticles/engine';

interface SparksProps {
    interactive?: boolean;
    zIndex?: number;
    id?: string;
    variant?: 'default' | 'simple';
}

export function Sparks({
    interactive = true,
    zIndex = 0,
    id = "tsparticles",
    variant = 'default'
}: SparksProps) {
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
                            ? ["#ffffff", "#ffff88", "#ffaa00"]
                            : ["#ffffff", "#ffff88", "#ffaa00", "#ff6600", "#ffcc00"],
                    },
                    links: {
                        enable: false,
                    },
                    life: {
                        duration: {
                            sync: false,
                            value: isSimple ? 1.5 : 2,
                        },
                        count: 1,
                    },
                    move: {
                        direction: "none",
                        enable: true,
                        outModes: {
                            default: "destroy",
                        },
                        random: true,
                        speed: { min: 1, max: isSimple ? 3 : 5 },
                        straight: false,
                        attract: {
                            enable: false,
                        },
                        trail: {
                            enable: true,
                            length: 3,
                            fill: {
                                color: "#ffffff",
                            },
                        },
                    },
                    number: {
                        density: {
                            enable: true,
                        },
                        value: isSimple ? 80 : 120,
                    },
                    opacity: {
                        value: { min: 0.8, max: 1 },
                        animation: {
                            enable: true,
                            speed: 2,
                            sync: false,
                            mode: "decrease",
                            startValue: "max",
                            destroy: "min"
                        }
                    },
                    shape: {
                        type: "star",
                        options: {
                            star: {
                                sides: 5,
                                inset: 2,
                            },
                        },
                    },
                    size: {
                        value: { min: 0.5, max: 2 },
                        animation: {
                            enable: true,
                            speed: 1,
                            sync: false,
                            mode: "decrease",
                            startValue: "max",
                            destroy: "min"
                        },
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
