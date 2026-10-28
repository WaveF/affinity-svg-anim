/*! SVG Anim runtime v0.4.1 | MIT License | (c) WaveF | https://github.com/WaveF/affinity-svg-anim */
/*
 * Plays animations described by data-svganim attributes inside an exported SVG.
 * Self-contained (no dependencies). Runs on the <svg> that contains this script,
 * both when the SVG is opened directly and when it is inlined into an HTML page.
 *
 * data-svganim = {"v":1,"n":<child count in Affinity>,"tracks":[{type, ...}]}
 */
(function () {
    'use strict';
    var SVGNS = 'http://www.w3.org/2000/svg';
    var script = document.currentScript;
    var root = (script && (script.ownerSVGElement || (script.closest && script.closest('svg')))) || document.documentElement;
    if (!root || root.__svgAnim) return;

    var NON_RENDERING = /^(defs|clipPath|mask|title|desc|metadata|style|script|linearGradient|radialGradient|pattern|filter|marker|symbol)$/;
    var GEOMETRY = /^(path|line|polyline|polygon|circle|ellipse|rect)$/;

    // ---------------------------------------------------------------- easing
    var C1 = 1.70158, C2 = C1 * 1.525, C3 = C1 + 1;
    function bounceOut(t) {
        var n = 7.5625, d = 2.75;
        if (t < 1 / d) return n * t * t;
        if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
        if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
        return n * (t -= 2.625 / d) * t + 0.984375;
    }
    var EASE = {
        linear: function (t) { return t; },
        sineIn: function (t) { return 1 - Math.cos(t * Math.PI / 2); },
        sineOut: function (t) { return Math.sin(t * Math.PI / 2); },
        sineInOut: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
        quadIn: function (t) { return t * t; },
        quadOut: function (t) { return 1 - (1 - t) * (1 - t); },
        quadInOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
        // The original Ease in/out/in-out curves are Cubic; retain their IDs.
        'in': function (t) { return t * t * t; },
        out: function (t) { return 1 - Math.pow(1 - t, 3); },
        inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
        quartIn: function (t) { return t * t * t * t; },
        quartOut: function (t) { return 1 - Math.pow(1 - t, 4); },
        quartInOut: function (t) { return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; },
        quintIn: function (t) { return t * t * t * t * t; },
        quintOut: function (t) { return 1 - Math.pow(1 - t, 5); },
        quintInOut: function (t) { return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2; },
        expoIn: function (t) { return t <= 0 || t >= 1 ? (t <= 0 ? 0 : 1) : Math.pow(2, 10 * t - 10); },
        expoOut: function (t) { return t <= 0 || t >= 1 ? (t <= 0 ? 0 : 1) : 1 - Math.pow(2, -10 * t); },
        expoInOut: function (t) {
            if (t <= 0 || t >= 1) return t <= 0 ? 0 : 1;
            return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
        },
        circIn: function (t) { return 1 - Math.sqrt(1 - t * t); },
        circOut: function (t) { return Math.sqrt(1 - Math.pow(t - 1, 2)); },
        circInOut: function (t) {
            return t < 0.5
                ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
                : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
        },
        backIn: function (t) { return C3 * t * t * t - C1 * t * t; },
        backOut: function (t) { return 1 + C3 * Math.pow(t - 1, 3) + C1 * Math.pow(t - 1, 2); },
        backInOut: function (t) {
            return t < 0.5
                ? (Math.pow(2 * t, 2) * ((C2 + 1) * 2 * t - C2)) / 2
                : (Math.pow(2 * t - 2, 2) * ((C2 + 1) * (t * 2 - 2) + C2) + 2) / 2;
        },
        elasticIn: function (t) {
            if (t <= 0 || t >= 1) return t <= 0 ? 0 : 1;
            return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * (2 * Math.PI) / 3);
        },
        elasticOut: function (t) {
            if (t <= 0 || t >= 1) return t <= 0 ? 0 : 1;
            return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
        },
        elasticInOut: function (t) {
            if (t <= 0 || t >= 1) return t <= 0 ? 0 : 1;
            var wave = Math.sin((20 * t - 11.125) * (2 * Math.PI) / 4.5);
            return t < 0.5 ? -Math.pow(2, 20 * t - 10) * wave / 2 : Math.pow(2, -20 * t + 10) * wave / 2 + 1;
        },
        bounceIn: function (t) { return 1 - bounceOut(1 - t); },
        bounceOut: bounceOut,
        bounceInOut: function (t) { return t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2; }
    };

    // --------------------------------------------------------------- helpers
    function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function hash(a, b) {
        var h = (a * 374761393 + b * 668265263) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }
    function renderChildren(el) {
        var out = [];
        for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
            if (!NON_RENDERING.test(c.localName)) out.push(c);
        }
        return out;
    }
    // Affinity may wrap a node's children in extra anonymous groups (clipping, effects).
    // Descend through single anonymous <g> wrappers until the expected child count is found.
    function childTargets(el, expected) {
        var list = renderChildren(el);
        var guard = 0;
        while (list.length === 1 && list[0].localName === 'g' && list.length !== expected && !list[0].hasAttribute('data-svganim') && guard++ < 8) {
            list = renderChildren(list[0]);
        }
        return list;
    }
    function geometryOf(el) {
        var out = [];
        if (GEOMETRY.test(el.localName)) out.push(el);
        var all = el.querySelectorAll('path,line,polyline,polygon,circle,ellipse,rect');
        for (var i = 0; i < all.length; i++) {
            var p = all[i].parentNode, skip = false;
            for (; p && p !== el; p = p.parentNode) if (NON_RENDERING.test(p.localName)) { skip = true; break; }
            if (!skip) out.push(all[i]);
        }
        return out;
    }
    function textLeaves(el) {
        var out = [];
        (function walk(n) {
            if ((n.localName === 'text' || n.localName === 'tspan') && !n.firstElementChild) { out.push(n); return; }
            for (var c = n.firstElementChild; c; c = c.nextElementSibling) walk(c);
        })(el);
        return out;
    }
    function firstCoord(node, attr) {
        var v = node.getAttribute(attr);
        if (v && /[\s,]/.test(v.trim())) node.setAttribute(attr, v.trim().split(/[\s,]+/)[0]);
    }
    function makeTextSetter(el) {
        var leaves = textLeaves(el), main = null;
        for (var i = 0; i < leaves.length; i++) if (leaves[i].textContent.trim()) { main = leaves[i]; break; }
        main = main || leaves[0] || null;
        if (!main) return { get: function () { return ''; }, set: function () {} };
        for (var j = 0; j < leaves.length; j++) if (leaves[j] !== main) leaves[j].textContent = '';
        // Per-glyph positions would scatter characters once the text length changes.
        firstCoord(main, 'x'); firstCoord(main, 'y'); main.removeAttribute('dx'); main.removeAttribute('textLength');
        for (var p = main.parentNode; p && p.localName === 'tspan'; p = p.parentNode) { firstCoord(p, 'x'); p.removeAttribute('textLength'); }
        var initial = main.textContent;
        return {
            get: function () { return initial; },
            set: function (s) { if (main.textContent !== s) main.textContent = s; }
        };
    }
    function decimalsOf(v) {
        var s = String(v), i = s.indexOf('.');
        return i < 0 ? 0 : s.length - i - 1;
    }
    function parseNumber(s) {
        var m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
        return m ? { value: Number(m[0]), decimals: m[1] ? m[1].length - 1 : 0 } : null;
    }
    function formatNumber(v, dec, padWidth, group) {
        var neg = v < 0 && Math.abs(v) >= Math.pow(10, -dec) / 2;
        var s = Math.abs(v).toFixed(dec);
        var parts = s.split('.');
        var intPart = parts[0];
        if (padWidth > intPart.length) intPart = new Array(padWidth - intPart.length + 1).join('0') + intPart;
        if (group) intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return (neg ? '-' : '') + intPart + (parts[1] ? '.' + parts[1] : '');
    }
    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    function formatClock(fmt, d) {
        var h = d.getHours();
        return fmt.replace(/YYYY|MM|DD|HH|hh|mm|ss|A/g, function (tok) {
            switch (tok) {
                case 'YYYY': return String(d.getFullYear());
                case 'MM': return pad2(d.getMonth() + 1);
                case 'DD': return pad2(d.getDate());
                case 'HH': return pad2(h);
                case 'hh': return pad2(h % 12 || 12);
                case 'mm': return pad2(d.getMinutes());
                case 'ss': return pad2(d.getSeconds());
                case 'A': return h < 12 ? 'AM' : 'PM';
            }
            return tok;
        });
    }

    // ------------------------------------------------------- transform slots
    // Each animated element is wrapped in a plain <g>, so animated transforms compose
    // with (instead of replacing) the element's own transform from Affinity.
    var slots = [];
    function slotFor(el) {
        if (el.__svgAnimSlot) return el.__svgAnimSlot;
        var g = document.createElementNS(SVGNS, 'g');
        g.setAttribute('class', 'svganim-wrap');
        el.parentNode.insertBefore(g, el);
        g.appendChild(el);
        var bbox = { x: 0, y: 0, width: 0, height: 0 };
        try { bbox = g.getBBox(); } catch (e) { /* not rendered */ }
        // Linear part of parent -> root mapping, used to express moves in document pixels.
        var a = 1, b = 0, c = 0, d = 1;
        try {
            var m = root.getScreenCTM().inverse().multiply(g.parentNode.getScreenCTM());
            a = m.a; b = m.b; c = m.c; d = m.d;
        } catch (e) { /* identity */ }
        var det = a * d - b * c;
        if (Math.abs(det) < 1e-12) { a = 1; b = 0; c = 0; d = 1; det = 1; }
        var slot = {
            g: g, bbox: bbox,
            inv: [d / det, -b / det, -c / det, a / det],
            flip: det < 0 ? -1 : 1,
            moves: [], rotates: [], scales: [], skews: [], opacity: 1, dirty: false
        };
        el.__svgAnimSlot = slot;
        slots.push(slot);
        return slot;
    }
    var PIVOT = { tl: [0, 0], tc: [0.5, 0], tr: [1, 0], cl: [0, 0.5], c: [0.5, 0.5], cr: [1, 0.5], bl: [0, 1], bc: [0.5, 1], br: [1, 1] };
    function pivotOf(slot, key) {
        var p = PIVOT[key] || PIVOT.c, bb = slot.bbox;
        return [bb.x + bb.width * p[0], bb.y + bb.height * p[1]];
    }
    function r4(v) { return Math.round(v * 10000) / 10000; }
    function flushSlot(s) {
        var ops = s.moves.concat(s.rotates, s.scales, s.skews);
        if (ops.length) s.g.setAttribute('transform', ops.join(' '));
        else if (s.dirty) s.g.removeAttribute('transform');
        if (s.opacity !== 1) s.g.style.opacity = String(r4(s.opacity));
        else if (s.dirty) s.g.style.opacity = '';
        s.dirty = ops.length > 0 || s.opacity !== 1;
        s.moves.length = 0; s.rotates.length = 0; s.scales.length = 0; s.skews.length = 0; s.opacity = 1;
    }

    // --------------------------------------------------------------- players
    var DIRS = { normal: 1, reverse: 1, alternate: 1, alternateReverse: 1 };
    function usesChildren(spec) {
        return spec.type === 'frames' || (spec.target === 'children' && spec.type !== 'count' && spec.type !== 'clock');
    }
    function Player(el, spec, targets) {
        this.el = el;
        this.spec = spec;
        this.type = spec.type;
        this.dur = Math.max(0.001, num(spec.dur, 1));
        this.delay = Math.max(0, num(spec.delay, 0));
        this.loops = Math.max(0, Math.floor(num(spec.loops, 0)));
        this.loopDelay = Math.max(0, num(spec.loopDelay, 0));
        this.dir = DIRS[spec.dir] ? spec.dir : 'normal';
        this.ease = EASE[spec.ease] || EASE.inOut;
        this.time = 0;
        this.rate = 0;
        this.targets = targets;
        var n = targets.length;
        var st = usesChildren(spec) && this.type !== 'frames' ? Math.max(0, num(spec.stagger, 0)) : 0;
        var shuffled = [];
        for (var i = 0; i < n; i++) shuffled.push(i);
        shuffled.sort(function (x, y) { return hash(x, 7) - hash(y, 7); });
        this.offsets = [];
        for (i = 0; i < n; i++) {
            var rank = spec.order === 'reverse' ? n - 1 - i
                : spec.order === 'center' ? Math.abs(i - (n - 1) / 2)
                : spec.order === 'random' ? shuffled.indexOf(i) : i;
            this.offsets.push(rank * st);
        }
        var maxOffset = 0;
        for (var k = 0; k < n; k++) maxOffset = Math.max(maxOffset, this.offsets[k]);
        var cycle = this.dur + this.loopDelay;
        this.end = this.loops > 0 ? this.delay + maxOffset + this.loops * cycle - this.loopDelay : Infinity;
        this.period = (this.dir === 'alternate' || this.dir === 'alternateReverse') ? 2 * cycle : cycle;
        this.setup();
    }
    Player.prototype.setup = function () {
        var self = this, spec = this.spec;
        switch (this.type) {
            case 'fade': case 'move': case 'rotate': case 'scale': case 'skew':
                this.slots = this.targets.map(slotFor);
                break;
            case 'draw':
                this.paths = this.targets.map(function (t) {
                    return geometryOf(t).map(function (g) {
                        var len = 0;
                        try { len = g.getTotalLength(); } catch (e) { /* unsupported */ }
                        return { el: g, len: len };
                    });
                });
                break;
            case 'count':
                this.text = makeTextSetter(this.el);
                var cur = parseNumber(this.text.get()) || { value: 0, decimals: 0 };
                var hasStart = spec.start !== null && spec.start !== undefined && spec.start !== '' && isFinite(Number(spec.start));
                this.from = hasStart ? Number(spec.start) : cur.value;
                this.to = num(spec.end, 0);
                var autoDec = Math.max(hasStart ? decimalsOf(spec.start) : cur.decimals, decimalsOf(this.to));
                this.dec = (spec.decimals === null || spec.decimals === undefined || spec.decimals < 0) ? autoDec : Math.floor(spec.decimals);
                this.padWidth = spec.pad ? String(Math.floor(Math.max(Math.abs(this.from), Math.abs(this.to)))).length : 0;
                this.seed = Math.floor(Math.random() * 100000);
                break;
            case 'clock':
                this.text = makeTextSetter(this.el);
                break;
            case 'frames':
                this.frameIndex = -1;
                break;
        }
        var trig = spec.trigger;
        if (this.type === 'clock') trig = 'load';
        if (trig === 'click') {
            this.el.style.cursor = 'pointer';
            this.el.addEventListener('click', function () { self.time = 0; self.rate = 1; wake(); });
        } else if (trig === 'hover') {
            this.el.addEventListener('mouseenter', function () { self.rate = 1; wake(); });
            this.el.addEventListener('mouseleave', function () {
                if (self.end === Infinity && self.time > self.delay + self.period) {
                    self.time = self.delay + ((self.time - self.delay) % self.period);
                }
                self.rate = -1; wake();
            });
        } else if (trig === 'view' && typeof IntersectionObserver === 'function') {
            var io = new IntersectionObserver(function (entries) {
                for (var i = 0; i < entries.length; i++) {
                    if (entries[i].isIntersecting) { self.rate = 1; io.disconnect(); wake(); break; }
                }
            }, { threshold: 0.2 });
            io.observe(this.el);
        } else {
            this.rate = 1;
            this.autoStart = true;
        }
    };
    Player.prototype.advance = function (dt) {
        if (!this.rate) return false;
        this.time += dt * this.rate;
        if (this.time <= 0 && this.rate < 0) { this.time = 0; this.rate = 0; }
        else if (this.time >= this.end && this.rate > 0) { this.time = this.end; this.rate = 0; }
        return this.rate !== 0;
    };
    // Eased progress (0..1) and iteration index for one target.
    Player.prototype.progress = function (i) {
        var local = this.time - this.delay - this.offsets[i];
        var cycle = this.dur + this.loopDelay, k = 0, p = 0;
        if (local > 0) {
            k = Math.floor(local / cycle);
            var within = local - k * cycle;
            if (this.loops > 0 && k >= this.loops) { k = this.loops - 1; p = 1; }
            else p = clamp01(within / this.dur);
        }
        var rev = this.dir === 'reverse' || (this.dir === 'alternate' && k % 2 === 1) || (this.dir === 'alternateReverse' && k % 2 === 0);
        if (rev) p = 1 - p;
        return { p: p, k: k, e: this.type === 'frames' ? p : this.ease(p) };
    };
    Player.prototype.apply = function () {
        var s = this.spec, n = this.targets.length, i, pr, slot;
        switch (this.type) {
            case 'fade':
                for (i = 0; i < n; i++) {
                    pr = this.progress(i);
                    var from = num(s.from, 100) / 100, to = num(s.to, 0) / 100;
                    this.slots[i].opacity *= Math.max(0, Math.min(1, from + (to - from) * pr.e));
                }
                break;
            case 'move':
                for (i = 0; i < n; i++) {
                    pr = this.progress(i); slot = this.slots[i];
                    var dx = num(s.x, 0) * pr.e, dy = num(s.y, 0) * pr.e, inv = slot.inv;
                    var lx = inv[0] * dx + inv[2] * dy, ly = inv[1] * dx + inv[3] * dy;
                    if (lx || ly) slot.moves.push('translate(' + r4(lx) + ' ' + r4(ly) + ')');
                }
                break;
            case 'rotate':
                for (i = 0; i < n; i++) {
                    pr = this.progress(i); slot = this.slots[i];
                    var ang = num(s.angle, 360) * pr.e * slot.flip, pv = pivotOf(slot, s.pivot);
                    if (ang) slot.rotates.push('rotate(' + r4(ang) + ' ' + r4(pv[0]) + ' ' + r4(pv[1]) + ')');
                }
                break;
            case 'scale':
                for (i = 0; i < n; i++) {
                    pr = this.progress(i); slot = this.slots[i];
                    var sx = 1 + (num(s.sx, 100) / 100 - 1) * pr.e, sy = 1 + (num(s.sy, 100) / 100 - 1) * pr.e;
                    var pc = pivotOf(slot, s.pivot);
                    if (sx !== 1 || sy !== 1) {
                        slot.scales.push('translate(' + r4(pc[0]) + ' ' + r4(pc[1]) + ') scale(' + r4(sx) + ' ' + r4(sy) + ') translate(' + r4(-pc[0]) + ' ' + r4(-pc[1]) + ')');
                    }
                }
                break;
            case 'skew':
                for (i = 0; i < n; i++) {
                    pr = this.progress(i); slot = this.slots[i];
                    // SVG parent axes, like Scale; angles and easing overshoot stay unbounded.
                    var ax = num(s.ax, 20) * pr.e, ay = num(s.ay, 0) * pr.e;
                    var ps = pivotOf(slot, s.pivot);
                    if (ax || ay) {
                        slot.skews.push('translate(' + r4(ps[0]) + ' ' + r4(ps[1]) + ') skewX(' + r4(ax) + ') skewY(' + r4(ay) + ') translate(' + r4(-ps[0]) + ' ' + r4(-ps[1]) + ')');
                    }
                }
                break;
            case 'draw':
                var seg = Math.max(0.001, Math.min(1, num(s.seg, 20) / 100));
                for (i = 0; i < n; i++) {
                    var e = this.progress(i).e, a0, a1;
                    switch (s.mode) {
                        case 'erase': a0 = e; a1 = 1; break;
                        case 'revealErase': if (e < 0.5) { a0 = 0; a1 = 2 * e; } else { a0 = 2 * e - 1; a1 = 1; } break;
                        case 'travel': a1 = (1 + seg) * e; a0 = a1 - seg; break;
                        default: a0 = 0; a1 = e;
                    }
                    a0 = clamp01(a0); a1 = clamp01(a1);
                    var paths = this.paths[i];
                    for (var j = 0; j < paths.length; j++) {
                        var g = paths[j], L = g.len, st = g.el.style;
                        if (!(L > 0)) continue;
                        if (a1 - a0 < 1e-4) { st.visibility = 'hidden'; continue; }
                        st.visibility = '';
                        st.strokeDasharray = r4((a1 - a0) * L) + ' ' + r4(L + 1);
                        st.strokeDashoffset = String(r4(-a0 * L));
                    }
                }
                break;
            case 'count':
                pr = this.progress(0);
                var v;
                if (s.random) {
                    var lo = Math.min(this.from, this.to), hi = Math.max(this.from, this.to);
                    var prev = pr.k === 0 ? this.from : lo + (hi - lo) * hash(this.seed, pr.k - 1);
                    var next = lo + (hi - lo) * hash(this.seed, pr.k);
                    v = prev + (next - prev) * this.ease(clamp01((this.time - this.delay - pr.k * (this.dur + this.loopDelay)) / this.dur));
                    if (this.time <= this.delay) v = this.from;
                } else {
                    v = this.from + (this.to - this.from) * pr.e;
                }
                this.text.set(formatNumber(v, this.dec, this.padWidth, !!s.group));
                break;
            case 'frames':
                pr = this.progress(0);
                var idx = Math.min(n - 1, Math.floor(pr.p * n));
                if (idx !== this.frameIndex) {
                    for (i = 0; i < n; i++) this.targets[i].style.visibility = i === idx ? '' : 'hidden';
                    this.frameIndex = idx;
                }
                break;
        }
    };

    // ------------------------------------------------------------ bootstrap
    var players = [];
    var clocks = [];
    var nodes = root.querySelectorAll('[data-svganim]');
    var entries = [];
    for (var i = 0; i < nodes.length; i++) {
        var data;
        try { data = JSON.parse(nodes[i].getAttribute('data-svganim')); } catch (e) { continue; }
        if (!data || !data.tracks || !data.tracks.length) continue;
        entries.push({ el: nodes[i], data: data });
    }
    // Resolve every target before wrapping anything, so wrappers never show up as "children".
    var pending = [];
    entries.forEach(function (en) {
        en.data.tracks.forEach(function (spec) {
            if (!spec || !spec.type || spec.type === 'none') return;
            pending.push({ el: en.el, spec: spec, targets: usesChildren(spec) ? childTargets(en.el, num(en.data.n, -1)) : [en.el] });
        });
    });
    pending.forEach(function (pd) {
        try {
            var p = new Player(pd.el, pd.spec, pd.targets);
            if (p.type === 'clock') clocks.push(p); else players.push(p);
        } catch (e) {
            if (window.console) console.warn('[svganim] skipped track', pd.spec, e);
        }
    });

    var raf = window.requestAnimationFrame || function (f) { return setTimeout(function () { f(Date.now()); }, 16); };
    var running = false, last = null, paused = false;
    function render() {
        for (var i = 0; i < players.length; i++) players[i].apply();
        for (var j = 0; j < slots.length; j++) flushSlot(slots[j]);
    }
    function frame(now) {
        var dt = last === null ? 0 : Math.min(0.25, (now - last) / 1000);
        last = now;
        var active = false;
        if (!paused) for (var i = 0; i < players.length; i++) if (players[i].advance(dt)) active = true;
        render();
        if (active && !paused) raf(frame);
        else { running = false; last = null; }
    }
    function wake() {
        if (running || paused) return;
        running = true; last = null; raf(frame);
    }
    function tickClocks() {
        var d = new Date();
        for (var i = 0; i < clocks.length; i++) clocks[i].text.set(formatClock(String(clocks[i].spec.format || 'HH:mm:ss'), d));
    }
    if (clocks.length) {
        tickClocks();
        setTimeout(function () { tickClocks(); setInterval(tickClocks, 1000); }, 1000 - (Date.now() % 1000) + 5);
    }
    render();
    wake();

    root.__svgAnim = {
        version: '0.4.1',
        players: players,
        play: function () { paused = false; wake(); },
        pause: function () { paused = true; },
        restart: function () {
            paused = false;
            players.forEach(function (p) { p.time = 0; p.rate = p.autoStart ? 1 : 0; });
            render(); wake();
        },
        seek: function (t) { players.forEach(function (p) { p.time = Math.max(0, Math.min(t, p.end)); }); render(); }
    };
})();
