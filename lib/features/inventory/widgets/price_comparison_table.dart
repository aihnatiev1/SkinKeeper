import 'package:flutter/material.dart';

const _sourceDisplayNames = <String, String>{
  'steam': 'Steam Market',
  'skinport': 'Skinport',
  'csfloat': 'CSFloat',
  'dmarket': 'DMarket',
};

const _sourceColors = <String, Color>{
  'steam': Color(0xFF1B9FFF),
  'skinport': Color(0xFF4CAF50),
  'csfloat': Color(0xFFF57C00),
  'dmarket': Color(0xFF9C27B0),
};

String sourceDisplayName(String source) =>
    _sourceDisplayNames[source] ?? source;

Color sourceColor(String source) =>
    _sourceColors[source] ?? Colors.grey;

class PriceComparisonTable extends StatelessWidget {
  final Map<String, double> prices;

  const PriceComparisonTable({super.key, required this.prices});

  @override
  Widget build(BuildContext context) {
    if (prices.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white.withAlpha(8),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withAlpha(15)),
        ),
        child: Center(
          child: Text(
            'No prices available',
            style: TextStyle(
              color: Colors.white.withAlpha(120),
              fontSize: 14,
            ),
          ),
        ),
      );
    }

    final sorted = prices.entries.toList()
      ..sort((a, b) => a.value.compareTo(b.value));

    final bestSource = sorted.first.key;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withAlpha(8),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withAlpha(15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: Text(
              'Cross-Market Prices',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: Colors.white.withAlpha(220),
              ),
            ),
          ),
          ...sorted.map((entry) {
            final isBest = entry.key == bestSource;
            return _PriceRow(
              source: entry.key,
              price: entry.value,
              isBest: isBest,
            );
          }),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  final String source;
  final double price;
  final bool isBest;

  const _PriceRow({
    required this.source,
    required this.price,
    required this.isBest,
  });

  @override
  Widget build(BuildContext context) {
    final color = sourceColor(source);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: isBest
          ? BoxDecoration(
              color: color.withAlpha(20),
              border: Border(
                left: BorderSide(color: color, width: 3),
              ),
            )
          : null,
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              sourceDisplayName(source),
              style: TextStyle(
                fontSize: 14,
                fontWeight: isBest ? FontWeight.w600 : FontWeight.normal,
                color: Colors.white.withAlpha(isBest ? 240 : 180),
              ),
            ),
          ),
          if (isBest)
            Container(
              margin: const EdgeInsets.only(right: 10),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: color.withAlpha(40),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                'BEST',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: color,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          Text(
            '\$${price.toStringAsFixed(2)}',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              fontFeatures: const [FontFeature.tabularFigures()],
              color: isBest
                  ? const Color(0xFF00D2D3)
                  : Colors.white.withAlpha(200),
            ),
          ),
        ],
      ),
    );
  }
}
