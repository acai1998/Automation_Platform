import type { ChartSegment, HoveredSegment } from "./types";

export function extractHoveredSegment(segment: unknown): HoveredSegment | null {
  if (!segment || typeof segment !== "object") {
    return null;
  }

  const candidate = segment as Partial<ChartSegment>;
  if (
    typeof candidate.name === "string" &&
    typeof candidate.value === "number" &&
    typeof candidate.color === "string" &&
    typeof candidate.percentage === "number" &&
    typeof candidate.status === "string"
  ) {
    return {
      name: candidate.name,
      value: candidate.value,
      color: candidate.color,
      percentage: candidate.percentage,
      status: candidate.status as HoveredSegment["status"],
    };
  }

  return null;
}
