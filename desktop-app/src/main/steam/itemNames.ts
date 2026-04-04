/**
 * Lightweight item name resolver using items_game.txt + csgo_english.txt
 * Downloads once at startup, caches in memory.
 */

const https = require('https');

interface ItemDef {
  name: string;
  icon: string;
}

let itemDefs: Map<number, string> = new Map(); // def_index → base name token
let paintKits: Map<number, string> = new Map(); // paint_index → paint name token
let stickerKits: Map<number, string> = new Map(); // sticker_kit_id → name token
let stickerImages: Map<number, string> = new Map(); // sticker_kit_id → full image URL
let translations: Map<string, string> = new Map(); // token → localized name
let prefabs: Map<string, string> = new Map(); // prefab name → item_name token
let loaded = false;

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res: any) => {
      let body = '';
      res.on('data', (chunk: string) => body += chunk);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

// Simple approach: extract all "item_name" values near their def_index
function extractItemDefs(text: string): Map<number, string> {
  const result = new Map<number, string>();
  // Match blocks like: "1209" { ... "item_name" "#CSGO_Tool_Sticker" ... }
  // Use regex to find numeric keys followed by item_name within ~500 chars
  const blockRegex = /"\s*(\d+)\s*"\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
  let match;
  while ((match = blockRegex.exec(text))) {
    const id = parseInt(match[1]);
    const body = match[2];
    const nameMatch = body.match(/"item_name"\s*"([^"]+)"/);
    if (nameMatch) {
      result.set(id, nameMatch[1].replace('#', '').toLowerCase());
    }
  }
  return result;
}

function extractStickerKits(text: string): Map<number, string> {
  const names = new Map<number, string>();
  let searchFrom = 0;
  while (true) {
    const sectionStart = text.indexOf('"sticker_kits"', searchFrom);
    if (sectionStart === -1) break;

    const searchText = text.substring(sectionStart, sectionStart + 3000000);
    const blockRegex = /"\s*(\d+)\s*"\s*\{([^}]*)\}/g;
    let match;
    while ((match = blockRegex.exec(searchText))) {
      const id = parseInt(match[1]);
      const body = match[2];
      const nameMatch = body.match(/"item_name"\s*"([^"]+)"/);
      if (nameMatch && !names.has(id)) {
        names.set(id, nameMatch[1].replace('#', '').toLowerCase());
      }
    }
    searchFrom = sectionStart + 1;
  }
  return names;
}

function extractPaintKits(text: string): Map<number, string> {
  const result = new Map<number, string>();
  let searchFrom = 0;
  while (true) {
    const sectionStart = text.indexOf('"paint_kits"', searchFrom);
    if (sectionStart === -1) break;

    const searchText = text.substring(sectionStart, sectionStart + 2000000);
    const blockRegex = /"\s*(\d+)\s*"\s*\{([^}]*)\}/g;
    let match;
    while ((match = blockRegex.exec(searchText))) {
      const id = parseInt(match[1]);
      const body = match[2];
      const descMatch = body.match(/"description_tag"\s*"([^"]+)"/);
      if (descMatch && !result.has(id)) {
        result.set(id, descMatch[1].replace('#', '').toLowerCase());
      }
    }
    searchFrom = sectionStart + 1;
  }
  return result;
}

function parseTranslations(text: string): Map<string, string> {
  const result = new Map<string, string>();
  const regex = /"([^"]+)"\s+"([^"]+)"/g;
  let match;
  while ((match = regex.exec(text))) {
    result.set(match[1].toLowerCase(), match[2]);
  }
  return result;
}

export async function loadItemData(): Promise<void> {
  if (loaded) return;

  try {
    console.log('[ItemNames] Loading items_game.txt and csgo_english.txt...');
    const [itemsGameRaw, englishRaw] = await Promise.all([
      fetchText('https://files.skinledger.com/counterstrike/items_game.txt'),
      fetchText('https://files.skinledger.com/counterstrike/csgo_english.txt'),
    ]);

    // Parse translations
    translations = parseTranslations(englishRaw);

    // Parse item definitions
    itemDefs = extractItemDefs(itemsGameRaw);

    // Parse paint kits
    paintKits = extractPaintKits(itemsGameRaw);

    // Parse sticker kits
    stickerKits = extractStickerKits(itemsGameRaw);

    // Load sticker images from CSGO-API
    try {
      const stickersJson = await fetchText('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/stickers.json');
      const stickers = JSON.parse(stickersJson);
      for (const s of stickers) {
        // id format: "sticker-5820"
        const kitId = parseInt(s.id?.replace('sticker-', ''));
        if (kitId && s.image) stickerImages.set(kitId, s.image);
      }
    } catch (err) {
      console.log('[ItemNames] Sticker images load failed:', (err as any)?.message);
    }

    loaded = true;
    console.log(`[ItemNames] Loaded: ${itemDefs.size} items, ${paintKits.size} paint kits, ${stickerKits.size} sticker kits, ${stickerImages.size} sticker images, ${translations.size} translations`);
  } catch (err) {
    console.error('[ItemNames] Failed to load:', (err as any)?.message);
  }
}

export function resolveItemName(defIndex: number, paintIndex?: number, customName?: string): string {
  if (customName) return customName;

  // Stickers: def_index 1209, use sticker_kits with paint_index as sticker kit ID
  if (defIndex === 1209 && paintIndex) {
    const stickerToken = stickerKits.get(paintIndex);
    const stickerName = stickerToken ? (translations.get(stickerToken) || stickerToken) : null;
    if (stickerName) return stickerName;
  }

  // Patches: def_index 1348
  if (defIndex === 1348 && paintIndex) {
    const stickerToken = stickerKits.get(paintIndex);
    const stickerName = stickerToken ? (translations.get(stickerToken) || stickerToken) : null;
    if (stickerName) return stickerName;
  }

  // Base item name
  const nameToken = itemDefs.get(defIndex);
  const baseName = nameToken ? (translations.get(nameToken) || nameToken) : null;

  if (!baseName && defIndex) {
    return `Unknown (${defIndex}${paintIndex ? `:${paintIndex}` : ''})`;
  }
  if (!baseName) return 'Unknown Item';

  // Paint kit name (skins)
  if (paintIndex && paintIndex > 0) {
    const paintToken = paintKits.get(paintIndex);
    const paintName = paintToken ? (translations.get(paintToken) || paintToken) : null;
    if (paintName) return `${baseName} | ${paintName}`;
  }

  return baseName;
}

export function resolveItemIcon(defIndex: number, paintIndex?: number, stickerId?: number): string {
  // Stickers/patches: use pre-loaded sticker images
  if ((defIndex === 1209 || defIndex === 1348) && stickerId) {
    return stickerImages.get(stickerId) || '';
  }

  return '';
}
