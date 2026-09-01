"use client";

import { useEffect, useRef, useState } from "react";
import { IconCCLogo } from "@/components/shared/Icons";
import styles from "./Home.module.scss";

const RAY_ANGLES = [
  { token: "--brand-red", angle: -26 },
  { token: "--brand-ember", angle: -13 },
  { token: "--brand-lime", angle: 0 },
  { token: "--brand-sky", angle: 13 },
  { token: "--brand-violet", angle: 26 },
];

function readRays() {
  const root = getComputedStyle(document.documentElement);
  return RAY_ANGLES.map(({ token, angle }) => ({
    angle,
    color: root.getPropertyValue(token).trim() || "#ffffff",
  }));
}

function readInk() {
  const root = getComputedStyle(document.documentElement);
  const ink = root.getPropertyValue("--prism-ink").trim() || "#ffffff";
  const blend = root.getPropertyValue("--prism-canvas-blend").trim();
  return {
    blend: (blend || "lighter") as GlobalCompositeOperation,
    beam: (alpha: number) =>
      `color-mix(in srgb, ${ink} ${Math.round(alpha * 100)}%, transparent)`,
  };
}

const MARK_LAYERS = 26;
const LAYER_SPACING = 1.15;
const CYCLE_MS = 18_000;
const MAX_PARTICLES = 90;
const IDLE_FRAMES = 150;
const SHIVER_MS = 620;

const EXTRUSION = Array.from({ length: MARK_LAYERS }, (_, index) => {
  const half = (MARK_LAYERS - 1) / 2;
  const edge = Math.abs(index - half) / half;
  const fill =
    edge > 0.86
      ? "currentColor"
      : `rgba(${Math.round(29 + edge * 226)},${Math.round(35 + edge * 43)},${Math.round(
          167 - edge * 102,
        )},${(0.34 + edge * 0.56).toFixed(2)})`;
  return { z: ((index - half) * LAYER_SPACING).toFixed(2), fill };
});

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
};

/** Coloured ring drifting in from the right */
type Ring = {
  x: number;
  y: number;
  radius: number;
  speed: number;
  color: string;
};

/** Flare thrown off the spinning disc */
type Flare = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
};

