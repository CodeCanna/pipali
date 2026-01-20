// Three.js OS1-style loading animation
let $wrap = document.getElementById('loading-animation'),

canvassize = 380,

length = 30,
radius = 5.6,

rotatevalue = 0.035,
acceleration = 0,
animatestep = 0,
toend = false,

pi2 = Math.PI*2,

group = new THREE.Group(),
mesh, ringcover, ring,

camera, scene, renderer;


camera = new THREE.PerspectiveCamera(65, 1, 1, 10000);
camera.position.z = 150;

scene = new THREE.Scene();
scene.add(group);

// Pipali brand colors
const PIPALI_RED = 0xe63946;
// Detect system theme for background color
const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
const PIPALI_BG = isDarkMode ? '#121212' : '#fafafa';

mesh = new THREE.Mesh(
    new THREE.TubeGeometry(new (THREE.Curve.create(function() {},
        function(percent) {

            let x = length*Math.sin(pi2*percent),
                y = radius*Math.cos(pi2*3*percent),
                z, t;

            t = percent%0.25/0.25;
            t = percent%0.25-(2*(1-t)*t* -0.0185 +t*t*0.25);
            if (Math.floor(percent/0.25) == 0 || Math.floor(percent/0.25) == 2) {
                t *= -1;
            }
            z = radius*Math.sin(pi2*2* (percent-t));

            return new THREE.Vector3(x, y, z);

        }
    ))(), 200, 1.1, 2, true),
    new THREE.MeshBasicMaterial({
        color: PIPALI_RED
    })
);
group.add(mesh);

ringcover = new THREE.Mesh(new THREE.PlaneGeometry(50, 15, 1), new THREE.MeshBasicMaterial({color: PIPALI_BG, opacity: 0, transparent: true}));
ringcover.position.x = length+1;
ringcover.rotation.y = Math.PI/2;
group.add(ringcover);

ring = new THREE.Mesh(new THREE.RingGeometry(4.3, 5.55, 32), new THREE.MeshBasicMaterial({color: PIPALI_RED, opacity: 0, transparent: true}));
ring.position.x = length+1.1;
ring.rotation.y = Math.PI/2;
group.add(ring);

// fake shadow
(function() {
    let plain, i;
    for (i = 0; i < 10; i++) {
        plain = new THREE.Mesh(new THREE.PlaneGeometry(length*2+1, radius*3, 1), new THREE.MeshBasicMaterial({color: PIPALI_BG, transparent: true, opacity: 0.15}));
        plain.position.z = -2.5+i*0.5;
        group.add(plain);
    }
})();

renderer = new THREE.WebGLRenderer({
    antialias: true
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvassize, canvassize);
renderer.setClearColor(PIPALI_BG);


$wrap.appendChild(renderer.domElement);

// Called from Rust when server is ready
function start() {
    toend = true;
}

// Track time for pulse animation
let pulseTime = 0;

// Speed of ribbon to ring transformation
const stepIncrement = 2.5;

function render() {
    let progress;

    // Use faster step increment during transformation
    animatestep = Math.max(0, Math.min(240, toend ? animatestep+stepIncrement : animatestep-4));
    acceleration = easing(animatestep, 0, 1, 240);

    if (acceleration > 0.35) {
        progress = (acceleration-0.35)/0.65;
        group.rotation.y = -Math.PI/2 *progress;
        group.position.z = 50*progress;
        progress = Math.max(0, (acceleration-0.99)/0.01);
        mesh.material.opacity = 1-progress;
        ringcover.material.opacity = ring.material.opacity = progress;

        // When animation is complete, add gentle breathing pulse to the ring
        // Pulse should be subtle (±8%) around final scale of 1.0
        if (animatestep >= 240) {
            pulseTime += 0.016; // ~60fps, completes one breath cycle in ~4 seconds
            const pulse = 1 + 0.08 * Math.sin(pulseTime * 1.5);
            ring.scale.x = ring.scale.y = pulse;
        } else {
            ring.scale.x = ring.scale.y = 0.9 + 0.1*progress;
        }
    }

    renderer.render(scene, camera);

}

function animate() {
    mesh.rotation.x += rotatevalue + acceleration*Math.sin(Math.PI*acceleration);
    render();
    requestAnimationFrame(animate);
}

function easing(t, b, c, d) {
    if ((t /= d/2) < 1)
        return c/2*t*t+b;
    return c/2*((t-=2)*t*t+2)+b;
}

animate();
