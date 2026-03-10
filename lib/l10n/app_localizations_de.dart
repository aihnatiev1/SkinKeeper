// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for German (`de`).
class AppLocalizationsDe extends AppLocalizations {
  AppLocalizationsDe([String locale = 'de']) : super(locale);

  @override
  String get appName => 'SkinKeeper';

  @override
  String get appSubtitle => 'CS2 Inventar & Preisalarme';

  @override
  String get tabPortfolio => 'Portfolio';

  @override
  String get tabInventory => 'Inventar';

  @override
  String get tabTrades => 'Tausch';

  @override
  String get tabHistory => 'Verlauf';

  @override
  String get tabSettings => 'Einstellungen';

  @override
  String get portfolioTitle => 'Portfolio';

  @override
  String get inventoryTitle => 'Inventar';

  @override
  String get tradesTitle => 'Tauschangebote';

  @override
  String get historyTitle => 'Transaktionen';

  @override
  String get settingsTitle => 'Einstellungen';

  @override
  String get portfolioValue => 'Portfoliowert';

  @override
  String get totalInvested => 'Investiert';

  @override
  String get totalProfit => 'Gewinn';

  @override
  String get totalLoss => 'Verlust';

  @override
  String get unrealizedPL => 'Unrealisiert';

  @override
  String get plHistory => 'G/V Verlauf';

  @override
  String get inventoryEmpty => 'Keine Gegenstände im Inventar';

  @override
  String itemCount(int count) {
    return '$count Gegenstände';
  }

  @override
  String get bestPrice => 'Bester Preis';

  @override
  String get steamPrice => 'Steam';

  @override
  String get skinportPrice => 'Skinport';

  @override
  String get csfloatPrice => 'CSFloat';

  @override
  String get dmarketPrice => 'DMarket';

  @override
  String get priceComparison => 'Preisvergleich';

  @override
  String get priceHistory => 'Preisverlauf';

  @override
  String get floatValue => 'Float-Wert';

  @override
  String get stickers => 'Sticker';

  @override
  String get charms => 'Anhänger';

  @override
  String get wearLabel => 'Abnutzung';

  @override
  String get sellTitle => 'Gegenstand verkaufen';

  @override
  String get sellButton => 'Auf Steam verkaufen';

  @override
  String get sellPrice => 'Verkaufspreis';

  @override
  String get buyerPays => 'Käufer zahlt';

  @override
  String get youReceive => 'Sie erhalten';

  @override
  String get steamFee => 'Steam-Gebühr';

  @override
  String get gameFee => 'Spielgebühr';

  @override
  String get bulkSell => 'Massenverkauf';

  @override
  String get confirmSell => 'Verkauf bestätigen';

  @override
  String get selling => 'Wird verkauft...';

  @override
  String get sellSuccess => 'Gegenstand erfolgreich eingestellt!';

  @override
  String get sellFailed => 'Einstellen fehlgeschlagen';

  @override
  String get tradesEmpty => 'Keine aktiven Tauschangebote';

  @override
  String get createTrade => 'Tausch erstellen';

  @override
  String get selectFriend => 'Freund auswählen';

  @override
  String get yourItems => 'Deine Gegenstände';

  @override
  String get theirItems => 'Deren Gegenstände';

  @override
  String get reviewTrade => 'Tausch überprüfen';

  @override
  String get sendOffer => 'Angebot senden';

  @override
  String get tradeStatus => 'Status';

  @override
  String get tradePending => 'Ausstehend';

  @override
  String get tradeAccepted => 'Angenommen';

  @override
  String get tradeDeclined => 'Abgelehnt';

  @override
  String get tradeCanceled => 'Abgebrochen';

  @override
  String get privateInventory => 'Privates Inventar';

  @override
  String get historyEmpty => 'Noch keine Transaktionen';

  @override
  String get filterAll => 'Alle';

  @override
  String get filterBuy => 'Kauf';

  @override
  String get filterSell => 'Verkauf';

  @override
  String get filterTrade => 'Tausch';

  @override
  String get exportCSV => 'CSV Export';

  @override
  String get exportTitle => 'Transaktionen exportieren';

  @override
  String get dateRange => 'Zeitraum';

  @override
  String get startDate => 'Startdatum';

  @override
  String get endDate => 'Enddatum';

  @override
  String get steamSession => 'Steam-Sitzung';

  @override
  String get sessionValid => 'Sitzung aktiv';

  @override
  String get sessionExpiring => 'Sitzung läuft ab';

  @override
  String get sessionExpired => 'Sitzung abgelaufen';

  @override
  String get sessionExpiredReauth =>
      'Steam-Sitzung abgelaufen. Tippen Sie zur erneuten Anmeldung.';

  @override
  String get sessionInfoTitle => 'So funktionieren Sitzungen';

  @override
  String get sessionInfoBody =>
      'Steam-Sitzungen dauern etwa 24 Stunden. Wenn Ihre abläuft, werden Sie hierher zurückgebracht. Dies ist eine Steam-Sicherheitsanforderung — wir aktualisieren automatisch wenn möglich, aber manchmal ist eine neue Anmeldung erforderlich.';

