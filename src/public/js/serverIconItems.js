/**
 * Server icon picker — edit this file to change which Minecraft items appear.
 *
 * Each string is a Minecraft item ID (without the "minecraft:" prefix).
 * Grid layout is 9 columns; order is left-to-right, top-to-bottom.
 */
(function () {
    'use strict';

    /** Alternate IDs resolved when the primary ID is missing from the asset index */
    const ITEM_ID_ALIASES = {
        eye_of_ender: 'ender_eye'
    };

    const PRESET_ITEMS = [
        // Shulker box row 1
        'command_block', 'enchanting_table', 'melon', 'emerald', 'copper_ingot',
        'netherite_ingot', 'lapis_lazuli', 'diamond', 'gold_ingot',
        // Shulker box row 2
        'nautilus_shell', 'anvil', 'cobblestone', 'iron_ingot', 'red_bed',
        'glass', 'beacon', 'player_head', 'cactus',
        // Shulker box row 3
        'oak_door', 'poppy', 'grass_block', 'redstone', 'dragon_head',
        'barrier', 'bedrock', 'heart_of_the_sea', 'blast_furnace',
        // Inventory row 1
        'furnace', 'purple_shulker_box', 'writable_book', 'trident', 'golden_apple',
        'oak_log', 'fishing_rod', 'mace', 'carved_pumpkin',
        // Inventory row 2
        'end_rod', 'bone', 'firework_star', 'ender_eye', 'ender_pearl',
        'end_crystal', 'bow', 'firework_rocket', 'observer',
        // Inventory row 3
        'tnt', 'ghast_tear', 'lava_bucket', 'diamond_shovel', 'diamond_sword',
        'diamond_hoe', 'diamond_pickaxe', 'diamond_axe', 'elytra',
        // Hotbar
        'water_bucket', 'copper_block', 'iron_block', 'diamond_block', 'gold_block',
        'emerald_block', 'redstone_block', 'lapis_block', 'netherite_block'
    ];

    function resolveItemId(itemId) {
        const clean = itemId.replace(/^minecraft:/i, '').toLowerCase();
        return ITEM_ID_ALIASES[clean] || clean;
    }

    window.serverIconItems = {
        PRESET_ITEMS,
        ITEM_ID_ALIASES,
        resolveItemId
    };
})();
