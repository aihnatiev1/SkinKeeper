// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'SkinKeeper';

  @override
  String get appSubtitle => 'CS2 Inventory & Price Alerts';

  @override
  String get tabPortfolio => 'Portfolio';

  @override
  String get tabInventory => 'Inventory';

  @override
  String get tabTrades => 'Trades';

  @override
  String get tabHistory => 'History';

  @override
  String get tabSettings => 'Settings';

  @override
  String get portfolioTitle => 'Portfolio';

  @override
  String get inventoryTitle => 'Inventory';

  @override
  String get tradesTitle => 'Trade Offers';

  @override
  String get historyTitle => 'Transactions';

  @override
  String get settingsTitle => 'Settings';

  @override
  String get portfolioValue => 'Portfolio Value';

  @override
  String get totalInvested => 'Invested';

  @override
  String get totalProfit => 'Profit';

  @override
  String get totalLoss => 'Loss';

  @override
  String get unrealizedPL => 'Unrealized P/L';

  @override
  String get plHistory => 'P/L History';

  @override
  String get inventoryEmpty => 'No items in your inventory';

  @override
  String itemCount(int count) {
    return '$count items';
  }

  @override
  String get bestPrice => 'Best Price';

  @override
  String get steamPrice => 'Steam';

  @override
  String get skinportPrice => 'Skinport';

  @override
  String get csfloatPrice => 'CSFloat';

  @override
  String get dmarketPrice => 'DMarket';

  @override
  String get priceComparison => 'Price Comparison';

  @override
  String get priceHistory => 'Price History';

  @override
  String get floatValue => 'Float Value';

  @override
  String get stickers => 'Stickers';

  @override
  String get charms => 'Charms';

  @override
  String get wearLabel => 'Wear';

  @override
  String get sellTitle => 'Sell Item';

  @override
  String get sellButton => 'Sell on Steam';

  @override
  String get sellPrice => 'Sell Price';

  @override
  String get buyerPays => 'Buyer Pays';

  @override
  String get youReceive => 'You Receive';

  @override
  String get steamFee => 'Steam Fee';

  @override
  String get gameFee => 'Game Fee';

  @override
  String get bulkSell => 'Bulk Sell';

  @override
  String get confirmSell => 'Confirm Sell';

  @override
  String get selling => 'Selling...';

  @override
  String get sellSuccess => 'Item listed successfully!';

  @override
  String get sellFailed => 'Failed to list item';

  @override
  String get tradesEmpty => 'No active trade offers';

  @override
  String get createTrade => 'Create Trade';

  @override
  String get selectFriend => 'Select Friend';

  @override
  String get yourItems => 'Your Items';

  @override
  String get theirItems => 'Their Items';

  @override
  String get reviewTrade => 'Review Trade';

  @override
  String get sendOffer => 'Send Offer';

  @override
  String get tradeStatus => 'Status';

  @override
  String get tradePending => 'Pending';

  @override
  String get tradeAccepted => 'Accepted';

  @override
  String get tradeDeclined => 'Declined';

  @override
  String get tradeCanceled => 'Canceled';

  @override
  String get privateInventory => 'Private inventory';

  @override
  String get historyEmpty => 'No transactions yet';

  @override
  String get filterAll => 'All';

  @override
  String get filterBuy => 'Buy';

  @override
  String get filterSell => 'Sell';

  @override
  String get filterTrade => 'Trade';

  @override
  String get exportCSV => 'Export CSV';

  @override
  String get exportTitle => 'Export Transactions';

  @override
  String get dateRange => 'Date Range';

  @override
  String get startDate => 'Start Date';

  @override
  String get endDate => 'End Date';

  @override
  String get steamSession => 'Steam Session';

  @override
  String get sessionValid => 'Session active';

  @override
  String get sessionExpiring => 'Session expiring soon';

  @override
  String get sessionExpired => 'Session expired';

  @override
  String get sessionExpiredReauth =>
      'Steam session expired. Tap to re-authenticate.';

  @override
  String get sessionInfoTitle => 'How sessions work';

  @override
  String get sessionInfoBody =>
      'Steam sessions last about 24 hours. When yours expires, you\'ll be brought back here to sign in again. This is a Steam security requirement — we automatically refresh when possible, but some sessions require a fresh login.';

  @override
  String get noSession => 'No session';

  @override
  String get connectSteam => 'Connect Steam';

  @override
  String get logout => 'Sign Out';

  @override
  String get premiumTitle => 'SkinKeeper PRO';

  @override
  String get premiumSubtitle => 'Unlock all features';

  @override
  String get restorePurchases => 'Restore Purchases';

  @override
  String get privacyPolicy => 'Privacy Policy';

  @override
  String get termsOfService => 'Terms of Service';

  @override
  String get alertsTitle => 'Price Alerts';

  @override
  String get alertsEmpty => 'No alerts configured';

  @override
  String get createAlert => 'Create Alert';

  @override
  String get alertConditionAbove => 'Price above';

  @override
  String get alertConditionBelow => 'Price below';

  @override
  String get alertConditionChange => 'Price changed by';

  @override
  String get alertSource => 'Market';

  @override
  String get alertSourceAny => 'Any market';

  @override
  String get alertCooldown => 'Cooldown';

  @override
  String get alertHistory => 'Notifications';

  @override
  String get alertTriggered => 'Triggered';

  @override
  String get alertActive => 'Active';

  @override
  String get alertPaused => 'Paused';

  @override
  String get premiumRequired => 'Premium Required';

  @override
  String get premiumRequiredDesc => 'This feature requires SkinKeeper PRO';

  @override
  String get upgradeToPremium => 'Upgrade to PRO';

  @override
  String get monthlyPlan => 'Monthly';

  @override
  String get yearlyPlan => 'Yearly';

  @override
  String get perMonth => '/month';

  @override
  String get perYear => '/year';

  @override
  String get bestValue => 'Best Value';

  @override
  String get freePlan => 'Free';

  @override
  String get proPlan => 'PRO';

  @override
  String get onboardingTitle1 => 'Track Your Skins';

  @override
  String get onboardingDesc1 =>
      'Monitor your CS2 inventory value across Steam, Skinport, CSFloat, and DMarket';

  @override
  String get onboardingTitle2 => 'Smart Price Alerts';

  @override
  String get onboardingDesc2 =>
      'Get notified when skin prices hit your target on any market';

  @override
  String get onboardingTitle3 => 'Profit & Loss';

  @override
  String get onboardingDesc3 =>
      'Track investment performance with detailed analytics';

  @override
  String get onboardingGetStarted => 'Get Started';

  @override
  String get onboardingSkip => 'Skip';

  @override
  String get onboardingNext => 'Next';

  @override
  String get loginTitle => 'Welcome to SkinKeeper';

  @override
  String get loginSubtitle => 'Sign in with your Steam account';

  @override
  String get loginWithSteam => 'Sign in with Steam';

  @override
  String get authQR => 'Quick Auth';

  @override
  String get authManual => 'Manual';

  @override
  String get authQRDesc => 'Scan QR with Steam Mobile';

  @override
  String get authSteamGuard => 'Steam Guard Code';

  @override
  String get authClientToken => 'Client JS Token';

  @override
  String get authBrowser => 'Open Steam in Browser';

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
  String get cancel => 'Cancel';

  @override
  String get save => 'Save';

  @override
  String get delete => 'Delete';

  @override
  String get confirm => 'Confirm';

  @override
  String get retry => 'Retry';

  @override
  String get loading => 'Loading...';

  @override
  String get error => 'Something went wrong';

  @override
  String get noData => 'No data available';

  @override
  String get refresh => 'Refresh';

  @override
  String get search => 'Search';
}
