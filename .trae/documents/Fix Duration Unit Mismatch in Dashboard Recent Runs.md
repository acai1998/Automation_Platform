I have identified the cause of the issue.

**Problem Analysis:**
1.  **Database**: The `Auto_TestCaseTaskExecutions` table stores the `duration` in **seconds** (e.g., 300).
2.  **Backend**: In `server/services/DashboardService.ts`, the `getRecentRuns` method multiplies the duration by 1000 (`r.duration * 1000 as duration`), converting it to **milliseconds** (e.g., 300,000).
3.  **Frontend**: The `RecentTests` component in `src/components/dashboard/RecentTests.tsx` uses a `formatDuration` function that expects the input to be in **seconds**.
    - When it receives 300,000 (milliseconds), it treats it as seconds.
    - Calculation: `300,000 / 60 = 5,000` minutes.
    - Display: "5000m".

**Proposed Plan:**
1.  **Modify Backend Code**: Update `server/services/DashboardService.ts` to remove the incorrect multiplication.
    - Change `r.duration * 1000 as duration` to `r.duration as duration`.
    - This ensures the API returns the duration in seconds (300), which matches the frontend's expectation.

**Verification:**
- After the fix, a duration of 300 seconds from the database will be sent as 300 to the frontend.
- The frontend will calculate `300 / 60 = 5` minutes and display "5m", which is the correct expected behavior.