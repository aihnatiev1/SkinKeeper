// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Portuguese (`pt`).
class AppLocalizationsPt extends AppLocalizations {
  AppLocalizationsPt([String locale = 'pt']) : super(locale);

  @override
  String get appName => 'SkinKeeper';

  @override
  String get appSubtitle => 'Inventário CS2 e Alertas de Preço';

  @override
  String get tabPortfolio => 'Portfólio';

  @override
  String get tabInventory => 'Inventário';

  @override
  String get tabTrades => 'Trocas';

  @override
  String get tabHistory => 'Histórico';

  @override
  String get tabSettings => 'Configurações';

  @override
  String get portfolioTitle => 'Portfólio';

  @override
  String get inventoryTitle => 'Inventário';

  @override
  String get tradesTitle => 'Ofertas de Troca';

  @override
  String get historyTitle => 'Transações';

  @override
  String get settingsTitle => 'Configurações';

  @override
  String get portfolioValue => 'Valor do Portfólio';

  @override
  String get totalInvested => 'Investido';

  @override
  String get totalProfit => 'Lucro';

  @override
  String get totalLoss => 'Prejuízo';

  @override
  String get unrealizedPL => 'L/P Não Realizado';

  @override
  String get plHistory => 'Histórico L/P';

  @override
  String get inventoryEmpty => 'Nenhum item no inventário';

  @override
  String itemCount(int count) {
    return '$count itens';
  }

  @override
  String get bestPrice => 'Melhor Preço';

  @override
  String get steamPrice => 'Steam';

  @override
  String get skinportPrice => 'Skinport';

  @override
  String get csfloatPrice => 'CSFloat';

  @override
  String get dmarketPrice => 'DMarket';

  @override
  String get priceComparison => 'Comparação de Preços';

  @override
  String get priceHistory => 'Histórico de Preços';

  @override
  String get floatValue => 'Valor Float';

  @override
  String get stickers => 'Adesivos';

  @override
  String get charms => 'Amuletos';

  @override
  String get wearLabel => 'Desgaste';

  @override
  String get sellTitle => 'Vender Item';

  @override
  String get sellButton => 'Vender no Steam';

  @override
  String get sellPrice => 'Preço de Venda';

  @override
  String get buyerPays => 'Comprador Paga';

  @override
  String get youReceive => 'Você Recebe';

  @override
  String get steamFee => 'Taxa Steam';

  @override
  String get gameFee => 'Taxa do Jogo';

  @override
  String get bulkSell => 'Venda em Massa';

  @override
  String get confirmSell => 'Confirmar Venda';

  @override
  String get selling => 'Vendendo...';

  @override
  String get sellSuccess => 'Item listado com sucesso!';

  @override
  String get sellFailed => 'Falha ao listar item';

  @override
  String get tradesEmpty => 'Nenhuma oferta de troca ativa';

  @override
  String get createTrade => 'Criar Troca';

  @override
  String get selectFriend => 'Selecionar Amigo';

  @override
  String get yourItems => 'Seus Itens';

  @override
  String get theirItems => 'Itens Deles';

  @override
  String get reviewTrade => 'Revisar Troca';

  @override
  String get sendOffer => 'Enviar Oferta';

  @override
  String get tradeStatus => 'Status';

  @override
  String get tradePending => 'Pendente';

  @override
  String get tradeAccepted => 'Aceita';

  @override
  String get tradeDeclined => 'Recusada';

  @override
  String get tradeCanceled => 'Cancelada';

  @override
  String get privateInventory => 'Inventário privado';

  @override
  String get historyEmpty => 'Nenhuma transação ainda';

  @override
  String get filterAll => 'Todas';

  @override
  String get filterBuy => 'Compra';

  @override
  String get filterSell => 'Venda';

  @override
  String get filterTrade => 'Troca';

  @override
  String get exportCSV => 'Exportar CSV';

  @override
  String get exportTitle => 'Exportar Transações';

  @override
  String get dateRange => 'Período';

  @override
  String get startDate => 'Data Inicial';

  @override
  String get endDate => 'Data Final';

  @override
  String get steamSession => 'Sessão Steam';

  @override
  String get sessionValid => 'Sessão ativa';

  @override
  String get sessionExpiring => 'Sessão expirando';

  @override
  String get sessionExpired => 'Sessão expirada';

