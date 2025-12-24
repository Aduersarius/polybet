'use client';

import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { ColoredOutcome } from '@/lib/chart/colors';

type OutcomeSelectorProps = {
    outcomes: Array<ColoredOutcome<{ id: string; name: string; probability: number }>>;
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
    currentValues: Record<string, number>;
    hoveredDataPoint: any | null;
};

export function OutcomeSelector({
    outcomes,
    selectedIds,
    onToggle,
    currentValues,
    hoveredDataPoint,
}: OutcomeSelectorProps) {
    return (
        <div className="flex-none border-b border-white/5 bg-[#1a1d28] py-2">
            <div className="flex items-center gap-3 px-4">
                {/* Scrollable Outcomes */}
                <ScrollArea className="flex-1 whitespace-nowrap">
                    <div className="flex w-max items-center gap-2 pb-2">
                        {outcomes.map((o) => {
                            const value = hoveredDataPoint
                                ? (hoveredDataPoint[`outcome_${o.id}`] || 0)
                                : (currentValues[`outcome_${o.id}`] || 0);
                            const isSelected = selectedIds.has(o.id);

                            return (
                                <button
                                    key={o.id}
                                    onClick={() => onToggle(o.id)}
                                    className={cn(
                                        "flex items-center gap-2 px-2.5 py-1 rounded-full border transition-all text-xs",
                                        isSelected
                                            ? "bg-white/5 border-white/10"
                                            : "bg-transparent border-transparent opacity-50 hover:opacity-80 hover:bg-white/5"
                                    )}
                                >
                                    <div
                                        className="h-2 w-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: isSelected ? o.color : '#666' }}
                                    />
                                    <span className={cn(
                                        "font-medium truncate max-w-[120px]",
                                        isSelected ? "text-gray-200" : "text-gray-400"
                                    )}>
                                        {o.name}
                                    </span>
                                    <span className="font-bold tabular-nums" style={{ color: isSelected ? o.color : '#666' }}>
                                        {Math.round(value)}%
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <ScrollBar orientation="horizontal" className="h-2" />
                </ScrollArea>
            </div>
        </div>
    );
}
