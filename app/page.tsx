// Server Component - fetches data on server for instant LCP
import { Suspense } from 'react';
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { EventFeedClient } from "./components/EventFeedClient";
import { getInitialEvents } from "@/lib/data";
import { Skeleton } from "@/components/ui/skeleton";

// Skeleton loader for event cards
function EventCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="bg-[#1a1d28] rounded-2xl border border-white/5 p-4 space-y-4 h-[220px] flex flex-col">
          <div className="flex justify-between items-start">
            <Skeleton className="h-12 w-12 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-lg" />
          </div>
          <Skeleton className="h-6 w-3/4 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-5/6 rounded" />
          </div>
          <div className="flex gap-2 mt-auto">
            <Skeleton className="h-10 flex-1 rounded-xl" />
            <Skeleton className="h-10 flex-1 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const params = await searchParams;
  const category = params.category || 'ALL';

  // Fetch initial events on server
  const { events: initialEvents } = await getInitialEvents({
    category,
    limit: 20,
    sortBy: 'volume_high'
  });

  return (
    <main className="flex flex-col relative overflow-x-hidden max-w-full">
      <div className="flex-grow overflow-x-hidden max-w-full">
        <div className="min-h-screen relative text-white z-10 overflow-x-hidden max-w-full">
          <Navbar selectedCategory={category} />

          {/* Markets Content */}
          <div className="relative z-10 pt-32 px-6 max-w-7xl mx-auto pb-8">
            <Suspense fallback={<EventCardsSkeleton />}>
              <EventFeedClient
                initialEvents={initialEvents}
                initialCategory={category}
              />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </main>
  );
}
