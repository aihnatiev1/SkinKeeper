import 'package:flutter/material.dart';
import '../../../models/inventory_item.dart';

const rarityOrder = [
  'Consumer Grade',
  'Industrial Grade',
  'Mil-Spec Grade',
  'Restricted',
  'Classified',
  'Covert',
];

const rarityShort = {
  'Consumer Grade': 'Consumer',
  'Industrial Grade': 'Industrial',
  'Mil-Spec Grade': 'Mil-Spec',
  'Restricted': 'Restricted',
  'Classified': 'Classified',
  'Covert': 'Covert',
};

const rarityColors = {
  'Consumer Grade': Color(0xFFB0C3D9),
  'Industrial Grade': Color(0xFF5E98D9),
  'Mil-Spec Grade': Color(0xFF4B69FF),
  'Restricted': Color(0xFF8847FF),
  'Classified': Color(0xFFD32CE6),
  'Covert': Color(0xFFEB4B4B),
};

String normalizeRarity(String? rarity) {
  if (rarity == null) return '';
  final r = rarity.replaceAll(RegExp(r'[★\s]+'), ' ').trim();
  if (rarityOrder.contains(r)) return r;
  final lower = r.toLowerCase();
  for (final tier in rarityOrder) {
    if (tier.toLowerCase() == lower) return tier;
    if (lower.contains(tier.toLowerCase().split(' ').first)) return tier;
  }
  return r;
}

bool isTradeUpEligible(InventoryItem item) {
  final rarity = normalizeRarity(item.rarity);
  if (rarity.isEmpty) return false;
  if (rarity == 'Covert') return false;
  if (!rarityOrder.contains(rarity)) return false;
  final idx = rarityOrder.indexOf(rarity);
  if (idx < 1) return false;
  if (item.wear == null) return false;
  final type = item.marketHashName.toLowerCase();
  if (type.contains('case') || type.contains('key') || type.contains('sticker') ||
      type.contains('graffiti') || type.contains('patch') || type.contains('pin') ||
      type.contains('music kit') || type.contains('agent')) {
    return false;
  }
  return true;
}