export default function PrismHero() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobRef = useRef<HTMLDivElement>(null);
  const discRef = useRef<HTMLDivElement>(null);
  const discSpinRef = useRef<HTMLDivElement>(null);
  const discAnchorRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLSpanElement>(null);
  const markTiltRef = useRef<HTMLDivElement>(null);
  const markSpinRef = useRef<HTMLDivElement>(null);
  const [caught, setCaught] = useState(0);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const motionOk = window.matchMedia(
      "(prefers-reduced-motion: no-preference)",
    ).matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    const capable = (navigator.hardwareConcurrency ?? 4) >= 4;
    if (!motionOk || !finePointer || !capable) return;

    setAnimated(true);

    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const maybeContext = canvas.getContext("2d");
    if (!maybeContext) return;
    const context: CanvasRenderingContext2D = maybeContext;

    // Cap DPR
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let disc = { x: 0, y: 0, radius: 165 };
    const discLean = { x: 0, y: 0 };
    const rays = readRays();
    const ink = readInk();

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const anchor = discAnchorRef.current?.getBoundingClientRect();
      if (anchor) {
        disc = {
          x: anchor.left - rect.left + anchor.width / 2,
          y: anchor.top - rect.top + anchor.height / 2,
          radius: anchor.width / 2,
        };
      }
    };
    resize();

    const pointer = { x: width * 0.4, y: height * 0.5 };
    let idle = 0;
    let particles: Particle[] = [];
    let rings: Ring[] = [];
    let flares: Flare[] = [];
    let shiverUntil = 0;
    let score = 0;
    let frame = 0;
    let running = true;
    const start = performance.now();

    const onPointerMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      idle = 0;

      // The prism, the disc and the mark lean toward the pointer
      const nx = pointer.x / Math.max(width, 1) - 0.5;
      const ny = pointer.y / Math.max(height, 1) - 0.5;
      if (blobRef.current) {
        blobRef.current.style.transform = `translate3d(${nx * -46}px, ${ny * -34}px, 0)`;
      }
      if (markTiltRef.current) {
        markTiltRef.current.style.transform = `rotateY(${nx * 26}deg) rotateX(${-ny * 18}deg)`;
      }
      discLean.x = nx * 22;
      discLean.y = ny * 16;
    };

    function spawnRing() {
      if (rings.length > 5) return;
      const ray = rays[Math.floor(Math.random() * rays.length)];
      rings.push({
        x: width + 40,
        y: height * (0.18 + Math.random() * 0.64),
        radius: 12 + Math.random() * 16,
        speed: 0.5 + Math.random() * 0.7,
        color: ray.color,
      });
    }

    /** Thrown off the disc rim along the tangent, so the spin appears to fling it */
    function spawnFlare(turnDegrees: number) {
      if (flares.length > 2) return;
      const angle = ((turnDegrees * 2 + Math.random() * 90) * Math.PI) / 180;
      const tangent = angle + Math.PI / 2;
      const ray = rays[Math.floor(Math.random() * rays.length)];
      flares.push({
        x: disc.x + Math.cos(angle) * disc.radius,
        y: disc.y + Math.sin(angle) * disc.radius,
        vx: Math.cos(tangent) * 0.9,
        vy: Math.sin(tangent) * 0.9,
        radius: 3,
        color: ray.color,
      });
    }

    function burst(x: number, y: number, color: string) {
      for (let i = 0; i < 14 && particles.length < MAX_PARTICLES; i++) {
        const angle = (Math.PI * 2 * i) / 14;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * (0.8 + Math.random()),
          vy: Math.sin(angle) * (0.8 + Math.random()),
          life: 1,
          color,
        });
      }
    }

    function tick(now: number) {
      if (!running) return;
      const age = now - start;
      const elapsed = age % CYCLE_MS;
      const turn = (elapsed / CYCLE_MS) * 360;
      const shivering = now < shiverUntil;

      if (markSpinRef.current) {
        markSpinRef.current.style.transform = `rotateY(${turn}deg)`;
      }

      const facing = Math.abs(Math.cos((turn * Math.PI) / 180));
      if (discRef.current) {
        discRef.current.style.transform =
          `translate3d(${discLean.x.toFixed(1)}px, ${discLean.y.toFixed(1)}px, 0)` +
          ` scale(${(1 + (1 - facing) * 0.12).toFixed(3)})`;
        discRef.current.style.opacity = String(0.42 + (1 - facing) * 0.58);
      }
      if (discSpinRef.current) {
        const wheel = (age / CYCLE_MS) * -180;
        discSpinRef.current.style.transform = `rotate(${wheel}deg)`;
      }
      if (coreRef.current) {
        coreRef.current.style.opacity = String(0.5 + (1 - facing) * 0.5);
        coreRef.current.style.transform = `scale(${1 + (1 - facing) * 0.5})`;
      }

      idle += 1;
      const ambient = idle > IDLE_FRAMES;
      context.clearRect(0, 0, width, height);

      if (Math.random() < 0.02) spawnRing();
      if (Math.random() < 0.004) spawnFlare(turn); // Rare

      context.globalCompositeOperation = ink.blend;

      // White beam in from the left at pointer height
      context.strokeStyle = ambient ? ink.beam(0.18) : ink.beam(0.5);
      context.lineWidth = 1.4;
      context.beginPath();
      context.moveTo(0, pointer.y);
      context.lineTo(pointer.x, pointer.y);
      context.stroke();

      // Prism
      const spin = (elapsed / CYCLE_MS) * Math.PI * 4;
      const size = 26;
      context.save();
      context.translate(pointer.x, pointer.y);
      context.rotate(spin);
      context.beginPath();
      for (let corner = 0; corner < 3; corner++) {
        const angle = (corner / 3) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(angle) * size;
        const py = Math.sin(angle) * size;
        if (corner === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.strokeStyle = ambient ? ink.beam(0.28) : ink.beam(0.75);
      context.lineWidth = 1.5;
      context.stroke();
      context.fillStyle = ink.beam(0.05);
      context.fill();
      context.restore();

      const jitter = shivering ? (Math.random() - 0.5) * 8 : 0;
      const geometry = rays.map((ray) => {
        const radians = ((ray.angle + jitter) * Math.PI) / 180;
        return { ...ray, dx: Math.cos(radians), dy: Math.sin(radians) };
      });

      for (const ray of geometry) {
        const length = Math.max(width - pointer.x, 240);
        const endX = pointer.x + ray.dx * length;
        const endY = pointer.y + ray.dy * length;
        const gradient = context.createLinearGradient(
          pointer.x,
          pointer.y,
          endX,
          endY,
        );
        gradient.addColorStop(0, ray.color);
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        context.strokeStyle = gradient;
        context.globalAlpha = shivering ? 1 : ambient ? 0.28 : 0.85;
        context.lineWidth = shivering ? 3.2 : 2;
        context.beginPath();
        context.moveTo(pointer.x, pointer.y);
        context.lineTo(endX, endY);
        context.stroke();

        // Perpendicular distance from a point to ray
        const near = (px: number, py: number, tolerance: number) => {
          const dx = px - pointer.x;
          const dy = py - pointer.y;
          if (dx * ray.dx + dy * ray.dy < 0) return false;
          return Math.abs(dx * -ray.dy + dy * ray.dx) < tolerance;
        };

        for (const ring of rings) {
          if (ring.color === ray.color && near(ring.x, ring.y, 12)) {
            burst(ring.x, ring.y, ring.color);
            ring.radius = -1;
            score += 1;
            setCaught(score);
          }
        }

        for (const flare of flares) {
          if (
            flare.color === ray.color &&
            near(flare.x, flare.y, flare.radius + 3)
          ) {
            // The disc's light re-entering the beam destabilises it
            burst(flare.x, flare.y, flare.color);
            shiverUntil = now + SHIVER_MS;
            flare.radius = -1;
            score = 0;
            setCaught(0);
          }
        }
      }
      context.globalAlpha = 1;

      rings = rings.filter((ring) => ring.radius > 0 && ring.x > -60);
      for (const ring of rings) {
        ring.x -= ring.speed;
        context.strokeStyle = ring.color;
        context.globalAlpha = ambient ? 0.3 : 0.7;
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        context.stroke();
      }

      flares = flares.filter(
        (flare) =>
          flare.radius > 0 &&
          flare.x > -40 &&
          flare.x < width + 40 &&
          flare.y > -40 &&
          flare.y < height + 40,
      );
      for (const flare of flares) {
        flare.x += flare.vx;
        flare.y += flare.vy;
        flare.radius += 0.05;
        context.strokeStyle = flare.color;
        context.globalAlpha = 0.95;
        context.lineWidth = 2;
        context.beginPath();
        context.arc(flare.x, flare.y, flare.radius, 0, Math.PI * 2);
        context.stroke();
      }

      particles = particles.filter((particle) => particle.life > 0);
      for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= 0.02;
        context.fillStyle = particle.color;
        context.globalAlpha = Math.max(particle.life, 0);
        context.fillRect(particle.x, particle.y, 2, 2);
      }

      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("resize", resize);

    // Suspend entirely once the hero scrolls away
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !running) {
          running = true;
          frame = requestAnimationFrame(tick);
        } else if (!entry.isIntersecting && running) {
          running = false;
          cancelAnimationFrame(frame);
        }
      },
      { threshold: 0 },
    );
    observer.observe(stage);

    // The hero dims as it leaves, and wash sinks slower than the mark
    const heroStage: HTMLDivElement = stage;
    let scrollQueued = false;
    function applyScroll() {
      scrollQueued = false;
      const height = heroStage.offsetHeight || 1;
      const past = Math.min(1, Math.max(0, window.scrollY / height));
      if (blobRef.current) {
        blobRef.current.style.opacity = (1 - past * 0.75).toFixed(3);
      }
      if (markTiltRef.current) {
        markTiltRef.current.style.opacity = (1 - past * 0.85).toFixed(3);
      }
    }
    function onScroll() {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(applyScroll);
    }
    applyScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <>
      <div ref={blobRef} className={styles.prismBlob} aria-hidden="true" />
      <div
        className={`${styles.staticRay} ${styles.rayRed}`}
        aria-hidden="true"
      />
      <div
        className={`${styles.staticRay} ${styles.rayLime}`}
        aria-hidden="true"
      />
      <div
        className={`${styles.staticRay} ${styles.rayIndigo}`}
        aria-hidden="true"
      />

      <div ref={stageRef} className={styles.prismStage} aria-hidden="true">
        <canvas ref={canvasRef} className={styles.prismCanvas} />
      </div>
      <div className={styles.prismScrim} aria-hidden="true" />

      <div className={styles.markStage} aria-hidden="true">
        <div ref={discAnchorRef} className={styles.discAnchor}>
          <div ref={discRef} className={styles.disc}>
            <div className={styles.discClip}>
              <div ref={discSpinRef} className={styles.discSpin} />
              <span className={styles.discVignette} />
            </div>
            <span className={styles.discRim} />
            <span ref={coreRef} className={styles.discCore} />
          </div>
        </div>

        <div ref={markTiltRef} className={styles.markTilt}>
          <div ref={markSpinRef} className={styles.markSpin}>
            {animated ? (
              EXTRUSION.map((layer) => (
                <IconCCLogo
                  key={layer.z}
                  width={150}
                  height={201}
                  fill={layer.fill}
                  className={styles.markLayer}
                  style={{ transform: `translateZ(${layer.z}px)` }}
                />
              ))
            ) : (
              <IconCCLogo
                width={150}
                height={201}
                fill="currentColor"
                className={styles.markLayer}
              />
            )}
          </div>
        </div>
      </div>

      {animated && (
        <p className={styles.caught}>
          {caught === 0 ? "move to split the light" : `refracted ${caught}`}
        </p>
      )}
    </>
  );
}
