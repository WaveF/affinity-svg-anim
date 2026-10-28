// ---------------------------------------------------------------------------
// SVG Anim core: data model, validation, node helpers.
// ---------------------------------------------------------------------------
// Animation data lives in the node's tag dictionary under TAG_KEY as JSON:
//   {"v":1,"tracks":[{ "type":"move", "x":0, "y":-20, "dur":1, ... }],"suffix":"__anim","auto":true}
// "suffix" is the text this script appended to the layer name ("" = none),
// "auto" marks a layer that had no name of its own before the suffix was added.
// Exported SVG elements carry {"v":1,"n":<child count>,"tracks":[…]} in data-svganim.

const TAG_KEY = 'svganim';
const DATA_VERSION = 1;
const MAX_TRACKS = 8;
const DEFAULT_SUFFIX = '__anim';
const MAX_SUFFIX_LENGTH = 32;

const TYPES = ['none', 'fade', 'move', 'rotate', 'scale', 'skew', 'draw', 'count', 'clock', 'frames'];
const TYPE_LABELS = ['None', 'Fade', 'Move', 'Rotate', 'Scale', 'Skew', 'Draw stroke', 'Count number', 'Clock', 'Frames'];
const TARGETS = ['self', 'children'];
const TARGET_LABELS = ['Element', 'Each child'];
// Cubic keeps the original in/out/inOut IDs so saved animations stay compatible.
const EASES = [
    'linear',
    'sineIn', 'sineOut', 'sineInOut',
    'quadIn', 'quadOut', 'quadInOut',
    'in', 'out', 'inOut',
    'quartIn', 'quartOut', 'quartInOut',
    'quintIn', 'quintOut', 'quintInOut',
    'expoIn', 'expoOut', 'expoInOut',
    'circIn', 'circOut', 'circInOut',
    'backIn', 'backOut', 'backInOut',
    'elasticIn', 'elasticOut', 'elasticInOut',
    'bounceIn', 'bounceOut', 'bounceInOut'
];
const EASE_LABELS = [
    'Linear',
    'Sine in', 'Sine out', 'Sine in-out',
    'Quad in', 'Quad out', 'Quad in-out',
    'Cubic in', 'Cubic out', 'Cubic in-out',
    'Quart in', 'Quart out', 'Quart in-out',
    'Quint in', 'Quint out', 'Quint in-out',
    'Expo in', 'Expo out', 'Expo in-out',
    'Circ in', 'Circ out', 'Circ in-out',
    'Back in', 'Back out', 'Back in-out',
    'Elastic in', 'Elastic out', 'Elastic in-out',
    'Bounce in', 'Bounce out', 'Bounce in-out'
];
const DIRS = ['normal', 'reverse', 'alternate', 'alternateReverse'];
const DIR_LABELS = ['Normal', 'Reverse', 'Alternate', 'Alternate reverse'];
const ORDERS = ['forward', 'reverse', 'center', 'random'];
const ORDER_LABELS = ['First to last', 'Last to first', 'From centre', 'Random'];
const TRIGGERS = ['load', 'view', 'click', 'hover'];
const TRIGGER_LABELS = ['On load', 'When visible', 'On click', 'On hover'];
const DRAW_MODES = ['reveal', 'revealErase', 'erase', 'travel'];
const DRAW_LABELS = ['Reveal', 'Reveal then erase', 'Erase', 'Travel'];
const PIVOTS = ['tl', 'tc', 'tr', 'cl', 'c', 'cr', 'bl', 'bc', 'br'];
const DECIMAL_LABELS = ['Auto', '0', '1', '2', '3', '4'];

