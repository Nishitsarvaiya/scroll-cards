import './style.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import CircularCarousel from './carousel.js';

gsap.registerPlugin(ScrollTrigger, SplitText);

/* =====================================================================
 * 1. DATA
 * ===================================================================== */

// 7 interior-design images from Unsplash (3/4-friendly crops).
const IMAGES = [
	'/images/1.avif',
	'/images/2.avif',
	'/images/3.avif',
	'/images/4.avif',
	'/images/5.avif',
	'/images/6.avif',
	'/images/7.avif',
];

const CARD_COUNT = IMAGES.length;

/* ---------------------------------------------------------------------
 * CARD STATES — drop your provided x / y / rotation values here.
 *
 * x, y are pixel offsets from the CENTER of the viewport.
 * rotation is in degrees. One entry per card (index 0..6).
 *
 * Values below are sensible placeholders so it runs out of the box;
 * replace them with the exact numbers you provide.
 * ------------------------------------------------------------------- */

// NOTE: x / y are percentages of each card's OWN size, applied on top of the
// xPercent/yPercent:-50 centering. rotate is degrees, scale is unitless.

// State 1: SHUFFLE — bottom edge, half-overflowing, randomised rotation.
const SHUFFLE = [
	{ x: '130%', y: '100%', rotate: -9.71, scale: 1 },
	{ x: '-160%', y: '115%', rotate: -5.41, scale: 1 },
	{ x: '60%', y: '90%', rotate: 7, scale: 1 },
	{ x: '0%', y: '83%', rotate: -4.4, scale: 1 },
	{ x: '-85%', y: '88%', rotate: 19.81, scale: 1 },
	{ x: '-140%', y: '95%', rotate: 9.69, scale: 1 },
	{ x: '140%', y: '115%', rotate: 22.79, scale: 1 },
];

// State 2: SPREAD — fan around the edges, leaving the center clear.
const SPREAD = [
	{ x: '160%', y: '70%', rotate: 9.38, scale: 0.65 },
	{ x: '-160%', y: '65%', rotate: 41.1, scale: 0.65 },
	{ x: '0%', y: '80%', rotate: -10.42, scale: 0.65 },
	{ x: '120%', y: '-80%', rotate: -16.05, scale: 0.65 },
	{ x: '220%', y: '-20%', rotate: 9.68, scale: 0.65 },
	{ x: '-240%', y: '-20%', rotate: -16.15, scale: 0.65 },
	{ x: '-100%', y: '-85%', rotate: 19.85, scale: 0.65 },
];

// State 3: DROP — keep each card's x/rotate/scale, fall fully below viewport.
const DROP = SPREAD.map((s) => ({
	x: s.x,
	y: '300%',
	rotate: s.rotate,
	scale: s.scale,
}));

// Content per state. Title is split so one word can render faded/grey.
const CONTENT = {
	shuffle: {
		title: ['Curated with ', 'intention', ' and care'],
		text: 'Every great space begins with a collection of ideas, materials, and inspiration.',
		top: '25vh',
	},
	spread: {
		title: ['Refined through ', 'thoughtful', ' decisions'],
		text: 'Thoughtful decisions bring clarity, balance, and character to every detail.',
		top: 'center',
	},
	drop: {
		title: ['Made to feel ', 'Effortlessly', ' Timeless'],
		text: 'The final composition feels effortless, refined, and distinctly timeless.',
		top: '20vh',
	},
};

/* =====================================================================
 * 2. BUILD DOM
 * ===================================================================== */

const cardsEl = document.getElementById('cards');
const cardEls = IMAGES.map((src, i) => {
	const card = document.createElement('div');
	card.className = 'card';
	const img = new Image();
	img.src = src;
	img.alt = `Interior design ${i + 1}`;
	img.loading = i < 3 ? 'eager' : 'lazy';
	img.decoding = 'async';
	card.appendChild(img);
	cardsEl.appendChild(card);
	return card;
});

// Center every card, then set its SHUFFLE start state.
gsap.set(cardEls, { xPercent: -50, yPercent: -50 });
applyState(SHUFFLE);

function applyState(state) {
	state.forEach((s, i) => {
		gsap.set(cardEls[i], { x: s.x, y: s.y, rotation: s.rotate, scale: s.scale });
	});
}

// Content text helpers.
const contentNodes = {
	wrap: document.getElementById('content'),
	title: document.querySelector('[data-content="title"]'),
	text: document.querySelector('[data-content="text"]'),
};

let activeSplits = [];
let activeTween;

function clearSplits() {
	activeSplits.forEach((s) => s.revert());
	activeSplits = [];
}

// Reveal a content slot: words rise into place from below the mask.
function enter(c, onDone) {
	clearSplits();

	// Vertical placement: 'center' uses flex centering, otherwise anchor from top.
	if (c.top === 'center') {
		gsap.set(contentNodes.wrap, { justifyContent: 'center', paddingTop: 0 });
	} else {
		gsap.set(contentNodes.wrap, { justifyContent: 'flex-start', paddingTop: c.top });
	}

	const [pre, faded, post] = c.title;
	contentNodes.title.innerHTML = `${pre}<span class="faded">${faded}</span>${post}`;
	contentNodes.text.textContent = c.text;

	const titleSplit = new SplitText(contentNodes.title, { type: 'words', mask: 'words' });
	const textSplit = new SplitText(contentNodes.text, { type: 'words', mask: 'words' });
	activeSplits = [titleSplit, textSplit];

	activeTween = gsap.from([...titleSplit.words, ...textSplit.words], {
		yPercent: 110,
		duration: 1,
		ease: 'expo.out',
		stagger: 0.04,
		force3D: true,
		onComplete: onDone,
	});
}

