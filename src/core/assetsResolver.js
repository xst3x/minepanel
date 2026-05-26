const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.resolve(__dirname, '../../assets');
const UNKNOWN_TEX = '/assets/minecraft/textures/misc/unknown.png';

let modelCache = {};

function readModel(namespace, category, name) {
    const modelPath = path.join(ASSETS_DIR, namespace, 'models', category, `${name}.json`);
    if (modelCache[modelPath]) return modelCache[modelPath];
    if (!fs.existsSync(modelPath)) return null;
    
    try {
        const json = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
        modelCache[modelPath] = json;
        return json;
    } catch (e) {
        console.error(`[AssetsResolver] Error parsing model ${modelPath}:`, e);
        return null;
    }
}

function resolveModelTextures(modelId) {
    if (typeof modelId !== 'string') return null;

    let namespace = 'minecraft';
    let pathPart = modelId;
    if (modelId.includes(':')) {
        [namespace, pathPart] = modelId.split(':');
    }
    
    let category = 'block';
    let name = pathPart;
    if (pathPart.includes('/')) {
        const parts = pathPart.split('/');
        category = parts[0];
        name = parts.slice(1).join('/');
    }

    const model = readModel(namespace, category, name);
    if (!model) return null;

    let textures = {};
    
    // Resolve parent textures recursively
    if (model.parent && !model.parent.startsWith('builtin/')) {
        const parentTextures = resolveModelTextures(model.parent);
        if (parentTextures) {
            // Parent textures are inherited
            Object.assign(textures, parentTextures);
        }
    }

    // Override with current model textures
    if (model.textures) {
        Object.assign(textures, model.textures);
    }

    // Resolve texture variables (references starting with #)
    const resolvedTextures = {};
    for (const [key, value] of Object.entries(textures)) {
        let val = value;
        let depth = 0;
        while (val && val.startsWith('#') && depth < 10) {
            val = textures[val.substring(1)];
            depth++;
        }
        if (val) {
            resolvedTextures[key] = val;
        }
    }

    return resolvedTextures;
}

function isModelFlat(modelId) {
    if (typeof modelId !== 'string') return false;

    let current = modelId;
    let depth = 0;
    while (current && depth < 10) {
        const cleanParent = current.replace(/^minecraft:/i, '').toLowerCase();
        if (cleanParent === 'item/generated' || 
            cleanParent === 'item/handheld' || 
            cleanParent === 'builtin/generated' ||
            cleanParent.includes('spawn_egg')) {
            return true;
        }

        let namespace = 'minecraft';
        let pathPart = current;
        if (current.includes(':')) {
            [namespace, pathPart] = current.split(':');
        }
        
        let category = 'block';
        let name = pathPart;
        if (pathPart.includes('/')) {
            const parts = pathPart.split('/');
            category = parts[0];
            name = parts.slice(1).join('/');
        }

        const model = readModel(namespace, category, name);
        if (!model || !model.parent) {
            break;
        }
        current = model.parent;
        depth++;
    }
    return false;
}

