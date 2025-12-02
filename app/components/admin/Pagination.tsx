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
        <div className="flex items-center justify-between mt-6 px-4 py-3 bg-[#2a2a2a] border border-white/10 rounded-lg">
            <div className="text-sm text-gray-400">
                Showing {startItem} to {endItem} of {totalItems} results
            </div>

            <div className="flex items-center space-x-1">
                {/* Previous Button */}
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-2 text-sm font-medium text-gray-300 bg-[#1e1e1e] border border-white/10 rounded-md hover:bg-[#374151] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
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
                                    ? 'bg-blue-600 text-white border border-blue-500'
                                    : page === '...'
                                        ? 'text-gray-500 cursor-default'
                                        : 'text-gray-300 bg-[#1e1e1e] border border-white/10 hover:bg-[#374151] hover:text-white'
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
                    className="px-3 py-2 text-sm font-medium text-gray-300 bg-[#1e1e1e] border border-white/10 rounded-md hover:bg-[#374151] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
                >
                    Next →
                </button>
            </div>
        </div>
    );
}