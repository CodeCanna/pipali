// Faithful port of the desktop app's Three.js loading animation
// Ribbon rotates on X-axis, transforms into a pulsing ring when resolved

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const CANVAS_WIDTH = 200;
const CANVAS_HEIGHT = 80;
const LENGTH = 30;
const RADIUS = 5.6;
const PI2 = Math.PI * 2;
const ROTATE_VALUE = 0.035;
const STEP_INCREMENT = 2.5;
const BRAND_RED = 0xe63946;

// Parametric ribbon curve (same as desktop)
class RibbonCurve extends THREE.Curve<THREE.Vector3> {
    constructor() { super(); }
    override getPoint(percent: number): THREE.Vector3 {
        const x = LENGTH * Math.sin(PI2 * percent);
        const y = RADIUS * Math.cos(PI2 * 3 * percent);

        let t = (percent % 0.25) / 0.25;
        t = (percent % 0.25) - (2 * (1 - t) * t * -0.0185 + t * t * 0.25);
        if (Math.floor(percent / 0.25) === 0 || Math.floor(percent / 0.25) === 2) {
            t *= -1;
        }
        const z = RADIUS * Math.sin(PI2 * 2 * (percent - t));

        return new THREE.Vector3(x, y, z);
    }
}

function easing(t: number, b: number, c: number, d: number): number {
    const halfD = d / 2;
    let n = t / halfD;
    if (n < 1) return (c / 2) * n * n + b;
    n -= 2;
    return (c / 2) * (n * n * n + 2) + b;
}

interface RibbonAnimationProps {
    resolved: boolean;
}

export function RibbonAnimation({ resolved }: RibbonAnimationProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const resolvedRef = useRef(resolved);

    useEffect(() => {
        resolvedRef.current = resolved;
    }, [resolved]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Scene setup
        const camera = new THREE.PerspectiveCamera(65, CANVAS_WIDTH / CANVAS_HEIGHT, 1, 10000);
        camera.position.z = 50;

        const scene = new THREE.Scene();
        const group = new THREE.Group();
        scene.add(group);

        // Ribbon mesh (tube geometry with parametric curve)
        const mesh = new THREE.Mesh(
            new THREE.TubeGeometry(new RibbonCurve(), 200, 1.1, 2, true),
            new THREE.MeshBasicMaterial({ color: BRAND_RED })
        );
        group.add(mesh);

        // Read page background color and track bg-colored materials for theme sync
        function readBgColor(): THREE.Color {
            const hex = getComputedStyle(document.documentElement)
                .getPropertyValue('--color-bg-elevated').trim() || '#ffffff';
            return new THREE.Color(hex);
        }
        const bgMaterials: THREE.MeshBasicMaterial[] = [];

        // Ringcover (background-colored plane to mask ribbon behind ring)
        const ringcoverMat = new THREE.MeshBasicMaterial({ color: readBgColor(), opacity: 0, transparent: true });
        bgMaterials.push(ringcoverMat);
        const ringcover = new THREE.Mesh(new THREE.PlaneGeometry(50, 15, 1), ringcoverMat);
        ringcover.position.x = LENGTH + 1;
        ringcover.rotation.y = Math.PI / 2;
        group.add(ringcover);

        // Ring (appears when resolved)
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(4.3, 5.55, 32),
            new THREE.MeshBasicMaterial({ color: BRAND_RED, opacity: 0, transparent: true })
        );
        ring.position.x = LENGTH + 1.1;
        ring.rotation.y = Math.PI / 2;
        group.add(ring);

        // Shadow planes behind the ribbon (softens depth at crossover)
        for (let i = 0; i < 10; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: readBgColor(), transparent: true, opacity: 0.15 });
            bgMaterials.push(mat);
            const plain = new THREE.Mesh(new THREE.PlaneGeometry(LENGTH * 2 + 1, RADIUS * 3, 1), mat);
            plain.position.z = -2.5 + i * 0.5;
            group.add(plain);
        }

        // Renderer with page background color
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT);
        renderer.setClearColor(readBgColor());
        container.appendChild(renderer.domElement);

        // Sync background color on theme change
        function syncBgColor() {
            const c = readBgColor();
            renderer.setClearColor(c);
            for (const mat of bgMaterials) mat.color.copy(c);
        }
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        mql.addEventListener('change', syncBgColor);
        const observer = new MutationObserver(syncBgColor);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        // Animation state
        let animatestep = 0;
        let acceleration = 0;
        let pulseTime = 0;
        let lastTime = 0;
        let animationId: number;

        function render(dt: number) {
            const toend = resolvedRef.current;
            animatestep = Math.max(0, Math.min(240, toend ? animatestep + STEP_INCREMENT : animatestep - (STEP_INCREMENT * 1.4)));
            acceleration = easing(animatestep, 0, 1, 240);

            if (acceleration > 0.35) {
                const progress = (acceleration - 0.35) / 0.65;
                group.rotation.y = (-Math.PI / 2) * progress;
                group.position.z = -5 * progress;

                // Fade ribbon out, ringcover and ring in (matches desktop)
                const progressOpacity = Math.max(0, (acceleration - 0.99) / 0.01);
                (mesh.material as THREE.MeshBasicMaterial).opacity = 1 - progressOpacity;
                mesh.material.transparent = progressOpacity > 0;
                (ringcover.material as THREE.MeshBasicMaterial).opacity = progressOpacity;
                (ring.material as THREE.MeshBasicMaterial).opacity = progressOpacity;
                ring.scale.x = ring.scale.y = 0.9 + 0.1 * progressOpacity;

                if (animatestep >= 240) {
                    pulseTime += dt;
                    const pulse = 1 + 0.10 * Math.sin(pulseTime * 1.05);  // Completes one breath cycles in ~6s (2π / 1.05)
                    ring.scale.x = ring.scale.y = pulse;
                }
            } else {
                group.rotation.y = 0;
                group.position.z = 0;
                (mesh.material as THREE.MeshBasicMaterial).opacity = 1;
                mesh.material.transparent = false;
                (ringcover.material as THREE.MeshBasicMaterial).opacity = 0;
                (ring.material as THREE.MeshBasicMaterial).opacity = 0;
                pulseTime = 0;
            }

            renderer.render(scene, camera);
        }

        function animate(time: number) {
            const dt = lastTime ? (time - lastTime) / 1000 : 0.016;
            lastTime = time;
            mesh.rotation.x += ROTATE_VALUE + acceleration*Math.sin(Math.PI*acceleration);
            render(dt);
            animationId = requestAnimationFrame(animate);
        }

        animationId = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(animationId);
            observer.disconnect();
            mql.removeEventListener('change', syncBgColor);
            group.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                    obj.geometry.dispose();
                    (obj.material as THREE.Material).dispose();
                }
            });
            renderer.dispose();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className="ribbon-animation"
            aria-hidden="true"
        />
    );
}