function buildAssetsIndex() {
    const index = {};
    modelCache = {}; // clear cache for fresh build

    // Ensure fallback exists
    const unknownTexPhysicalPath = path.join(ASSETS_DIR, 'minecraft', 'textures', 'misc', 'unknown.png');
    if (!fs.existsSync(unknownTexPhysicalPath)) {
        fs.mkdirSync(path.dirname(unknownTexPhysicalPath), { recursive: true });
        const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD7qdggAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAMElEQVR4nGO4c+fO379///79Y2BgYGBgYGBgYGBg+M/AwMDAwMDAwMDAwMDAwMDAwAD/YAYGz4G97wAAAABJRU5ErkJggg==';
        fs.writeFileSync(unknownTexPhysicalPath, Buffer.from(base64Png, 'base64'));
    }

    if (!fs.existsSync(ASSETS_DIR)) {
        return index;
    }

    const namespaces = fs.readdirSync(ASSETS_DIR).filter(f => fs.statSync(path.join(ASSETS_DIR, f)).isDirectory());

    let indexedCount = 0;

    for (const namespace of namespaces) {
        const itemDefsDir = path.join(ASSETS_DIR, namespace, 'items');
        const legacyModelsDir = path.join(ASSETS_DIR, namespace, 'models', 'item');
        
        const allItemIds = new Set();
        
        if (fs.existsSync(itemDefsDir)) {
            fs.readdirSync(itemDefsDir).filter(f => f.endsWith('.json')).forEach(f => allItemIds.add(path.basename(f, '.json')));
        }
        if (fs.existsSync(legacyModelsDir)) {
            fs.readdirSync(legacyModelsDir).filter(f => f.endsWith('.json')).forEach(f => allItemIds.add(path.basename(f, '.json')));
        }

        for (const itemId of allItemIds) {
            let modelRef = `${namespace}:item/${itemId}`;
            
            let entityTexRef = null;
            let entityType = null; // 'chest' | 'shulker' | 'bed' | null

            // Check 1.21.5+ item definitions
            const itemDefPath = path.join(itemDefsDir, `${itemId}.json`);
            if (fs.existsSync(itemDefPath)) {
                try {
                    const itemDef = JSON.parse(fs.readFileSync(itemDefPath, 'utf8'));
                    
                    // Extract special model info from any nested model node (model / fallback / cases[].model)
                    function extractSpecialModel(node) {
                        if (!node) return;
                        if (typeof node.model === 'string') { modelRef = node.model; return; }
                        if (typeof node.base === 'string')  { modelRef = node.base; }
                        // Direct special model
                        const spec = node.model;
                        if (spec && typeof spec === 'object') {
                            if (spec.type === 'minecraft:chest' && spec.texture) {
                                entityTexRef = `minecraft:entity/chest/${spec.texture.replace('minecraft:', '')}`;
                                entityType = 'chest';
                            } else if (spec.type === 'minecraft:bed' && spec.texture) {
                                entityTexRef = `minecraft:entity/bed/${spec.texture.replace('minecraft:', '')}`;
                                entityType = 'bed';
                            } else if (spec.type === 'minecraft:shulker_box' && spec.texture) {
                                entityTexRef = `minecraft:entity/shulker/${spec.texture.replace('minecraft:', '')}`;
                                entityType = 'shulker';
                            } else if (spec.type === 'minecraft:decorated_pot') {
                                entityTexRef = `minecraft:entity/decorated_pot/decorated_pot_side`;
                                entityType = 'decorated_pot';
                            } else if (spec.type === 'minecraft:head' && spec.kind) {
                                const kindMap = {
                                    dragon: 'entity/enderdragon/dragon',
                                    skeleton: 'entity/skeleton/skeleton',
                                    wither_skeleton: 'entity/skeleton/wither_skeleton',
                                    zombie: 'entity/zombie/zombie',
                                    creeper: 'entity/creeper/creeper',
                                    piglin: 'entity/piglin/piglin',
                                    player: 'entity/player/wide/steve'
                                };
                                const texPath = kindMap[spec.kind];
                                if (texPath) {
                                    entityTexRef = `minecraft:${texPath}`;
                                    entityType = `head_${spec.kind}`;
                                }
                            } else if (spec.type === 'minecraft:player_head') {
                                entityTexRef = 'minecraft:entity/player/wide/steve';
                                entityType = 'head_player';
                            } else if (spec.type === 'minecraft:banner') {
                                entityTexRef = `minecraft:entity/banner_base`;
                                entityType = `banner_${spec.color || 'white'}`;
                            } else if (spec.type === 'minecraft:conduit') {
                                entityTexRef = `minecraft:entity/conduit/base`;
                                entityType = 'conduit';
                            } else if (spec.type === 'minecraft:copper_golem_statue') {
                                const rawTex = spec.texture
                                    ? spec.texture.replace('minecraft:textures/', '').replace('.png', '')
                                    : 'entity/copper_golem/copper_golem';
                                entityTexRef = `minecraft:${rawTex}`;
                                entityType = 'copper_golem_statue';
                            }
                        }
                    }

                    if (itemDef.model) {
                        // Top-level direct model
                        extractSpecialModel(itemDef.model);
                        // Handle select type (chest has christmas/normal cases)
                        if (!entityTexRef && itemDef.model.fallback) {
                            extractSpecialModel(itemDef.model.fallback);
                        }
                        if (!entityTexRef && Array.isArray(itemDef.model.cases)) {
                            for (const c of itemDef.model.cases) extractSpecialModel(c.model);
                        }
                    }
                } catch (e) {
                    console.error(`[AssetsResolver] Error parsing item definition ${itemDefPath}:`, e);
                }
            }
            
            let texRef = entityTexRef;
            let topTexRef = entityTexRef;
            let frontTexRef = null;
            
            let isFlatItem = false;
            if (!texRef) {
                isFlatItem = isModelFlat(modelRef);
                const textures = resolveModelTextures(modelRef);
                if (textures) {
                    // Special case: decorated_pot uses entity textures for side/base
                    if (itemId === 'decorated_pot') {
                        texRef = `entity/decorated_pot/decorated_pot_side`;
                        topTexRef = `entity/decorated_pot/decorated_pot_base`;
                    } else {
                        // Special overrides for blocks whose primary texture isn't the first fallback key
                        if (itemId === 'beacon') {
                            texRef = textures['beacon'] || textures['glass'];
                            topTexRef = textures['beacon'] || texRef;
                        } else if (itemId === 'end_rod') {
                            texRef = textures['end_rod'] || textures['particle'];
                            topTexRef = texRef;
                        } else if (itemId === 'calibrated_sculk_sensor') {
                            texRef = textures['calibrated_side'] || textures['side'];
                            topTexRef = textures['top'] || texRef;
                        } else if (itemId === 'command_block') {
                            texRef = textures['side'] || textures['back'];
                            topTexRef = texRef;
                            frontTexRef = textures['front'] || textures['north'] || null;
                        } else {
                            texRef = textures['side'] || textures['sides'] || textures['all'] || textures['texture']
                              || textures['bottom'] || textures['layer0'] || textures['cross']
                              || textures['north'] || textures['east'] || textures['west'] || textures['south']
                              || textures['up'] || textures['down']
                              || textures['end_rod'] || textures['particle'];
                            // If still no side texture, fall back to the block texture using the item ID
                            if (!texRef) {
                                texRef = `block/${itemId}`;
                            }
                        }
                    }
                    // Determine top texture – use explicit "top" if present, otherwise fall back to side texture
                    if (itemId !== 'decorated_pot' && itemId !== 'beacon' && itemId !== 'end_rod') {
                        topTexRef = textures['top'] || textures['up'] || textures['end'] || texRef || textures['particle'];
                        // Grindstone specific top texture fallback
                        if (!topTexRef && itemId === 'grindstone') {
                            topTexRef = textures['pivot'] || textures['round'] || texRef;
                        }
                    }
                    // Determine front texture – prefer "front", then "north"
                    const rawFront = textures['front'] || textures['north'];
                    if (rawFront && rawFront !== texRef) {
                        frontTexRef = rawFront;
                    }
                    
                    if (!texRef) {
                        const keys = Object.keys(textures).filter(k => k !== 'particle');
                        if (keys.length > 0) texRef = textures[keys[0]];
                        else texRef = Object.values(textures)[0];
                        topTexRef = texRef;
                    }
                }
            }


            if (!texRef) continue;

            function resolveTexPath(ref) {
                if (!ref) return null;
                let ns = 'minecraft', p = ref;
                if (ref.includes(':')) [ns, p] = ref.split(':');
                const full = path.join(ASSETS_DIR, ns, 'textures', `${p}.png`);
                return fs.existsSync(full) ? { url: `/assets/${ns}/textures/${p}.png`, isBlock: p.startsWith('block/') } : null;
            }

            const sideResolvedRaw = resolveTexPath(texRef);
            const sideResolved = sideResolvedRaw || resolveTexPath(topTexRef);
            if (!sideResolved) continue;

            const topResolved  = resolveTexPath(topTexRef);
            const frontResolved = resolveTexPath(frontTexRef);

            // Entity-rendered items (chest, shulker, bed, banner, head) → object with entityType tag
            if (entityType) {
                const entry = { entityType, texture: sideResolved.url };
                if (entityType.startsWith('banner_')) {
                    entry.bannerColor = entityType.replace('banner_', '');
                }
                index[itemId] = entry;
                indexedCount++;
                continue;
            }

            const isBlock = (sideResolved.isBlock || itemId === 'decorated_pot') && !isFlatItem;

            if (isBlock) {
                const entry = { side: sideResolved.url };
                // Ensure top texture
                if (topResolved && topResolved.url && topResolved.url !== sideResolved.url) {
                    entry.top = topResolved.url;
                } else {
                    entry.top = sideResolved.url;
                }
                // Ensure front texture
                if (frontResolved && frontResolved.url && frontResolved.url !== sideResolved.url) {
                    entry.front = frontResolved.url;
                } else {
                    entry.front = sideResolved.url;
                }
                // Tag special item shapes so blockRenderer can render them correctly
                if (itemId.endsWith('_stairs')) entry.itemShape = 'stairs';
                else if (itemId.endsWith('_fence_gate') || itemId === 'fence_gate') entry.itemShape = 'fence_gate';
                else if (itemId.endsWith('_button') || itemId === 'button') entry.itemShape = 'button';
                else if (itemId === 'beacon') entry.itemShape = 'beacon';
                else if (itemId === 'end_rod') entry.itemShape = 'end_rod';
                else if (itemId === 'command_block') entry.itemShape = 'command_block';
                else if (itemId === 'grindstone') entry.itemShape = 'grindstone';
                else if (itemId === 'calibrated_sculk_sensor') entry.itemShape = 'calibrated_sculk_sensor';

                index[itemId] = entry;
            } else {
                // Check for tint (e.g. vine, leaves) — read from item definition
                let tintColor = null;
                const itemDefPathForTint = path.join(ASSETS_DIR, namespace, 'items', `${itemId}.json`);
                if (fs.existsSync(itemDefPathForTint)) {
                    try {
                        const itemDef = JSON.parse(fs.readFileSync(itemDefPathForTint, 'utf8'));
                        const tints = itemDef?.model?.tints;
                        if (Array.isArray(tints) && tints.length > 0) {
                            const t = tints[0];
                            if (t.type === 'minecraft:constant' && typeof t.value === 'number') {
                                // Convert signed int32 to ARGB hex — mask to 24-bit RGB
                                tintColor = '#' + (t.value & 0xFFFFFF).toString(16).padStart(6, '0');
                            }
                        }
                    } catch (_) {}
                }
                index[itemId] = tintColor ? { flat: sideResolved.url, tint: tintColor } : sideResolved.url;
            }
            indexedCount++;

        }
    }

    // Legacy / alias IDs (e.g. eye_of_ender → ender_eye)
    const aliases = {
        eye_of_ender: 'ender_eye'
    };
    for (const [alias, target] of Object.entries(aliases)) {
        if (index[target] && !index[alias]) {
            index[alias] = index[target];
        }
    }

    console.log(`[AssetsResolver] Built dynamic index for ${indexedCount} items based on model resolution.`);
    return index;
}

module.exports = {
    buildAssetsIndex,
    UNKNOWN_TEX
};
