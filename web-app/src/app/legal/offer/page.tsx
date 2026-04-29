import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Публічна Оферта — SkinKeeper',
  description: 'Договір публічної оферти на надання послуг SkinKeeper — платформи для управління інвентарем CS2.',
  alternates: { canonical: 'https://skinkeeper.store/legal/offer' },
};

export default function OfferPage() {
  return (
    <div className="min-h-screen gradient-mesh">
      <nav className="flex items-center justify-between px-6 lg:px-16 h-16 border-b border-border/50 glass-strong">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="text-lg font-bold text-gradient">SkinKeeper</span>
        </Link>
        <div className="flex items-center gap-4 text-sm text-muted">
          <Link href="/legal/terms" className="hover:text-foreground transition-colors">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link href="/legal/offer" className="text-foreground font-medium">Оферта</Link>
        </div>
      </nav>
      <main className="max-w-3xl mx-auto px-6 py-16" lang="uk">
        <div className="mb-8 p-4 rounded-xl bg-surface-light/50 border border-border/40 text-sm" lang="en">
          <p className="font-medium text-foreground mb-1">This page is in Ukrainian.</p>
          <p className="text-muted">
            The Public Offer (Публічна Оферта) is a Ukrainian-law contract issued by the
            legal entity that operates SkinKeeper (a Ukrainian sole proprietor). It is
            published in Ukrainian as required by that jurisdiction. For our English-language
            user terms see <Link href="/legal/terms" className="text-primary hover:underline">Terms of Service</Link>
            {' '}and <Link href="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
          </p>
        </div>
        <h1 className="text-3xl font-extrabold mb-2">Публічна Оферта</h1>
        <p className="text-muted text-sm mb-8">Договір про надання послуг</p>
        <div className="prose prose-invert prose-sm max-w-none space-y-5 text-muted">
          <p><strong>Дата останнього оновлення:</strong> 15 квітня 2026 р.</p>

          <p>
            Цей документ є офіційною пропозицією (публічною офертою) Фізичної особи-підприємця Ігнатьєва Андрія Олександровича
            (далі — «Виконавець»), адресованою будь-якій фізичній або юридичній особі (далі — «Замовник»),
            укласти Договір про надання послуг на умовах, викладених нижче.
          </p>

          <h2 className="text-lg font-bold text-foreground mt-8">1. Загальні положення</h2>
          <p>1.1. Відповідно до статті 633 Цивільного кодексу України, цей документ є публічною офертою. Акцептом (прийняттям) оферти є реєстрація на платформі SkinKeeper та/або оплата послуг.</p>
          <p>1.2. Договір вважається укладеним з моменту акцепту оферти Замовником.</p>
          <p>1.3. Оферта діє безстроково до моменту її відкликання Виконавцем.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">2. Предмет Договору</h2>
          <p>2.1. Виконавець надає Замовнику доступ до онлайн-платформи SkinKeeper (далі — «Платформа»), що розташована за адресою <a href="https://skinkeeper.store" className="text-primary hover:underline">skinkeeper.store</a>, для управління інвентарем Counter-Strike 2 (CS2).</p>
          <p>2.2. Платформа надає наступні послуги:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Відстеження вартості інвентарю та портфеля скінів</li>
            <li>Аналітика прибутків та збитків (P&L)</li>
            <li>Моніторинг цін на предмети CS2 з різних торговельних майданчиків</li>
            <li>Сповіщення про зміну цін</li>
            <li>Управління торговельними пропозиціями</li>
            <li>Розширення для браузера для інтеграції зі Steam</li>
            <li>Мобільний та десктопний додатки</li>
          </ul>
          <p>2.3. Платформа не є фінансовою послугою, біржею або торговельним майданчиком. SkinKeeper надає виключно інформаційно-аналітичні послуги.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">3. Порядок надання послуг</h2>
          <p>3.1. Доступ до Платформи надається після реєстрації через Steam OpenID. Виконавець ніколи не отримує та не зберігає пароль Steam Замовника.</p>
          <p>3.2. Базові функції Платформи надаються безоплатно.</p>
          <p>3.3. Розширені функції (PRO-підписка) надаються на платній основі відповідно до тарифів, опублікованих на Платформі.</p>
          <p>3.4. Виконавець залишає за собою право змінювати функціональність та тарифи Платформи, попередньо повідомивши Замовника.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">4. Вартість послуг та порядок оплати</h2>
          <p>4.1. Вартість PRO-підписки визначається тарифами, опублікованими на сторінці Платформи.</p>
          <p>4.2. Оплата здійснюється у безготівковій формі через платіжні системи, інтегровані з Платформою.</p>
          <p>4.3. Підписка поновлюється автоматично. Замовник може скасувати підписку в будь-який момент через налаштування облікового запису.</p>
          <p>4.4. Повернення коштів здійснюється згідно з чинним законодавством України протягом 14 днів з моменту оплати, якщо послуги не були використані в повному обсязі.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">5. Права та обов&apos;язки сторін</h2>
          <h3 className="text-sm font-bold text-foreground mt-4">5.1. Виконавець зобов&apos;язується:</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Надавати доступ до Платформи 24/7, за винятком планових технічних робіт</li>
            <li>Забезпечувати захист персональних даних Замовника відповідно до Закону України «Про захист персональних даних»</li>
            <li>Повідомляти Замовника про суттєві зміни в роботі Платформи</li>
          </ul>
          <h3 className="text-sm font-bold text-foreground mt-4">5.2. Замовник зобов&apos;язується:</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Не використовувати Платформу для шахрайства або порушення правил Steam</li>
            <li>Не намагатися отримати несанкціонований доступ до Платформи або даних інших користувачів</li>
            <li>Своєчасно оплачувати обрані платні послуги</li>
          </ul>

          <h2 className="text-lg font-bold text-foreground mt-8">6. Обробка персональних даних</h2>
          <p>6.1. Виконавець обробляє персональні дані Замовника відповідно до <Link href="/legal/privacy" className="text-primary hover:underline">Політики конфіденційності</Link> та чинного законодавства України.</p>
          <p>6.2. Реєструючись на Платформі, Замовник надає згоду на обробку своїх персональних даних в обсязі, необхідному для надання послуг.</p>
          <p>6.3. Замовник має право вимагати видалення своїх персональних даних та облікового запису через налаштування Платформи або зв&apos;язавшись з Виконавцем.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">7. Відповідальність</h2>
          <p>7.1. Виконавець не несе відповідальності за збитки, пов&apos;язані з торговельними рішеннями Замовника, прийнятими на основі даних Платформи.</p>
          <p>7.2. Виконавець не несе відповідальності за дії Valve Corporation (Steam), торговельних майданчиків або третіх осіб.</p>
          <p>7.3. Виконавець не гарантує точність цін та аналітичних даних, оскільки вони залежать від зовнішніх джерел.</p>
          <p>7.4. Максимальна відповідальність Виконавця обмежується сумою, сплаченою Замовником за останні 3 місяці.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">8. Порядок вирішення спорів</h2>
          <p>8.1. Спори вирішуються шляхом переговорів. У разі недосягнення згоди — відповідно до законодавства України.</p>
          <p>8.2. Для зв&apos;язку з Виконавцем використовуйте електронну пошту: <a href="mailto:support@skinkeeper.store" className="text-primary hover:underline">support@skinkeeper.store</a></p>

          <h2 className="text-lg font-bold text-foreground mt-8">9. Зміна умов Договору</h2>
          <p>9.1. Виконавець залишає за собою право вносити зміни до цього Договору, опублікувавши оновлену версію на Платформі.</p>
          <p>9.2. Продовження використання Платформи після внесення змін означає прийняття нових умов.</p>

          <h2 className="text-lg font-bold text-foreground mt-8">10. Реквізити Виконавця</h2>
          <div className="bg-surface-light/50 rounded-xl p-4 text-sm">
            <p>ФОП Ігнатьєв Андрій Олександрович</p>
            <p>Електронна пошта: support@skinkeeper.store</p>
            <p>Вебсайт: <a href="https://skinkeeper.store" className="text-primary hover:underline">skinkeeper.store</a></p>
          </div>

          <div className="pt-8 border-t border-border/30 mt-8">
            <p className="text-xs text-muted/60">
              Також доступні: <Link href="/legal/terms" className="text-primary hover:underline">Terms of Service</Link> | <Link href="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
