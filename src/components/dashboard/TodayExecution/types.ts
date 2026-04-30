import type { DashboardResponse, TestStatusFilter } from "@/types/dashboard";

export interface TodayExecutionProps {
  data?: DashboardResponse;
}

export type RateStatus = Exclude<TestStatusFilter, "all">;
export type SegmentStatus = RateStatus | "running";

export interface ChartSegment {
  [key: string]: string | number;
  name: string;
  value: number;
  color: string;
  percentage: number;
  icon: string;
  status: SegmentStatus;
}

export type HoveredSegment = Pick<
  ChartSegment,
  "name" | "value" | "color" | "percentage" | "status"
>;
