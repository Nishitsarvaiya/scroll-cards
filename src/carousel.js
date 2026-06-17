import gsap from 'gsap';

const TWO_PI = Math.PI * 2;
const RADIUS_X = 0.43; // fraction of vw
const RADIUS_Y = 0.6; // fraction of vh
const DEPTH = 0; // fraction of vh — z travel front-to-back

// Inertia — friction is smoothstep-modulated so the carousel glides naturally
const FRICTION_SLOW = 0.93; // friction at near-zero speed  → stops quickly
const FRICTION_FAST = 0.97; // friction at peak speed       → glides longer
const MAX_SPEED = 0.002; // radians/frame for normalising the smoothstep input

function smoothstep(t) {
	t = Math.max(0, Math.min(1, t));
	return t * t * (3 - 2 * t);
}

export default class CircularCarousel {
	constructor(carousel, slides) {
		this.carousel = carousel;
		this.slides = slides;
		this.count = slides.length;
		this.rotation = 0; // radians — current orbit offset
		this._velocity = 0; // radians/frame — used by inertia ticker
		this._velBuffer = []; // rolling window of recent deltas for smoother release
		this._inertiaFn = null;
		this._removeListeners = null;
		this._enterTl = null;
		this.shown = false;

		// Base (stacked) state: piled at the bottom-centre, off-screen.
		gsap.set(this.slides, {
			xPercent: -50,
			yPercent: -50,
			left: '50%',
			top: '135%',
		});
	}

	// ─── geometry ────────────────────────────────────────────────────────────

	_posFor(i) {
		const angle = (TWO_PI / this.count) * i - Math.PI / 2 + this.rotation;
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		const x = Math.cos(angle) * RADIUS_X * vw;
		const y = Math.sin(angle) * RADIUS_Y * vh;

		const depth = Math.sin(angle); // -1 (top/far) … +1 (bottom/near)
		const nearness = (depth + 1) / 2; //  0 … 1

		const z = depth * DEPTH * vh;
		const scale = 1 + 0.15 * nearness;
		const rotateY = -Math.cos(angle) * 20;
		const rotate = Math.atan2(RADIUS_Y * vh * Math.cos(angle), -RADIUS_X * vw * Math.sin(angle)) * (180 / Math.PI);

		return { x, y, z, scale, rotate, rotateY };
	}

	// Möbius-strip z-order. Each slide overlaps the next one in the same
	// rotational direction; the wrap seam sits at the bottom of the orbit
	// (off-screen). Assigning z by RANK (not floor) guarantees strictly
	// distinct values, so adjacent slides can never tie and flicker.
	_normalizedPos(i) {
		return ((((TWO_PI / this.count) * i + this.rotation - Math.PI) % TWO_PI) + TWO_PI) % TWO_PI;
	}

	_applyZ() {
		const order = this.slides.map((_, i) => ({ i, np: this._normalizedPos(i) })).sort((a, b) => a.np - b.np);
		order.forEach((o, rank) => gsap.set(this.slides[o.i], { zIndex: rank + 1 }));
	}

	_updatePositions() {
		this.slides.forEach((slide, i) => gsap.set(slide, this._posFor(i)));
		this._applyZ();
	}

	// ─── show / hide (driven by scroll) ───────────────────────────────────────

	show() {
		if (this.shown) return;
		this.shown = true;

		this._exitTl?.kill();
		this._exitTl = null;

		this._applyZ(); // z-order is static during the entrance (rotation fixed)

		this._enterTl = gsap.timeline({
			onComplete: () => {
				this._initDrag();
				this.carousel.classList.add('is-active');
			},
		});

		this.slides.forEach((slide, i) => {
			this._enterTl.to(slide, { ...this._posFor(i), duration: 1.6, ease: 'expo.out' }, (i / this.count) * 0.05);
		});
	}

	hide() {
		if (!this.shown) return;
		this.shown = false;

		// Stop interaction immediately; let the slides animate back out.
		this._enterTl?.kill();
		this._stopInertia();
		this._removeListeners?.();
		this.carousel.classList.remove('is-active', 'is-dragging');
		this._velocity = 0;
		this._velBuffer = [];

		// Animate the slides back down into the stacked, off-screen base state,
		// mirroring the entrance so the exit reads just as smoothly.
		this._exitTl = gsap.timeline({
			onComplete: () => {
				this.rotation = 0;
				gsap.set(this.slides, { clearProps: 'zIndex' });
			},
		});

		this.slides.forEach((slide, i) => {
			this._exitTl.to(
				slide,
				{
					x: 0,
					y: 0,
					z: 0,
					scale: 1,
					rotate: 0,
					rotateY: 0,
					duration: 0.7,
					ease: 'power3.inOut',
				},
				(i / this.count) * 0.04,
			);
		});
	}

	resize() {
		if (this.shown) this._updatePositions();
	}

	// ─── drag ────────────────────────────────────────────────────────────────

	_initDrag() {
		this._removeListeners?.();

		const el = this.carousel;
		let isDragging = false;
		let prevX = 0;

		const onDown = (e) => {
			isDragging = true;
			prevX = e.clientX;
			this._velocity = 0;
			this._velBuffer = [];
			this._stopInertia();
			el.classList.add('is-dragging');
			el.setPointerCapture(e.pointerId);
		};

		const onMove = (e) => {
			if (!isDragging) return;
			const delta = e.clientX - prevX;
			prevX = e.clientX;
			// Convert px delta to radians (one full viewport width = one revolution)
			const dr = (delta / window.innerWidth) * TWO_PI;
			this.rotation += dr;
			// Rolling window of last 6 frames — release velocity = average, not last instant
			this._velBuffer.push(dr);
			if (this._velBuffer.length > 6) this._velBuffer.shift();
			this._updatePositions();
		};

		const onUp = () => {
			if (!isDragging) return;
			isDragging = false;
			el.classList.remove('is-dragging');
			// Average the buffer so a momentary slow-down before release keeps the throw
			if (this._velBuffer.length > 0) {
				this._velocity = this._velBuffer.reduce((a, b) => a + b, 0) / this._velBuffer.length;
			}
			this._startInertia();
		};

		el.addEventListener('pointerdown', onDown);
		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerup', onUp);
		el.addEventListener('pointercancel', onUp);

		this._removeListeners = () => {
			el.removeEventListener('pointerdown', onDown);
			el.removeEventListener('pointermove', onMove);
			el.removeEventListener('pointerup', onUp);
			el.removeEventListener('pointercancel', onUp);
			this._removeListeners = null;
		};
	}

	// ─── inertia ─────────────────────────────────────────────────────────────

	_startInertia() {
		const tick = () => {
			if (Math.abs(this._velocity) < 1e-5) {
				this._stopInertia();
				return;
			}

			this.rotation += this._velocity;
			this._updatePositions();

			// smoothstep maps speed → [0,1]; fast = higher friction coeff so fast
			// throws glide longer, slow drags snap to a stop quickly.
			const t = smoothstep(Math.abs(this._velocity) / MAX_SPEED);
			const friction = FRICTION_SLOW + (FRICTION_FAST - FRICTION_SLOW) * t;
			this._velocity *= friction;
		};

		this._inertiaFn = tick;
		gsap.ticker.add(tick);
	}

	_stopInertia() {
		if (this._inertiaFn) {
			gsap.ticker.remove(this._inertiaFn);
			this._inertiaFn = null;
		}
	}

	destroy() {
		this._removeListeners?.();
		this._stopInertia();
		this._enterTl?.kill();
		this._exitTl?.kill();
	}
}
