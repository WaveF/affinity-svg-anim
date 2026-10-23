// Test fixture only: converts the old affinity-svg {{…}} layer names into SVG Anim data,
// so the original AppleWatch.af example can be used as a real-world export test.
// ------------------------------------------------- legacy {{...}} layer names
// Format of the original affinity-svg project:
//   command(*children)_(#pad)value(*stagger)_(@forward)(!reversed)duration(*loop)_ease
const LEGACY_RE = /^\s*\{\{(.*)\}\}\s*$/;

function legacyEase(raw) {
    switch (raw) {
        case '<': return 'in';
        case '>': return 'out';
        case '<>': case '': case undefined: return 'inOut';
        case '0': return 'linear';
    }
    const s = String(raw).toLowerCase();
    if (s.indexOf('linear') >= 0) return 'linear';
    if (s.indexOf('elastic') >= 0) return 'elasticOut';
    if (s.indexOf('bounce') >= 0) return 'bounceOut';
    if (s.indexOf('back') >= 0) return s.indexOf('inout') >= 0 ? 'backInOut' : s.indexOf('in') === 0 ? 'backIn' : 'backOut';
    if (s.indexOf('sine') >= 0) return 'sineInOut';
    if (s.indexOf('expo') >= 0) return 'expoInOut';
    if (s.indexOf('inout') >= 0) return 'inOut';
    if (s.indexOf('in') === 0) return 'in';
    if (s.indexOf('out') === 0) return 'out';
    return 'inOut';
}

/** Parses a legacy layer name into animation data, or null when the name is not an expression. */
function parseLegacyName(name) {
    const m = LEGACY_RE.exec(String(name || ''));
    if (!m) return null;
    const parts = m[1].trim().split('_');
    const rawCommand = parts[0] || '', rawValue = parts[1] || '', rawDuration = parts[2] || '1', rawEase = parts[3];
    const children = rawCommand.indexOf('*') >= 0;
    const command = rawCommand.replace('*', '').trim();
    const stagger = rawValue.indexOf('*') >= 0 ? (Number(rawValue.split('*')[1]) || 1) : null;
    const pad = rawValue.indexOf('#') >= 0;
    const valueStr = rawValue.split('*')[0].replace('#', '');
    const value = valueStr !== '' && !isNaN(Number(valueStr)) ? Number(valueStr) : null;

    let dur = rawDuration;
    const reversed = dur.indexOf('!') >= 0;
    const alternate = dur.indexOf('@') < 0;
    dur = dur.replace('!', '').replace('@', '');
    let loops = 0;
    if (dur.indexOf('*') >= 0) {
        // anime.js "loop: N" = N extra repeats; "*0" played once.
        loops = Math.max(0, Math.floor(Number(dur.split('*')[1]) || 0)) + 1;
        dur = dur.split('*')[0];
    }
    const base = {
        target: children ? 'children' : 'self',
        dur: Number(dur) || 1,
        delay: 0,
        stagger: stagger !== null ? stagger : 0,
        ease: legacyEase(rawEase),
        dir: alternate ? (reversed ? 'alternateReverse' : 'alternate') : (reversed ? 'reverse' : 'normal'),
        loops,
        loopDelay: 0,
        trigger: 'load'
    };
    // Original: a single (non-children) target used the stagger as a plain delay.
    if (!children && stagger !== null) { base.delay = stagger; base.stagger = 0; }
    if (children && stagger === null) base.stagger = base.dur;

    let t = null;
    switch (command) {
        case 'alpha': t = Object.assign(base, { type: 'fade', from: 100, to: (value === null ? 0 : value) * 100 }); break;
        case 'x': t = Object.assign(base, { type: 'move', x: value || 0, y: 0 }); break;
        case 'y': t = Object.assign(base, { type: 'move', x: 0, y: value || 0 }); break;
        case 'rotate': t = Object.assign(base, { type: 'rotate', angle: (value === null ? 1 : value) * 360, pivot: 'c' }); break;
        case 'scale': t = Object.assign(base, { type: 'scale', sx: (value === null ? 1 : value) * 100, sy: (value === null ? 1 : value) * 100, pivot: 'c' }); break;
        case 'line': {
            const v = value || 1;
            const mode = v === 2 ? 'revealErase' : v === 3 || v === 4 ? 'travel' : 'reveal';
            t = Object.assign(base, { type: 'draw', mode, seg: v === 4 ? 10 : 20 });
            break;
        }
        case 'num': {
            const random = valueStr.indexOf('?') >= 0;
            let start = null, end = value === null ? 0 : value;
            if (random) {
                const r = valueStr.split('?');
                start = r[0] !== '' && !isNaN(Number(r[0])) ? Number(r[0]) : null;
                end = Number(r[1]) || 0;
            }
            t = Object.assign(base, { type: 'count', start, end, decimals: null, pad, group: false, random, target: 'self' });
            if (random) t.loopDelay = 1.5;
            break;
        }
        case 'time': {
            const fmt = { hh: 'HH', mm: 'mm', ss: 'ss' }[valueStr] || (valueStr || 'HH:mm:ss');
            t = Object.assign(base, { type: 'clock', format: fmt });
            break;
        }
        case 'frame': t = Object.assign(base, { type: 'frames', target: 'children', ease: 'linear', stagger: 0 }); break;
    }
    const data = t ? normalizeData({ tracks: [t] }) : null;
    return data;
}

