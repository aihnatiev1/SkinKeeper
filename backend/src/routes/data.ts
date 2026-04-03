/**
 * /api/data — shared data endpoints for all clients (extension, web app, desktop app)
 * Serves lookup tables, calculation results, and static data files
 */
import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";

const router = Router();

// ─── Import canonical data from shared package ───────────────────────
// Note: backend uses Node16 modules, so we use relative path to shared
// In production, this would be a proper workspace dependency
const DOPPLER_PHASES: Record<number, { phase: string; color: string; tier: number; multiplier: number }> = {
  415: { phase: 'Ruby', color: '#dc2626', tier: 1, multiplier: 8.0 },
  416: { phase: 'Sapphire', color: '#2563eb', tier: 1, multiplier: 10.0 },
  417: { phase: 'Black Pearl', color: '#7c3aed', tier: 1, multiplier: 6.0 },
  418: { phase: 'Phase 1', color: '#1e1b4b', tier: 3, multiplier: 1.0 },
  419: { phase: 'Phase 2', color: '#ec4899', tier: 2, multiplier: 1.3 },
  420: { phase: 'Phase 3', color: '#16a34a', tier: 4, multiplier: 0.9 },
  421: { phase: 'Phase 4', color: '#0ea5e9', tier: 2, multiplier: 1.2 },
  568: { phase: 'Emerald', color: '#059669', tier: 1, multiplier: 12.0 },
  569: { phase: 'Gamma P1', color: '#065f46', tier: 3, multiplier: 1.0 },
  570: { phase: 'Gamma P2', color: '#10b981', tier: 2, multiplier: 1.3 },
  571: { phase: 'Gamma P3', color: '#84cc16', tier: 4, multiplier: 0.9 },
  572: { phase: 'Gamma P4', color: '#22d3ee', tier: 3, multiplier: 1.1 },
};

const MARKETPLACE_FEES: Record<string, number> = {
  steam: 0.1304, buff: 0.025, csfloat: 0.02, skinport: 0.06, dmarket: 0.05, bitskins: 0.05,
};

router.get("/doppler-phases", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.json(DOPPLER_PHASES);
});

router.get("/marketplace-fees", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.json(MARKETPLACE_FEES);
});

// ─── Price analysis ──────────────────────────────────────────────────
router.post("/analyze-prices", (req: Request, res: Response) => {
  const { steam, buff, csfloat, skinport, dmarket, bitskins } = req.body;
  const sources: [string, number, number][] = [];

  const fees: Record<string, number> = { steam: 0.1304, buff: 0.025, csfloat: 0.02, skinport: 0.06, dmarket: 0.05, bitskins: 0.05 };

  if (steam) sources.push(['steam', steam, fees.steam]);
  if (buff) sources.push(['buff', buff, fees.buff]);
  if (csfloat) sources.push(['csfloat', csfloat, fees.csfloat]);
  if (skinport) sources.push(['skinport', skinport, fees.skinport]);
  if (dmarket) sources.push(['dmarket', dmarket, fees.dmarket]);
  if (bitskins) sources.push(['bitskins', bitskins, fees.bitskins]);

  sources.sort((a, b) => a[1] - b[1]);

  const buffSteamRatio = (buff && steam && steam > 0) ? Math.round((buff / steam) * 100) : null;

  // Find best arbitrage
  let arbitrage = null;
  for (const [buySource, buyPrice] of sources) {
    for (const [sellSource, sellPrice, sellFee] of [...sources].reverse()) {
      if (buySource === sellSource) continue;
      const netSell = sellPrice * (1 - sellFee);
      const profit = netSell - buyPrice;
      const profitPct = buyPrice > 0 ? (profit / buyPrice) * 100 : 0;
      if (profit > 0 && profitPct > 2) {
        arbitrage = { buySource, sellSource, buyPrice, sellPrice, profit: Math.round(profit), profitPct: Math.round(profitPct * 10) / 10 };
        break;
      }
    }
    if (arbitrage) break;
  }

  res.json({
    buffSteamRatio,
    cheapestSource: sources[0]?.[0] || null,
    cheapestPrice: sources[0]?.[1] || 0,
    spread: sources.length >= 2 ? sources[sources.length - 1][1] - sources[0][1] : 0,
    arbitrage,
  });
});

// ─── Blue gem data (gzipped JSON) ────────────────────────────────────
router.get("/bluegem.json.gz", (_req: Request, res: Response) => {
  const filePath = path.resolve(__dirname, "../../../browser-ext/data/bluegem.json.gz");
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Blue gem data not found" });
  }
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Encoding", "gzip");
  res.setHeader("Cache-Control", "public, max-age=86400"); // 24h cache
  fs.createReadStream(filePath).pipe(res);
});

// ─── Steam fee calculator ────────────────────────────────────────────
router.post("/calc-fees", (req: Request, res: Response) => {
  const { buyerPrice, sellerReceives } = req.body;

  if (buyerPrice) {
    const steamFee = Math.max(1, Math.floor(buyerPrice * 0.05));
    const gameFee = Math.max(1, Math.floor(buyerPrice * 0.10));
    return res.json({ buyerPays: buyerPrice, sellerReceives: buyerPrice - steamFee - gameFee, steamFee, gameFee });
  }

  if (sellerReceives) {
    let bp = Math.round(sellerReceives / 0.85);
    for (let i = 0; i < 5; i++) {
      const sf = Math.max(1, Math.floor(bp * 0.05));
      const gf = Math.max(1, Math.floor(bp * 0.10));
      if (bp - sf - gf >= sellerReceives) {
        return res.json({ buyerPays: bp, sellerReceives, steamFee: sf, gameFee: gf });
      }
      bp++;
    }
    return res.json({ buyerPays: bp, sellerReceives, steamFee: Math.max(1, Math.floor(bp * 0.05)), gameFee: Math.max(1, Math.floor(bp * 0.10)) });
  }

  res.status(400).json({ error: "Provide buyerPrice or sellerReceives" });
});

export default router;
