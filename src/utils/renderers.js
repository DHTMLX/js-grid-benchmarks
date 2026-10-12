/**
 * Shared cell renderer HTML templates.
 * Each adapter's mapColumns() calls these when scenario.complexCells = true.
 */

const STATUS_MAP = {
    Active:   { color: '#28a745', label: 'Active' },
    Pending:  { color: '#ffc107', label: 'Pending' },
    Inactive: { color: '#dc3545', label: 'Inactive' },
};

/** Team name → badge colour. A team the generator never emits falls back to the first. */
const TEAM_COLORS = {
    'Team A': '#4dabf7',
    'Team B': '#69db7c',
    'Team C': '#ffa94d',
    'Team D': '#f783ac',
};
const DEFAULT_TEAM_COLOR = TEAM_COLORS['Team A'];

export function statusHtml(status) {
    const badge = STATUS_MAP[status] || STATUS_MAP.Inactive;
    return `<span style="display:inline-flex;align-items:center;gap:6px;color:${badge.color}">` +
           `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${badge.color};flex-shrink:0"></span>` +
           `${badge.label}</span>`;
}

export function changeHtml(value) {
    const percent = Number(value);
    if (percent > 0) return `<span class="chg chg-up">+${percent}%</span>`;
    if (percent < 0) return `<span class="chg chg-dn">${percent}%</span>`;
    return `<span class="chg chg-zero">0%</span>`;
}

export function ratingHtml(rating) {
    const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    return `<span style="color:#f59f00;letter-spacing:1px">${stars}</span>`;
}

export function teamComplexHtml(team) {
    const color = TEAM_COLORS[team] ?? DEFAULT_TEAM_COLOR;
    return `<span style="background:${color};color:#fff;padding:2px 16px;border-radius:30px;font-size:12px">${team}</span>`;
}

/** Numeric column templates for the col01–col90 columns of the mix* sets — picked by
 *  CanonicalColumn.templateSlot, which cycles 0→1→2 across the numeric columns. */

// Slot 0 — mini progress bar proportional to value (100000–999999)
export function numBarHtml(value) {
    const percent = Math.round(((value - 100000) / 899999) * 100);
    return `<div style="display:flex;align-items:center;gap:4px;padding:0 2px">` +
           `<div style="width:48px;height:8px;background:#e9ecef;border-radius:2px;flex-shrink:0">` +
           `<div style="width:${percent}%;height:8px;background:#4dabf7;border-radius:2px"></div></div>` +
           `<span style="font-size:12px">${value}</span></div>`;
}

// Slot 1 — colored badge: red < 400k, yellow < 700k, green ≥ 700k
export function numBadgeHtml(value) {
    const color = value < 400000 ? '#e53935' : value < 700000 ? '#f9a825' : '#43a047';
    return `<span style="background:${color};color:#fff;padding:1px 7px;border-radius:10px;font-size:12px">${value}</span>`;
}

// Slot 2 — directional icon + colored number (above/below midpoint 550000)
export function numIconHtml(value) {
    const up    = value >= 550000;
    const color = up ? '#43a047' : '#e53935';
    return `<span style="color:${color}">${up ? '↑' : '↓'}&nbsp;${value}</span>`;
}

export const NUM_TEMPLATE_FNS = [numBarHtml, numBadgeHtml, numIconHtml];
