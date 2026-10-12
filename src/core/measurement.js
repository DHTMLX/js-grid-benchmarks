/**
 * Row height in px, applied to every grid. Rows per viewport is the strongest single driver
 * of everything measured here. Four grids take it as an option; Kendo has none and reads it
 * from the --bench-row-height custom property that host.js sets.
 */
export const ROW_HEIGHT = 40;

/** How far a measured row height may sit from ROW_HEIGHT before the run is refused. */
export const ROW_HEIGHT_TOLERANCE_PX = 2;

/** How far the scroll test travels by default, in px. Long enough for percentiles. */
export const DEFAULT_SCROLL_DISTANCE = 50_000;

/**
 * How long to let the first paint settle before the scroll starts, in ms. A grid that is
 * still finishing work off the render path would otherwise be measured mid-task, and the
 * wait has to be the same for all five.
 */
export const PAINT_SETTLE_MS = 1_000;

/**
 * How long to keep counting frames after the scroll stops, in ms. Several grids defer work
 * out of the scroll handler, and ending with the last scroll step would reward that.
 */
export const DRAIN_MS = 500;

/**
 * How deep into the dataset the jump goes, as a fraction of the scrollable range.
 *
 * Far enough that no grid can have the target rows rendered or cached from the scroll that
 * preceded it, and short of the very end, where a grid may special-case the last page.
 */
export const JUMP_TARGET_FRACTION = 0.9;

/** Assumed average scroll speed in px per ms, used only to size the run timeout. */
export const SCROLL_PX_PER_MS = 500;
