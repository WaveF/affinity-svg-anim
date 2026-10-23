// ---------------------------------------------------------------------------
// Animate panel: edit the animation tracks stored on the selected elements.
// ---------------------------------------------------------------------------

function selectedNodes(doc) {
    const nodes = [];
    for (let i = 0; i < doc.selection.length; i++) {
        const node = doc.selection.at(i).node;
        if (node) nodes.push(node);
    }
    return nodes;
}

const ANCHOR_NAMES = { tl: 'TopLeft', tc: 'TopCentre', tr: 'TopRight', cl: 'CentreLeft', c: 'Centre', cr: 'CentreRight', bl: 'BottomLeft', bc: 'BottomCentre', br: 'BottomRight' };
function anchorValue(key) { return SpatialAnchor[ANCHOR_NAMES[key] || 'Centre'].value; }
function anchorKey(value) {
    for (const k of PIVOTS) if (SpatialAnchor[ANCHOR_NAMES[k]].value === value) return k;
    return 'c';
}

/** What the panel starts from: stored tracks, differences, the suffix to show. */
function loadSelectionState(nodes) {
    const items = nodes.map(node => {
        const tag = readNodeData(node);
        return { node, data: tag.data, tagError: tag.error || null };
    });
    const first = items.find(it => it.data) || null;
    const signatures = new Set(items.map(it => it.data ? JSON.stringify(it.data.tracks) : ''));
    // Show the suffix the animated elements already use, when they agree.
    const suffixes = new Set(items.filter(it => it.data && typeof it.data.suffix === 'string').map(it => it.data.suffix));
    return {
        items,
        tracks: first ? first.data.tracks.slice() : [],
        differ: signatures.size > 1,
        suffix: suffixes.size === 1 ? Array.from(suffixes)[0] : DEFAULT_SUFFIX,
        animatedCount: items.filter(it => it.data).length,
        errors: items.filter(it => it.tagError)
    };
}

function selectionInfo(state) {
    const n = state.items.length;
    if (!n) return 'Nothing is selected. Select the elements to animate, then run the script again.';
    const lines = [];
    if (n === 1) {
        const it = state.items[0];
        const name = baseName(it.node, it.data) || displayName(it.node);
        lines.push('"' + name + '": ' + (it.data ? describeData(it.data) : 'no animation yet'));
    } else {
        lines.push(n + ' elements selected (' + state.animatedCount + ' animated). OK applies these tracks to all of them.');
        if (state.differ) lines.push('Their animations differ; the first animated one is shown.');
    }
    if (state.errors.length) lines.push('Unreadable animation data was found and will be replaced.');
    return lines.join('\n');
}

