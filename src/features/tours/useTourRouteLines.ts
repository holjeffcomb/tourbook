import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { RouteLine } from '@/features/maps/mapScene';
import { routeColorAt } from '@/features/maps/routeColors';
import { listStops } from '@/features/shows/api';
import { showsKey } from '@/features/shows/queries';
import type { TourStop } from '@/features/shows/api';
import { computeTourRoutes } from '@/features/stats/compute';

/**
 * Fetches each tour's stops (reusing the same query cache as the detail screens)
 * and derives colour-coded route lines for the shared map. Colours are assigned
 * by the tour's index in `tourIds`, so a route stays tied to its list row.
 */
export function useTourRouteLines(tourIds: string[]): { routes: RouteLine[]; isLoading: boolean } {
  const queries = useQueries({
    queries: tourIds.map((id) => ({
      queryKey: showsKey(id),
      queryFn: () => listStops(id),
      enabled: !!id,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);

  // Stable signature so `routes` keeps its identity across unrelated re-renders
  // (the scene depends on it, and would otherwise churn every render).
  const signature = tourIds.map((id, i) => `${id}:${queries[i]?.dataUpdatedAt ?? 0}`).join('|');

  const routes = useMemo(() => {
    const byTour: Record<string, TourStop[]> = {};
    tourIds.forEach((id, i) => {
      const data = queries[i]?.data;
      if (data) byTour[id] = data;
    });
    const order = new Map(tourIds.map((id, i) => [id, i]));
    return computeTourRoutes(byTour).map((r) => ({
      id: r.tourId,
      coordinates: r.coordinates,
      color: routeColorAt(order.get(r.tourId) ?? 0),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return { routes, isLoading };
}
