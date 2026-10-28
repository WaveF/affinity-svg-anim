// Reusable presets contain the panel's eight track slots, not document identities
// or SVG output settings. Null slots preserve the user's track numbering.
const CONFIG_FORMAT = 'svg-anim-preset';
const CONFIG_VERSION = 1;

function parseConfig(text) {
    let raw;
    try { raw = JSON.parse(String(text).replace(/^\uFEFF/, '')); }
    catch (_) { throw new Error('The configuration file is not valid JSON.'); }
    if (!raw || Array.isArray(raw) || raw.format !== CONFIG_FORMAT) {
        throw new Error('Choose an SVG Anim preset JSON file.');
    }
    if (raw.schemaVersion !== CONFIG_VERSION) throw new Error('Unsupported configuration version: ' + raw.schemaVersion + '.');
    if (!Array.isArray(raw.tracks) || raw.tracks.length > MAX_TRACKS) throw new Error('A preset must contain at most ' + MAX_TRACKS + ' track slots.');
    const tracks = raw.tracks.map((track, i) => {
        if (track === null) return null;
        if (!track || Array.isArray(track) || typeof track !== 'object') throw new Error('Track ' + (i + 1) + ' is invalid.');
        const normalized = normalizeTrack(track);
        if (!normalized) throw new Error('Track ' + (i + 1) + ' has an unsupported type: ' + track.type + '.');
        // Missing fields receive defaults. Explicit invalid values must not be
        // silently clamped, dropped or replaced by a different enum value.
        for (const key of Object.keys(normalized)) {
            if (track[key] !== undefined && track[key] !== normalized[key]) {
                throw new Error('Track ' + (i + 1) + ': invalid ' + key + '.');
            }
        }
        return normalized;
    });
    const result = { tracks };
    if (raw.suffix !== undefined) {
        if (typeof raw.suffix !== 'string' || raw.suffix !== cleanSuffix(raw.suffix)) throw new Error('Invalid layer name suffix.');
        result.suffix = raw.suffix;
    }
    return result;
}

function configText(anim, suffix) {
    return JSON.stringify({
        format: CONFIG_FORMAT, schemaVersion: CONFIG_VERSION,
        createdWith: SCRIPT_NAME + ' v' + VERSION,
        tracks: anim.slots(), suffix: cleanSuffix(suffix)
    }, null, 2) + '\n';
}

function importConfigText(text, ui, anim) {
    const config = parseConfig(text); // Validate the entire file before touching the panel.
    anim.replace(config.tracks);
    if (config.suffix !== undefined) ui.animate.c.suffix.text = config.suffix;
    ui.mode.selectedIndex = MODES.indexOf('animate');
    // Loading a preset never starts an SVG export implicitly.
    ui.animate.c.exportAfter.value = false;
    return config;
}

function exportConfigFile(path, text) {
    path = String(path || '').trim();
    if (!path) return null;
    if (!/\.json$/i.test(path)) path += '.json';
    if (path.startsWith('~/')) path = homePath() + path.slice(1);
    if (!path.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(path)) throw new Error('Enter a full path for the JSON file.');
    const parent = path.replace(/[\\/][^\\/]*$/, '');
    if (parent && !fsApi.exists(parent)) fsApi.createDirectory(parent);
    writeText(path, text);
    return path;
}

function attachConfig(ui, anim, ctx, refresh) {
    let busy = false;
    let lastPath = joinPath(ctx.folder, 'animation-preset.json');
    const setBusy = value => {
        busy = value;
        ui.config.importButton.isEnabled = !value;
        ui.config.exportButton.isEnabled = !value;
        ui.config.clearButton.isEnabled = !value;
    };
    const act = action => {
        if (busy) return;
        setBusy(true);
        try {
            // Use synchronous native dialogs: async callbacks are deferred while
            // the parent runModal() is running in the Affinity JS engine.
            if (action === 0) {
                const path = app.chooseFile();
                if (!path) return;
                const config = importConfigText(readText(String(path)), ui, anim);
                lastPath = String(path);
                refresh();
                const count = config.tracks.filter(Boolean).length;
                app.alert('Loaded ' + count + ' track(s). OK applies this preset to the selection; Cancel keeps the original animation.', SCRIPT_TITLE);
            } else {
                const text = configText(anim, String(ui.animate.c.suffix.text || ''));
                const path = app.prompt('Save animation preset as JSON (full file path):', SCRIPT_TITLE, lastPath);
                if (!path || !String(path).trim()) return;
                let output = String(path).trim();
                if (!/\.json$/i.test(output)) output += '.json';
                if (output.startsWith('~/')) output = homePath() + output.slice(1);
                if (fsApi.exists(output) && !app.confirm('Replace the existing file?\n' + output, SCRIPT_TITLE)) return;
                lastPath = exportConfigFile(output, text);
                app.alert('Saved animation preset:\n' + lastPath, SCRIPT_TITLE);
            }
        } catch (error) {
            app.alert(compactError(error) + '\nFor file access errors, choose a folder allowed in Affinity Scripting settings (for example, the Desktop).', SCRIPT_TITLE);
        } finally {
            setBusy(false);
        }
    };
    ui.config.importButton.onClickHandler = () => act(0);
    ui.config.exportButton.onClickHandler = () => act(1);
    const clear = () => {
        if (busy) return;
        anim.replace([]);
        ui.mode.selectedIndex = MODES.indexOf('animate');
        ui.animate.c.exportAfter.value = false;
        refresh();
    };
    ui.config.clearButton.onClickHandler = clear;
    return { clear };
}