// ------------------------------------------------------------------- panel
function buildAnimatePanel(doc, left, right, state) {
    const num = (group, label, value, min, max, precision) => {
        const ctl = group.addUnitValueEditor(label, UnitType.Number, UnitType.Number, value, min, max);
        if (precision !== undefined) ctl.precision = precision;
        return ctl;
    };
    const pct = (group, label, value, min, max) => group.addUnitValueEditor(label, UnitType.Percentage, UnitType.Percentage, value, min, max);
    const c = {};
    const groups = [];

    const sel = left.addGroup('Selection'); groups.push(sel);
    c.info = sel.addStaticText(null, selectionInfo(state)).setIsFullWidth();

    const track = left.addGroup('Tracks'); groups.push(track);
    c.track = track.addButtonSet('Track', ['1', '2', '3', '4', '5', '6', '7', '8'], 0);
    c.summary = track.addStaticText(null, '').setIsFullWidth();

    const fx = left.addGroup('Effect'); groups.push(fx);
    c.type = fx.addComboBox('Type', TYPE_LABELS, 0);
    c.target = fx.addButtonSet('Apply to', TARGET_LABELS, 0);
    c.fadeFrom = pct(fx, 'From opacity', 100, 0, 100);
    c.fadeTo = pct(fx, 'To opacity', 0, 0, 100);
    c.moveX = fx.addUnitValueEditor('Move X', UnitType.Pixel, doc.units, 0);
    c.moveY = fx.addUnitValueEditor('Move Y', UnitType.Pixel, doc.units, -20);
    c.angle = fx.addUnitValueEditor('Angle (clockwise)', UnitType.Degree, UnitType.Degree, 360);
    c.sx = pct(fx, 'Scale X', 120);
    c.sy = pct(fx, 'Scale Y', 120);
    c.pivot = fx.addSpatialAnchor('Pivot', SpatialAnchor.Centre);
    c.drawMode = fx.addComboBox('Draw', DRAW_LABELS, 0);
    c.drawSeg = pct(fx, 'Segment length', 20, 1, 100);
    c.countStart = fx.addTextBox('Start (blank = current text)', '');
    c.countEnd = num(fx, 'End', 100, null, null, 3);
    c.countDec = fx.addComboBox('Decimals', DECIMAL_LABELS, 0);
    c.countPad = fx.addSwitch('Pad with leading zeros', false);
    c.countGroup = fx.addSwitch('Thousands separator', false);
    c.countRandom = fx.addSwitch('Random value each repeat', false);
    c.clockFormat = fx.addTextBox('Format', 'HH:mm:ss');
    c.clockHint = fx.addStaticText(null, 'Tokens: YYYY MM DD HH hh mm ss A. Shows the viewer\'s local time; timing settings are ignored.').setIsFullWidth();
    c.framesHint = fx.addStaticText(null, 'Shows one child at a time, top child last. Duration is one pass through all children.').setIsFullWidth();
    c.typeHint = fx.addStaticText(null, 'Choose a type to animate this track. Set every track to None to remove the animation.').setIsFullWidth();

    const timing = right.addGroup('Timing'); groups.push(timing);
    c.dur = num(timing, 'Duration (s)', 1, 0.01, null, 2);
    c.delay = num(timing, 'Delay (s)', 0, 0, null, 2);
    c.stagger = num(timing, 'Stagger per child (s)', 0.1, 0, null, 2);
    c.order = timing.addComboBox('Stagger order', ORDER_LABELS, 0);
    c.ease = timing.addComboBox('Easing', EASE_LABELS, 3);
    c.dir = timing.addComboBox('Direction', DIR_LABELS, 2);
    c.loops = num(timing, 'Play count (0 = forever)', 0, 0, null, 0);
    c.loopDelay = num(timing, 'Pause between plays (s)', 0, 0, null, 2);
    c.trigger = timing.addComboBox('Start', TRIGGER_LABELS, 0);

    const layer = right.addGroup('Layer name'); groups.push(layer);
    c.suffix = layer.addTextBox('Suffix', state.suffix);
    c.suffixHint = layer.addStaticText(null, 'Added to the names of animated layers so you can spot them in the Layers panel; removed again when the animation is cleared. Leave blank for none. Not used in the SVG ids.').setIsFullWidth();
    c.exportAfter = layer.addSwitch('Export after applying (uses the Export settings)', false);

    return { c, groups };
}

/** Reads the visible form into a normalized track (or null for None). */
function readForm(c) {
    const type = TYPES[c.type.selectedIndex] || 'none';
    if (type === 'none') return null;
    const dec = c.countDec.selectedIndex;
    const startText = String(c.countStart.text || '').trim();
    return normalizeTrack({
        type,
        target: TARGETS[c.target.selectedIndex],
        dur: c.dur.value, delay: c.delay.value, stagger: c.stagger.value,
        order: ORDERS[c.order.selectedIndex], ease: EASES[c.ease.selectedIndex], dir: DIRS[c.dir.selectedIndex],
        loops: c.loops.value, loopDelay: c.loopDelay.value, trigger: TRIGGERS[c.trigger.selectedIndex],
        from: c.fadeFrom.value, to: c.fadeTo.value,
        x: round6(c.moveX.value), y: round6(c.moveY.value),
        angle: c.angle.value,
        sx: c.sx.value, sy: c.sy.value,
        pivot: anchorKey(c.pivot.value),
        mode: DRAW_MODES[c.drawMode.selectedIndex], seg: c.drawSeg.value,
        start: startText === '' ? null : startText, end: c.countEnd.value,
        decimals: dec <= 0 ? null : dec - 1,
        pad: !!c.countPad.value, group: !!c.countGroup.value, random: !!c.countRandom.value,
        format: String(c.clockFormat.text || '')
    });
}

