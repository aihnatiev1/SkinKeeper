// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Ukrainian (`uk`).
class AppLocalizationsUk extends AppLocalizations {
  AppLocalizationsUk([String locale = 'uk']) : super(locale);

  @override
  String get appName => 'SkinKeeper';

  @override
  String get appSubtitle => 'CS2 Інвентар і Цінові Сповіщення';

  @override
  String get tabPortfolio => 'Портфель';

  @override
  String get tabInventory => 'Інвентар';

  @override
  String get tabTrades => 'Обміни';

  @override
  String get tabHistory => 'Історія';

  @override
  String get tabSettings => 'Меню';

  @override
  String get portfolioTitle => 'Портфель';

  @override
  String get inventoryTitle => 'Інвентар';

  @override
  String get tradesTitle => 'Пропозиції обміну';

  @override
  String get historyTitle => 'Транзакції';

  @override
  String get settingsTitle => 'Налаштування';

  @override
  String get portfolioValue => 'Вартість портфеля';

  @override
  String get totalInvested => 'Інвестовано';

  @override
  String get totalProfit => 'Прибуток';

  @override
  String get totalLoss => 'Збиток';

  @override
  String get unrealizedPL => 'Нереалізований P/L';

  @override
  String get plHistory => 'Історія P/L';

  @override
  String get inventoryEmpty => 'Немає предметів в інвентарі';

  @override
  String itemCount(int count) {
    return '$count предметів';
  }

  @override
  String get bestPrice => 'Найкраща ціна';

  @override
  String get steamPrice => 'Steam';

  @override
  String get skinportPrice => 'Skinport';

  @override
  String get csfloatPrice => 'CSFloat';

  @override
  String get dmarketPrice => 'DMarket';

  @override
  String get priceComparison => 'Порівняння цін';

  @override
  String get priceHistory => 'Історія цін';

  @override
  String get floatValue => 'Float значення';

  @override
  String get stickers => 'Стікери';

  @override
  String get charms => 'Чарми';

  @override
  String get wearLabel => 'Зношеність';

  @override
  String get sellTitle => 'Продати предмет';

  @override
  String get sellButton => 'Продати в Steam';

  @override
  String get sellPrice => 'Ціна продажу';

  @override
  String get buyerPays => 'Покупець платить';

  @override
  String get youReceive => 'Ви отримаєте';

  @override
  String get steamFee => 'Комісія Steam';

  @override
  String get gameFee => 'Комісія гри';

  @override
  String get bulkSell => 'Масовий продаж';

  @override
  String get confirmSell => 'Підтвердити продаж';

  @override
  String get selling => 'Продаємо...';

  @override
  String get sellSuccess => 'Предмет виставлено на продаж!';

  @override
  String get sellFailed => 'Не вдалося виставити предмет';

  @override
  String get tradesEmpty => 'Немає активних пропозицій обміну';

  @override
  String get createTrade => 'Створити обмін';

  @override
  String get selectFriend => 'Обрати друга';

  @override
  String get yourItems => 'Ваші предмети';

  @override
  String get theirItems => 'Їх предмети';

  @override
  String get reviewTrade => 'Переглянути обмін';

  @override
  String get sendOffer => 'Надіслати пропозицію';

  @override
  String get tradeStatus => 'Статус';

  @override
  String get tradePending => 'Очікує';

  @override
  String get tradeAccepted => 'Прийнято';

  @override
  String get tradeDeclined => 'Відхилено';

  @override
  String get tradeCanceled => 'Скасовано';

  @override
  String get privateInventory => 'Приватний інвентар';

  @override
  String get historyEmpty => 'Немає транзакцій';

  @override
  String get filterAll => 'Всі';

  @override
  String get filterBuy => 'Купівля';

  @override
  String get filterSell => 'Продаж';

  @override
  String get filterTrade => 'Обмін';

  @override
  String get exportCSV => 'Експорт CSV';

  @override
  String get exportTitle => 'Експорт транзакцій';

  @override
  String get dateRange => 'Період';

  @override
  String get startDate => 'Початкова дата';

  @override
  String get endDate => 'Кінцева дата';

