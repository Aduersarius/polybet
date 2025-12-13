## Odds chart modularization (V2)

The original chart implementation lives in `app/components/OddsChart.tsx` and is intentionally kept as-is.

The new modular implementation lives under:

- `app/components/charts/` (React + Recharts integration)
- `lib/chart/` (pure helpers: formatting, domains, ticks, data shaping, colors)
- `hooks/` (data fetching + realtime)

### How to use `OddsChartV2`

Replace your existing import:

```tsx
import { NewPolymarketChart } from '@/app/components/OddsChart';
```

With:

```tsx
import { OddsChartV2 } from '@/app/components/charts/OddsChartV2';
```

And render it with the same props shape:

```tsx
<OddsChartV2
  eventId={eventId}
  eventType={eventType}
  outcomes={outcomes}
  liveOutcomes={liveOutcomes}
  currentYesPrice={currentYesPrice}
/>
```

### Notes

- `OddsChartV2` intentionally mirrors the existing styling and behavior.\n+- The cursor/tooltip logic is isolated in `app/components/charts/cursor/OddsCursor.tsx`.\n+- Chart calculations are in `lib/chart/*` to keep UI components simple.\n+

