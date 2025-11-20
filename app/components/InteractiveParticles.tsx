'use client';
import { useEffect, useRef } from 'react';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    opacity: number;
}

export function InteractiveParticles() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<Particle[]>([]);
    const mouseRef = useRef({ x: 0, y: 0 });
    const animationRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        // Set canvas size with device pixel ratio for sharpness
        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            ctx.scale(dpr, dpr);
        };
        resize();
        window.addEventListener('resize', resize);

        // Reduce particle count for better performance
        const particleCount = 60;
        const particles: Particle[] = [];

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                radius: Math.random() * 2.5 + 1.5,
                opacity: Math.random() * 0.6 + 0.4,
            });
        }
        particlesRef.current = particles;

        // Mouse move handler with throttling
        let lastMouseUpdate = 0;
        const handleMouseMove = (e: MouseEvent) => {
            const now = Date.now();
            if (now - lastMouseUpdate > 16) { // ~60fps throttle
                mouseRef.current = { x: e.clientX, y: e.clientY };
                lastMouseUpdate = now;
            }
        };
        window.addEventListener('mousemove', handleMouseMove, { passive: true });

        // Animation loop with optimizations
        const animate = () => {
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

            // Draw connections first (behind particles)
            ctx.lineWidth = 1;
            particles.forEach((particle, i) => {
                particles.forEach((other, j) => {
                    if (i >= j) return; // Only draw once
                    const dx = particle.x - other.x;
                    const dy = particle.y - other.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < 120) {
                        const alpha = 0.25 * (1 - distance / 120);
                        ctx.strokeStyle = `rgba(187, 134, 252, ${alpha})`;
                        ctx.beginPath();
                        ctx.moveTo(particle.x, particle.y);
                        ctx.lineTo(other.x, other.y);
                        ctx.stroke();
                    }
                });
            });

            // Update and draw particles
            particles.forEach((particle) => {
                // Mouse interaction - repel particles
                const dx = mouseRef.current.x - particle.x;
                const dy = mouseRef.current.y - particle.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const maxDistance = 150;

                if (distance < maxDistance) {
                    const force = (maxDistance - distance) / maxDistance;
                    const angle = Math.atan2(dy, dx);
                    particle.vx -= Math.cos(angle) * force * 0.3;
                    particle.vy -= Math.sin(angle) * force * 0.3;
                }

                // Apply velocity
                particle.x += particle.vx;
                particle.y += particle.vy;

                // Friction
                particle.vx *= 0.98;
                particle.vy *= 0.98;

                // Gentle drift
                particle.vx += (Math.random() - 0.5) * 0.05;
                particle.vy += (Math.random() - 0.5) * 0.05;

                // Bounce off edges
                if (particle.x < 0 || particle.x > window.innerWidth) {
                    particle.vx *= -1;
                    particle.x = Math.max(0, Math.min(window.innerWidth, particle.x));
                }
                if (particle.y < 0 || particle.y > window.innerHeight) {
                    particle.vy *= -1;
                    particle.y = Math.max(0, Math.min(window.innerHeight, particle.y));
                }

                // Draw particle with optimized glow (single shadow blur)
                ctx.shadowBlur = 12;
                ctx.shadowColor = `rgba(187, 134, 252, ${particle.opacity})`;

                // Outer glow circle
                ctx.fillStyle = `rgba(220, 190, 255, ${particle.opacity * 0.6})`;
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
                ctx.fill();

                // Inner bright core (no shadow for performance)
                ctx.shadowBlur = 0;
                ctx.fillStyle = `rgba(255, 255, 255, ${particle.opacity})`;
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.radius * 0.4, 0, Math.PI * 2);
                ctx.fill();
            });

            animationRef.current = requestAnimationFrame(animate);
        };
        animate();

        return () => {
            window.removeEventListener('resize', resize);
            window.removeEventListener('mousemove', handleMouseMove);
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none"
            style={{ zIndex: 1, willChange: 'transform' }}
        />
    );
}
