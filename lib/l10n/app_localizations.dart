import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_de.dart';
import 'app_localizations_en.dart';
import 'app_localizations_pt.dart';
import 'app_localizations_ru.dart';
import 'app_localizations_uk.dart';
import 'app_localizations_zh.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('de'),
    Locale('pt'),
    Locale('ru'),
    Locale('uk'),
    Locale('zh'),
  ];

  /// No description provided for @appName.
  ///
  /// In en, this message translates to:
  /// **'SkinKeeper'**
  String get appName;

  /// No description provided for @appSubtitle.
  ///
  /// In en, this message translates to:
  /// **'CS2 Inventory & Price Alerts'**
  String get appSubtitle;

  /// No description provided for @tabPortfolio.
  ///
  /// In en, this message translates to:
  /// **'Portfolio'**
  String get tabPortfolio;

  /// No description provided for @tabInventory.
  ///
  /// In en, this message translates to:
  /// **'Inventory'**
  String get tabInventory;

  /// No description provided for @tabTrades.
  ///
  /// In en, this message translates to:
  /// **'Trades'**
  String get tabTrades;

  /// No description provided for @tabHistory.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get tabHistory;

  /// No description provided for @tabSettings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get tabSettings;

  /// No description provided for @portfolioTitle.
  ///
  /// In en, this message translates to:
  /// **'Portfolio'**
  String get portfolioTitle;

  /// No description provided for @inventoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Inventory'**
  String get inventoryTitle;

  /// No description provided for @tradesTitle.
  ///
  /// In en, this message translates to:
  /// **'Trade Offers'**
  String get tradesTitle;

  /// No description provided for @historyTitle.
  ///
  /// In en, this message translates to:
  /// **'Transactions'**
  String get historyTitle;

  /// No description provided for @settingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsTitle;

  /// No description provided for @portfolioValue.
  ///
  /// In en, this message translates to:
  /// **'Portfolio Value'**
  String get portfolioValue;

  /// No description provided for @totalInvested.
  ///
  /// In en, this message translates to:
  /// **'Invested'**
  String get totalInvested;

  /// No description provided for @totalProfit.
  ///
  /// In en, this message translates to:
  /// **'Profit'**
  String get totalProfit;

  /// No description provided for @totalLoss.
  ///
  /// In en, this message translates to:
  /// **'Loss'**
  String get totalLoss;

  /// No description provided for @unrealizedPL.
  ///
  /// In en, this message translates to:
  /// **'Unrealized P/L'**
  String get unrealizedPL;

  /// No description provided for @plHistory.
  ///
  /// In en, this message translates to:
  /// **'P/L History'**
  String get plHistory;

  /// No description provided for @inventoryEmpty.
  ///
  /// In en, this message translates to:
  /// **'No items in your inventory'**
  String get inventoryEmpty;

  /// No description provided for @itemCount.
  ///
  /// In en, this message translates to:
  /// **'{count} items'**
  String itemCount(int count);

  /// No description provided for @bestPrice.
  ///
  /// In en, this message translates to:
  /// **'Best Price'**
  String get bestPrice;

  /// No description provided for @steamPrice.
  ///
  /// In en, this message translates to:
  /// **'Steam'**
  String get steamPrice;

  /// No description provided for @skinportPrice.
  ///
  /// In en, this message translates to:
  /// **'Skinport'**
  String get skinportPrice;

  /// No description provided for @csfloatPrice.
  ///
  /// In en, this message translates to:
  /// **'CSFloat'**
  String get csfloatPrice;

  /// No description provided for @dmarketPrice.
  ///
  /// In en, this message translates to:
  /// **'DMarket'**
  String get dmarketPrice;

  /// No description provided for @priceComparison.
  ///
  /// In en, this message translates to:
  /// **'Price Comparison'**
  String get priceComparison;

  /// No description provided for @priceHistory.
  ///
  /// In en, this message translates to:
  /// **'Price History'**
  String get priceHistory;

  /// No description provided for @floatValue.
  ///
  /// In en, this message translates to:
  /// **'Float Value'**
  String get floatValue;

  /// No description provided for @stickers.
  ///
  /// In en, this message translates to:
  /// **'Stickers'**
  String get stickers;

  /// No description provided for @charms.
  ///
  /// In en, this message translates to:
  /// **'Charms'**
  String get charms;

  /// No description provided for @wearLabel.
  ///
  /// In en, this message translates to:
  /// **'Wear'**
  String get wearLabel;

  /// No description provided for @sellTitle.
  ///
  /// In en, this message translates to:
  /// **'Sell Item'**
  String get sellTitle;

  /// No description provided for @sellButton.
  ///
  /// In en, this message translates to:
  /// **'Sell on Steam'**
  String get sellButton;

  /// No description provided for @sellPrice.
  ///
  /// In en, this message translates to:
  /// **'Sell Price'**
  String get sellPrice;

  /// No description provided for @buyerPays.
  ///
  /// In en, this message translates to:
  /// **'Buyer Pays'**
  String get buyerPays;

  /// No description provided for @youReceive.
  ///
  /// In en, this message translates to:
  /// **'You Receive'**
  String get youReceive;

  /// No description provided for @steamFee.
  ///
  /// In en, this message translates to:
  /// **'Steam Fee'**
  String get steamFee;

  /// No description provided for @gameFee.
  ///
  /// In en, this message translates to:
  /// **'Game Fee'**
  String get gameFee;

  /// No description provided for @bulkSell.
  ///
  /// In en, this message translates to:
  /// **'Bulk Sell'**
  String get bulkSell;

  /// No description provided for @confirmSell.
  ///
  /// In en, this message translates to:
  /// **'Confirm Sell'**
  String get confirmSell;

  /// No description provided for @selling.
  ///
  /// In en, this message translates to:
  /// **'Selling...'**
  String get selling;

  /// No description provided for @sellSuccess.
  ///
  /// In en, this message translates to:
  /// **'Item listed successfully!'**
  String get sellSuccess;

  /// No description provided for @sellFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to list item'**
  String get sellFailed;

  /// No description provided for @tradesEmpty.
  ///
  /// In en, this message translates to:
  /// **'No active trade offers'**
  String get tradesEmpty;

  /// No description provided for @createTrade.
  ///
  /// In en, this message translates to:
  /// **'Create Trade'**
  String get createTrade;

  /// No description provided for @selectFriend.
  ///
  /// In en, this message translates to:
  /// **'Select Friend'**
  String get selectFriend;

  /// No description provided for @yourItems.
  ///
  /// In en, this message translates to:
  /// **'Your Items'**
  String get yourItems;

  /// No description provided for @theirItems.
  ///
  /// In en, this message translates to:
  /// **'Their Items'**
  String get theirItems;

  /// No description provided for @reviewTrade.
  ///
  /// In en, this message translates to:
  /// **'Review Trade'**
  String get reviewTrade;

  /// No description provided for @sendOffer.
  ///
  /// In en, this message translates to:
  /// **'Send Offer'**
  String get sendOffer;

  /// No description provided for @tradeStatus.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get tradeStatus;

  /// No description provided for @tradePending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get tradePending;

  /// No description provided for @tradeAccepted.
  ///
  /// In en, this message translates to:
  /// **'Accepted'**
  String get tradeAccepted;

  /// No description provided for @tradeDeclined.
  ///
  /// In en, this message translates to:
  /// **'Declined'**
  String get tradeDeclined;

  /// No description provided for @tradeCanceled.
  ///
  /// In en, this message translates to:
  /// **'Canceled'**
  String get tradeCanceled;

  /// No description provided for @privateInventory.
  ///
  /// In en, this message translates to:
  /// **'Private inventory'**
  String get privateInventory;

  /// No description provided for @historyEmpty.
  ///
  /// In en, this message translates to:
  /// **'No transactions yet'**
  String get historyEmpty;

  /// No description provided for @filterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get filterAll;

  /// No description provided for @filterBuy.
  ///
  /// In en, this message translates to:
  /// **'Buy'**
  String get filterBuy;

  /// No description provided for @filterSell.
  ///
  /// In en, this message translates to:
  /// **'Sell'**
  String get filterSell;

  /// No description provided for @filterTrade.
  ///
  /// In en, this message translates to:
  /// **'Trade'**
  String get filterTrade;

  /// No description provided for @exportCSV.
  ///
  /// In en, this message translates to:
  /// **'Export CSV'**
  String get exportCSV;

  /// No description provided for @exportTitle.
  ///
  /// In en, this message translates to:
  /// **'Export Transactions'**
  String get exportTitle;

  /// No description provided for @dateRange.
  ///
  /// In en, this message translates to:
  /// **'Date Range'**
  String get dateRange;

  /// No description provided for @startDate.
  ///
  /// In en, this message translates to:
  /// **'Start Date'**
  String get startDate;

  /// No description provided for @endDate.
  ///
  /// In en, this message translates to:
  /// **'End Date'**
  String get endDate;

  /// No description provided for @steamSession.
  ///
  /// In en, this message translates to:
  /// **'Steam Account'**
  String get steamSession;

  /// No description provided for @sessionValid.
  ///
  /// In en, this message translates to:
  /// **'Session active'**
  String get sessionValid;

  /// No description provided for @sessionExpiring.
  ///
  /// In en, this message translates to:
  /// **'Session expiring soon'**
  String get sessionExpiring;

  /// No description provided for @sessionExpired.
  ///
  /// In en, this message translates to:
  /// **'Session expired'**
  String get sessionExpired;

  /// No description provided for @sessionExpiredReauth.
  ///
  /// In en, this message translates to:
  /// **'Steam session expired. Tap to re-authenticate.'**
  String get sessionExpiredReauth;

  /// No description provided for @sessionInfoTitle.
  ///
  /// In en, this message translates to:
  /// **'How sessions work'**
  String get sessionInfoTitle;

  /// No description provided for @sessionInfoBody.
  ///
  /// In en, this message translates to:
  /// **'Steam sessions last about 24 hours. When yours expires, you\'ll be brought back here to sign in again. This is a Steam security requirement — we automatically refresh when possible, but some sessions require a fresh login.'**
  String get sessionInfoBody;

  /// No description provided for @noSession.
  ///
  /// In en, this message translates to:
  /// **'No session'**
  String get noSession;

  /// No description provided for @connectSteam.
  ///
  /// In en, this message translates to:
  /// **'Connect Steam'**
  String get connectSteam;

  /// No description provided for @logout.
  ///
  /// In en, this message translates to:
  /// **'Sign Out'**
  String get logout;

  /// No description provided for @premiumTitle.
  ///
  /// In en, this message translates to:
  /// **'SkinKeeper PRO'**
  String get premiumTitle;

  /// No description provided for @premiumSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Unlock all features'**
  String get premiumSubtitle;

  /// No description provided for @restorePurchases.
  ///
  /// In en, this message translates to:
  /// **'Restore Purchases'**
  String get restorePurchases;

  /// No description provided for @privacyPolicy.
  ///
  /// In en, this message translates to:
  /// **'Privacy Policy'**
  String get privacyPolicy;

  /// No description provided for @termsOfService.
  ///
  /// In en, this message translates to:
  /// **'Terms of Service'**
  String get termsOfService;

  /// No description provided for @alertsTitle.
  ///
  /// In en, this message translates to:
  /// **'Price Alerts'**
  String get alertsTitle;

  /// No description provided for @alertsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No alerts configured'**
  String get alertsEmpty;

  /// No description provided for @createAlert.
  ///
  /// In en, this message translates to:
  /// **'Create Alert'**
  String get createAlert;

  /// No description provided for @alertConditionAbove.
  ///
  /// In en, this message translates to:
  /// **'Price above'**
  String get alertConditionAbove;

  /// No description provided for @alertConditionBelow.
  ///
  /// In en, this message translates to:
  /// **'Price below'**
  String get alertConditionBelow;

  /// No description provided for @alertConditionChange.
  ///
  /// In en, this message translates to:
  /// **'Price changed by'**
  String get alertConditionChange;

  /// No description provided for @alertSource.
  ///
  /// In en, this message translates to:
  /// **'Market'**
  String get alertSource;

  /// No description provided for @alertSourceAny.
  ///
  /// In en, this message translates to:
  /// **'Any market'**
  String get alertSourceAny;

  /// No description provided for @alertCooldown.
  ///
  /// In en, this message translates to:
  /// **'Cooldown'**
  String get alertCooldown;

  /// No description provided for @alertHistory.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get alertHistory;

  /// No description provided for @alertTriggered.
  ///
  /// In en, this message translates to:
  /// **'Triggered'**
  String get alertTriggered;

  /// No description provided for @alertActive.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get alertActive;

  /// No description provided for @alertPaused.
  ///
  /// In en, this message translates to:
  /// **'Paused'**
  String get alertPaused;

  /// No description provided for @premiumRequired.
  ///
  /// In en, this message translates to:
  /// **'Premium Required'**
  String get premiumRequired;

  /// No description provided for @premiumRequiredDesc.
  ///
  /// In en, this message translates to:
  /// **'This feature requires SkinKeeper PRO'**
  String get premiumRequiredDesc;

  /// No description provided for @upgradeToPremium.
  ///
  /// In en, this message translates to:
  /// **'Upgrade to PRO'**
  String get upgradeToPremium;

  /// No description provided for @monthlyPlan.
  ///
  /// In en, this message translates to:
  /// **'Monthly'**
  String get monthlyPlan;

  /// No description provided for @yearlyPlan.
  ///
  /// In en, this message translates to:
  /// **'Yearly'**
  String get yearlyPlan;

  /// No description provided for @perMonth.
  ///
  /// In en, this message translates to:
  /// **'/month'**
  String get perMonth;

  /// No description provided for @perYear.
  ///
  /// In en, this message translates to:
  /// **'/year'**
  String get perYear;

  /// No description provided for @bestValue.
  ///
  /// In en, this message translates to:
  /// **'Best Value'**
  String get bestValue;

  /// No description provided for @freePlan.
  ///
  /// In en, this message translates to:
  /// **'Free'**
  String get freePlan;

  /// No description provided for @proPlan.
  ///
  /// In en, this message translates to:
  /// **'PRO'**
  String get proPlan;

  /// No description provided for @onboardingTitle1.
  ///
  /// In en, this message translates to:
  /// **'Track Your Skins'**
  String get onboardingTitle1;

  /// No description provided for @onboardingDesc1.
  ///
  /// In en, this message translates to:
  /// **'Monitor your CS2 inventory value across Steam, Skinport, CSFloat, and DMarket'**
  String get onboardingDesc1;

  /// No description provided for @onboardingTitle2.
  ///
  /// In en, this message translates to:
  /// **'Smart Price Alerts'**
  String get onboardingTitle2;

  /// No description provided for @onboardingDesc2.
  ///
  /// In en, this message translates to:
  /// **'Get notified when skin prices hit your target on any market'**
  String get onboardingDesc2;

  /// No description provided for @onboardingTitle3.
  ///
  /// In en, this message translates to:
  /// **'Profit & Loss'**
  String get onboardingTitle3;

  /// No description provided for @onboardingDesc3.
  ///
  /// In en, this message translates to:
  /// **'Track investment performance with detailed analytics'**
  String get onboardingDesc3;

  /// No description provided for @onboardingGetStarted.
  ///
  /// In en, this message translates to:
  /// **'Get Started'**
  String get onboardingGetStarted;

  /// No description provided for @onboardingSkip.
  ///
  /// In en, this message translates to:
  /// **'Skip'**
  String get onboardingSkip;

  /// No description provided for @onboardingNext.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get onboardingNext;

  /// No description provided for @loginTitle.
  ///
  /// In en, this message translates to:
  /// **'Welcome to SkinKeeper'**
  String get loginTitle;

  /// No description provided for @loginSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Sign in with your Steam account'**
  String get loginSubtitle;

  /// No description provided for @loginWithSteam.
  ///
  /// In en, this message translates to:
  /// **'Sign in with Steam'**
  String get loginWithSteam;

  /// No description provided for @authQR.
  ///
  /// In en, this message translates to:
  /// **'Quick Auth'**
  String get authQR;

  /// No description provided for @authManual.
  ///
  /// In en, this message translates to:
  /// **'Manual'**
  String get authManual;

  /// No description provided for @authQRDesc.
  ///
  /// In en, this message translates to:
  /// **'Scan QR with Steam Mobile'**
  String get authQRDesc;

  /// No description provided for @authSteamGuard.
  ///
  /// In en, this message translates to:
  /// **'Steam Guard Code'**
  String get authSteamGuard;

  /// No description provided for @authClientToken.
  ///
  /// In en, this message translates to:
  /// **'Client JS Token'**
  String get authClientToken;

  /// No description provided for @authBrowser.
  ///
  /// In en, this message translates to:
  /// **'Open Steam in Browser'**
  String get authBrowser;

  /// No description provided for @linkedAccounts.
  ///
  /// In en, this message translates to:
  /// **'Linked Accounts'**
  String get linkedAccounts;

  /// No description provided for @priceAlerts.
  ///
  /// In en, this message translates to:
  /// **'Price Alerts'**
  String get priceAlerts;

  /// No description provided for @currency.
  ///
  /// In en, this message translates to:
  /// **'Currency'**
  String get currency;

  /// No description provided for @language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// No description provided for @theme.
  ///
  /// In en, this message translates to:
  /// **'Theme'**
  String get theme;

  /// No description provided for @themeDark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get themeDark;

  /// No description provided for @themeLight.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get themeLight;

  /// No description provided for @systemDefault.
  ///
  /// In en, this message translates to:
  /// **'System Default'**
  String get systemDefault;

  /// No description provided for @appTour.
  ///
  /// In en, this message translates to:
  /// **'App Tour'**
  String get appTour;

  /// No description provided for @signOut.
  ///
  /// In en, this message translates to:
  /// **'Sign Out'**
  String get signOut;

  /// No description provided for @connected.
  ///
  /// In en, this message translates to:
  /// **'Logged in'**
  String get connected;

  /// No description provided for @notConfigured.
  ///
  /// In en, this message translates to:
  /// **'Not connected'**
  String get notConfigured;

  /// No description provided for @checking.
  ///
  /// In en, this message translates to:
  /// **'Checking...'**
  String get checking;

  /// No description provided for @connectSteamSession.
  ///
  /// In en, this message translates to:
  /// **'Connect Steam Session'**
  String get connectSteamSession;

  /// No description provided for @sessionBrowserHint.
  ///
  /// In en, this message translates to:
  /// **'Open this URL in your browser while logged into Steam:'**
  String get sessionBrowserHint;

  /// No description provided for @sessionPasteHint.
  ///
  /// In en, this message translates to:
  /// **'Then paste the full JSON response below:'**
  String get sessionPasteHint;

  /// No description provided for @connect.
  ///
  /// In en, this message translates to:
  /// **'Connect'**
  String get connect;

  /// No description provided for @urlCopied.
  ///
  /// In en, this message translates to:
  /// **'URL copied!'**
  String get urlCopied;

  /// No description provided for @paintSeed.
  ///
  /// In en, this message translates to:
  /// **'Seed'**
  String get paintSeed;

  /// No description provided for @tradeBan.
  ///
  /// In en, this message translates to:
  /// **'Trade Ban'**
  String get tradeBan;

  /// No description provided for @ok.
  ///
  /// In en, this message translates to:
  /// **'OK'**
  String get ok;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @save.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// No description provided for @delete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get delete;

  /// No description provided for @confirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get confirm;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// No description provided for @loading.
  ///
  /// In en, this message translates to:
  /// **'Loading...'**
  String get loading;

  /// No description provided for @error.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong'**
  String get error;

  /// No description provided for @noData.
  ///
  /// In en, this message translates to:
  /// **'No data available'**
  String get noData;

  /// No description provided for @refresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get refresh;

  /// No description provided for @search.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get search;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>[
    'de',
    'en',
    'pt',
    'ru',
    'uk',
    'zh',
  ].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'de':
      return AppLocalizationsDe();
    case 'en':
      return AppLocalizationsEn();
    case 'pt':
      return AppLocalizationsPt();
    case 'ru':
      return AppLocalizationsRu();
    case 'uk':
      return AppLocalizationsUk();
    case 'zh':
      return AppLocalizationsZh();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
