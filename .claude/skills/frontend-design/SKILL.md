# frontend-design

A skill for creating distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics.

## Activation

Auto-activates when building UI components, pages, or any frontend interface.

## Process

Before writing any frontend code, work through these four questions:

1. **Purpose** — What problem does this solve? Who uses it? In what context?
2. **Tone** — Pick an intentional aesthetic direction: brutalist, maximalist, retro-futuristic, luxury, playful, organic, editorial, clinical, kinetic, etc.
3. **Constraints** — What technical requirements apply? (framework, browser support, performance budget)
4. **Differentiation** — What one visual or interactive detail will make this memorable?

## Design Execution

### Typography
- Choose distinctive, beautiful fonts — avoid Arial, Inter, Roboto, or any generic system font
- Pair a display/expressive font with a refined body font
- Apply tight tracking (`-0.03em` to `-0.05em`) on large headings
- Use generous line-height (`1.6`–`1.8`) on body copy
- Scale type intentionally — establish a clear hierarchy with at least 4 size steps

### Color & Theme
- Commit fully to a cohesive aesthetic using CSS custom properties
- Use dominant colors with sharp, unexpected accents — avoid timid, safe palettes
- Derive a full scale from a single brand hue (light, mid, dark, tint, tint-2)
- Avoid clichés: purple gradients on white, teal on dark, indigo-500 as primary

### Motion & Animation
- Only animate `transform` and `opacity` — never `transition-all`
- One well-orchestrated page load with staggered reveals beats scattered micro-interactions
- Use spring-style easing (`cubic-bezier(0.34, 1.56, 0.64, 1)` or similar)
- Add scroll-triggered reveals and meaningful hover states on all interactive elements
- Every clickable element needs hover, focus-visible, and active states

### Spatial Composition
- Break the grid intentionally: asymmetry, overlap, diagonal flow
- Use generous negative space to create breathing room and hierarchy
- Layer elements at different z-planes (base → elevated → floating)
- Avoid centering everything — use offset, anchored, and edge-aligned layouts

### Backgrounds & Depth
- Layer multiple radial gradients for atmospheric depth
- Add grain/texture via SVG `feTurbulence` noise filter
- Use layered, color-tinted shadows with low opacity (never flat `box-shadow`)
- Apply gradient overlays on images (`background: linear-gradient(to top, rgba(0,0,0,0.6), transparent)`)

### What to Avoid
- Generic "AI slop" — stock layouts, default components, predictable patterns
- Overused fonts (Inter, Poppins as default, Montserrat for headings)
- Clichéd color schemes and default Tailwind palette as primary colors
- Flat, same-plane surfaces with no depth system
- Transitions on all properties (`transition-all`)
- Adding features or sections not in the brief

## Core Principle

Match implementation complexity to the aesthetic vision. Bold maximalism and refined minimalism both work — the key is **intentionality**, not intensity. Every choice should be defensible: "I chose this because..."
