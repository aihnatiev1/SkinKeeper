// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Russian (`ru`).
class AppLocalizationsRu extends AppLocalizations {
  AppLocalizationsRu([String locale = 'ru']) : super(locale);

  @override
  String get appName => 'SkinKeeper';

  @override
  String get appSubtitle => 'CS2 Инвентарь и Ценовые Оповещения';

  @override
  String get tabPortfolio => 'Портфель';

  @override
  String get tabInventory => 'Инвентарь';

  @override
  String get tabTrades => 'Обмены';

  @override
  String get tabHistory => 'История';

  @override
  String get tabSettings => 'Настройки';

  @override
  String get portfolioTitle => 'Портфель';

  @override
  String get inventoryTitle => 'Инвентарь';

  @override
  String get tradesTitle => 'Предложения обмена';

  @override
  String get historyTitle => 'Транзакции';

  @override
  String get settingsTitle => 'Настройки';

  @override
  String get portfolioValue => 'Стоимость портфеля';

  @override
  String get totalInvested => 'Инвестировано';

  @override
  String get totalProfit => 'Прибыль';

  @override
  String get totalLoss => 'Убыток';

  @override
  String get unrealizedPL => 'Нереализованный P/L';

  @override
  String get plHistory => 'История P/L';

  @override
  String get inventoryEmpty => 'Нет предметов в инвентаре';

  @override
  String itemCount(int count) {
    return '$count предметов';
  }

  @override
  String get bestPrice => 'Лучшая цена';

  @override
  String get steamPrice => 'Steam';

  @override
  String get skinportPrice => 'Skinport';

  @override
  String get csfloatPrice => 'CSFloat';

  @override
  String get dmarketPrice => 'DMarket';

  @override
  String get priceComparison => 'Сравнение цен';

  @override
  String get priceHistory => 'История цен';

  @override
  String get floatValue => 'Float значение';

  @override
  String get stickers => 'Стикеры';

  @override
  String get charms => 'Чармы';

  @override
  String get wearLabel => 'Износ';

  @override
  String get sellTitle => 'Продать предмет';

  @override
  String get sellButton => 'Продать в Steam';

  @override
  String get sellPrice => 'Цена продажи';

  @override
  String get buyerPays => 'Покупатель платит';

  @override
  String get youReceive => 'Вы получите';

  @override
  String get steamFee => 'Комиссия Steam';

  @override
  String get gameFee => 'Комиссия игры';

  @override
  String get bulkSell => 'Массовая продажа';

  @override
  String get confirmSell => 'Подтвердить продажу';

  @override
  String get selling => 'Продаём...';

  @override
  String get sellSuccess => 'Предмет выставлен на продажу!';

  @override
  String get sellFailed => 'Не удалось выставить предмет';

  @override
  String get tradesEmpty => 'Нет активных предложений обмена';

  @override
  String get createTrade => 'Создать обмен';

  @override
  String get selectFriend => 'Выбрать друга';

  @override
  String get yourItems => 'Ваши предметы';

  @override
  String get theirItems => 'Их предметы';

  @override
  String get reviewTrade => 'Просмотреть обмен';

  @override
  String get sendOffer => 'Отправить предложение';

  @override
  String get tradeStatus => 'Статус';

  @override
  String get tradePending => 'Ожидает';

  @override
  String get tradeAccepted => 'Принято';

  @override
  String get tradeDeclined => 'Отклонено';

  @override
  String get tradeCanceled => 'Отменено';

  @override
  String get privateInventory => 'Приватный инвентарь';

  @override
  String get historyEmpty => 'Нет транзакций';

  @override
  String get filterAll => 'Все';

  @override
  String get filterBuy => 'Покупка';

  @override
  String get filterSell => 'Продажа';

  @override
  String get filterTrade => 'Обмен';

  @override
  String get exportCSV => 'Экспорт CSV';

  @override
  String get exportTitle => 'Экспорт транзакций';

  @override
  String get dateRange => 'Период';

  @override
  String get startDate => 'Начальная дата';

  @override
  String get endDate => 'Конечная дата';