  @override
  String get steamSession => 'Сесія Steam';

  @override
  String get sessionValid => 'Сесія активна';

  @override
  String get sessionExpiring => 'Сесія закінчується';

  @override
  String get sessionExpired => 'Сесія закінчилась';

  @override
  String get sessionExpiredReauth =>
      'Steam сесія закінчилась. Натисніть для повторної авторизації.';

  @override
  String get sessionInfoTitle => 'Як працюють сесії';

  @override
  String get sessionInfoBody =>
      'Сесія Steam діє приблизно 24 години. Коли вона закінчиться, вас повернуть сюди для повторного входу. Це вимога безпеки Steam — ми оновлюємо сесію автоматично коли можливо, але іноді потрібен новий вхід.';

  @override
  String get noSession => 'Немає сесії';

  @override
  String get connectSteam => 'Підключити Steam';

  @override
  String get logout => 'Вийти';

  @override
  String get premiumTitle => 'SkinKeeper PRO';

  @override
  String get premiumSubtitle => 'Розблокуй всі функції';

  @override
  String get restorePurchases => 'Відновити покупки';

  @override
  String get privacyPolicy => 'Політика конфіденційності';

  @override
  String get termsOfService => 'Умови використання';

  @override
  String get alertsTitle => 'Цінові сповіщення';

  @override
  String get alertsEmpty => 'Немає налаштованих сповіщень';

  @override
  String get createAlert => 'Створити сповіщення';

  @override
  String get alertConditionAbove => 'Ціна вище';

  @override
  String get alertConditionBelow => 'Ціна нижче';

  @override
  String get alertConditionChange => 'Ціна змінилась на';

  @override
  String get alertSource => 'Маркет';

  @override
  String get alertSourceAny => 'Будь-який маркет';

  @override
  String get alertCooldown => 'Затримка';

  @override
  String get alertHistory => 'Сповіщення';

  @override
  String get alertTriggered => 'Спрацювало';

  @override
  String get alertActive => 'Активне';

  @override
  String get alertPaused => 'Призупинено';

  @override
  String get premiumRequired => 'Потрібен Premium';

  @override
  String get premiumRequiredDesc => 'Ця функція потребує SkinKeeper PRO';

  @override
  String get upgradeToPremium => 'Перейти на PRO';

  @override
  String get monthlyPlan => 'Місячний';

  @override
  String get yearlyPlan => 'Річний';

  @override
  String get perMonth => '/місяць';

  @override
  String get perYear => '/рік';

  @override
  String get bestValue => 'Найвигідніше';

  @override
  String get freePlan => 'Безкоштовний';

  @override
  String get proPlan => 'PRO';

  @override
  String get onboardingTitle1 => 'Відстежуйте скіни';

  @override
  String get onboardingDesc1 =>
      'Моніторте вартість інвентарю CS2 на Steam, Skinport, CSFloat та DMarket';

  @override
  String get onboardingTitle2 => 'Розумні сповіщення';

  @override
  String get onboardingDesc2 =>
      'Отримуйте повідомлення коли ціни досягнуть вашої цілі';

  @override
  String get onboardingTitle3 => 'Прибутки та збитки';

  @override
  String get onboardingDesc3 =>
      'Відстежуйте ефективність інвестицій з детальною аналітикою';

  @override
  String get onboardingGetStarted => 'Почати';

  @override
  String get onboardingSkip => 'Пропустити';

  @override
  String get onboardingNext => 'Далі';

  @override
  String get onbDashTitle => 'Портфель і P/L дашборд';

  @override
  String get onbDashSub =>
      'Слідкуйте за загальною вартістю та профітом усіх своїх скінів у реальному часі.';

  @override
  String get onbInventoryTitle => 'Повний контроль інвентарю';

  @override
  String get onbInventorySub =>
      'Float, sticker\'и, charm\'и. Продавайте напряму або шліть trade offer\'и.';

  @override
  String get onbTradesTitle => 'Зручні trade offer\'и';

  @override
  String get onbTradesSub =>
      'Надсилайте та приймайте обміни не виходячи з додатка. Без Steam-браузера.';

