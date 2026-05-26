/**
 * blockRenderer.js
 * Canvas-based isometric block renderer.
 * Produces pixel-perfect Minecraft-style inventory block icons.
 */
(function () {
    'use strict';
    window.players = window.players || {};

    // Output canvas dimensions
    const OUT_W = 32, OUT_H = 32;
    // Texture space size (Minecraft textures are 16x16 in model space)
    const TEX = 16;

    const BANNER_DYE_COLORS = {
        white: '#F9FFFE', orange: '#F9801D', magenta: '#C74EBD', light_blue: '#3AB3DA',
        yellow: '#FED83D', lime: '#80C71F', pink: '#F38BAA', gray: '#474F52',
        light_gray: '#9D9D97', cyan: '#169C9C', purple: '#8932B2', blue: '#3C44AA',
        brown: '#835432', green: '#5E7C16', red: '#B02E26', black: '#1D1D21'
    };

    // 3D-to-2D Isometric Projection formula
    // Maps any 3D coordinate (X, Y, Z) in the [0, 16] space to [x, y] in the 32x32 canvas space.
    function project(X, Y, Z) {
        // Scale factor of 0.875 maps the 0-16 range to a 2-30 range, leaving a 2px padding on all sides to prevent clipping
        return [
            16 + (X - Z) * 0.875,
            16 + (0.5 * X + 0.5 * Z - Y) * 0.875
        ];
    }

    // Affine transformation parameters solver
    // Maps texture coordinates (0, 0), (texW, 0), (0, texH) to three projected canvas points.
    function getFaceTransform(p0, p1, p2, texW, texH) {
        const e = p0[0];
        const f = p0[1];
        const a = (p1[0] - p0[0]) / texW;
        const b = (p1[1] - p0[1]) / texW;
        const c = (p2[0] - p0[0]) / texH;
        const d = (p2[1] - p0[1]) / texH;
        return [a, b, c, d, e, f];
    }

    // Dynamic bounding boxes for non-solid blocks
    function getBoundsForId(id) {
        if (!id) return [0, 0, 0, 16, 16, 16];
        const cleanId = id.replace(/^minecraft:/i, '').toLowerCase();

        if (cleanId.includes('slab')) {
            return [0, 0, 0, 16, 8, 16];
        }
        if (cleanId.includes('carpet')) {
            return [0, 0, 0, 16, 1, 16];
        }
        if (cleanId.includes('trapdoor')) {
            return [0, 0, 0, 16, 3, 16];
        }
        if (cleanId.includes('pressure_plate')) {
            return [1, 0, 1, 15, 1, 15];
        }
        if (cleanId.includes('enchanting_table')) {
            return [0, 0, 0, 16, 12, 16];
        }
        if (cleanId.includes('end_portal_frame')) {
            return [0, 0, 0, 16, 13, 16];
        }
        if (cleanId.includes('daylight_detector')) {
            return [0, 0, 0, 16, 6, 16];
        }
        if (cleanId.includes('dirt_path') || cleanId.includes('farmland')) {
            return [0, 0, 0, 16, 15, 16];
        }
        if (cleanId.includes('chest')) {
            return [1, 0, 1, 15, 14, 15];
        }
        if (cleanId.includes('cake')) {
            return [1, 0, 1, 15, 8, 15];
        }
        if (cleanId.includes('anvil')) {
            return [2, 0, 2, 14, 16, 14];
        }
        if (cleanId.includes('stonecutter')) {
            return [0, 0, 0, 16, 9, 16];
        }
        if (cleanId.includes('decorated_pot')) {
            return [1, 0, 1, 15, 16, 15];
        }
        if (cleanId.includes('lectern')) {
            return [0, 0, 0, 16, 14, 16];
        }
        if (cleanId.includes('cactus')) {
            return [1, 0, 1, 15, 16, 15];
        }
        if (cleanId.includes('bed')) {
            return [0, 0, 0, 16, 6, 16];
        }

        return [0, 0, 0, 16, 16, 16];
    }

    const imgCache = {};
    function loadImg(src) {
        if (imgCache[src]) return imgCache[src];
        const p = new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
        imgCache[src] = p;
        return p;
    }

    function clipPoly(ctx, poly) {
        ctx.beginPath();
        ctx.moveTo(poly[0][0], poly[0][1]);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
        ctx.closePath();
        ctx.clip();
    }

    const avgColorCache = new WeakMap();
    function getAverageColor(img) {
        if (!img) return 'transparent';
        if (avgColorCache.has(img)) return avgColorCache.get(img);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 1;
        tempCanvas.height = 1;
        const tempCtx = tempCanvas.getContext('2d');
        try {
            tempCtx.drawImage(img, 0, 0, 1, 1);
            const pixel = tempCtx.getImageData(0, 0, 1, 1).data;
            // If the image is mostly transparent, keep transparent, otherwise get solid rgb
            const color = pixel[3] < 50 ? 'transparent' : `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
            avgColorCache.set(img, color);
            return color;
        } catch (e) {
            avgColorCache.set(img, 'transparent');
            return 'transparent';
        }
    }

    function cropImage(img, sx, sy, sw, sh) {
        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        return canvas;
    }

    function drawDynamicFace(ctx, img, p0, p1, p2, poly, dark) {
        if (!img) return;
        
        // Fill face with average color first to prevent seam bleeding/gaps
        const avgColor = getAverageColor(img);
        
        const transform = getFaceTransform(p0, p1, p2, img.width, img.height);
        ctx.save();
        clipPoly(ctx, poly);
        
        if (avgColor !== 'transparent') {
            ctx.fillStyle = avgColor;
            ctx.fill();
        }
        
        ctx.setTransform(...transform);
        ctx.drawImage(img, 0, 0);
        if (dark > 0) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = `rgba(0,0,0,${dark})`;
            ctx.fillRect(0, 0, OUT_W, OUT_H);
        }
        ctx.restore();
    }

    function drawBox(ctx, box, topImg, leftImg, rightImg) {
        const [xMin, yMin, zMin, xMax, yMax, zMax] = box;

        // Project top face corners
        const P_top_0 = project(xMin, yMax, zMin); // Back
        const P_top_1 = project(xMax, yMax, zMin); // Right
        const P_top_2 = project(xMax, yMax, zMax); // Front
        const P_top_3 = project(xMin, yMax, zMax); // Left

        // Project left face (Z = zMax face) corners
        const P_left_0 = project(xMin, yMax, zMax); // Top-Left
        const P_left_1 = project(xMax, yMax, zMax); // Top-Right
        const P_left_2 = project(xMax, yMin, zMax); // Bottom-Right
        const P_left_3 = project(xMin, yMin, zMax); // Bottom-Left

        // Project right face (X = xMax face) corners
        const P_right_0 = project(xMax, yMax, zMax); // Top-Left
        const P_right_1 = project(xMax, yMax, zMin); // Top-Right
        const P_right_2 = project(xMax, yMin, zMin); // Bottom-Right
        const P_right_3 = project(xMax, yMin, zMax); // Bottom-Left

        // Draw top face
        if (topImg) {
            drawDynamicFace(ctx, topImg, P_top_0, P_top_1, P_top_3, [P_top_0, P_top_1, P_top_2, P_top_3], 0);
        }

        // Draw left face
        if (leftImg) {
            drawDynamicFace(ctx, leftImg, P_left_0, P_left_1, P_left_3, [P_left_0, P_left_1, P_left_2, P_left_3], 0.2);
        }

        // Draw right face
        if (rightImg) {
            drawDynamicFace(ctx, rightImg, P_right_0, P_right_1, P_right_3, [P_right_0, P_right_1, P_right_2, P_right_3], 0.35);
        }
    }

    /**
     * Render a block into `canvas` given texture URLs and bounds or block ID.
     * @param {HTMLCanvasElement} canvas
     * @param {string} topSrc    URL for top face texture
     * @param {string} sideSrc   URL for left/right face texture
     * @param {string|null} frontSrc  URL for right (front/south) face if different
     * @param {Array|string|null} boundsOrId  Optional bounding box or block ID for non-solid scaling
     * @param {string|null} itemShape  Optional shape hint ('stairs', 'fence_gate', 'button', etc.)
     */
    async function renderBlock(canvas, topSrc, sideSrc, frontSrc, boundsOrId, itemShape) {
        const ctx = canvas.getContext('2d');
        canvas.width  = OUT_W;
        canvas.height = OUT_H;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, OUT_W, OUT_H);

        const [topImg, sideImg, frontImg] = await Promise.all([
            loadImg(topSrc  || sideSrc),
            loadImg(sideSrc),
            loadImg(frontSrc || sideSrc),
        ]);

        let cleanId = '';
        if (typeof boundsOrId === 'string') {
            cleanId = boundsOrId.replace(/^minecraft:/i, '').toLowerCase();
        }

        // ── ITEM SHAPE OVERRIDES (from assetsResolver itemShape hints) ────────
        if (itemShape === 'stairs' || (!itemShape && cleanId.endsWith('_stairs'))) {
            // Bottom slab + upper back step
            drawBox(ctx, [0, 0, 0, 16,  8, 16], topImg, sideImg, frontImg || sideImg);
            drawBox(ctx, [0, 8, 0, 16, 16,  8], topImg, sideImg, frontImg || sideImg);
            return;
        }

        if (itemShape === 'fence_gate' || (!itemShape && (cleanId.endsWith('_fence_gate') || cleanId === 'fence_gate'))) {
            const t = sideImg;
            drawBox(ctx, [ 0, 5, 7,  2, 16, 9], t, t, t);  // Left post
            drawBox(ctx, [14, 5, 7, 16, 16, 9], t, t, t);  // Right post
            drawBox(ctx, [ 6, 6, 7,  8, 15, 9], t, t, t);  // Left inner post
            drawBox(ctx, [ 8, 6, 7, 10, 15, 9], t, t, t);  // Right inner post
            drawBox(ctx, [ 2, 6, 7,  6,  9, 9], t, t, t);  // Left lower bar
            drawBox(ctx, [ 2,12, 7,  6, 15, 9], t, t, t);  // Left upper bar
            drawBox(ctx, [10, 6, 7, 14,  9, 9], t, t, t);  // Right lower bar
            drawBox(ctx, [10,12, 7, 14, 15, 9], t, t, t);  // Right upper bar
            return;
        }

        if (itemShape === 'button' || (!itemShape && (cleanId.endsWith('_button') || cleanId === 'button'))) {
            drawBox(ctx, [5, 6, 6, 11, 10, 10], topImg, sideImg, sideImg);
            return;
        }

        if (itemShape === 'command_block' || cleanId === 'command_block') {
            // Command block textures are animated spritesheets (height = N*width).
            // Always crop the first frame (top 16x16 pixels scaled) for all faces.
            function cropFirstFrame(img) {
                if (!img) return img;
                const fw = img.width;
                const fh = fw; // one frame is square
                if (img.height <= fh) return img;
                return cropImage(img, 0, 0, fw, fh);
            }
            const sideFrame  = cropFirstFrame(sideImg);
            const frontFrame = cropFirstFrame(frontImg || sideImg);
            const topImg2    = await loadImg(topSrc || sideSrc);
            const topFrame   = cropFirstFrame(topImg2);
            drawBox(ctx, [0, 0, 0, 16, 16, 16], topFrame, sideFrame, frontFrame);
            return;
        }

        if (itemShape === 'beacon' || cleanId === 'beacon') {
            const glassImg = await loadImg('/assets/minecraft/textures/block/glass.png') || sideImg;
            const obsidImg = await loadImg('/assets/minecraft/textures/block/obsidian.png') || sideImg;
            drawBox(ctx, [ 0,  0,  0, 16, 16, 16], glassImg, glassImg, glassImg);
            drawBox(ctx, [ 2,  0,  2, 14,  3, 14], obsidImg, obsidImg, obsidImg);
            drawBox(ctx, [ 3,  3,  3, 13, 14, 13], topImg,   topImg,   topImg);
            return;
        }

        if (itemShape === 'end_rod' || cleanId === 'end_rod') {
            // end_rod.png is 16x16. UV coords taken directly from end_rod.json elements:
            // Base knob: from [6,0,6] to [10,1,10]
            //   sides UV [2,6,6,7] → cropImage(img, 2,6, 4,1) — 4px wide, 1px tall strip
            //   top   UV [2,2,6,6] → cropImage(img, 2,2, 4,4) — 4x4 top
            // Shaft:     from [7,1,7] to [9,16,9]
            //   sides UV [0,0,2,15] → cropImage(img, 0,0, 2,15) — 2px wide, 15px tall
            //   top   UV [2,0,4,2]  → cropImage(img, 2,0, 2,2)
            const rodTex = sideImg;
            const sc = rodTex ? rodTex.width / 16 : 1;

            const knobSideTex = rodTex ? cropImage(rodTex, 2*sc, 6*sc, 4*sc, 1*sc) : rodTex;
            const knobTopTex  = rodTex ? cropImage(rodTex, 2*sc, 2*sc, 4*sc, 4*sc) : rodTex;
            const shaftSideTex = rodTex ? cropImage(rodTex, 0,    0,    2*sc, 15*sc) : rodTex;
            const shaftTopTex  = rodTex ? cropImage(rodTex, 2*sc, 0,    2*sc, 2*sc)  : rodTex;

            // Draw base knob [6,0,6 → 10,1,10]
            drawBox(ctx, [6, 0, 6, 10, 1, 10], knobTopTex, knobSideTex, knobSideTex);
            // Draw shaft     [7,1,7 → 9,16,9]
            drawBox(ctx, [7, 1, 7,  9, 16, 9], shaftTopTex, shaftSideTex, shaftSideTex);
            return;
        }

        if (cleanId.includes('anvil')) {
            drawBox(ctx, [2, 0, 2, 14, 4, 14], sideImg, sideImg, frontImg || sideImg);
            drawBox(ctx, [4, 4, 3, 12, 5, 13], sideImg, sideImg, frontImg || sideImg);
            drawBox(ctx, [6, 5, 4, 10, 10, 12], sideImg, sideImg, frontImg || sideImg);
            drawBox(ctx, [3, 10, 0, 13, 16, 16], topImg, sideImg, frontImg || sideImg);
            return;
        }

        if (itemShape === 'grindstone' || cleanId === 'grindstone') {
            const [pivotImg, roundImg, legImg] = await Promise.all([
                loadImg('/assets/minecraft/textures/block/grindstone_pivot.png'),
                loadImg('/assets/minecraft/textures/block/grindstone_round.png'),
                loadImg('/assets/minecraft/textures/block/dark_oak_log.png')
            ]);
            const activeLegImg = legImg || sideImg;
            const activePivotImg = pivotImg || sideImg;
            const activeRoundImg = roundImg || sideImg;
            const activeSideImg = sideImg;

            drawBox(ctx, [2, 0, 6, 4, 7, 10], activeLegImg, activeLegImg, activeLegImg);
            drawBox(ctx, [2, 7, 5, 4, 13, 11], activePivotImg, activePivotImg, activePivotImg);
            drawBox(ctx, [4, 4, 2, 12, 16, 14], activeRoundImg, activeSideImg, activeSideImg);
            drawBox(ctx, [12, 0, 6, 14, 7, 10], activeLegImg, activeLegImg, activeLegImg);
            drawBox(ctx, [12, 7, 5, 14, 13, 11], activePivotImg, activePivotImg, activePivotImg);
            return;
        }

        if (cleanId === 'decorated_pot') {
            const terracottaImg = await loadImg('/assets/minecraft/textures/block/terracotta.png') || sideImg;
            
            // Crop the top-left 16x16 (scaled by topImg.width/32) of decorated_pot_base for the rim top
            const mult = topImg.width / 32;
            const rimTopImg = cropImage(topImg, 0, 0, 16 * mult, 16 * mult);

            // Draw Body [2, 0, 2, 14, 10.1, 14]
            drawBox(ctx, [2, 0, 2, 14, 10.1, 14], terracottaImg, sideImg, sideImg);
            // Draw Neck [4, 9.9, 4, 12, 12.1, 12]
            drawBox(ctx, [4, 9.9, 4, 12, 12.1, 12], terracottaImg, terracottaImg, terracottaImg);
            // Draw Rim [3, 11.9, 3, 13, 16, 13]
            drawBox(ctx, [3, 11.9, 3, 13, 16, 13], rimTopImg, terracottaImg, terracottaImg);
            return;
        }

        if (cleanId.includes('shelf') && !cleanId.includes('bookshelf')) {
            const mult = sideImg.width / 16;
            const getCrop = (u0, v0, u1, v1) => {
                const su0 = Math.min(u0, u1);
                const sv0 = Math.min(v0, v1);
                const sw = Math.abs(u1 - u0);
                const sh = Math.abs(v1 - v0);
                return cropImage(sideImg, su0 * mult, sv0 * mult, sw * mult, sh * mult);
            };

            // 1. Body: [0, 0, 0, 16, 16, 3] (Rotated 180 deg)
            const bodyTop = getCrop(8, 3.5, 16, 5);
            const bodyLeft = getCrop(8, 0, 16, 8);
            const bodyRight = getCrop(8, 0, 9.5, 8);
            drawBox(ctx, [0, 0, 0, 16, 16, 3], bodyTop, bodyLeft, bodyRight);

            // 2. Bottom Shelf: [0, 0, 3, 16, 4, 5] (Rotated 180 deg)
            const bottomTop = getCrop(8, 3.5, 16, 4.5);
            const bottomLeft = getCrop(0, 6, 8, 8);
            const bottomRight = getCrop(1.5, 6, 2.5, 8);
            drawBox(ctx, [0, 0, 3, 16, 4, 5], bottomTop, bottomLeft, bottomRight);

            // 3. Top Shelf: [0, 12, 3, 16, 16, 5] (Rotated 180 deg)
            const topTop = getCrop(8, 5, 16, 6);
            const topLeft = getCrop(0, 0, 8, 2);
            const topRight = getCrop(1.5, 0, 2.5, 2);
            drawBox(ctx, [0, 12, 3, 16, 16, 5], topTop, topLeft, topRight);
            return;
        }

        if (cleanId.includes('enchanting_table')) {
            const scale = sideImg.height / 16;
            const sideCropped = cropImage(sideImg, 0, 4 * scale, sideImg.width, 12 * scale);
            drawBox(ctx, [0, 0, 0, 16, 12, 16], topImg, sideCropped, sideCropped);
            return;
        }

        if (cleanId.includes('sculk_shrieker')) {
            const scale = sideImg.height / 16;
            const bottomSide = cropImage(sideImg, 0, 8 * scale, sideImg.width, 8 * scale);
            const topSide = cropImage(sideImg, 0, 0, sideImg.width, 8 * scale);
            const innerTopImg = await loadImg('/assets/minecraft/textures/block/sculk_shrieker_inner_top.png') || topImg;

            // Draw bottom slab: [0, 0, 0, 16, 8, 16]
            drawBox(ctx, [0, 0, 0, 16, 8, 16], innerTopImg, bottomSide, bottomSide);
            // Draw top slab: [1, 8, 1, 15, 15, 15]
            drawBox(ctx, [1, 8, 1, 15, 15, 15], topImg, topSide, topSide);
            return;
        }

        if (itemShape === 'calibrated_sculk_sensor' || cleanId === 'calibrated_sculk_sensor') {
            const scale = sideImg.height / 16;
            const baseSide = cropImage(sideImg, 0, 8 * scale, sideImg.width, 8 * scale);
            const inputSideImg = await loadImg('/assets/minecraft/textures/block/calibrated_sculk_sensor_input_side.png') || sideImg;
            const inputSideCropped = cropImage(inputSideImg, 0, 8 * scale, inputSideImg.width, 8 * scale);
            const amethystImg = await loadImg('/assets/minecraft/textures/block/calibrated_sculk_sensor_amethyst.png') || sideImg;

            // Draw base: [0, 0, 0, 16, 8, 16]
            // Top: topImg, Left: baseSide, Right: inputSideCropped
            drawBox(ctx, [0, 0, 0, 16, 8, 16], topImg, baseSide, inputSideCropped);

            // Draw intersecting amethyst crystals (Y = 8 to 20)
            // Plane 1: X = 8, Z = 0 to 16
            const P0 = project(8, 20, 0);
            const P1 = project(8, 20, 16);
            const P2 = project(8, 8, 16);
            const P3 = project(8, 8, 0);
            drawDynamicFace(ctx, amethystImg, P0, P1, P3, [P0, P1, P2, P3], 0);

            // Plane 2: Z = 8, X = 0 to 16
            const Q0 = project(0, 20, 8);
            const Q1 = project(16, 20, 8);
            const Q2 = project(16, 8, 8);
            const Q3 = project(0, 8, 8);
            drawDynamicFace(ctx, amethystImg, Q0, Q1, Q3, [Q0, Q1, Q2, Q3], 0);
            return;
        }

        if (cleanId.includes('sculk_sensor')) {
            const scale = sideImg.height / 16;
            const baseSide = cropImage(sideImg, 0, 8 * scale, sideImg.width, 8 * scale);
            const tendrilsImg = await loadImg('/assets/minecraft/textures/block/sculk_sensor_tendril_inactive.png') || sideImg;
            
            // Draw base: [0, 0, 0, 16, 8, 16]
            drawBox(ctx, [0, 0, 0, 16, 8, 16], topImg, baseSide, baseSide);
            // Draw tendrils box in the center: [4, 8, 4, 12, 14, 12]
            drawBox(ctx, [4, 8, 4, 12, 14, 12], tendrilsImg, tendrilsImg, tendrilsImg);
            return;
        }

        if (cleanId === 'dragon_egg') {
            // Dragon egg is a stepped pyramid shape built from multiple stacked tiers
            drawBox(ctx, [1,  3, 1, 15,  8, 15], sideImg, sideImg, sideImg);
            drawBox(ctx, [2,  1, 2, 14,  3, 14], sideImg, sideImg, sideImg);
            drawBox(ctx, [3,  0, 3, 13, 13, 13], sideImg, topImg,  sideImg);
            drawBox(ctx, [4, 13, 4, 12, 14, 12], sideImg, topImg,  sideImg);
            drawBox(ctx, [5, 14, 5, 11, 15, 11], sideImg, topImg,  sideImg);
            drawBox(ctx, [6, 15, 6, 10, 16, 10], sideImg, topImg,  sideImg);
            return;
        }

        // ── GRASS BLOCK colormap tint ──────────────────────────────────────────
        // grass_block_top.png is a greyscale mask; apply plains biome green (#5FB236)
        // and also composite the side overlay (grass_block_side_overlay.png) on the sides.
        if (cleanId === 'grass_block') {
            const GRASS_COLOR = '#5FB236';
            // Tinted top
            const tintedTop = document.createElement('canvas');
            tintedTop.width = topImg ? topImg.width : 16;
            tintedTop.height = topImg ? topImg.height : 16;
            const ttCtx = tintedTop.getContext('2d');
            ttCtx.imageSmoothingEnabled = false;
            if (topImg) ttCtx.drawImage(topImg, 0, 0);
            ttCtx.globalCompositeOperation = 'multiply';
            ttCtx.fillStyle = GRASS_COLOR;
            ttCtx.fillRect(0, 0, tintedTop.width, tintedTop.height);
            ttCtx.globalCompositeOperation = 'destination-in';
            if (topImg) ttCtx.drawImage(topImg, 0, 0);
            ttCtx.globalCompositeOperation = 'source-over';

            // Side with tinted overlay
            const overlayImg = await loadImg('/assets/minecraft/textures/block/grass_block_side_overlay.png');
            const tintedSide = document.createElement('canvas');
            tintedSide.width = sideImg ? sideImg.width : 16;
            tintedSide.height = sideImg ? sideImg.height : 16;
            const tsCtx = tintedSide.getContext('2d');
            tsCtx.imageSmoothingEnabled = false;
            if (sideImg) tsCtx.drawImage(sideImg, 0, 0);
            if (overlayImg) {
                // Draw tinted overlay on top
                const ov = document.createElement('canvas');
                ov.width = tintedSide.width; ov.height = tintedSide.height;
                const ovCtx = ov.getContext('2d');
                ovCtx.imageSmoothingEnabled = false;
                ovCtx.drawImage(overlayImg, 0, 0, overlayImg.width, overlayImg.height, 0, 0, ov.width, ov.height);
                ovCtx.globalCompositeOperation = 'multiply';
                ovCtx.fillStyle = GRASS_COLOR;
                ovCtx.fillRect(0, 0, ov.width, ov.height);
                ovCtx.globalCompositeOperation = 'destination-in';
                ovCtx.drawImage(overlayImg, 0, 0, overlayImg.width, overlayImg.height, 0, 0, ov.width, ov.height);
                ovCtx.globalCompositeOperation = 'source-over';
                tsCtx.drawImage(ov, 0, 0);
            }

            drawBox(ctx, [0, 0, 0, 16, 16, 16], tintedTop, tintedSide, tintedSide);
            return;
        }

        let bounds = [0, 0, 0, 16, 16, 16];
        if (Array.isArray(boundsOrId)) {
            bounds = boundsOrId;
        } else if (typeof boundsOrId === 'string') {
            bounds = getBoundsForId(boundsOrId);
        }

        drawBox(ctx, bounds, topImg, sideImg, frontImg || sideImg);
    }

    /**
     * Render an entity-texture block (chest, shulker_box, bed)
     * by showing a beautiful composite 3D isometric cube.
     */
    async function renderEntityBlock(canvas, entitySrc, type) {
        const ctx = canvas.getContext('2d');
        canvas.width  = OUT_W;
        canvas.height = OUT_H;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, OUT_W, OUT_H);

        const img = await loadImg(entitySrc);
        if (!img) return;

        // ── DECORATED POT ─────────────────────────────────────────────────
        if (type === 'decorated_pot') {
            // Render using renderBlock with the entity textures directly
            const topImg  = await loadImg('/assets/minecraft/textures/entity/decorated_pot/decorated_pot_base.png');
            const sideImg = img; // decorated_pot_side.png

            const terracottaImg = await loadImg('/assets/minecraft/textures/block/terracotta.png') || sideImg;
            const mult = (topImg || sideImg).width / 32;
            const rimTopImg = topImg ? cropImage(topImg, 0, 0, 16 * mult, 16 * mult) : sideImg;

            // Body
            drawBox(ctx, [2, 0, 2, 14, 10.1, 14], terracottaImg, sideImg, sideImg);
            // Neck
            drawBox(ctx, [4, 9.9, 4, 12, 12.1, 12], terracottaImg, terracottaImg, terracottaImg);
            // Rim
            drawBox(ctx, [3, 11.9, 3, 13, 16, 13], rimTopImg, terracottaImg, terracottaImg);
            return;
        }

        // ── SKULL / HEAD ITEMS ────────────────────────────────────────────
        if (type && type.startsWith('head_')) {
            const kind = type.replace('head_', '');
            // Draw a flat head icon using the entity skin texture
            // Extract face region from skin and show it flat
            const headCanvas = document.createElement('canvas');
            headCanvas.width = 32;
            headCanvas.height = 32;
            const hCtx = headCanvas.getContext('2d');
            hCtx.imageSmoothingEnabled = false;

            if (kind === 'dragon') {
                // dragon.png is 256x256 (or sc multiples).
                // Head box UV offset=(0,0), w=8, h=8, d=14 (Minecraft Java source):
                //   top:   cropImage(img, 14*sc, 0,     8*sc, 14*sc)
                //   side:  cropImage(img,  0,    14*sc, 14*sc,  8*sc)
                //   front: cropImage(img, 14*sc, 14*sc,  8*sc,  8*sc)
                const sc = img.width / 256;
                const dragonTop   = cropImage(img, 14*sc,  0,      8*sc, 14*sc);
                const dragonSide  = cropImage(img,  0,     14*sc, 14*sc,  8*sc);
                const dragonFront = cropImage(img, 14*sc,  14*sc,  8*sc,  8*sc);
                // Box proportional to head dims w=8, h=8, d=14 → scaled to 16-unit space
                drawBox(ctx, [0, 0, 0, 16, 9, 16], dragonTop, dragonSide, dragonFront);
            } else {
                const scale = img.width >= 64 ? img.width / 64 : 1;
                const faceImg = cropImage(img, 8 * scale, 8 * scale, 8 * scale, 8 * scale);
                drawBox(ctx, [2, 2, 2, 14, 14, 14], faceImg, faceImg, faceImg);
            }
            return;
        }

        // ── BANNER ───────────────────────────────────────────────────────────
        if (type && type.startsWith('banner_')) {
            const color = type.replace('banner_', '');
            const dye = BANNER_DYE_COLORS[color] || BANNER_DYE_COLORS.white;
            const poleImg = await loadImg('/assets/minecraft/textures/block/oak_planks.png')
                || await loadImg('/assets/minecraft/textures/block/dark_oak_log.png')
                || img;

            const clothCanvas = document.createElement('canvas');
            clothCanvas.width = 20;
            clothCanvas.height = 24;
            const clothCtx = clothCanvas.getContext('2d');
            clothCtx.imageSmoothingEnabled = false;
            clothCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 20, 24);
            clothCtx.globalCompositeOperation = 'multiply';
            clothCtx.fillStyle = dye;
            clothCtx.fillRect(0, 0, 20, 24);
            clothCtx.globalCompositeOperation = 'destination-in';
            clothCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 20, 24);
            clothCtx.globalCompositeOperation = 'source-over';

            drawBox(ctx, [7, 0, 7, 9, 6, 9], poleImg, poleImg, poleImg);
            drawBox(ctx, [4, 6, 7, 12, 22, 9], clothCanvas, clothCanvas, clothCanvas);
            return;
        }

        // ── CONDUIT ──────────────────────────────────────────────────────────
        if (type === 'conduit') {
            // Conduit base is a small ornate block — render as small cube with base texture
            drawBox(ctx, [3, 3, 3, 13, 13, 13], img, img, img);
            return;
        }

        // ── COPPER GOLEM STATUE ──────────────────────────────────────────────
        if (type === 'copper_golem_statue') {
            // Show as a flat item icon using the copper golem entity texture (face region)
            // Copper golem texture is similar to a player skin — extract head face at (8,8)
            const scale = img.width / 64;
            const faceImg = cropImage(img, 8 * scale, 8 * scale, 8 * scale, 8 * scale);
            // Draw body as small humanoid hint — head + body blocks
            drawBox(ctx, [4,  8, 6, 12, 14, 10], faceImg,  faceImg,  faceImg);   // head
            drawBox(ctx, [5,  0, 6, 11,  8, 10], img,      img,      img);        // body
            return;
        }

        let bounds = [0, 0, 0, 16, 16, 16];
        let topCanvas, leftCanvas, rightCanvas;

        if (type === 'chest') {
            bounds = [1, 0, 1, 15, 14, 15];

            topCanvas = document.createElement('canvas');
            topCanvas.width = 14; topCanvas.height = 14;
            const topCtx = topCanvas.getContext('2d');
            topCtx.imageSmoothingEnabled = false;
            topCtx.drawImage(img, 28, 0, 14, 14, 0, 0, 14, 14);

            leftCanvas = document.createElement('canvas');
            leftCanvas.width = 14; leftCanvas.height = 15;
            const leftCtx = leftCanvas.getContext('2d');
            leftCtx.imageSmoothingEnabled = false;
            leftCtx.drawImage(img, 0, 14, 14, 5, 0, 0, 14, 5);
            leftCtx.drawImage(img, 0, 33, 14, 10, 0, 5, 14, 10);

            rightCanvas = document.createElement('canvas');
            rightCanvas.width = 14; rightCanvas.height = 15;
            const rightCtx = rightCanvas.getContext('2d');
            rightCtx.imageSmoothingEnabled = false;
            rightCtx.drawImage(img, 14, 14, 14, 5, 0, 0, 14, 5);
            rightCtx.drawImage(img, 14, 33, 14, 10, 0, 5, 14, 10);
            
            // Latch Front (1, 1, size 2x4) centered at x=6, y=2 (split is at y=5, so latch sits around it)
            rightCtx.drawImage(img, 1, 1, 2, 4, 6, 3, 2, 4);
            // Latch Top (1, 0, size 2x1) centered at x=6, y=2
            rightCtx.drawImage(img, 1, 0, 2, 1, 6, 2, 2, 1);

        } else if (type === 'shulker') {
            bounds = [0, 0, 0, 16, 16, 16];

            topCanvas = document.createElement('canvas');
            topCanvas.width = 16; topCanvas.height = 16;
            const topCtx = topCanvas.getContext('2d');
            topCtx.imageSmoothingEnabled = false;
            topCtx.drawImage(img, 16, 0, 16, 16, 0, 0, 16, 16);

            leftCanvas = document.createElement('canvas');
            leftCanvas.width = 16; leftCanvas.height = 16;
            const leftCtx = leftCanvas.getContext('2d');
            leftCtx.imageSmoothingEnabled = false;
            leftCtx.drawImage(img, 0, 16, 16, 12, 0, 0, 16, 12);
            leftCtx.drawImage(img, 0, 44, 16, 8, 0, 12, 16, 4);

            rightCanvas = document.createElement('canvas');
            rightCanvas.width = 16; rightCanvas.height = 16;
            const rightCtx = rightCanvas.getContext('2d');
            rightCtx.imageSmoothingEnabled = false;
            rightCtx.drawImage(img, 16, 16, 16, 12, 0, 0, 16, 12);
            rightCtx.drawImage(img, 16, 44, 16, 8, 0, 12, 16, 4);

        } else if (type === 'bed') {
            const scale = Math.max(1, img.width / 64);

            const drawBoxBed = (ctx, box, topImg, leftImg, rightImg) => {
                const [xMin, yMin, zMin, xMax, yMax, zMax] = box;

                function bedProj(X, Y, Z) {
                    return project(X, Y, Z);
                }

                const P_top_0 = bedProj(xMin, yMax, zMin);
                const P_top_1 = bedProj(xMax, yMax, zMin);
                const P_top_2 = bedProj(xMax, yMax, zMax);
                const P_top_3 = bedProj(xMin, yMax, zMax);

                const P_left_0 = bedProj(xMin, yMax, zMax);
                const P_left_1 = bedProj(xMax, yMax, zMax);
                const P_left_2 = bedProj(xMax, yMin, zMax);
                const P_left_3 = bedProj(xMin, yMin, zMax);

                const P_right_0 = bedProj(xMax, yMax, zMax);
                const P_right_1 = bedProj(xMax, yMax, zMin);
                const P_right_2 = bedProj(xMax, yMin, zMin);
                const P_right_3 = bedProj(xMax, yMin, zMax);

                if (topImg) {
                    drawDynamicFace(ctx, topImg, P_top_0, P_top_1, P_top_3, [P_top_0, P_top_1, P_top_2, P_top_3], 0);
                }
                if (leftImg) {
                    drawDynamicFace(ctx, leftImg, P_left_0, P_left_1, P_left_3, [P_left_0, P_left_1, P_left_2, P_left_3], 0.2);
                }
                if (rightImg) {
                    drawDynamicFace(ctx, rightImg, P_right_0, P_right_1, P_right_3, [P_right_0, P_right_1, P_right_2, P_right_3], 0.35);
                }
            };

            topCanvas = document.createElement('canvas');
            topCanvas.width = 16; topCanvas.height = 32;
            const topCtx = topCanvas.getContext('2d');
            topCtx.imageSmoothingEnabled = false;
            // Head Top (pillow + upper blanket): [6, 6, 16, 16] -> top half (y=0 to y=16)
            topCtx.drawImage(img, 6 * scale, 6 * scale, 16 * scale, 16 * scale, 0, 0, 16, 16);
            // Foot Top (lower blanket): [6, 28, 16, 16] -> bottom half (y=16 to y=32)
            topCtx.drawImage(img, 6 * scale, 28 * scale, 16 * scale, 16 * scale, 0, 16, 16, 16);

            leftCanvas = document.createElement('canvas');
            leftCanvas.width = 16; leftCanvas.height = 6;
            const leftCtx = leftCanvas.getContext('2d');
            leftCtx.imageSmoothingEnabled = false;
            // Foot End (Z=32 end): [6, 22, 16, 6] -> full left face
            leftCtx.drawImage(img, 6 * scale, 22 * scale, 16 * scale, 6 * scale, 0, 0, 16, 6);

            rightCanvas = document.createElement('canvas');
            rightCanvas.width = 32; rightCanvas.height = 6;
            const rightCtx = rightCanvas.getContext('2d');
            rightCtx.imageSmoothingEnabled = false;
            
            // Draw Foot Side (Z = 32 to 16) onto x = 0 to 16 in rightCanvas
            rightCtx.save();
            rightCtx.translate(0, 6);
            rightCtx.rotate(-Math.PI / 2);
            rightCtx.drawImage(img, 22 * scale, 28 * scale, 6 * scale, 16 * scale, 0, 0, 6, 16);
            rightCtx.restore();

            // Draw Head Side (Z = 16 to 0) onto x = 16 to 32 in rightCanvas
            rightCtx.save();
            rightCtx.translate(16, 6);
            rightCtx.rotate(-Math.PI / 2);
            rightCtx.drawImage(img, 22 * scale, 6 * scale, 6 * scale, 16 * scale, 0, 0, 6, 16);
            rightCtx.restore();

            drawBoxBed(ctx, [0, 0, 0, 16, 6, 32], topCanvas, leftCanvas, rightCanvas);
            return;
        } else {
            // Generic fallback
            topCanvas = document.createElement('canvas');
            topCanvas.width = TEX; topCanvas.height = TEX;
            const topCtx = topCanvas.getContext('2d');
            topCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, TEX, TEX);

            leftCanvas = document.createElement('canvas');
            leftCanvas.width = TEX; leftCanvas.height = TEX;
            const leftCtx = leftCanvas.getContext('2d');
            leftCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, TEX, TEX);

            rightCanvas = document.createElement('canvas');
            rightCanvas.width = TEX; rightCanvas.height = TEX;
            const rightCtx = rightCanvas.getContext('2d');
            rightCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, TEX, TEX);
        }

        const [xMin, yMin, zMin, xMax, yMax, zMax] = bounds;

        const P_top_0 = project(xMin, yMax, zMin);
        const P_top_1 = project(xMax, yMax, zMin);
        const P_top_2 = project(xMax, yMax, zMax);
        const P_top_3 = project(xMin, yMax, zMax);

        const P_left_0 = project(xMin, yMax, zMax);
        const P_left_1 = project(xMax, yMax, zMax);
        const P_left_2 = project(xMax, yMin, zMax);
        const P_left_3 = project(xMin, yMin, zMax);

        const P_right_0 = project(xMax, yMax, zMax);
        const P_right_1 = project(xMax, yMax, zMin);
        const P_right_2 = project(xMax, yMin, zMin);
        const P_right_3 = project(xMax, yMin, zMax);

        if (topCanvas) {
            drawDynamicFace(ctx, topCanvas, P_top_0, P_top_1, P_top_3, [P_top_0, P_top_1, P_top_2, P_top_3], 0);
        }
        if (leftCanvas) {
            drawDynamicFace(ctx, leftCanvas, P_left_0, P_left_1, P_left_3, [P_left_0, P_left_1, P_left_2, P_left_3], 0.2);
        }
        if (rightCanvas) {
            drawDynamicFace(ctx, rightCanvas, P_right_0, P_right_1, P_right_3, [P_right_0, P_right_1, P_right_2, P_right_3], 0.35);
        }
    }

    window.players.blockRenderer = { renderBlock, renderEntityBlock };
})();