  @override
  String get steamSession => 'Сессия Steam';

  @override
  String get sessionValid => 'Сессия активна';

  @override
  String get sessionExpiring => 'Сессия истекает';

  @override
  String get sessionExpired => 'Сессия истекла';

  @override
  String get sessionExpiredReauth =>
      'Сессия Steam истекла. Нажмите для повторной авторизации.';

  @override
  String get sessionInfoTitle => 'Как работают сессии';

  @override
  String get sessionInfoBody =>
      'Сессия Steam действует около 24 часов. Когда она истечёт, вы будете перенаправлены сюда для повторного входа. Это требование безопасности Steam — мы обновляем сессию автоматически когда возможно, но иногда нужен новый вход.';

  @override
  String get noSession => 'Нет сессии';

  @override
  String get connectSteam => 'Подключить Steam';

  @override
  String get logout => 'Выйти';

  @override
  String get premiumTitle => 'SkinKeeper PRO';

  @override
  String get premiumSubtitle => 'Разблокируй все функции';

  @override
  String get restorePurchases => 'Восстановить покупки';

  @override
  String get privacyPolicy => 'Политика конфиденциальности';

  @override
  String get termsOfService => 'Условия использования';

  @override
  String get alertsTitle => 'Ценовые оповещения';

  @override
  String get alertsEmpty => 'Нет настроенных оповещений';

  @override
  String get createAlert => 'Создать оповещение';

  @override
  String get alertConditionAbove => 'Цена выше';

  @override
  String get alertConditionBelow => 'Цена ниже';

  @override
  String get alertConditionChange => 'Цена изменилась на';

  @override
  String get alertSource => 'Маркет';

  @override
  String get alertSourceAny => 'Любой маркет';

  @override
  String get alertCooldown => 'Задержка';

  @override
  String get alertHistory => 'Уведомления';

  @override
  String get alertTriggered => 'Сработало';

  @override
  String get alertActive => 'Активно';

  @override
  String get alertPaused => 'Приостановлено';

  @override
  String get premiumRequired => 'Нужен Premium';

  @override
  String get premiumRequiredDesc => 'Эта функция требует SkinKeeper PRO';

  @override
  String get upgradeToPremium => 'Перейти на PRO';

  @override
  String get monthlyPlan => 'Месячный';

  @override
  String get yearlyPlan => 'Годовой';

  @override
  String get perMonth => '/месяц';

  @override
  String get perYear => '/год';

  @override
  String get bestValue => 'Лучшая цена';

  @override
  String get freePlan => 'Бесплатный';

  @override
  String get proPlan => 'PRO';

  @override
  String get onboardingTitle1 => 'Отслеживайте скины';

  @override
  String get onboardingDesc1 =>
      'Мониторьте стоимость инвентаря CS2 на Steam, Skinport, CSFloat и DMarket';

  @override
  String get onboardingTitle2 => 'Умные оповещения';

  @override
  String get onboardingDesc2 =>
      'Получайте уведомления когда цены достигнут вашей цели';

  @override
  String get onboardingTitle3 => 'Прибыли и убытки';

  @override
  String get onboardingDesc3 =>
      'Отслеживайте эффективность инвестиций с детальной аналитикой';

  @override
  String get onboardingGetStarted => 'Начать';

  @override
  String get onboardingSkip => 'Пропустить';

  @override
  String get onboardingNext => 'Далее';

  @override
  String get onbDashTitle => 'Портфель и P/L-дашборд';

  @override
  String get onbDashSub =>
      'Следите за общей стоимостью и профитом по всем скинам в реальном времени.';

  @override
  String get onbInventoryTitle => 'Полный контроль инвентаря';

  @override
  String get onbInventorySub =>
      'Float\'ы, sticker\'ы, charm\'ы. Продавайте напрямую или шлите trade offer\'ы.';

  @override
  String get onbTradesTitle => 'Удобные trade offer\'ы';

  @override
  String get onbTradesSub =>
      'Отправляйте и принимайте обмены не выходя из приложения. Без Steam-браузера.';

