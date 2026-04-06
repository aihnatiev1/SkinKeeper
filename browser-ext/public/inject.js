(function() {
  function checkInventory() {
    try {
      if (typeof UserYou !== 'undefined' && UserYou.getInventory) {
        const inv = UserYou.getInventory(730, 2);
        if (inv && inv.m_rgAssets && Object.keys(inv.m_rgAssets).length > 0) {
          const items = [];
          const allProps = inv.m_rgAssetProperties || {};

          for (const key in inv.m_rgAssets) {
            const asset = inv.m_rgAssets[key];
            if (asset && asset.description) {
              const item = {
                assetid: asset.assetid,
                name: asset.description.market_hash_name || asset.description.name,
                type: asset.description.type,
                rarity_color: (asset.description.tags || []).find(t => t.category === 'Rarity')?.color,
                float: null,
                paintSeed: null,
                paintIndex: null
              };

              // Extract properties (Float is propertyid 2)
              const props = allProps[asset.assetid];
              if (props && Array.isArray(props)) {
                props.forEach(p => {
                  if (p.propertyid === 2 && p.float_value) item.float = parseFloat(p.float_value);
                  if (p.propertyid === 1 && p.int_value) item.paintSeed = parseInt(p.int_value);
                  if (p.propertyid === 3 && p.int_value) item.paintIndex = parseInt(p.int_value);
                });
              }

              items.push(item);
            }
          }

          window.dispatchEvent(new CustomEvent('sk_inventory_ready', { 
            detail: { 
              count: items.length,
              currency: typeof g_rgWalletInfo !== 'undefined' ? g_rgWalletInfo.wallet_currency : 1,
              items: items
            } 
          }));
          return true;
        }
      }
    } catch (e) {
      console.error('[SkinKeeper Inject] Error:', e);
    }
    return false;
  }

  const timer = setInterval(() => { if (checkInventory()) clearInterval(timer); }, 500);
  setTimeout(() => clearInterval(timer), 15000);
})();