const COMMON_DEFAULTS = {
    target: 'self', dur: 1, delay: 0, stagger: 0.1, order: 'forward',
    ease: 'inOut', dir: 'alternate', loops: 0, loopDelay: 0, trigger: 'load'
};
// Fields per type; '$' = timing preset applied when a track is first given this type.
const TYPE_DEFAULTS = {
    fade: { from: 100, to: 0 },
    move: { x: 0, y: -20 },
    rotate: { angle: 360, pivot: 'c', $: { ease: 'linear', dir: 'normal', dur: 2 } },
    scale: { sx: 120, sy: 120, pivot: 'c' },
    skew: { ax: 20, ay: 0, pivot: 'c' },
    draw: { mode: 'reveal', seg: 20, $: { dir: 'normal', dur: 2, loopDelay: 0.5 } },
    count: { start: null, end: 100, decimals: null, pad: false, group: false, random: false, $: { dir: 'normal', ease: 'out', dur: 2, loops: 1 } },
    clock: { format: 'HH:mm:ss' },
    frames: { $: { target: 'children', ease: 'linear', dir: 'normal' } }
};

function finiteOr(v, d) {
    const n = Number(v);
    return v !== null && v !== '' && Number.isFinite(n) ? n : d;
}
function pick(list, v, d) { return list.indexOf(v) >= 0 ? v : d; }
function round6(v) { return Math.round(v * 1e6) / 1e6; }

/** Returns a fully populated, validated track (common + type fields), or null. */
function normalizeTrack(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const type = pick(TYPES, raw.type, null);
    if (!type || type === 'none') return null;
    const def = TYPE_DEFAULTS[type];
    const t = { type };
    t.target = pick(TARGETS, raw.target, COMMON_DEFAULTS.target);
    if (type === 'frames') t.target = 'children';
    if (type === 'count' || type === 'clock') t.target = 'self';
    t.dur = Math.max(0.01, finiteOr(raw.dur, COMMON_DEFAULTS.dur));
    t.delay = Math.max(0, finiteOr(raw.delay, 0));
    t.stagger = Math.max(0, finiteOr(raw.stagger, COMMON_DEFAULTS.stagger));
    t.order = pick(ORDERS, raw.order, 'forward');
    t.ease = pick(EASES, raw.ease, COMMON_DEFAULTS.ease);
    t.dir = pick(DIRS, raw.dir, COMMON_DEFAULTS.dir);
    t.loops = Math.max(0, Math.floor(finiteOr(raw.loops, 0)));
    t.loopDelay = Math.max(0, finiteOr(raw.loopDelay, 0));
    t.trigger = pick(TRIGGERS, raw.trigger, 'load');
    switch (type) {
        case 'fade':
            t.from = Math.min(100, Math.max(0, finiteOr(raw.from, def.from)));
            t.to = Math.min(100, Math.max(0, finiteOr(raw.to, def.to)));
            break;
        case 'move':
            t.x = finiteOr(raw.x, def.x);
            t.y = finiteOr(raw.y, def.y);
            break;
        case 'rotate':
            t.angle = finiteOr(raw.angle, def.angle);
            t.pivot = pick(PIVOTS, raw.pivot, 'c');
            break;
        case 'scale':
            t.sx = finiteOr(raw.sx, def.sx);
            t.sy = finiteOr(raw.sy, def.sy);
            t.pivot = pick(PIVOTS, raw.pivot, 'c');
            break;
        case 'skew':
            t.ax = finiteOr(raw.ax, def.ax);
            t.ay = finiteOr(raw.ay, def.ay);
            t.pivot = pick(PIVOTS, raw.pivot, 'c');
            break;
        case 'draw':
            t.mode = pick(DRAW_MODES, raw.mode, 'reveal');
            t.seg = Math.min(100, Math.max(1, finiteOr(raw.seg, def.seg)));
            break;
        case 'count':
            t.start = finiteOr(raw.start, null);
            t.end = finiteOr(raw.end, def.end);
            t.decimals = raw.decimals === null || raw.decimals === undefined ? null : Math.min(4, Math.max(0, Math.floor(finiteOr(raw.decimals, 0))));
            t.pad = !!raw.pad;
            t.group = !!raw.group;
            t.random = !!raw.random;
            break;
        case 'clock':
            t.format = typeof raw.format === 'string' && raw.format.length ? raw.format.slice(0, 64) : def.format;
            break;
    }
    return t;
}

/** A brand-new track of the given type with its timing preset. */
function newTrack(type, base) {
    const def = TYPE_DEFAULTS[type] || {};
    const raw = Object.assign({}, COMMON_DEFAULTS, base || {}, def.$ || {}, { type });
    for (const k of Object.keys(def)) if (k !== '$') raw[k] = def[k];
    return normalizeTrack(raw);
}