  @override
  String get onbAccountsTitle => 'Несколько Steam-аккаунтов';

  @override
  String get onbAccountsSub =>
      'Переключайтесь между аккаунтами мгновенно. Весь инвентарь в одном месте.';

  @override
  String get onbProTitle => 'Открой PRO';

  @override
  String get onbProSub =>
      'Цены с нескольких источников, учёт профита, bulk sell, безлимитные аккаунты.\n7 дней бесплатно.';

  @override
  String get onbBtnSkip => 'Пропустить';

  @override
  String get onbBtnNext => 'Далее';

  @override
  String get onbBtnGetStarted => 'Начать';

  @override
  String get onbBtnTryPro => 'Попробовать PRO 7 дней бесплатно';

  @override
  String get onbBtnMaybeLater => 'Может позже';

  @override
  String get onbProBullet1 => 'Цены Skinport, CSFloat, DMarket';

  @override
  String get onbProBullet2 => 'P/L по портфелю';

  @override
  String get onbProBullet3 => 'Bulk sell на Steam Market';

  @override
  String get onbProBullet4 => 'Безлимитные Steam-аккаунты';

  @override
  String get onbProBullet5 => 'Экспорт в CSV/Excel';

  @override
  String get loginTitle => 'Добро пожаловать';

  @override
  String get loginSubtitle => 'Войдите через Steam аккаунт';

  @override
  String get loginWithSteam => 'Войти через Steam';

  @override
  String get authQR => 'Быстрая авторизация';

  @override
  String get authManual => 'Вручную';

  @override
  String get authQRDesc => 'Сканируйте QR с помощью Steam Mobile';

  @override
  String get authSteamGuard => 'Код Steam Guard';

  @override
  String get authClientToken => 'Client JS Token';

  @override
  String get authBrowser => 'Открыть Steam в браузере';

  @override
  String get linkedAccounts => 'Привязанные аккаунты';

  @override
  String get priceAlerts => 'Ценовые оповещения';

  @override
  String get currency => 'Валюта';

  @override
  String get language => 'Язык';

  @override
  String get theme => 'Тема';

  @override
  String get themeDark => 'Тёмная';

  @override
  String get themeLight => 'Светлая';

  @override
  String get systemDefault => 'Системная';

  @override
  String get appTour => 'Обзор приложения';

  @override
  String get signOut => 'Выйти';

  @override
  String get connected => 'Подключено';

  @override
  String get notConfigured => 'Не настроено';

  @override
  String get checking => 'Проверка...';

  @override
  String get connectSteamSession => 'Подключить сессию Steam';

  @override
  String get sessionBrowserHint =>
      'Откройте эту ссылку в браузере, войдя в Steam:';

  @override
  String get sessionPasteHint => 'Затем вставьте полный JSON ответ ниже:';

  @override
  String get connect => 'Подключить';

  @override
  String get urlCopied => 'URL скопирован!';

  @override
  String get paintSeed => 'Паттерн';

  @override
  String get tradeBan => 'Блокировка обмена';

  @override
  String get ok => 'OK';

  @override
  String get cancel => 'Отмена';

  @override
  String get save => 'Сохранить';

  @override
  String get delete => 'Удалить';

  @override
  String get confirm => 'Подтвердить';

  @override
  String get retry => 'Повторить';

  @override
  String get loading => 'Загрузка...';

  @override
  String get error => 'Что-то пошло не так';

  @override
  String get noData => 'Нет данных';

  @override
  String get refresh => 'Обновить';

  @override
  String get search => 'Поиск';

  @override
  String get cancelModalTitle => 'Listing in progress';

  @override
  String cancelModalCountdown(int seconds) {
    return 'Listing in ${seconds}s';
  }

  @override
  String get cancelModalContinue => 'Continue';

  @override
  String get cancelModalCancel => 'Cancel';

  @override
  String get cancelModalCancelled => 'Listing cancelled';

  @override
  String get cancelModalErrorExpired => 'Too late — listing already on Steam';

  @override
  String get cancelModalErrorGeneric => 'Failed to cancel';
}