  @override
  String get sessionExpiredReauth =>
      'Sessão Steam expirada. Toque para reautenticar.';

  @override
  String get sessionInfoTitle => 'Como funcionam as sessões';

  @override
  String get sessionInfoBody =>
      'As sessões Steam duram cerca de 24 horas. Quando expirar, você será trazido de volta aqui para entrar novamente. Isso é um requisito de segurança do Steam — atualizamos automaticamente quando possível, mas às vezes é necessário um novo login.';

  @override
  String get noSession => 'Sem sessão';

  @override
  String get connectSteam => 'Conectar Steam';

  @override
  String get logout => 'Sair';

  @override
  String get premiumTitle => 'SkinKeeper PRO';

  @override
  String get premiumSubtitle => 'Desbloqueie todas as funcionalidades';

  @override
  String get restorePurchases => 'Restaurar Compras';

  @override
  String get privacyPolicy => 'Política de Privacidade';

  @override
  String get termsOfService => 'Termos de Uso';

  @override
  String get alertsTitle => 'Alertas de Preço';

  @override
  String get alertsEmpty => 'Nenhum alerta configurado';

  @override
  String get createAlert => 'Criar Alerta';

  @override
  String get alertConditionAbove => 'Preço acima de';

  @override
  String get alertConditionBelow => 'Preço abaixo de';

  @override
  String get alertConditionChange => 'Preço alterou em';

  @override
  String get alertSource => 'Mercado';

  @override
  String get alertSourceAny => 'Qualquer mercado';

  @override
  String get alertCooldown => 'Intervalo';

  @override
  String get alertHistory => 'Notificações';

  @override
  String get alertTriggered => 'Disparado';

  @override
  String get alertActive => 'Ativo';

  @override
  String get alertPaused => 'Pausado';

  @override
  String get premiumRequired => 'Premium Necessário';

  @override
  String get premiumRequiredDesc => 'Esta funcionalidade requer SkinKeeper PRO';

  @override
  String get upgradeToPremium => 'Upgrade para PRO';

  @override
  String get monthlyPlan => 'Mensal';

  @override
  String get yearlyPlan => 'Anual';

  @override
  String get perMonth => '/mês';

  @override
  String get perYear => '/ano';

  @override
  String get bestValue => 'Melhor Valor';

  @override
  String get freePlan => 'Grátis';

  @override
  String get proPlan => 'PRO';

  @override
  String get onboardingTitle1 => 'Acompanhe seus Skins';

  @override
  String get onboardingDesc1 =>
      'Monitore o valor do seu inventário CS2 no Steam, Skinport, CSFloat e DMarket';

  @override
  String get onboardingTitle2 => 'Alertas Inteligentes';

  @override
  String get onboardingDesc2 =>
      'Receba notificações quando os preços atingirem seu alvo';

  @override
  String get onboardingTitle3 => 'Lucros e Prejuízos';

  @override
  String get onboardingDesc3 =>
      'Acompanhe o desempenho dos investimentos com análises detalhadas';

  @override
  String get onboardingGetStarted => 'Começar';

  @override
  String get onboardingSkip => 'Pular';

  @override
  String get onboardingNext => 'Próximo';

  @override
  String get loginTitle => 'Bem-vindo';

  @override
  String get loginSubtitle => 'Entre com sua conta Steam';

  @override
  String get loginWithSteam => 'Entrar com Steam';

  @override
  String get authQR => 'Auth Rápida';

  @override
  String get authManual => 'Manual';

  @override
  String get authQRDesc => 'Escaneie o QR com o Steam Mobile';

  @override
  String get authSteamGuard => 'Código Steam Guard';

  @override
  String get authClientToken => 'Client JS Token';

  @override
  String get authBrowser => 'Abrir Steam no Navegador';

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
  String get ok => 'OK';

  @override
  String get cancel => 'Cancelar';

  @override
  String get save => 'Salvar';

  @override
  String get delete => 'Excluir';

  @override
  String get confirm => 'Confirmar';

  @override
  String get retry => 'Tentar Novamente';

  @override
  String get loading => 'Carregando...';

  @override
  String get error => 'Algo deu errado';

  @override
  String get noData => 'Sem dados disponíveis';

  @override
  String get refresh => 'Atualizar';

  @override
  String get search => 'Buscar';

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
