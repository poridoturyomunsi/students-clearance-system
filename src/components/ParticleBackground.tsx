import React, { useEffect, useRef } from 'react';

interface Particle {
  baseRadius: number; // Base orbital radius
  angle: number;      // Current angle in radians
  speed: number;      // Angular speed
  size: number;       // Base particle size
  color: string;      // Color in hsla format with OPACITY placeholder
  pulseSpeed: number; // Speed of pulsing opacity
  pulseTime: number;  // Initial pulse phase
  waveFreq: number;   // Frequency of the radial wave
  waveAmp: number;    // Amplitude of the radial wave
  baseOpacity: number; // Maximum opacity
  
  // Current positions
  x: number;
  y: number;
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Particle Configuration
    const PARTICLE_COUNT = 750;
    const particles: Particle[] = [];
    const colors = [
      'hsla(217, 91%, 60%, OPACITY)',  // Blue
      'hsla(43, 96%, 56%, OPACITY)',   // Gold
      'hsla(0, 0%, 100%, OPACITY)',    // White
      'hsla(270, 84%, 67%, OPACITY)',  // Light Purple
    ];

    // Mouse Tracking
    const mouse = {
      x: -1000,
      y: -1000,
      targetX: -1000,
      targetY: -1000,
      radius: 130,      // Repulsion radius
      strength: 65,     // Repulsion force strength
    };

    // Initialize Particles
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Distribute radii in rings, concentrated more in the middle
      const ratio = i / PARTICLE_COUNT;
      const baseRadius = 50 + Math.pow(ratio, 1.5) * Math.max(width, height) * 0.75;
      
      const angle = Math.random() * Math.PI * 2;
      
      // Orbit direction & speed: slower for outer particles
      const dir = Math.random() > 0.45 ? 1 : -1;
      const speed = (0.0001 + Math.random() * 0.0004) * (50 / (baseRadius + 1)) * dir;
      
      const color = colors[Math.floor(Math.random() * colors.length)];
      const size = 0.6 + Math.random() * 1.4;
      const pulseSpeed = 0.005 + Math.random() * 0.015;
      const pulseTime = Math.random() * Math.PI * 2;
      const waveFreq = 2 + Math.floor(Math.random() * 6);
      const waveAmp = 10 + Math.random() * 25;
      const baseOpacity = 0.35 + Math.random() * 0.45;

      // Position initialized to correct orbit location
      const cx = width / 2;
      const cy = height / 2;
      const x = cx + baseRadius * Math.cos(angle);
      const y = cy + baseRadius * Math.sin(angle);

      particles.push({
        baseRadius,
        angle,
        speed,
        size,
        color,
        pulseSpeed,
        pulseTime,
        waveFreq,
        waveAmp,
        baseOpacity,
        x,
        y,
      });
    }

    // Event Handlers
    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
    };

    const handleMouseLeave = () => {
      mouse.targetX = -1000;
      mouse.targetY = -1000;
    };

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('resize', handleResize);

    // Animation variables
    let time = 0;

    // Animation Loop
    const animate = () => {
      time += 1;
      
      // Deep space background clear
      ctx.fillStyle = '#05070f';
      ctx.fillRect(0, 0, width, height);

      // Smooth mouse coordinates interpolation
      mouse.x += (mouse.targetX - mouse.x) * 0.1;
      mouse.y += (mouse.targetY - mouse.y) * 0.1;

      const cx = width / 2;
      const cy = height / 2;

      // Global wave multiplier to transition between circles and wave structures
      // Oscillates slowly over time
      const dispersion = Math.sin(time * 0.003) * 0.8; 

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particles[i];

        // 1. Update Angle (Orbit)
        p.angle += p.speed;

        // 2. Add Dynamic Radial Wave Pattern
        const wave = Math.sin(p.angle * p.waveFreq + time * 0.015) * p.waveAmp * dispersion;
        const currentRadius = p.baseRadius + wave;

        // 3. Compute Base Orbital Coordinates
        const orbitalX = cx + currentRadius * Math.cos(p.angle);
        const orbitalY = cy + currentRadius * Math.sin(p.angle);

        // 4. Calculate Mouse Interaction
        let targetX = orbitalX;
        let targetY = orbitalY;

        if (mouse.x > -500 && mouse.y > -500) {
          const dx = orbitalX - mouse.x;
          const dy = orbitalY - mouse.y;
          const dist = Math.hypot(dx, dy);

          if (dist < mouse.radius) {
            const force = (mouse.radius - dist) / mouse.radius;
            const pushAngle = Math.atan2(dy, dx);
            // Push particle along the vector from cursor to particle
            targetX = orbitalX + Math.cos(pushAngle) * force * mouse.strength;
            targetY = orbitalY + Math.sin(pushAngle) * force * mouse.strength;
          }
        }

        // 5. Smooth Particle Position Interpolation (easing)
        p.x += (targetX - p.x) * 0.08;
        p.y += (targetY - p.y) * 0.08;

        // 6. Draw Glowing Particle
        const opacity = (Math.sin(time * p.pulseSpeed + p.pulseTime) * 0.25 + 0.75) * p.baseOpacity;
        
        // Render double-layer for glow effect: larger faint circle + bright core
        // Layer 1: Glow Ring
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace('OPACITY', (opacity * 0.25).toFixed(2));
        ctx.fill();

        // Layer 2: Core
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace('OPACITY', opacity.toFixed(2));
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    // Start
    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none block z-0"
      style={{ mixBlendMode: 'screen' }}
    />
  );
}
