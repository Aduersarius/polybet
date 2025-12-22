# Color System Refactor Summary

## Overview
All colors in the application have been centralized into a single source of truth located in `lib/colors/`.

## Structure

### Files Created
1. **`lib/colors/tokens.ts`** - Raw color token definitions
2. **`lib/colors/index.ts`** - Main export file with helper functions
3. **`lib/colors/tailwind.ts`** - Tailwind configuration integration

### Key Changes

#### 1. Centralized Color System
- All color values are now defined in `lib/colors/tokens.ts`
- Includes: primary, secondary, accent, error, warning, success, grays, chart colors, outcome colors, and category colors

#### 2. Updated Files
- **`tailwind.config.ts`** - Now imports colors from centralized system
- **`app/globals.css`** - Uses CSS variables (still need to be synced with tokens)
- **`lib/chart/colors.ts`** - Now re-exports from centralized system
- **`app/components/EventCard2.tsx`** - Uses `getCategoryColorClasses()` from centralized system
- **`app/components/PnLChart.tsx`** - Uses `colors.success` and `colors.error`
- **`app/components/admin/AdminStatistics.tsx`** - Uses `colors.gray` scale
- **`app/(app)/profile/page.tsx`** - Replaced `#1e1e1e` with `bg-zinc-800`
- **`app/components/TradingPanel.tsx`** - Uses `getOutcomeColor()` for dynamic colors

## Usage

### Import Colors
```typescript
import { colors, getOutcomeColor, getCategoryColorClasses } from '@/lib/colors';
```

### Common Patterns

#### Static Colors
```typescript
// Use semantic color names
<div style={{ backgroundColor: colors.primary }} />
<div className="bg-primary-500" /> // If using Tailwind classes
```

#### Dynamic Colors (Outcomes)
```typescript
const outcomeColor = getOutcomeColor(index);
<div style={{ backgroundColor: outcomeColor }} />
```

#### Category Colors
```typescript
// Returns Tailwind classes
const categoryClasses = getCategoryColorClasses('CRYPTO');
<Badge className={categoryClasses}>Crypto</Badge>
```

#### Inline Styles with Opacity
```typescript
import { rgba, getBgStyle } from '@/lib/colors';

// Using rgba helper
<div style={{ backgroundColor: rgba(colors.primary, 0.2) }} />

// Using style helper
<div style={getBgStyle(colors.primary, 0.2)} />
```

## Remaining Work

### Components That May Need Updates
Some components still have hardcoded colors that should be migrated:
- `app/components/OrderBook.tsx`
- `app/components/MultipleTradingPanel.tsx`
- `app/components/charts/OddsChartV2.tsx`
- `app/components/charts/controls/PeriodSelector.tsx`
- `app/components/charts/cursor/OddsCursor.tsx`
- `app/components/BalanceDropdown.tsx`
- `app/components/EditProfileModal.tsx`
- `app/components/EventChat.tsx`
- `app/components/admin/AdminSuggestedEvents.tsx`

### CSS Variables Sync
The CSS variables in `app/globals.css` should ideally be generated from the color tokens to ensure consistency. Currently they are manually maintained.

### Tailwind Dynamic Colors Note
For truly dynamic colors (computed at runtime), use inline styles instead of Tailwind classes, as Tailwind's JIT compiler needs to see full class names at build time.

## Benefits

1. **Single Source of Truth** - All colors defined in one place
2. **Easy Theme Changes** - Update colors in one file to change entire app
3. **Type Safety** - TypeScript ensures color usage is correct
4. **Consistency** - No more duplicate color definitions
5. **Maintainability** - Easy to find and update colors

## Migration Guide

When updating components:
1. Import colors from `@/lib/colors`
2. Replace hardcoded hex values with `colors.*` references
3. Replace hardcoded rgba with `rgba(colors.*, opacity)`
4. Use `getCategoryColorClasses()` for category badges
5. Use `getOutcomeColor(index)` for outcome colors


