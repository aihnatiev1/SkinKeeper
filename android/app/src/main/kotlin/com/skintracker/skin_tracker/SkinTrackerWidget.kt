package com.skintracker.skin_tracker

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetPlugin

class SkinTrackerWidget : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        for (widgetId in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_portfolio)
            val prefs = HomeWidgetPlugin.getData(context)

            val totalValue = prefs.getString("totalValue", "--") ?: "--"
            val change24h = prefs.getString("change24h", "--") ?: "--"
            val change24hPct = prefs.getString("change24hPct", "--") ?: "--"
            val itemCount = prefs.getInt("itemCount", 0)
            val lastUpdated = prefs.getString("lastUpdated", "Never") ?: "Never"
            val isPositive = prefs.getBoolean("isPositive", true)

            views.setTextViewText(R.id.widget_total_value, totalValue)
            views.setTextViewText(R.id.widget_change_pct, change24hPct)
            views.setTextViewText(R.id.widget_change_abs, change24h)
            views.setTextViewText(R.id.widget_item_count, "$itemCount items")
            views.setTextViewText(R.id.widget_last_updated, lastUpdated)

            // Set change color: green for positive, red for negative
            val changeColor = if (isPositive) 0xFF4CAF50.toInt() else 0xFFF44336.toInt()
            views.setTextColor(R.id.widget_change_pct, changeColor)
            views.setTextColor(R.id.widget_change_abs, changeColor)
            views.setTextColor(R.id.widget_change_arrow, changeColor)
            views.setTextViewText(R.id.widget_change_arrow, if (isPositive) "\u2197" else "\u2198")

            // Deep link: tap widget opens app to portfolio
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("skintracker://portfolio"))
            intent.setPackage(context.packageName)
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)

            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }
}
