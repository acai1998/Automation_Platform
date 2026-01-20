import { useState, useCallback } from 'react';
import { TestStatusFilter, ChartFilterState } from '@/types/dashboard';

export function useDashboardFilter() {
  const [filterState, setFilterState] = useState<ChartFilterState>({
    selectedStatus: 'all',
    isActive: false
  });

  const setFilter = useCallback((status: TestStatusFilter) => {
    setFilterState({
      selectedStatus: status,
      isActive: status !== 'all'
    });
  }, []);

  const clearFilter = useCallback(() => {
    setFilterState({
      selectedStatus: 'all',
      isActive: false
    });
  }, []);

  const toggleFilter = useCallback((status: TestStatusFilter) => {
    if (filterState.selectedStatus === status && filterState.isActive) {
      clearFilter();
    } else {
      setFilter(status);
    }
  }, [filterState.selectedStatus, filterState.isActive, setFilter, clearFilter]);

  return {
    filterState,
    setFilter,
    clearFilter,
    toggleFilter
  };
}