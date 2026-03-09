import WidgetKit
import SwiftUI

struct PortfolioEntry: TimelineEntry {
    let date: Date
    let totalValue: String
    let change24h: String
    let change24hPct: String
    let isPositive: Bool
    let itemCount: Int
    let lastUpdated: String
    // Premium P/L fields
    let totalProfit: String?
    let isProfitable: Bool?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> PortfolioEntry {
        PortfolioEntry(
            date: .now,
            totalValue: "$1,234.56",
            change24h: "+$12.34",
            change24hPct: "+1.2%",
            isPositive: true,
            itemCount: 42,
            lastUpdated: "12:30",
            totalProfit: nil,
            isProfitable: nil
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (PortfolioEntry) -> Void) {
        completion(readEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PortfolioEntry>) -> Void) {
        let entry = readEntry()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: .now)!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }

    private func readEntry() -> PortfolioEntry {
        let defaults = UserDefaults(suiteName: "group.com.skintracker.widget")
        let totalValue = defaults?.string(forKey: "totalValue") ?? "--"
        let change24h = defaults?.string(forKey: "change24h") ?? "--"
        let change24hPct = defaults?.string(forKey: "change24hPct") ?? "--"
        let isPositive = defaults?.bool(forKey: "isPositive") ?? true
        let itemCount = defaults?.integer(forKey: "itemCount") ?? 0
        let lastUpdated = defaults?.string(forKey: "lastUpdated") ?? "Never"
        let totalProfit = defaults?.string(forKey: "totalProfit")
        let isProfitable = defaults?.object(forKey: "isProfitable") as? Bool

        return PortfolioEntry(
            date: .now,
            totalValue: totalValue,
            change24h: change24h,
            change24hPct: change24hPct,
            isPositive: isPositive,
            itemCount: itemCount,
            lastUpdated: lastUpdated,
            totalProfit: totalProfit,
            isProfitable: isProfitable
        )
    }
}

struct SkinTrackerWidgetEntryView: View {
    var entry: PortfolioEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header row
            HStack {
                Text("SkinTracker")
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundColor(.secondary)
                Spacer()
                Text("\(entry.itemCount) items")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }

            // Portfolio total value
            Text(entry.totalValue)
                .font(.system(size: family == .systemSmall ? 22 : 28, weight: .bold))
                .foregroundColor(.white)
                .minimumScaleFactor(0.7)
                .lineLimit(1)

            // 24h change
            HStack(spacing: 4) {
                Image(systemName: entry.isPositive ? "arrow.up.right" : "arrow.down.right")
                    .font(.caption)
                Text(entry.change24hPct)
                    .font(.caption)
                    .fontWeight(.semibold)
                if family == .systemMedium {
                    Text(entry.change24h)
                        .font(.caption)
                }
            }
            .foregroundColor(entry.isPositive ? .green : .red)

            // Premium P/L section (medium only, when available)
            if family == .systemMedium, let profit = entry.totalProfit {
                Divider().background(Color.white.opacity(0.2))
                HStack(spacing: 4) {
                    Text("P/L")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Text(profit)
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(entry.isProfitable == true ? .green : .red)
                }
            }

            Spacer()

            // Last updated timestamp
            Text(entry.lastUpdated)
                .font(.caption2)
                .foregroundColor(Color.white.opacity(0.4))
        }
        .padding()
        .widgetURL(URL(string: "skintracker://portfolio"))
    }
}

@main
struct SkinTrackerWidget: Widget {
    let kind: String = "SkinTrackerPortfolio"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            if #available(iOSApplicationExtension 17.0, *) {
                SkinTrackerWidgetEntryView(entry: entry)
                    .containerBackground(.black.gradient, for: .widget)
            } else {
                SkinTrackerWidgetEntryView(entry: entry)
                    .background(
                        LinearGradient(
                            colors: [Color.black, Color(white: 0.12)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            }
        }
        .configurationDisplayName("Portfolio")
        .description("CS2 inventory value at a glance")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
