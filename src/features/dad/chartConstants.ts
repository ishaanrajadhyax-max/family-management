// Fixed Y-axis ranges for the trend charts. Without these, a chart auto-scales
// to whatever min/max happens to be in the visible data — so on a mostly
// stable reading with one outlier day, every other day gets compressed into
// a flat line near the middle. A fixed clinical range keeps normal
// day-to-day fluctuation visible; a reading outside the range still shows
// (clamped to the edge, flagged) rather than being hidden.
export const BLOOD_SUGAR_Y_DOMAIN: [number, number] = [90, 140]
export const SYSTOLIC_Y_DOMAIN: [number, number] = [90, 160]
export const DIASTOLIC_Y_DOMAIN: [number, number] = [60, 100]
