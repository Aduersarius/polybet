export function computeYAxisDomain(opts: {
  chartData: any[];
  isMultipleOutcomes: boolean;
  outcomeKeys?: string[];
}): [number, number] {
  const { chartData, isMultipleOutcomes, outcomeKeys = [] } = opts;
  if (!chartData || chartData.length === 0) return [0, 100];

  let minValue = 100;
  let maxValue = 0;

  chartData.forEach((point) => {
    if (isMultipleOutcomes) {
      outcomeKeys.forEach((k) => {
        const v = point?.[k] ?? 0;
        minValue = Math.min(minValue, v);
        maxValue = Math.max(maxValue, v);
      });
    } else {
      const v = point?.value ?? 0;
      minValue = Math.min(minValue, v);
      maxValue = Math.max(maxValue, v);
    }
  });

  const range = maxValue - minValue;
  const padding = Math.max(range * 0.1, 5);

  return [Math.max(0, Math.floor(minValue - padding)), Math.min(100, Math.ceil(maxValue + padding))];
}

export function computeXAxisDomain(chartData: any[]): [number, number] | ['dataMin', 'dataMax'] {
  if (!chartData || chartData.length === 0) return ['dataMin', 'dataMax'];

  const timestamps = chartData
    .map((p: any) => p?.timestamp)
    .filter((ts: any) => typeof ts === 'number');
  if (timestamps.length === 0) return ['dataMin', 'dataMax'];

  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);
  const range = Math.max(maxTs - minTs, 60);
  const padding = Math.max(range * 0.05, 60);

  return [minTs - padding, maxTs + padding];
}


