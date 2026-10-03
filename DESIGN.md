# Design System: Healthy Jewellery Editorial UI

## 1. Visual Theme & Atmosphere
A restrained, gallery-airy interface with confident asymmetric layouts and fluid spring-physics motion. The atmosphere is clinical yet warm — like a well-lit architectural studio emphasizing real materials. Density is set to a balanced 4, with high layout variance (8) to break predictable grids. Motion (6) feels weighty, leveraging CSS transforms and glassmorphism to create spatial depth without overwhelming the product photography.

## 2. Color Palette & Roles
- **Canvas Void** (`#F7F5F1`) — Primary background surface (`--bg`).
- **Nacre Surface** (`#EDEAE4`) — Card and container fill (`--nacre`).
- **Ink Charcoal** (`#1A1714`) — Primary text, deep depth (`--ink`).
- **Graphite Steel** (`#6B6762`) — Secondary text, descriptions, metadata (`--graphite`).
- **Ash Border** (`#D8D3CB`) — Card borders, 1px structural lines (`--ash`).
- **Titanium Accent** (`#9DA7AF`) — Single accent for active states and subtle focus rings (`--titanium`).

*(Note: Restricted to 1 primary accent. Saturation < 80%. No purple/neon.)*

## 3. Typography Rules
- **Display:** `Barlow Condensed` — Track-tight, controlled scale, weight-driven hierarchy. Used for Editorial Heroes.
- **Body:** `DM Sans` — Relaxed leading (1.65), 65ch max-width, neutral secondary color.
- **Mono:** `DM Sans` (tabular nums) — For metadata, timestamps, or technical material specs.
- **Banned:** `Inter`, generic system fonts, and generic serifs (Times New Roman, Georgia, Garamond).

## 4. Component Stylings
* **Buttons:** Flat, no outer glow. Tactile -1px translate on active state with a minimum `0.3s ease-out` transition. Ghost/outline for secondary.
* **Cards:** Generously rounded corners. Diffused whisper shadow (`box-shadow: 0 20px 40px rgba(0,0,0,0.05)`). High-density: replace with border-top dividers.
* **Glassmorphism:** Overlays (like the scrolled header) use subtle translucency and background blur (`backdrop-filter: blur(12px)`).
* **Inputs:** Label above, error below. Focus ring in accent color (`2px solid var(--ink)`). No floating labels.
* **Loaders:** Skeletal shimmer matching exact layout dimensions. No generic circular spinners.
* **Empty States:** Composed, illustrated compositions indicating how to populate data — not just "No data" text.

## 5. Layout Principles
- **Grid-first Architecture:** Asymmetric splits for Hero sections.
- **Spatial Separation:** No overlapping elements — every element occupies its own clear spatial zone. No absolute-positioned content stacking (except intentional hero overlays).
- **Responsive Collapse:** Strict single-column collapse below 768px.
- **Containment:** Max-width containment. No flexbox percentage math. Generous internal padding.
- **Avoid Clichés:** No 3-column equal card layouts. Use 2-column zig-zag or asymmetric grids instead.

## 6. Motion & Interaction
- **Physics:** Spring physics for all interactive elements (weighty feel).
- **Staggered Orchestration:** Staggered cascade reveals for grids (e.g., Collection grids drop in like dominoes).
- **Performance:** Hardware-accelerated transforms only (`will-change: transform`). Never animate `top`, `left`, `width`, `height`.
- **Accessibility:** All animations must respect `@media (prefers-reduced-motion: reduce)`.

## 7. Anti-Patterns (Banned)
- **NO emojis anywhere.**
- **NO `Inter` font or generic serif fonts.**
- **NO pure black (`#000000`).**
- **NO neon/outer glow shadows or oversaturated accents.**
- **NO excessive gradient text on large headers.**
- **NO custom mouse cursors.**
- **NO overlapping elements** (clean spatial separation always).
- **NO 3-column equal card layouts.**
- **NO generic names** ("John Doe", "Acme", "Nexus").
- **NO fake round numbers** (`99.99%`, `50%`).
- **NO AI copywriting clichés** ("Elevate", "Seamless", "Unleash", "Next-Gen").
- **NO filler UI text** ("Scroll to explore", "Swipe down", scroll arrows, bouncing chevrons).
- **NO broken image links** (use placeholders like `picsum.photos` if needed, but prefer real editorial photos).
- **NO centered Hero sections.**
