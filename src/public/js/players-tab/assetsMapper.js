(function() {
    window.players = window.players || {};
    
    const MISSING_TEXTURE = '/assets/minecraft/textures/misc/unknown.png';
    
    let assetsIndex = null;
    let loadingPromise = null;
    const loggedMissing = new Set();

    function init(serverId) {
        if (assetsIndex) return Promise.resolve(assetsIndex);
        if (loadingPromise) return loadingPromise;

        console.log(`[AssetsMapper] Starting initialization for server: ${serverId}`);
        loadingPromise = api.req(`/servers/${serverId}/players/assets-index`)
            .then(data => {
                assetsIndex = data;
                console.log(`[AssetsMapper] Successfully loaded assets-index. Keys count: ${Object.keys(assetsIndex).length}`);
                return assetsIndex;
            })
            .catch(err => {
                console.error("[AssetsMapper] Failed to load assets-index:", err);
                assetsIndex = {}; // Fallback
                return assetsIndex;
            });

        return loadingPromise;
    }

    function getItemIconPath(id) {
        if (!id) return MISSING_TEXTURE;
        
        // Normalize:
        // minecraft:diamond_sword -> diamond_sword
        // 1. remove minecraft: prefix
        // 2. lowercase
        // 3. replace spaces with _
        let cleanId = id.replace(/^minecraft:/i, '').toLowerCase().replace(/\s+/g, '_');
        if (window.serverIconItems?.resolveItemId) {
            cleanId = window.serverIconItems.resolveItemId(cleanId);
        }
        
        if (!assetsIndex) {
            return MISSING_TEXTURE;
        }

        if (assetsIndex[cleanId]) {
            console.log(`[AssetsMapper] Resolved: "${id}" -> "${assetsIndex[cleanId]}"`);
            return assetsIndex[cleanId];
        }

        // Log missing texture once
        if (!loggedMissing.has(cleanId)) {
            loggedMissing.add(cleanId);
            console.warn(`[AssetsMapper] Missing texture for item ID: "${id}" (normalized: "${cleanId}")`);
        }

        return MISSING_TEXTURE;
    }

    window.players.assetsMapper = {
        init,
        getItemIconPath,
        MISSING_TEXTURE
    };
})();