/** Writes a track into the form. Fields the track does not use keep their defaults. */
function loadForm(c, track) {
    const t = track || null;
    const type = t ? t.type : 'none';
    const pre = t || newTrack('fade');
    const ofType = (k, d) => (t && t[k] !== undefined && t[k] !== null) ? t[k] : d;
    c.type.selectedIndex = TYPES.indexOf(type);
    c.target.selectedIndex = TARGETS.indexOf(pre.target);
    c.dur.value = pre.dur; c.delay.value = pre.delay; c.stagger.value = pre.stagger;
    c.order.selectedIndex = ORDERS.indexOf(pre.order);
    c.ease.selectedIndex = EASES.indexOf(pre.ease);
    c.dir.selectedIndex = DIRS.indexOf(pre.dir);
    c.loops.value = pre.loops; c.loopDelay.value = pre.loopDelay;
    c.trigger.selectedIndex = TRIGGERS.indexOf(pre.trigger);
    c.fadeFrom.value = ofType('from', 100); c.fadeTo.value = ofType('to', 0);
    c.moveX.value = ofType('x', 0); c.moveY.value = ofType('y', -20);
    c.angle.value = ofType('angle', 360);
    c.sx.value = ofType('sx', 120); c.sy.value = ofType('sy', 120);
    c.pivot.value = anchorValue(ofType('pivot', 'c'));
    c.drawMode.selectedIndex = Math.max(0, DRAW_MODES.indexOf(ofType('mode', 'reveal')));
    c.drawSeg.value = ofType('seg', 20);
    const start = t && t.type === 'count' ? t.start : null;
    c.countStart.text = start === null || start === undefined ? '' : String(start);
    c.countEnd.value = ofType('end', 100);
    const dec = t && t.type === 'count' ? t.decimals : null;
    c.countDec.selectedIndex = dec === null || dec === undefined ? 0 : dec + 1;
    c.countPad.value = !!ofType('pad', false);
    c.countGroup.value = !!ofType('group', false);
    c.countRandom.value = !!ofType('random', false);
    c.clockFormat.text = ofType('format', 'HH:mm:ss');
}

const TYPE_CONTROLS = {
    fade: ['fadeFrom', 'fadeTo'],
    move: ['moveX', 'moveY'],
    rotate: ['angle', 'pivot'],
    scale: ['sx', 'sy', 'pivot'],
    draw: ['drawMode', 'drawSeg'],
    count: ['countStart', 'countEnd', 'countDec', 'countPad', 'countGroup', 'countRandom'],
    clock: ['clockFormat', 'clockHint'],
    frames: ['framesHint'],
    none: ['typeHint']
};
const ALL_TYPE_CONTROLS = Array.from(new Set([].concat(...Object.values(TYPE_CONTROLS))));
const TIMING_CONTROLS = ['dur', 'delay', 'stagger', 'order', 'ease', 'dir', 'loops', 'loopDelay', 'trigger'];

function setVisible(item, visible) {
    if (item.isVisible !== visible) item.isVisible = visible;
}

/** Two lines: tracks 1–4 and 5–8; ▸ marks the track being edited. */
function trackSummary(tracks, current) {
    const cell = i => (i + 1) + (i === current ? '▸' : ' ') + describeTrack(tracks[i]);
    const line = from => [0, 1, 2, 3].map(k => cell(from + k)).join('   ');
    return line(0) + '\n' + line(4);
}

