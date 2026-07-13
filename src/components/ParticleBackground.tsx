import React, { useEffect, useRef } from 'react';

interface Particle {
  isSpiral: boolean;     // Whether it flows in a spiral arm or a concentric circle
  baseRadius: number;    // Radial distance from center
  outwardSpeed: number;  // Speed of moving outward
  arm: number;           // Spiral arm index
  dispersion: number;    // Angular deviation from arm center
  orbitOffset: number;   // Cumulative angular rotation
  angularSpeed: number;  // Orbital speed
  size: number;          // Size of particle
  color: string;         // Color in hsla format with OPACITY placeholder
  pulseSpeed: number;    // Speed of opacity pulsing
  pulseTime: number;     // Initial pulse phase
  baseOpacity: number;   // Maximum opacity
  
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
    const PARTICLE_COUNT = 850;
    const particles: Particle[] = [];
    const colors = [
      'hsla(217, 91%, 60%, OPACITY)',  // Blue
      'hsla(43, 96%, 56%, OPACITY)',   // Gold
      'hsla(0, 0%, 100%, OPACITY)',    // White
      'hsla(270, 84%, 67%, OPACITY)',  // Light Purple
    ];

    // Spiral Configuration
    const numArms = 3;
    const tightness = 0.0035; // Controls how tightly wrapped the spiral arms are

    // Mouse Tracking
    const mouse = {
      x: -1000,
      y: -1000,
      targetX: -1000,
      targetY: -1000,
      radius: 125,      // Repulsion radius
      strength: 60,     // Repulsion force strength
    };

    const maxRadius = Math.max(width, height) * 0.85;

    // Helper to initialize a single particle
    const createParticle = (index: number, initFullRadius = false): Particle => {
      const isSpiral = Math.random() < 0.75;
      
      // If initFullRadius is true, distribute radius across the whole screen (on startup).
      // Otherwise, start near the center (on reset/spawn).
      let baseRadius = 5;
      if (initFullRadius) {
        const ratio = index / PARTICLE_COUNT;
        baseRadius = 5 + Math.pow(ratio, 1.5) * maxRadius;
      } else {
        baseRadius = Math.random() * 30; // Spawn near center
      }

      const outwardSpeed = isSpiral ? (0.2 + Math.random() * 0.5) : 0; // Only spiral particles drift outward
      const arm = Math.floor(Math.random() * numArms);
      const dispersion = (Math.random() - 0.5) * 0.45;
      const orbitOffset = Math.random() * Math.PI * 2;
      const angularSpeed = isSpiral 
        ? (0.0002 + Math.random() * 0.0006) 
        : (0.0001 + Math.random() * 0.0004) * (Math.random() > 0.5 ? 1 : -1);

      const color = colors[Math.floor(Math.random() * colors.length)];
      const size = 0.6 + Math.random() * 1.5;
      const pulseSpeed = 0.006 + Math.random() * 0.016;
      const pulseTime = Math.random() * Math.PI * 2;
      const baseOpacity = isSpiral ? (0.4 + Math.random() * 0.45) : (0.25 + Math.random() * 0.35);

      const cx = width / 2;
      const cy = height / 2;
      
      // Calculate starting angle
      let angle = orbitOffset;
      if (isSpiral) {
        const baseArmAngle = (arm * Math.PI * 2) / numArms;
        const twist = baseRadius * tightness;
        angle = baseArmAngle + twist + dispersion + orbitOffset;
      }

      const x = cx + baseRadius * Math.cos(angle);
      const y = cy + baseRadius * Math.sin(angle);

      return {
        isSpiral,
        baseRadius,
        outwardSpeed,
        arm,
        dispersion,
        orbitOffset,
        angularSpeed,
        size,
        color,
        pulseSpeed,
        pulseTime,
        baseOpacity,
        x,
        y,
      };
    };

    // Initialize Particles
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(createParticle(i, true));
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

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        let p = particles[i];

        // 1. Update Position & Orbit
        p.orbitOffset += p.angularSpeed;

        if (p.isSpiral) {
          // Drift outward
          p.baseRadius += p.outwardSpeed;
          
          // Reset to center if it goes off screen
          if (p.baseRadius > maxRadius) {
            particles[i] = createParticle(i, false);
            continue;
          }
        }

        // 2. Calculate Target Coordinates
        let angle = p.orbitOffset;
        let currentRadius = p.baseRadius;

        if (p.isSpiral) {
          // Spiral angle calculation with twist based on radius
          const baseArmAngle = (p.arm * Math.PI * 2) / numArms;
          const twist = p.baseRadius * tightness;
          angle = baseArmAngle + twist + p.dispersion + p.orbitOffset;
        } else {
          // Circular particle breathing
          currentRadius = p.baseRadius + Math.sin(p.orbitOffset * 2 + time * 0.01) * 8;
        }

        const orbitalX = cx + currentRadius * Math.cos(angle);
        const orbitalY = cy + currentRadius * Math.sin(angle);

        let targetX = orbitalX;
        let targetY = orbitalY;

        // 3. Mouse Interaction (Repulsion force)
        if (mouse.x > -500 && mouse.y > -500) {
          const dx = orbitalX - mouse.x;
          const dy = orbitalY - mouse.y;
          const dist = Math.hypot(dx, dy);

          if (dist < mouse.radius) {
            const force = (mouse.radius - dist) / mouse.radius;
            const pushAngle = Math.atan2(dy, dx);
            targetX = orbitalX + Math.cos(pushAngle) * force * mouse.strength;
            targetY = orbitalY + Math.sin(pushAngle) * force * mouse.strength;
          }
        }

        // 4. Smooth Particle Position Easing
        p.x += (targetX - p.x) * 0.08;
        p.y += (targetY - p.y) * 0.08;

        // 5. Draw Particle with double layer for soft glow
        const opacity = (Math.sin(time * p.pulseSpeed + p.pulseTime) * 0.25 + 0.75) * p.baseOpacity;
        
        // Layer 1: Soft Outer Glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.3, 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace('OPACITY', (opacity * 0.22).toFixed(2));
        ctx.fill();

        // Layer 2: Glowing Core
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