  @override
  String get onbAccountsTitle => 'Кілька Steam-акаунтів';

  @override
  String get onbAccountsSub =>
      'Перемикайтесь між акаунтами миттєво. Весь інвентар в одному місці.';

  @override
  String get onbProTitle => 'Відкрийте PRO';

  @override
  String get onbProSub =>
      'Ціни з кількох джерел, облік прибутку, bulk sell, безлімітні акаунти.\n7 днів безкоштовно.';

  @override
  String get onbBtnSkip => 'Пропустити';

  @override
  String get onbBtnNext => 'Далі';

  @override
  String get onbBtnGetStarted => 'Почати';

  @override
  String get onbBtnTryPro => 'Спробувати PRO 7 днів безкоштовно';

  @override
  String get onbBtnMaybeLater => 'Можливо пізніше';

  @override
  String get onbProBullet1 => 'Ціни Skinport, CSFloat, DMarket';

  @override
  String get onbProBullet2 => 'P/L по портфелю';

  @override
  String get onbProBullet3 => 'Bulk sell на Steam Market';

  @override
  String get onbProBullet4 => 'Безлімітні Steam-акаунти';

  @override
  String get onbProBullet5 => 'Експорт у CSV/Excel';

  @override
  String get loginTitle => 'Ласкаво просимо';

  @override
  String get loginSubtitle => 'Увійдіть через Steam аккаунт';

  @override
  String get loginWithSteam => 'Увійти через Steam';

  @override
  String get authQR => 'Швидка авторизація';

  @override
  String get authManual => 'Вручну';

  @override
  String get authQRDesc => 'Скануйте QR за допомогою Steam Mobile';

  @override
  String get authSteamGuard => 'Код Steam Guard';

  @override
  String get authClientToken => 'Client JS Token';

  @override
  String get authBrowser => 'Відкрити Steam у браузері';

  @override
  String get linkedAccounts => 'Прив\'язані акаунти';

  @override
  String get priceAlerts => 'Цінові сповіщення';

  @override
  String get currency => 'Валюта';

  @override
  String get language => 'Мова';

  @override
  String get theme => 'Тема';

  @override
  String get themeDark => 'Темна';

  @override
  String get themeLight => 'Світла';

  @override
  String get systemDefault => 'Системна';

  @override
  String get appTour => 'Тур по додатку';

  @override
  String get signOut => 'Вийти';

  @override
  String get connected => 'Підключено';

  @override
  String get notConfigured => 'Не налаштовано';

  @override
  String get checking => 'Перевірка...';

  @override
  String get connectSteamSession => 'Підключити сесію Steam';

  @override
  String get sessionBrowserHint =>
      'Відкрийте це посилання у браузері, увійшовши в Steam:';

  @override
  String get sessionPasteHint => 'Потім вставте повну JSON відповідь нижче:';

  @override
  String get connect => 'Підключити';

  @override
  String get urlCopied => 'URL скопійовано!';

  @override
  String get paintSeed => 'Патерн';

  @override
  String get tradeBan => 'Блокування обміну';

  @override
  String get ok => 'OK';

  @override
  String get cancel => 'Скасувати';

  @override
  String get save => 'Зберегти';

  @override
  String get delete => 'Видалити';

  @override
  String get confirm => 'Підтвердити';

  @override
  String get retry => 'Повторити';

  @override
  String get loading => 'Завантаження...';

  @override
  String get error => 'Щось пішло не так';

  @override
  String get noData => 'Немає даних';

  @override
  String get refresh => 'Оновити';

  @override
  String get search => 'Пошук';

  @override
  String get cancelModalTitle => 'Виставляємо на продаж';

  @override
  String cancelModalCountdown(int seconds) {
    return 'Виставляємо за $seconds с';
  }

  @override
  String get cancelModalContinue => 'Продовжити';

  @override
  String get cancelModalCancel => 'Скасувати';

  @override
  String get cancelModalCancelled => 'Продаж скасовано';

  @override
  String get cancelModalErrorExpired => 'Запізно — лот уже на Steam';

  @override
  String get cancelModalErrorGeneric => 'Не вдалося скасувати';
}
