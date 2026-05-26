(function() {
    window.players = window.players || {};

    const colorMap = {
        '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
        '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
        '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF',
        'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF'
    };

    const styleMap = {
        'l': 'font-weight: bold;',
        'm': 'text-decoration: line-through;',
        'n': 'text-decoration: underline;',
        'o': 'font-style: italic;',
        'k': 'opacity: 0.8;' // obfuscated placeholder
    };

    // Parse Minecraft color and formatting codes (§) to HTML
    function parseFormatting(text) {
        if (!text) return '';
        let html = '';
        let currentStyles = [];
        let currentColor = '';

        let i = 0;
        while (i < text.length) {
            const char = text[i];
            if (char === '§' && i + 1 < text.length) {
                const code = text[i + 1].toLowerCase();
                i += 2;

                if (colorMap[code] !== undefined) {
                    currentColor = colorMap[code];
                    currentStyles = []; // colors reset styles in vanilla MC
                } else if (styleMap[code] !== undefined) {
                    if (!currentStyles.includes(styleMap[code])) {
                        currentStyles.push(styleMap[code]);
                    }
                } else if (code === 'r') {
                    currentColor = '';
                    currentStyles = [];
                }
                continue;
            }

            let styleStr = '';
            if (currentColor) styleStr += `color:${currentColor};`;
            if (currentStyles.length > 0) styleStr += currentStyles.join('');

            if (styleStr) {
                html += `<span style="${styleStr}">${escapeHtml(char)}</span>`;
            } else {
                html += escapeHtml(char);
            }
            i++;
        }

        return html;
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    const enchantsMap = {
        'minecraft:protection': 'Protection',
        'minecraft:fire_protection': 'Fire Protection',
        'minecraft:feather_falling': 'Feather Falling',
        'minecraft:blast_protection': 'Blast Protection',
        'minecraft:projectile_protection': 'Projectile Protection',
        'minecraft:respiration': 'Respiration',
        'minecraft:aqua_affinity': 'Aqua Affinity',
        'minecraft:thorns': 'Thorns',
        'minecraft:depth_strider': 'Depth Strider',
        'minecraft:frost_walker': 'Frost Walker',
        'minecraft:binding_curse': 'Curse of Binding',
        'minecraft:soul_speed': 'Soul Speed',
        'minecraft:swift_sneak': 'Swift Sneak',
        'minecraft:sharpness': 'Sharpness',
        'minecraft:smite': 'Smite',
        'minecraft:bane_of_arthropods': 'Bane of Arthropods',
        'minecraft:knockback': 'Knockback',
        'minecraft:fire_aspect': 'Fire Aspect',
        'minecraft:looting': 'Looting',
        'minecraft:sweeping_edge': 'Sweeping Edge',
        'minecraft:efficiency': 'Efficiency',
        'minecraft:silk_touch': 'Silk Touch',
        'minecraft:unbreaking': 'Unbreaking',
        'minecraft:fortune': 'Fortune',
        'minecraft:power': 'Power',
        'minecraft:punch': 'Punch',
        'minecraft:flame': 'Flame',
        'minecraft:infinity': 'Infinity',
        'minecraft:luck_of_the_sea': 'Luck of the Sea',
        'minecraft:lure': 'Lure',
        'minecraft:loyalty': 'Loyalty',
        'minecraft:impaling': 'Impaling',
        'minecraft:riptide': 'Riptide',
        'minecraft:channeling': 'Channeling',
        'minecraft:multishot': 'Multishot',
        'minecraft:quick_charge': 'Quick Charge',
        'minecraft:piercing': 'Piercing',
        'minecraft:density': 'Density',
        'minecraft:breach': 'Breach',
        'minecraft:wind_burst': 'Wind Burst',
        'minecraft:mending': 'Mending',
        'minecraft:vanishing_curse': 'Curse of Vanishing'
    };

    function getEnchantmentName(id) {
        if (!id) return 'Unknown Enchantment';
        const cleanId = id.includes(':') ? id.toLowerCase() : `minecraft:${id.toLowerCase()}`;
        if (enchantsMap[cleanId]) return enchantsMap[cleanId];
        
        // Fallback title case mapping
        return cleanId
            .replace('minecraft:', '')
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    function toRoman(num) {
        if (typeof num !== 'number') return num;
        const roman = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
        let str = '';
        let n = num;
        for (let i of Object.keys(roman)) {
            let q = Math.floor(n / roman[i]);
            n -= q * roman[i];
            str += i.repeat(q);
        }
        return str || 'I';
    }

    window.players.nbtParser = {
        parseFormatting,
        getEnchantmentName,
        toRoman
    };
})();