function updateAnimateControls(c, tracks, current) {
    const type = TYPES[c.type.selectedIndex] || 'none';
    const shown = new Set(TYPE_CONTROLS[type] || []);
    for (const k of ALL_TYPE_CONTROLS) setVisible(c[k], shown.has(k));
    const animated = type !== 'none' && type !== 'clock';
    const childCapable = type !== 'none' && type !== 'count' && type !== 'clock' && type !== 'frames';
    setVisible(c.target, childCapable);
    const children = childCapable && c.target.selectedIndex === 1;
    for (const k of TIMING_CONTROLS) setVisible(c[k], animated);
    setVisible(c.stagger, animated && children);
    setVisible(c.order, animated && children);
    setVisible(c.ease, animated && type !== 'frames');
    setVisible(c.drawSeg, type === 'draw' && c.drawMode.selectedIndex === DRAW_MODES.indexOf('travel'));
    c.loopDelay.isEnabled = c.loops.value !== 1;
    c.summary.text = trackSummary(tracks, current);
}

/** Wires the panel: switching tracks saves/loads the form; a new type gets its presets. */
function attachAnimate(panel, state) {
    const c = panel.c;
    const tracks = [];
    for (let i = 0; i < MAX_TRACKS; i++) tracks.push(state.tracks[i] || null);
    let current = 0;
    let lastType = tracks[0] ? tracks[0].type : 'none';
    loadForm(c, tracks[0]);
    updateAnimateControls(c, tracks, current);

    const onChange = () => {
        const idx = c.track.selectedIndex;
        if (idx !== current) {
            tracks[current] = readForm(c);
            current = idx;
            loadForm(c, tracks[current]);
            lastType = tracks[current] ? tracks[current].type : 'none';
        } else {
            const type = TYPES[c.type.selectedIndex] || 'none';
            if (type !== lastType) {
                const base = lastType === 'none' ? null : readForm(c);
                let next = null;
                if (type !== 'none') {
                    if (!base) next = newTrack(type);
                    else {
                        // Keep timing, take the new type's own fields from its defaults.
                        const keep = {};
                        for (const k of Object.keys(COMMON_DEFAULTS)) keep[k] = base[k];
                        next = normalizeTrack(Object.assign({}, TYPE_DEFAULTS[type], keep, { type }));
                    }
                }
                tracks[current] = next;
                loadForm(c, next);
                lastType = type;
            } else {
                tracks[current] = readForm(c);
            }
        }
        updateAnimateControls(c, tracks, current);
    };
    const collect = () => {
        tracks[current] = readForm(c);
        return tracks.filter(Boolean);
    };
    // Tracks as they would be saved, without disturbing the form.
    const peek = () => tracks.map((t, i) => i === current ? readForm(c) : t).filter(Boolean);
    return { onChange, collect, peek };
}

// ------------------------------------------------------------------- apply
/** New layer name and tag value for one element. */
function planNode(node, oldData, tracks, suffix) {
    const name = userName(node);
    const base = baseName(node, oldData);
    const auto = isAutoName(node, oldData);
    if (!tracks.length) {
        return { name: auto ? '' : base, tag: '' };
    }
    let newName;
    if (suffix) {
        const stem = base || defaultName(node);
        newName = stem.endsWith(suffix) ? stem : stem + suffix;
    } else {
        newName = auto ? '' : base;
    }
    const data = { tracks, suffix };
    if (auto) data.auto = true;
    return { name: newName, tag: serializeData(data), changedName: newName !== name };
}

function buildApplyCommand(doc, state, tracks, suffix) {
    const builder = CompoundCommandBuilder.create();
    let renamed = 0;
    for (const it of state.items) {
        const plan = planNode(it.node, it.data, tracks, suffix);
        const one = Selection.create(doc, [it.node]);
        builder.addCommand(DocumentCommand.createSetTagValueForKey(one, TAG_KEY, plan.tag));
        if (plan.name !== userName(it.node)) {
            builder.addCommand(DocumentCommand.createSetDescription(one, plan.name));
            renamed++;
        }
    }
    return { command: builder.createCommand(), renamed };
}
