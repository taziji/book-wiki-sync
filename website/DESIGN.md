---
name: Obsidian Slate
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#ccc3d8'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#958da1'
  outline-variant: '#4a4455'
  surface-tint: '#d2bbff'
  primary: '#d2bbff'
  on-primary: '#3f008e'
  primary-container: '#7c3aed'
  on-primary-container: '#ede0ff'
  inverse-primary: '#732ee4'
  secondary: '#b7c8e1'
  on-secondary: '#213145'
  secondary-container: '#3a4a5f'
  on-secondary-container: '#a9bad3'
  tertiary: '#c8c6c5'
  on-tertiary: '#303030'
  tertiary-container: '#676666'
  on-tertiary-container: '#e7e5e4'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#eaddff'
  primary-fixed-dim: '#d2bbff'
  on-primary-fixed: '#25005a'
  on-primary-fixed-variant: '#5a00c6'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#e5e2e1'
  tertiary-fixed-dim: '#c8c6c5'
  on-tertiary-fixed: '#1b1b1c'
  on-tertiary-fixed-variant: '#474746'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  h1:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  h3:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '500'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.6'
  mono-code:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  mono-label:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  gutter: 20px
  sidebar_width: 260px
---

## Brand & Style

This design system establishes a focused, cerebral environment for deep work, technical writing, and knowledge architecture. It blends the structural rigor of a code editor with the refined, illustrative clarity of a modern knowledge base.

The aesthetic is **Technical Minimalism**. It prioritizes information density and legibility through high-quality typography and a disciplined color palette. Visual interest is generated not through decorative elements, but through the beauty of organized data: file trees, syntax highlighting, and connected-node motifs that reference graph-based thinking.

The interface should feel like a "second brain"—quiet, responsive, and invisible until needed. It avoids the fleeting trends of typical SaaS platforms in favor of a timeless, utility-first dark mode that reduces eye strain during long sessions.

## Colors

The palette is anchored in deep, "ink-pool" blacks and charcoal grays to provide a high-contrast foundation for text.

- **Primary:** A vivid but soft purple (#7C3AED) used sparingly for focus states, primary actions, and "active node" connections.
- **Surface Tones:** Layers are defined by subtle shifts in charcoal values rather than heavy shadows. #1A1A1A acts as the primary container color against the #0F0F0F base.
- **Accents:** Slate grays provide a neutral bridge for secondary metadata and UI borders, ensuring the interface feels cohesive and understated.
- **Syntax Tones:** For technical blocks, use a spectrum of muted teals, oranges, and pinks that harmonize with the primary purple without competing for attention.

## Typography

This system utilizes a dual-font strategy to distinguish between "thought" (prose) and "structure" (system/code).

- **Inter:** Chosen for its exceptional legibility in dark modes. It is used for all narrative content, headings, and primary navigation. Headings feature tight tracking and a medium weight to feel authoritative.
- **JetBrains Mono:** Used for all technical UI elements, including file paths, code blocks, metadata labels, and the file tree. It provides a crisp, rhythmic "developer" feel that reinforces the Markdown-inspired nature of the design.

Line heights are generous (1.6x for body text) to ensure that dense documentation remains approachable and easy to scan.

## Layout & Spacing

The layout philosophy is based on **Functional Partitioning**. It utilizes a fixed-sidebar/fluid-content model reminiscent of IDEs and modern documentation tools.

- **Grid:** A standard 12-column grid is used for landing pages, but internal application views rely on a flexible 3-pane architecture (Navigation, Editor, Inspector).
- **Margins:** Large outer margins (48px+) are used for "Focus Mode" writing to center the content and minimize distractions.
- **Rhythm:** A 4px baseline grid ensures vertical consistency. Use 16px (md) for standard component spacing and 24px (lg) for section separation.
- **The "Node" Connection:** Where appropriate, use thin (1px) vertical and horizontal lines to connect related elements (like threaded comments or file nesting), mimicking a graph structure.

## Elevation & Depth

This system avoids heavy drop shadows, opting instead for **Tonal Tiering** and **Ghost Outlines**.

- **Level 0 (Base):** #0F0F0F - The canvas.
- **Level 1 (Panels):** #1A1A1A - Sidebars and secondary panels. Defined by a 1px solid border of #2D2D2D.
- **Level 2 (Overlays):** #262626 - Modals and dropdowns. These feature a subtle "ambient glow" shadow: a 20px blur with 40% opacity using the base background color to create soft separation.
- **Interactive States:** Use a 1px "inner-glow" border using a low-opacity version of the primary purple (#7C3AED) to indicate focus or selection.
- **Backdrop Blur:** For transient elements like command palettes, use a heavy backdrop blur (20px) on a semi-transparent surface to maintain context while focusing the user's attention.

## Shapes

The shape language is **Structured and Soft**. By using a "Soft" (4px - 12px) corner radius, the design system avoids the harshness of sharp technical tools while staying more professional than "bubbly" consumer apps.

- **Standard Elements (Buttons, Inputs):** 4px (rounded-sm) to maintain a precise, tool-like feel.
- **Containers (Cards, Modals):** 8px (rounded-md) to provide a gentle frame for content.
- **Feature Illustrative Elements:** 12px (rounded-lg) for large callouts or imagery containers.
- **Node Points:** Small circular elements (fully rounded) are used in graph views and list bullets to provide a organic contrast to the rectangular grid.

## Components

- **Buttons:** Primary buttons use a solid purple (#7C3AED) with white text. Secondary buttons are "Ghost" style—transparent backgrounds with a 1px slate-gray border that turns purple on hover.
- **Inputs:** Monospace text for input fields. Borders are subtle #2D2D2D, shifting to a purple glow on focus. No heavy fills.
- **The File Tree:** High-density list items using JetBrains Mono. Use subtle indentation guides (1px vertical lines) to show hierarchy.
- **Monospace Blocks:** Code and technical snippets are wrapped in a slightly lighter background (#1E1E1E) with a "Copy" utility visible only on hover.
- **Graph Nodes:** Small, circular nodes connected by 1px dimmed lines. The active node should pulse with a soft purple outer glow.
- **Chips/Tags:** Small, monospace labels with a low-opacity purple background (accent_soft) and a high-contrast purple border.
- **Markdown Preview:** Pro-style Markdown rendering with clear distinctions for blockquotes (purple left-border) and task-lists (custom square checkboxes).