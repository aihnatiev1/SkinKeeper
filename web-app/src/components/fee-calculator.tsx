'use client';

import { useState } from 'react';
import { useFormatPrice } from '@/lib/utils';
import { Calculator } from 'lucide-react';

/**
 * Steam Market fee calculator — compute buyer pays ↔ seller receives.
 * Uses local calculation (no API call needed): 5% Valve + 10% CS2 = 15% total.
 */
export function FeeCalculator() {
  const formatPrice = useFormatPrice();
  const [mode, setMode] = useState<'buyer' | 'seller'>('buyer');
  const [input, setInput] = useState('');

  const amount = parseFloat(input) || 0;
  const amountCents = Math.round(amount * 100);

  let buyerPays = 0;
  let sellerReceives = 0;
  let valveFee = 0;
  let gameFee = 0;

  if (mode === 'buyer' && amountCents > 0) {
    buyerPays = amountCents;
    valveFee = Math.max(1, Math.floor(amountCents * 0.05));
    gameFee = Math.max(1, Math.floor(amountCents * 0.10));
    sellerReceives = amountCents - valveFee - gameFee;
  } else if (mode === 'seller' && amountCents > 0) {
    sellerReceives = amountCents;
    // Reverse: find buyer price that yields this seller amount
    let bp = Math.round(amountCents / 0.85);
    for (let i = 0; i < 10; i++) {
      const vf = Math.max(1, Math.floor(bp * 0.05));
      const gf = Math.max(1, Math.floor(bp * 0.10));
      if (bp - vf - gf >= amountCents) {
        buyerPays = bp;
        valveFee = vf;
        gameFee = gf;
        sellerReceives = bp - vf - gf;
        break;
      }
      bp++;
    }
    if (buyerPays === 0) {
      buyerPays = bp;
      valveFee = Math.max(1, Math.floor(bp * 0.05));
      gameFee = Math.max(1, Math.floor(bp * 0.10));
      sellerReceives = bp - valveFee - gameFee;
    }
  }

  return (
    <div className="glass rounded-xl p-4 border border-border/30">
      <div className="flex items-center gap-2 mb-3">
        <Calculator size={16} className="text-primary" />
        <h3 className="text-sm font-bold">Fee Calculator</h3>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as 'buyer' | 'seller')}
          className="px-2.5 py-1.5 glass rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
        >
          <option value="buyer">Buyer pays</option>
          <option value="seller">I want to receive</option>
        </select>
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">$</span>
          <input
            type="number"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0.00"
            step="0.01"
            className="w-full pl-6 pr-3 py-1.5 glass rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {amountCents > 0 && (
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted">Buyer pays</span>
            <span className="font-semibold">{formatPrice(buyerPays / 100)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Valve fee (5%)</span>
            <span className="text-loss">-{formatPrice(valveFee / 100)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">CS2 fee (10%)</span>
            <span className="text-loss">-{formatPrice(gameFee / 100)}</span>
          </div>
          <div className="h-px bg-border/30 my-1" />
          <div className="flex justify-between">
            <span className="text-muted font-medium">You receive</span>
            <span className="font-bold text-profit">{formatPrice(sellerReceives / 100)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Effective fee</span>
            <span className="text-muted">{buyerPays > 0 ? ((1 - sellerReceives / buyerPays) * 100).toFixed(1) : '0'}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