// Exit current words upward out of the mask, then release the splits.
function exit(onDone) {
	if (!activeSplits.length) {
		onDone?.();
		return;
	}
	activeTween = gsap.to(
		activeSplits.flatMap((s) => s.words),
		{
			yPercent: -110,
			duration: 0.4,
			ease: 'expo.in',
			stagger: 0.03,
			force3D: true,
			onComplete: onDone,
		},
	);
}

/* Progress → which content slot is on screen.
 *   < 0.08           shuffle
 *   0.08 – 0.38      (gap: shuffle has exited, spread not yet in)
 *   0.38 – 0.5       spread
 *   0.5 – 0.8        (gap)
 *   >= 0.8           drop
 * Wider gaps give each exit room to finish before the next enter.
 * Symmetric in reverse. */
function slotForProgress(p) {
	if (p < 0.08) return 'shuffle';
	if (p >= 0.3 && p < 0.6) return 'spread';
	if (p >= 0.8) return 'drop';
	return null;
}

// State machine. `currentSlot` is what's on screen; `targetSlot` is where the
// scroll wants to be. We always run a transition to completion, then step
// toward the latest target — so no transition is ever cut, at any scroll speed.
let currentSlot = null;
let targetSlot = 'shuffle';
let isAnimating = false;

function step() {
	if (isAnimating || targetSlot === currentSlot) return;
	isAnimating = true;

	if (currentSlot !== null) {
		// Something is on screen — it must exit before anything new enters.
		exit(() => {
			currentSlot = null;
			isAnimating = false;
			step(); // re-evaluate against the latest target
		});
	} else {
		// Stage is clear — enter whatever the target currently is.
		const slot = targetSlot;
		enter(CONTENT[slot], () => {
			currentSlot = slot;
			isAnimating = false;
			step();
		});
	}
}

function updateContent(p) {
	targetSlot = slotForProgress(p);
	step();
}

// Intro on load: content reveals, cards slide up from below into SHUFFLE.
step();
gsap.from(cardEls, {
	y: '250%', // start below the viewport (relative to card height)
	duration: 1.6,
	delay: 0.4,
	ease: 'elastic.out(1, 0.7)',
	stagger: {
		amount: 0.24,
		from: 'center',
	},
	force3D: true,
});

/* =====================================================================
 * 3. LENIS SMOOTH SCROLL  ↔  SCROLLTRIGGER
 * ===================================================================== */

const lenis = new Lenis({
	lerp: 0.06,
	smoothWheel: true,
});

// Drive Lenis from GSAP's ticker so scroll + animation share one RAF loop.
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

/* =====================================================================
 * 4. SCRUBBABLE TIMELINE
 * ===================================================================== */

const tl = gsap.timeline({
	defaults: { ease: 'power3.out', easeReverse: 'power3.in' },
	scrollTrigger: {
		trigger: '#scroll-track',
		start: 'top top',
		end: 'bottom bottom',
		scrub: 1, // smooth, reversible scrub (forwards & backwards)
		// Exit / enter content at fixed progress points, plus reveal the carousel.
		onUpdate: (self) => {
			updateContent(self.progress);
			updateCarousel?.(self.progress);
		},
	},
});

// --- Segment A: SHUFFLE → SPREAD (cards fan out, content stays) ---
SPREAD.forEach((s, i) => {
	tl.to(
		cardEls[i],
		{
			x: s.x,
			y: s.y,
			rotation: s.rotate,
			scale: s.scale,
			ease: 'power3.inOut',
			easeReverse: 'power3.inOut',
			force3D: true,
		},
		0,
	);
});

// --- Segment B: SPREAD → DROP (cards fall away) ---
const dropStart = 1; // position label after segment A
DROP.forEach((s, i) => {
	tl.to(
		cardEls[i],
		{
			x: s.x,
			y: s.y,
			rotation: s.rotate,
			scale: s.scale,
			ease: 'power3.in',
			easeReverse: 'power3.out',
			force3D: true,
		},
		dropStart + i * 0.04, // slight stagger for a cascading drop
	);
});

/* =====================================================================
 * 5. CIRCULAR CAROUSEL — 14 slides (7 images, repeated), draggable + inertia
 * ===================================================================== */

const CAROUSEL_COUNT = 14;
const carouselEl = document.getElementById('carousel');

const slideEls = [];
for (let i = 0; i < CAROUSEL_COUNT; i++) {
	const slide = document.createElement('div');
	slide.className = 'carousel__slide';
	slide.setAttribute('js-slide', '');
	const img = new Image();
	img.src = IMAGES[i % CARD_COUNT];
	img.alt = `Interior design ${(i % CARD_COUNT) + 1}`;
	img.loading = 'lazy';
	img.decoding = 'async';
	slide.appendChild(img);
	carouselEl.appendChild(slide);
	slideEls.push(slide);
}

const carousel = new CircularCarousel(carouselEl, slideEls);

// The carousel reveals (fans up from the bottom) once the drop is essentially
// done, and collapses again if you scroll back up — so it's fully reversible.
const CAROUSEL_PROGRESS = 0.92;
function updateCarousel(p) {
	if (p >= CAROUSEL_PROGRESS) carousel.show();
	else carousel.hide();
}

/* =====================================================================
 * 6. HOUSEKEEPING
 * ===================================================================== */

// Recalculate positions if the viewport changes.
window.addEventListener('resize', () => {
	ScrollTrigger.refresh();
	carousel.resize();
});