  @override
  String get noSession => 'Keine Sitzung';

  @override
  String get connectSteam => 'Steam verbinden';

  @override
  String get logout => 'Abmelden';

  @override
  String get premiumTitle => 'SkinKeeper PRO';

  @override
  String get premiumSubtitle => 'Alle Funktionen freischalten';

  @override
  String get restorePurchases => 'Käufe wiederherstellen';

  @override
  String get privacyPolicy => 'Datenschutzerklärung';

  @override
  String get termsOfService => 'Nutzungsbedingungen';

  @override
  String get alertsTitle => 'Preisalarme';

  @override
  String get alertsEmpty => 'Keine Alarme konfiguriert';

  @override
  String get createAlert => 'Alarm erstellen';

  @override
  String get alertConditionAbove => 'Preis über';

  @override
  String get alertConditionBelow => 'Preis unter';

  @override
  String get alertConditionChange => 'Preis geändert um';

  @override
  String get alertSource => 'Markt';

  @override
  String get alertSourceAny => 'Jeder Markt';

  @override
  String get alertCooldown => 'Abklingzeit';

  @override
  String get alertHistory => 'Alarmverlauf';

  @override
  String get alertTriggered => 'Ausgelöst';

  @override
  String get alertActive => 'Aktiv';

  @override
  String get alertPaused => 'Pausiert';

  @override
  String get premiumRequired => 'Premium erforderlich';

  @override
  String get premiumRequiredDesc => 'Diese Funktion erfordert SkinKeeper PRO';

  @override
  String get upgradeToPremium => 'Auf PRO upgraden';

  @override
  String get monthlyPlan => 'Monatlich';

  @override
  String get yearlyPlan => 'Jährlich';

  @override
  String get perMonth => '/Monat';

  @override
  String get perYear => '/Jahr';

  @override
  String get bestValue => 'Bestes Angebot';

  @override
  String get freePlan => 'Kostenlos';

  @override
  String get proPlan => 'PRO';

  @override
  String get onboardingTitle1 => 'Verfolge deine Skins';

  @override
  String get onboardingDesc1 =>
      'Überwache den Wert deines CS2-Inventars auf Steam, Skinport, CSFloat und DMarket';

  @override
  String get onboardingTitle2 => 'Smarte Preisalarme';

  @override
  String get onboardingDesc2 =>
      'Erhalte Benachrichtigungen wenn Preise dein Ziel erreichen';

  @override
  String get onboardingTitle3 => 'Gewinn & Verlust';

  @override
  String get onboardingDesc3 =>
      'Verfolge die Investitionsleistung mit detaillierter Analyse';

  @override
  String get onboardingGetStarted => 'Los geht\'s';

  @override
  String get onboardingSkip => 'Überspringen';

  @override
  String get onboardingNext => 'Weiter';

  @override
  String get loginTitle => 'Willkommen';

  @override
  String get loginSubtitle => 'Mit Steam-Konto anmelden';

  @override
  String get loginWithSteam => 'Mit Steam anmelden';

  @override
  String get authQR => 'Schnell-Auth';

  @override
  String get authManual => 'Manuell';

  @override
  String get authQRDesc => 'QR mit Steam Mobile scannen';

  @override
  String get authSteamGuard => 'Steam Guard Code';

  @override
  String get authClientToken => 'Client JS Token';

  @override
  String get authBrowser => 'Steam im Browser öffnen';

  @override
  String get linkedAccounts => 'Linked Accounts';

  @override
  String get priceAlerts => 'Price Alerts';

  @override
  String get currency => 'Currency';

  @override
  String get language => 'Language';

  @override
  String get theme => 'Theme';

  @override
  String get themeDark => 'Dark';

  @override
  String get themeLight => 'Light';

  @override
  String get systemDefault => 'System Default';

  @override
  String get appTour => 'App Tour';

  @override
  String get signOut => 'Sign Out';

  @override
  String get connected => 'Connected';

  @override
  String get notConfigured => 'Not configured';

  @override
  String get checking => 'Checking...';

  @override
  String get connectSteamSession => 'Connect Steam Session';

  @override
  String get sessionBrowserHint =>
      'Open this URL in your browser while logged into Steam:';

  @override
  String get sessionPasteHint => 'Then paste the full JSON response below:';

  @override
  String get connect => 'Connect';

  @override
  String get urlCopied => 'URL copied!';

  @override
  String get paintSeed => 'Seed';

  @override
  String get tradeBan => 'Trade Ban';

  @override
  String get ok => 'OK';

  @override
  String get cancel => 'Abbrechen';

  @override
  String get save => 'Speichern';

  @override
  String get delete => 'Löschen';

  @override
  String get confirm => 'Bestätigen';

  @override
  String get retry => 'Wiederholen';

  @override
  String get loading => 'Laden...';

  @override
  String get error => 'Etwas ist schiefgelaufen';

  @override
  String get noData => 'Keine Daten verfügbar';

  @override
  String get refresh => 'Aktualisieren';

  @override
  String get search => 'Suchen';
}
