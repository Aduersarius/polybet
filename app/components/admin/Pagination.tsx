'use client';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    totalItems: number;
    itemsPerPage: number;
}

export function Pagination({
    currentPage,
    totalPages,
    onPageChange,
    totalItems,
    itemsPerPage
}: PaginationProps) {
    if (totalPages <= 1) return null;

    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    const getVisiblePages = () => {
        const delta = 2;
        const range = [];
        const rangeWithDots = [];

        for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
            range.push(i);
        }

        if (currentPage - delta > 2) {
            rangeWithDots.push(1, '...');
        } else {
            rangeWithDots.push(1);
        }

        rangeWithDots.push(...range);

        if (currentPage + delta < totalPages - 1) {
            rangeWithDots.push('...', totalPages);
        } else if (totalPages > 1) {
            rangeWithDots.push(totalPages);
        }

        return rangeWithDots;
    };

    return (
        <div className="flex items-center justify-between mt-6 px-4 py-3 bg-white/5 border border-white/5 rounded-lg">
            <div className="text-sm text-muted-foreground">
                Showing {startItem} to {endItem} of {totalItems} results
            </div>

            <div className="flex items-center space-x-1">
                {/* Previous Button */}
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-2 text-sm font-medium text-zinc-300 bg-white/5 border border-white/5 rounded-md hover:bg-white/10 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
                >
                    ← Previous
                </button>

                {/* Page Numbers */}
                <div className="flex items-center space-x-1">
                    {getVisiblePages().map((page, index) => (
                        <button
                            key={index}
                            onClick={() => typeof page === 'number' && onPageChange(page)}
                            disabled={page === '...'}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-all duration-150 ${page === currentPage
                                ? 'bg-primary text-zinc-200 border border-primary'
                                : page === '...'
                                    ? 'text-muted-foreground cursor-default'
                                    : 'text-zinc-300 bg-white/5 border border-white/5 hover:bg-white/10 hover:text-zinc-200'
                                }`}
                        >
                            {page}
                        </button>
                    ))}
                </div>

                {/* Next Button */}
                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 text-sm font-medium text-zinc-300 bg-white/5 border border-white/5 rounded-md hover:bg-white/10 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
                >
                    Next →
                </button>
            </div>
        </div>
    );
}