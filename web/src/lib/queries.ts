import { queryOptions } from "@tanstack/react-query";
import { getStats, listMemories } from "../server/queries";

export const statsQueryOptions = queryOptions({
  queryKey: ["stats"] as const,
  queryFn: () => getStats(),
});

export const memoriesQueryOptions = queryOptions({
  queryKey: ["memories"] as const,
  queryFn: () => listMemories(),
});
