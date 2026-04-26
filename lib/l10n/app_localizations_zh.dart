// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Chinese (`zh`).
class AppLocalizationsZh extends AppLocalizations {
  AppLocalizationsZh([String locale = 'zh']) : super(locale);

  @override
  String get appName => 'SkinKeeper';

  @override
  String get appSubtitle => 'CS2 库存与价格提醒';

  @override
  String get tabPortfolio => '投资组合';

  @override
  String get tabInventory => '库存';

  @override
  String get tabTrades => '交易';

  @override
  String get tabHistory => '历史';

  @override
  String get tabSettings => '设置';

  @override
  String get portfolioTitle => '投资组合';

  @override
  String get inventoryTitle => '库存';

  @override
  String get tradesTitle => '交易报价';

  @override
  String get historyTitle => '交易记录';

  @override
  String get settingsTitle => '设置';

  @override
  String get portfolioValue => '组合价值';

  @override
  String get totalInvested => '已投资';

  @override
  String get totalProfit => '利润';

  @override
  String get totalLoss => '亏损';

  @override
  String get unrealizedPL => '未实现盈亏';

  @override
  String get plHistory => '盈亏历史';

  @override
  String get inventoryEmpty => '库存中没有物品';

  @override
  String itemCount(int count) {
    return '$count 个物品';
  }

  @override
  String get bestPrice => '最佳价格';

  @override
  String get steamPrice => 'Steam';

  @override
  String get skinportPrice => 'Skinport';

  @override
  String get csfloatPrice => 'CSFloat';

  @override
  String get dmarketPrice => 'DMarket';

  @override
  String get priceComparison => '价格对比';

  @override
  String get priceHistory => '价格历史';

  @override
  String get floatValue => '磨损值';

  @override
  String get stickers => '贴纸';

  @override
  String get charms => '挂件';

  @override
  String get wearLabel => '磨损';

  @override
  String get sellTitle => '出售物品';

  @override
  String get sellButton => '在Steam出售';

  @override
  String get sellPrice => '售价';

  @override
  String get buyerPays => '买家支付';

  @override
  String get youReceive => '您将收到';

  @override
  String get steamFee => 'Steam手续费';

  @override
  String get gameFee => '游戏手续费';

  @override
  String get bulkSell => '批量出售';

  @override
  String get confirmSell => '确认出售';

  @override
  String get selling => '出售中...';

  @override
  String get sellSuccess => '物品上架成功！';

  @override
  String get sellFailed => '上架失败';

  @override
  String get tradesEmpty => '没有活跃的交易报价';

  @override
  String get createTrade => '创建交易';

  @override
  String get selectFriend => '选择好友';

  @override
  String get yourItems => '你的物品';

  @override
  String get theirItems => '对方物品';

  @override
  String get reviewTrade => '审核交易';

  @override
  String get sendOffer => '发送报价';

  @override
  String get tradeStatus => '状态';

  @override
  String get tradePending => '待处理';

  @override
  String get tradeAccepted => '已接受';

  @override
  String get tradeDeclined => '已拒绝';

  @override
  String get tradeCanceled => '已取消';

  @override
  String get privateInventory => '私密库存';

  @override
  String get historyEmpty => '暂无交易记录';

  @override
  String get filterAll => '全部';

  @override
  String get filterBuy => '购买';

  @override
  String get filterSell => '出售';

  @override
  String get filterTrade => '交易';

  @override
  String get exportCSV => '导出CSV';

  @override
  String get exportTitle => '导出交易记录';

  @override
  String get dateRange => '日期范围';

  @override
  String get startDate => '开始日期';

  @override
  String get endDate => '结束日期';

  @override
  String get steamSession => 'Steam会话';

  @override
  String get sessionValid => '会话有效';

  @override
  String get sessionExpiring => '会话即将过期';

  @override
  String get sessionExpired => '会话已过期';

  @override
  String get sessionExpiredReauth => 'Steam会话已过期。点击重新认证。';

  @override
  String get sessionInfoTitle => '会话工作原理';

  @override
  String get sessionInfoBody =>
      'Steam会话持续约24小时。过期后，您将被带回此处重新登录。这是Steam的安全要求——我们会尽可能自动刷新，但有时需要重新登录。';

  @override
  String get noSession => '无会话';

  @override
  String get connectSteam => '连接Steam';

  @override
  String get logout => '退出登录';

  @override
  String get premiumTitle => 'SkinKeeper PRO';

  @override
  String get premiumSubtitle => '解锁所有功能';

  @override
  String get restorePurchases => '恢复购买';

  @override
  String get privacyPolicy => '隐私政策';

  @override
  String get termsOfService => '服务条款';

  @override
  String get alertsTitle => '价格提醒';

  @override
  String get alertsEmpty => '未配置提醒';

  @override
  String get createAlert => '创建提醒';

  @override
  String get alertConditionAbove => '价格高于';

  @override
  String get alertConditionBelow => '价格低于';

  @override
  String get alertConditionChange => '价格变动';

  @override
  String get alertSource => '市场';

  @override
  String get alertSourceAny => '任何市场';

  @override
  String get alertCooldown => '冷却时间';

  @override
  String get alertHistory => '通知';

  @override
  String get alertTriggered => '已触发';

  @override
  String get alertActive => '活跃';

  @override
  String get alertPaused => '已暂停';

  @override
  String get premiumRequired => '需要Premium';

  @override
  String get premiumRequiredDesc => '此功能需要SkinKeeper PRO';

  @override
  String get upgradeToPremium => '升级到PRO';

  @override
  String get monthlyPlan => '月付';

  @override
  String get yearlyPlan => '年付';

  @override
  String get perMonth => '/月';

  @override
  String get perYear => '/年';

  @override
  String get bestValue => '最超值';

  @override
  String get freePlan => '免费';

  @override
  String get proPlan => 'PRO';

  @override
  String get onboardingTitle1 => '追踪你的皮肤';

  @override
  String get onboardingDesc1 => '在Steam、Skinport、CSFloat和DMarket上监控CS2库存价值';

  @override
  String get onboardingTitle2 => '智能价格提醒';

  @override
  String get onboardingDesc2 => '当价格达到目标时收到通知';

  @override
  String get onboardingTitle3 => '盈亏追踪';

  @override
  String get onboardingDesc3 => '通过详细分析追踪投资表现';

  @override
  String get onboardingGetStarted => '开始使用';

  @override
  String get onboardingSkip => '跳过';

  @override
  String get onboardingNext => '下一步';

  @override
  String get loginTitle => '欢迎';

  @override
  String get loginSubtitle => '使用Steam账号登录';

  @override
  String get loginWithSteam => 'Steam登录';

  @override
  String get authQR => '快速验证';

  @override
  String get authManual => '手动';

  @override
  String get authQRDesc => '使用Steam手机扫描二维码';

  @override
  String get authSteamGuard => 'Steam令牌代码';

  @override
  String get authClientToken => 'Client JS Token';

  @override
  String get authBrowser => '在浏览器中打开Steam';

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
  String get connected => 'Logged in';

  @override
  String get notConfigured => 'Not connected';

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
  String get ok => '确定';

  @override
  String get cancel => '取消';

  @override
  String get save => '保存';

  @override
  String get delete => '删除';

  @override
  String get confirm => '确认';

  @override
  String get retry => '重试';

  @override
  String get loading => '加载中...';

  @override
  String get error => '出了点问题';

  @override
  String get noData => '暂无数据';

  @override
  String get refresh => '刷新';

  @override
  String get search => '搜索';

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
