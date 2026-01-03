# Premium Navy Rich Color Combination Guide

## New Color Scheme

### Background & Surface Colors

**Main Background**: `#0f1117`
- Premium deep rich navy - sophisticated and luxurious
- Dark but not too dark - perfect balance
- Creates depth with rich blue undertones
- No green tones - pure premium navy

**Event Card Surface**: `#1a1d28`
- Elevated surface with rich navy undertones
- Creates clear visual hierarchy with premium sophistication
- Maintains readability while being distinct from background
- Perfect contrast ratio for accessibility

**Elevated Surface**: `#232736`
- For modals, dialogs, and floating elements
- Higher elevation with lighter navy tones
- Maintains premium navy aesthetic at all levels

## Design Rationale

### Why This Combination Works

1. **Visual Hierarchy**: Clear distinction between background and cards
2. **Premium Sophistication**: Rich navy tones create luxurious, high-end feel
3. **Readability**: Excellent contrast ratios for text
4. **Balanced Darkness**: Dark enough to be "dire" but not too dark - perfect balance
5. **Brand Alignment**: Works beautifully with vibrant blue accents
6. **No Green**: Pure navy palette - no green undertones

### Color Psychology

- **Deep Navy Background**: Creates focus, premium feel, professional luxury
- **Rich Navy Surface**: Suggests sophistication, trust, reliability
- **Pure Blue Tones**: Adds depth and elegance without distraction

## Usage

### In Components

```typescript
import { colors } from '@/lib/colors';

// Background
<div style={{ backgroundColor: colors.background }} />

// Event Card
<div className="bg-surface" /> // Uses CSS variable
// or
<div style={{ backgroundColor: colors.surface }} />

// Elevated Surface (modals)
<div style={{ backgroundColor: colors.surfaceElevated }} />
```

### CSS Variables

```css
background: var(--background); /* #0d0d11 */
background: var(--surface); /* #1a1a24 */
background: var(--surface-elevated); /* #22222e */
```

### Tailwind Classes

```tsx
<div className="bg-background" /> {/* Uses Tailwind config */}
<div className="bg-surface" /> {/* If configured */}
<div className="bg-zinc-800" /> {/* Maps to surface color */}
```

## Contrast Ratios

- Background to Surface: ~1.6:1 (visual separation)
- Surface to White Text: ~12:1 (excellent readability)
- Background to White Text: ~15:1 (excellent readability)

## Migration Notes

All components using `bg-zinc-800` or `bg-[#1e1e1e]` should now use:
- `bg-surface` (CSS variable)
- `colors.surface` (TypeScript import)
- `bg-zinc-800` (Tailwind - now maps to new surface color)