function cleanSuffix(s) {
    s = typeof s === 'string' ? s.slice(0, MAX_SUFFIX_LENGTH) : '';
    return s.trim() ? s : '';
}

function normalizeData(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tracks)) return null;
    const tracks = raw.tracks.map(normalizeTrack).filter(Boolean).slice(0, MAX_TRACKS);
    if (!tracks.length) return null;
    const data = { v: DATA_VERSION, tracks };
    if (typeof raw.suffix === 'string') data.suffix = cleanSuffix(raw.suffix);
    if (raw.auto === true) data.auto = true;
    return data;
}

function serializeData(data) {
    const norm = normalizeData(data);
    return norm ? JSON.stringify(norm) : '';
}

/** Reads animation data from a node's tag. {data, error} — data null when absent/empty. */
function readNodeData(node) {
    let ti = null;
    try { ti = node.tagInterface; } catch (_) { return { data: null }; }
    if (!ti || !ti.hasKey(TAG_KEY)) return { data: null };
    const raw = ti.getValueForKey(TAG_KEY);
    if (!raw) return { data: null };
    try {
        const data = normalizeData(JSON.parse(raw));
        return data ? { data, raw } : { data: null, raw, error: 'no valid tracks' };
    } catch (e) {
        return { data: null, raw, error: 'invalid JSON' };
    }
}

// ------------------------------------------------------------------- names
function userName(node) {
    try { return node.descriptionInterface.userDescription || ''; } catch (_) { return ''; }
}
function displayName(node) {
    try { return node.descriptionInterface.description || ''; } catch (_) { return ''; }
}
function defaultName(node) {
    try { return node.descriptionInterface.defaultDescription || ''; } catch (_) { return ''; }
}
/** The layer name without the suffix this script added. */
function baseName(node, data) {
    const name = userName(node);
    const sfx = data && data.suffix;
    return sfx && name.length > sfx.length && name.endsWith(sfx) ? name.slice(0, -sfx.length) : name;
}
/** True when the base name is only the default name the script filled in. */
function isAutoName(node, data) {
    const name = userName(node);
    if (!name) return true;
    return !!(data && data.auto) && baseName(node, data) === defaultName(node);
}
/** Name used for the SVG id: base name, or '' when the layer has no name of its own. */
function exportName(node, data) {
    return isAutoName(node, data) ? '' : baseName(node, data);
}

// ------------------------------------------------------------- descriptions
function describeTrack(t) {
    if (!t) return '–';
    const s = (v) => String(round6(v));
    switch (t.type) {
        case 'fade': return 'Fade ' + s(t.from) + '→' + s(t.to) + '%';
        case 'move': return 'Move ' + s(t.x) + ',' + s(t.y);
        case 'rotate': return 'Rotate ' + s(t.angle) + '°';
        case 'scale': return 'Scale ' + s(t.sx) + (t.sx === t.sy ? '' : '×' + s(t.sy)) + '%';
        case 'skew': return 'Skew ' + s(t.ax) + ',' + s(t.ay) + '°';
        case 'draw': return 'Draw ' + ['reveal', 'reveal+erase', 'erase', 'travel'][DRAW_MODES.indexOf(t.mode)];
        case 'count': return 'Count →' + s(t.end);
        case 'clock': return 'Clock ' + t.format;
        case 'frames': return 'Frames';
    }
    return t.type;
}
function describeData(data) {
    if (!data || !data.tracks.length) return 'No animation';
    return data.tracks.map(describeTrack).join(' + ');
}

// ---------------------------------------------------------------- node tree
function forEachNode(node, fn) {
    fn(node);
    let kids = null;
    try { kids = node.children; } catch (_) { kids = null; }
    if (!kids) return;
    for (const c of kids) forEachNode(c, fn);
}
function childCount(node) {
    let n = 0;
    try { for (const _ of node.children) n++; } catch (_) { n = 0; }
    return n;
}
function compactError(error) {
    return String(error && error.message ? error.message : error).replace(/\s+/g, ' ').trim();
}
