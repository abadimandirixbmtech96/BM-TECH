/*!
 * bm-lang.js — terjemahan tampilan dashboard-admin.html (11 bahasa)
 * Bahasa dipilih di System Management dan tersimpan per-device (localStorage "bm-lang").
 *
 * Cara kerja: teks UI asli (Indonesia/Inggris) dicocokkan dengan kamus lalu diganti
 * langsung di halaman, termasuk konten yang muncul belakangan (MutationObserver).
 * Teks yang tidak ada di kamus dibiarkan apa adanya. Data pengguna (isi catatan,
 * nama folder, nama customer) tidak pernah diterjemahkan.
 *
 * Muat di <head>:  <script src="/bm-lang.js"></script>
 */
(function (root) {
  'use strict';

  var CODES = ['id', 'en', 'ms', 'zh', 'hi', 'es', 'ar', 'fr', 'pt', 'ru', 'ja'];

  /* kata asli -> [id, en, ms, zh, hi, es, ar, fr, pt, ru, ja] */
  var DICT = {
 "Memverifikasi akses admin...": [
  "Memverifikasi akses admin...",
  "Verifying admin access...",
  "Mengesahkan akses admin...",
  "正在验证管理员权限…",
  "एडमिन एक्सेस सत्यापित हो रहा है...",
  "Verificando acceso de administrador...",
  "جارٍ التحقق من صلاحية المشرف...",
  "Vérification de l'accès administrateur...",
  "Verificando acesso de administrador...",
  "Проверка доступа администратора...",
  "管理者アクセスを確認中..."
 ],
 "Notes": [
  "Catatan",
  "Notes",
  "Nota",
  "笔记",
  "नोट्स",
  "Notas",
  "الملاحظات",
  "Notes",
  "Notas",
  "Заметки",
  "ノート"
 ],
 "Tasks": [
  "Tugas",
  "Tasks",
  "Tugasan",
  "任务",
  "कार्य",
  "Tareas",
  "المهام",
  "Tâches",
  "Tarefas",
  "Задачи",
  "タスク"
 ],
 "List View": [
  "Tampilan Daftar",
  "List View",
  "Paparan Senarai",
  "列表视图",
  "सूची दृश्य",
  "Vista de lista",
  "عرض القائمة",
  "Vue liste",
  "Visualização em lista",
  "Список",
  "リスト表示"
 ],
 "Card View": [
  "Tampilan Kartu",
  "Card View",
  "Paparan Kad",
  "卡片视图",
  "कार्ड दृश्य",
  "Vista de tarjetas",
  "عرض البطاقات",
  "Vue cartes",
  "Visualização em cartões",
  "Карточки",
  "カード表示"
 ],
 "Grid View": [
  "Tampilan Grid",
  "Grid View",
  "Paparan Grid",
  "网格视图",
  "ग्रिड दृश्य",
  "Vista de cuadrícula",
  "عرض الشبكة",
  "Vue grille",
  "Visualização em grade",
  "Сетка",
  "グリッド表示"
 ],
 "ALL": [
  "SEMUA",
  "ALL",
  "SEMUA",
  "全部",
  "सभी",
  "TODO",
  "الكل",
  "TOUT",
  "TODOS",
  "ВСЕ",
  "すべて"
 ],
 "Memuat...": [
  "Memuat...",
  "Loading...",
  "Memuatkan...",
  "加载中…",
  "लोड हो रहा है...",
  "Cargando...",
  "جارٍ التحميل...",
  "Chargement...",
  "Carregando...",
  "Загрузка...",
  "読み込み中..."
 ],
 "Search": [
  "Cari",
  "Search",
  "Cari",
  "搜索",
  "खोजें",
  "Buscar",
  "بحث",
  "Rechercher",
  "Buscar",
  "Поиск",
  "検索"
 ],
 "Pin": [
  "Sematkan",
  "Pin",
  "Semat",
  "置顶",
  "पिन करें",
  "Fijar",
  "تثبيت",
  "Épingler",
  "Fixar",
  "Закрепить",
  "ピン留め"
 ],
 "Pindah": [
  "Pindah",
  "Move",
  "Alih",
  "移动",
  "ले जाएँ",
  "Mover",
  "نقل",
  "Déplacer",
  "Mover",
  "Переместить",
  "移動"
 ],
 "Hapus": [
  "Hapus",
  "Delete",
  "Padam",
  "删除",
  "हटाएँ",
  "Eliminar",
  "حذف",
  "Supprimer",
  "Excluir",
  "Удалить",
  "削除"
 ],
 "Folders": [
  "Folder",
  "Folders",
  "Folder",
  "文件夹",
  "फ़ोल्डर",
  "Carpetas",
  "المجلدات",
  "Dossiers",
  "Pastas",
  "Папки",
  "フォルダ"
 ],
 "New": [
  "Baru",
  "New",
  "Baharu",
  "新建",
  "नया",
  "Nuevo",
  "جديد",
  "Nouveau",
  "Novo",
  "Новая",
  "新規"
 ],
 "Mode Preview": [
  "Mode Preview",
  "Preview Mode",
  "Mod Pratonton",
  "预览模式",
  "प्रीव्यू मोड",
  "Modo vista previa",
  "وضع المعاينة",
  "Mode aperçu",
  "Modo de pré-visualização",
  "Режим просмотра",
  "プレビューモード"
 ],
 "Analisa": [
  "Analisa",
  "Analysis",
  "Analisis",
  "分析",
  "विश्लेषण",
  "Análisis",
  "التحليل",
  "Analyse",
  "Análise",
  "Аналитика",
  "分析"
 ],
 "Settings": [
  "Pengaturan",
  "Settings",
  "Tetapan",
  "设置",
  "सेटिंग्स",
  "Ajustes",
  "الإعدادات",
  "Réglages",
  "Configurações",
  "Настройки",
  "設定"
 ],
 "Kelola Customer": [
  "Kelola Customer",
  "Manage Customers",
  "Urus Pelanggan",
  "管理客户",
  "ग्राहक प्रबंधित करें",
  "Gestionar clientes",
  "إدارة العملاء",
  "Gérer les clients",
  "Gerenciar clientes",
  "Управление клиентами",
  "顧客を管理"
 ],
 "Kelola Karyawan": [
  "Kelola Karyawan",
  "Manage Employees",
  "Urus Pekerja",
  "管理员工",
  "कर्मचारी प्रबंधित करें",
  "Gestionar empleados",
  "إدارة الموظفين",
  "Gérer les employés",
  "Gerenciar funcionários",
  "Управление сотрудниками",
  "従業員を管理"
 ],
 "Daftar Nomor Customer": [
  "Daftar Nomor Customer",
  "Customer Phone List",
  "Senarai Nombor Pelanggan",
  "客户号码列表",
  "ग्राहक नंबर सूची",
  "Lista de números de clientes",
  "قائمة أرقام العملاء",
  "Liste des numéros clients",
  "Lista de números de clientes",
  "Список номеров клиентов",
  "顧客番号リスト"
 ],
 "Sampah": [
  "Sampah",
  "Trash",
  "Tong Sampah",
  "回收站",
  "ट्रैश",
  "Papelera",
  "سلة المحذوفات",
  "Corbeille",
  "Lixeira",
  "Корзина",
  "ゴミ箱"
 ],
 "Dark Theme": [
  "Tema Gelap",
  "Dark Theme",
  "Tema Gelap",
  "深色主题",
  "डार्क थीम",
  "Tema oscuro",
  "المظهر الداكن",
  "Thème sombre",
  "Tema escuro",
  "Тёмная тема",
  "ダークテーマ"
 ],
 "Haptic Feedback": [
  "Umpan Balik Haptik",
  "Haptic Feedback",
  "Maklum Balas Haptik",
  "触感反馈",
  "हैप्टिक फ़ीडबैक",
  "Respuesta háptica",
  "الاهتزاز اللمسي",
  "Retour haptique",
  "Resposta tátil",
  "Тактильный отклик",
  "触覚フィードバック"
 ],
 "Backup Semua Data": [
  "Backup Semua Data",
  "Back Up All Data",
  "Sandarkan Semua Data",
  "备份所有数据",
  "सभी डेटा का बैकअप",
  "Copia de seguridad de todos los datos",
  "نسخ احتياطي لكل البيانات",
  "Sauvegarder toutes les données",
  "Fazer backup de todos os dados",
  "Резервная копия всех данных",
  "全データをバックアップ"
 ],
 "Sync to Cloud Database": [
  "Sinkronisasi ke Database Cloud",
  "Sync to Cloud Database",
  "Segerak ke Pangkalan Data Awan",
  "同步到云数据库",
  "क्लाउड डेटाबेस से सिंक करें",
  "Sincronizar con la base de datos en la nube",
  "المزامنة مع قاعدة البيانات السحابية",
  "Synchroniser avec la base de données cloud",
  "Sincronizar com o banco de dados na nuvem",
  "Синхронизация с облачной базой данных",
  "クラウドデータベースに同期"
 ],
 "Active": [
  "Aktif",
  "Active",
  "Aktif",
  "已启用",
  "सक्रिय",
  "Activo",
  "نشط",
  "Actif",
  "Ativo",
  "Активно",
  "有効"
 ],
 "User Agreement": [
  "Perjanjian Pengguna",
  "User Agreement",
  "Perjanjian Pengguna",
  "用户协议",
  "उपयोगकर्ता समझौता",
  "Acuerdo de usuario",
  "اتفاقية المستخدم",
  "Conditions d'utilisation",
  "Contrato do usuário",
  "Пользовательское соглашение",
  "利用規約"
 ],
 "Privacy Policy": [
  "Kebijakan Privasi",
  "Privacy Policy",
  "Dasar Privasi",
  "隐私政策",
  "गोपनीयता नीति",
  "Política de privacidad",
  "سياسة الخصوصية",
  "Politique de confidentialité",
  "Política de privacidade",
  "Политика конфиденциальности",
  "プライバシーポリシー"
 ],
 "Logout": [
  "Keluar",
  "Logout",
  "Log keluar",
  "退出登录",
  "लॉग आउट",
  "Cerrar sesión",
  "تسجيل الخروج",
  "Se déconnecter",
  "Sair",
  "Выйти",
  "ログアウト"
 ],
 "Memuat data customer...": [
  "Memuat data customer...",
  "Loading customer data...",
  "Memuatkan data pelanggan...",
  "正在加载客户数据…",
  "ग्राहक डेटा लोड हो रहा है...",
  "Cargando datos de clientes...",
  "جارٍ تحميل بيانات العملاء...",
  "Chargement des données clients...",
  "Carregando dados de clientes...",
  "Загрузка данных клиентов...",
  "顧客データを読み込み中..."
 ],
 "Tambah Customer Baru": [
  "Tambah Customer Baru",
  "Add New Customer",
  "Tambah Pelanggan Baharu",
  "添加新客户",
  "नया ग्राहक जोड़ें",
  "Añadir nuevo cliente",
  "إضافة عميل جديد",
  "Ajouter un client",
  "Adicionar novo cliente",
  "Добавить клиента",
  "新しい顧客を追加"
 ],
 "Nama Customer (boleh spasi, tampil di kolom tabel)": [
  "Nama Customer (boleh spasi, tampil di kolom tabel)",
  "Customer name (spaces allowed, shown in table column)",
  "Nama pelanggan (boleh ada ruang, dipaparkan dalam lajur jadual)",
  "客户名称（可含空格，显示在表格列中）",
  "ग्राहक का नाम (स्पेस चलेगा, तालिका कॉलम में दिखेगा)",
  "Nombre del cliente (se permiten espacios, se muestra en la columna de la tabla)",
  "اسم العميل (يُسمح بالمسافات، يظهر في عمود الجدول)",
  "Nom du client (espaces autorisés, affiché dans la colonne du tableau)",
  "Nome do cliente (espaços permitidos, exibido na coluna da tabela)",
  "Имя клиента (пробелы допустимы, отображается в столбце таблицы)",
  "顧客名（スペース可、表の列に表示）"
 ],
 "Username (untuk link login, tanpa spasi/simbol)": [
  "Username (untuk link login, tanpa spasi/simbol)",
  "Username (for login link, no spaces/symbols)",
  "Nama pengguna (untuk pautan log masuk, tanpa ruang/simbol)",
  "用户名（用于登录链接，不含空格/符号）",
  "यूज़रनेम (लॉगिन लिंक के लिए, बिना स्पेस/चिह्न)",
  "Usuario (para el enlace de acceso, sin espacios ni símbolos)",
  "اسم المستخدم (لرابط تسجيل الدخول، بدون مسافات أو رموز)",
  "Nom d'utilisateur (pour le lien de connexion, sans espaces ni symboles)",
  "Usuário (para o link de login, sem espaços/símbolos)",
  "Имя пользователя (для ссылки входа, без пробелов и символов)",
  "ユーザー名（ログインリンク用、スペース・記号なし）"
 ],
 "Email": [
  "Email",
  "Email",
  "E-mel",
  "电子邮箱",
  "ईमेल",
  "Correo electrónico",
  "البريد الإلكتروني",
  "E-mail",
  "E-mail",
  "Эл. почта",
  "メール"
 ],
 "Password (min. 6 karakter)": [
  "Password (min. 6 karakter)",
  "Password (min. 6 characters)",
  "Kata laluan (min. 6 aksara)",
  "密码（至少 6 个字符）",
  "पासवर्ड (कम से कम 6 अक्षर)",
  "Contraseña (mín. 6 caracteres)",
  "كلمة المرور (6 أحرف على الأقل)",
  "Mot de passe (6 caractères min.)",
  "Senha (mín. 6 caracteres)",
  "Пароль (минимум 6 символов)",
  "パスワード（6文字以上）"
 ],
 "Batal": [
  "Batal",
  "Cancel",
  "Batal",
  "取消",
  "रद्द करें",
  "Cancelar",
  "إلغاء",
  "Annuler",
  "Cancelar",
  "Отмена",
  "キャンセル"
 ],
 "Buat Akun": [
  "Buat Akun",
  "Create Account",
  "Cipta Akaun",
  "创建账号",
  "खाता बनाएँ",
  "Crear cuenta",
  "إنشاء حساب",
  "Créer le compte",
  "Criar conta",
  "Создать аккаунт",
  "アカウント作成"
 ],
 "Kosongkan": [
  "Kosongkan",
  "Empty",
  "Kosongkan",
  "清空",
  "खाली करें",
  "Vaciar",
  "إفراغ",
  "Vider",
  "Esvaziar",
  "Очистить",
  "空にする"
 ],
 "Catatan dan folder yang dihapus muncul di sini": [
  "Catatan dan folder yang dihapus muncul di sini",
  "Deleted notes and folders appear here",
  "Nota dan folder yang dipadam muncul di sini",
  "已删除的笔记和文件夹会显示在这里",
  "हटाए गए नोट और फ़ोल्डर यहाँ दिखते हैं",
  "Las notas y carpetas eliminadas aparecen aquí",
  "تظهر هنا الملاحظات والمجلدات المحذوفة",
  "Les notes et dossiers supprimés apparaissent ici",
  "Notas e pastas excluídas aparecem aqui",
  "Удалённые заметки и папки появляются здесь",
  "削除したノートとフォルダがここに表示されます"
 ],
 "Memuat sampah...": [
  "Memuat sampah...",
  "Loading trash...",
  "Memuatkan tong sampah...",
  "正在加载回收站…",
  "ट्रैश लोड हो रहा है...",
  "Cargando papelera...",
  "جارٍ تحميل سلة المحذوفات...",
  "Chargement de la corbeille...",
  "Carregando lixeira...",
  "Загрузка корзины...",
  "ゴミ箱を読み込み中..."
 ],
 "Filter Tasks": [
  "Filter Tugas",
  "Filter Tasks",
  "Tapis Tugasan",
  "筛选任务",
  "कार्य फ़िल्टर",
  "Filtrar tareas",
  "تصفية المهام",
  "Filtrer les tâches",
  "Filtrar tarefas",
  "Фильтр задач",
  "タスクを絞り込み"
 ],
 "Jenis tugas": [
  "Jenis tugas",
  "Task type",
  "Jenis tugasan",
  "任务类型",
  "कार्य का प्रकार",
  "Tipo de tarea",
  "نوع المهمة",
  "Type de tâche",
  "Tipo de tarefa",
  "Тип задачи",
  "タスクの種類"
 ],
 "Folder": [
  "Folder",
  "Folder",
  "Folder",
  "文件夹",
  "फ़ोल्डर",
  "Carpeta",
  "مجلد",
  "Dossier",
  "Pasta",
  "Папка",
  "フォルダ"
 ],
 "Reset": [
  "Atur ulang",
  "Reset",
  "Set semula",
  "重置",
  "रीसेट",
  "Restablecer",
  "إعادة تعيين",
  "Réinitialiser",
  "Redefinir",
  "Сбросить",
  "リセット"
 ],
 "Selesai": [
  "Selesai",
  "Done",
  "Selesai",
  "完成",
  "पूर्ण",
  "Listo",
  "تم",
  "Terminé",
  "Concluir",
  "Готово",
  "完了"
 ],
 "Hapus?": [
  "Hapus?",
  "Delete?",
  "Padam?",
  "删除？",
  "हटाएँ?",
  "¿Eliminar?",
  "حذف؟",
  "Supprimer ?",
  "Excluir?",
  "Удалить?",
  "削除しますか？"
 ],
 "Geser potongan gambar ke lubang yang pas untuk melanjutkan.": [
  "Geser potongan gambar ke lubang yang pas untuk melanjutkan.",
  "Slide the puzzle piece into the matching gap to continue.",
  "Seret kepingan gambar ke lubang yang sesuai untuk meneruskan.",
  "将拼图块拖到对应缺口以继续。",
  "जारी रखने के लिए पज़ल का टुकड़ा सही खाली जगह पर खिसकाएँ।",
  "Desliza la pieza al hueco correcto para continuar.",
  "حرّك قطعة الصورة إلى الفراغ المناسب للمتابعة.",
  "Faites glisser la pièce dans l'emplacement correspondant pour continuer.",
  "Deslize a peça até a lacuna certa para continuar.",
  "Передвиньте фрагмент в подходящее отверстие, чтобы продолжить.",
  "続けるには、パズルのピースを合う穴までスライドしてください。"
 ],
 "Geser untuk mencocokkan": [
  "Geser untuk mencocokkan",
  "Slide to match",
  "Seret untuk memadankan",
  "滑动以匹配",
  "मिलाने के लिए खिसकाएँ",
  "Desliza para encajar",
  "اسحب للمطابقة",
  "Glissez pour ajuster",
  "Deslize para encaixar",
  "Сдвиньте, чтобы совместить",
  "スライドして合わせる"
 ],
 "Memuat data karyawan...": [
  "Memuat data karyawan...",
  "Loading employee data...",
  "Memuatkan data pekerja...",
  "正在加载员工数据…",
  "कर्मचारी डेटा लोड हो रहा है...",
  "Cargando datos de empleados...",
  "جارٍ تحميل بيانات الموظفين...",
  "Chargement des données employés...",
  "Carregando dados de funcionários...",
  "Загрузка данных сотрудников...",
  "従業員データを読み込み中..."
 ],
 "Tambah Karyawan Baru": [
  "Tambah Karyawan Baru",
  "Add New Employee",
  "Tambah Pekerja Baharu",
  "添加新员工",
  "नया कर्मचारी जोड़ें",
  "Añadir nuevo empleado",
  "إضافة موظف جديد",
  "Ajouter un employé",
  "Adicionar novo funcionário",
  "Добавить сотрудника",
  "新しい従業員を追加"
 ],
 "Nama PJ (harus SAMA PERSIS dengan yang ditulis di kolom \"PJ\" buku besar)": [
  "Nama PJ (harus SAMA PERSIS dengan yang ditulis di kolom \"PJ\" buku besar)",
  "PJ name (must match EXACTLY what is written in the \"PJ\" column of the ledger)",
  "Nama PJ (mesti SAMA PERSIS dengan yang ditulis dalam lajur \"PJ\" buku besar)",
  "PJ 姓名（必须与总账“PJ”列中的写法完全一致）",
  "PJ का नाम (बही के \"PJ\" कॉलम में लिखे नाम से बिल्कुल मेल खाना चाहिए)",
  "Nombre del PJ (debe coincidir EXACTAMENTE con lo escrito en la columna \"PJ\" del libro mayor)",
  "اسم PJ (يجب أن يطابق تمامًا المكتوب في عمود \"PJ\" بدفتر الأستاذ)",
  "Nom du PJ (doit correspondre EXACTEMENT à la colonne « PJ » du grand livre)",
  "Nome do PJ (deve ser IGUAL ao escrito na coluna \"PJ\" do livro-razão)",
  "Имя PJ (должно ТОЧНО совпадать с записью в столбце «PJ» главной книги)",
  "PJ名（元帳の「PJ」列の表記と完全に一致させてください）"
 ],
 "New Folder": [
  "Folder Baru",
  "New Folder",
  "Folder Baharu",
  "新建文件夹",
  "नया फ़ोल्डर",
  "Nueva carpeta",
  "مجلد جديد",
  "Nouveau dossier",
  "Nova pasta",
  "Новая папка",
  "新規フォルダ"
 ],
 "NOTES": [
  "CATATAN",
  "NOTES",
  "NOTA",
  "笔记",
  "नोट्स",
  "NOTAS",
  "الملاحظات",
  "NOTES",
  "NOTAS",
  "ЗАМЕТКИ",
  "ノート"
 ],
 "Solid Color": [
  "Warna Solid",
  "Solid Color",
  "Warna Pepejal",
  "纯色",
  "ठोस रंग",
  "Color sólido",
  "لون ثابت",
  "Couleur unie",
  "Cor sólida",
  "Сплошной цвет",
  "単色"
 ],
 "Gradation": [
  "Gradasi",
  "Gradient",
  "Kecerunan",
  "渐变",
  "ग्रेडिएंट",
  "Degradado",
  "تدرج",
  "Dégradé",
  "Gradiente",
  "Градиент",
  "グラデーション"
 ],
 "Graphics": [
  "Grafis",
  "Graphics",
  "Grafik",
  "图案",
  "ग्राफ़िक्स",
  "Gráficos",
  "رسومات",
  "Graphismes",
  "Gráficos",
  "Графика",
  "グラフィック"
 ],
 "Culture": [
  "Budaya",
  "Culture",
  "Budaya",
  "文化",
  "संस्कृति",
  "Cultura",
  "ثقافة",
  "Culture",
  "Cultura",
  "Культура",
  "カルチャー"
 ],
 "Completed": [
  "Selesai",
  "Completed",
  "Selesai",
  "已完成",
  "पूर्ण",
  "Completado",
  "مكتمل",
  "Terminé",
  "Concluído",
  "Выполнено",
  "完了済み"
 ],
 "Judul": [
  "Judul",
  "Title",
  "Tajuk",
  "标题",
  "शीर्षक",
  "Título",
  "العنوان",
  "Titre",
  "Título",
  "Заголовок",
  "タイトル"
 ],
 "Isi pesan.": [
  "Isi pesan.",
  "Message content.",
  "Kandungan mesej.",
  "消息内容。",
  "संदेश की सामग्री।",
  "Contenido del mensaje.",
  "محتوى الرسالة.",
  "Contenu du message.",
  "Conteúdo da mensagem.",
  "Текст сообщения.",
  "メッセージ内容。"
 ],
 "Tutup": [
  "Tutup",
  "Close",
  "Tutup",
  "关闭",
  "बंद करें",
  "Cerrar",
  "إغلاق",
  "Fermer",
  "Fechar",
  "Закрыть",
  "閉じる"
 ],
 "Untitled": [
  "Tanpa Judul",
  "Untitled",
  "Tanpa Tajuk",
  "无标题",
  "बिना शीर्षक",
  "Sin título",
  "بدون عنوان",
  "Sans titre",
  "Sem título",
  "Без названия",
  "無題"
 ],
 "Mode Lihat Saja": [
  "Mode Lihat Saja",
  "View-only mode",
  "Mod lihat sahaja",
  "仅查看模式",
  "केवल देखने का मोड",
  "Modo solo lectura",
  "وضع العرض فقط",
  "Mode lecture seule",
  "Modo somente leitura",
  "Режим только просмотра",
  "閲覧専用モード"
 ],
 "Bagikan Tabel": [
  "Bagikan Tabel",
  "Share Table",
  "Kongsi Jadual",
  "分享表格",
  "तालिका साझा करें",
  "Compartir tabla",
  "مشاركة الجدول",
  "Partager le tableau",
  "Compartilhar tabela",
  "Поделиться таблицей",
  "表を共有"
 ],
 "Bagikan Link": [
  "Bagikan Link",
  "Share Link",
  "Kongsi Pautan",
  "分享链接",
  "लिंक साझा करें",
  "Compartir enlace",
  "مشاركة الرابط",
  "Partager le lien",
  "Compartilhar link",
  "Поделиться ссылкой",
  "リンクを共有"
 ],
 "Copy link, tinggal tempel di WhatsApp/sosmed": [
  "Copy link, tinggal tempel di WhatsApp/sosmed",
  "Copy the link and paste it into WhatsApp/social media",
  "Salin pautan, tampal di WhatsApp/media sosial",
  "复制链接，直接粘贴到 WhatsApp/社交媒体",
  "लिंक कॉपी करें और WhatsApp/सोशल मीडिया में पेस्ट करें",
  "Copia el enlace y pégalo en WhatsApp/redes sociales",
  "انسخ الرابط والصقه في واتساب/وسائل التواصل",
  "Copiez le lien et collez-le dans WhatsApp/réseaux sociaux",
  "Copie o link e cole no WhatsApp/redes sociais",
  "Скопируйте ссылку и вставьте в WhatsApp/соцсети",
  "リンクをコピーして WhatsApp/SNS に貼り付け"
 ],
 "Export ke PDF": [
  "Export ke PDF",
  "Export to PDF",
  "Eksport ke PDF",
  "导出为 PDF",
  "PDF में निर्यात करें",
  "Exportar a PDF",
  "تصدير إلى PDF",
  "Exporter en PDF",
  "Exportar para PDF",
  "Экспорт в PDF",
  "PDFに書き出す"
 ],
 "Dokumen siap cetak, teksnya tetap bisa di-select": [
  "Dokumen siap cetak, teksnya tetap bisa di-select",
  "Print-ready document, text stays selectable",
  "Dokumen sedia cetak, teks masih boleh dipilih",
  "可直接打印的文档，文字仍可选择",
  "प्रिंट के लिए तैयार दस्तावेज़, टेक्स्ट चुना जा सकता है",
  "Documento listo para imprimir, el texto sigue siendo seleccionable",
  "مستند جاهز للطباعة، ويمكن تحديد النص",
  "Document prêt à imprimer, texte sélectionnable",
  "Documento pronto para impressão, texto selecionável",
  "Документ готов к печати, текст можно выделять",
  "印刷用ドキュメント。文字は選択可能"
 ],
 "Export ke Gambar": [
  "Export ke Gambar",
  "Export to Image",
  "Eksport ke Imej",
  "导出为图片",
  "छवि में निर्यात करें",
  "Exportar a imagen",
  "تصدير كصورة",
  "Exporter en image",
  "Exportar para imagem",
  "Экспорт в изображение",
  "画像に書き出す"
 ],
 "PNG, gampang dikirim lewat WhatsApp/chat": [
  "PNG, gampang dikirim lewat WhatsApp/chat",
  "PNG, easy to send via WhatsApp/chat",
  "PNG, mudah dihantar melalui WhatsApp/sembang",
  "PNG，方便通过 WhatsApp/聊天发送",
  "PNG, WhatsApp/चैट से भेजना आसान",
  "PNG, fácil de enviar por WhatsApp/chat",
  "PNG، سهل الإرسال عبر واتساب/الدردشة",
  "PNG, facile à envoyer par WhatsApp/chat",
  "PNG, fácil de enviar por WhatsApp/chat",
  "PNG, удобно отправлять в WhatsApp/чат",
  "PNG形式。WhatsApp/チャットで送りやすい"
 ],
 "Export ke Excel (CSV)": [
  "Export ke Excel (CSV)",
  "Export to Excel (CSV)",
  "Eksport ke Excel (CSV)",
  "导出为 Excel (CSV)",
  "Excel (CSV) में निर्यात करें",
  "Exportar a Excel (CSV)",
  "تصدير إلى Excel (CSV)",
  "Exporter vers Excel (CSV)",
  "Exportar para Excel (CSV)",
  "Экспорт в Excel (CSV)",
  "Excel (CSV) に書き出す"
 ],
 "Bisa dibuka di Excel / Google Sheets": [
  "Bisa dibuka di Excel / Google Sheets",
  "Opens in Excel / Google Sheets",
  "Boleh dibuka dalam Excel / Google Sheets",
  "可在 Excel / Google 表格中打开",
  "Excel / Google Sheets में खुल सकता है",
  "Se abre en Excel / Google Sheets",
  "يمكن فتحه في Excel / Google Sheets",
  "S'ouvre dans Excel / Google Sheets",
  "Abre no Excel / Google Sheets",
  "Открывается в Excel / Google Таблицах",
  "Excel / Googleスプレッドシートで開けます"
 ],
 "Menyiapkan file...": [
  "Menyiapkan file...",
  "Preparing file...",
  "Menyediakan fail...",
  "正在准备文件…",
  "फ़ाइल तैयार हो रही है...",
  "Preparando archivo...",
  "جارٍ تجهيز الملف...",
  "Préparation du fichier...",
  "Preparando arquivo...",
  "Подготовка файла...",
  "ファイルを準備中..."
 ],
 "Bagikan": [
  "Bagikan",
  "Share",
  "Kongsi",
  "分享",
  "साझा करें",
  "Compartir",
  "مشاركة",
  "Partager",
  "Compartilhar",
  "Поделиться",
  "共有"
 ],
 "Berikutnya": [
  "Berikutnya",
  "Next",
  "Seterusnya",
  "下一个",
  "अगला",
  "Siguiente",
  "التالي",
  "Suivant",
  "Próximo",
  "Далее",
  "次へ"
 ],
 "Buat Baru": [
  "Buat Baru",
  "Create New",
  "Cipta Baharu",
  "新建",
  "नया बनाएँ",
  "Crear nuevo",
  "إنشاء جديد",
  "Créer",
  "Criar novo",
  "Создать",
  "新規作成"
 ],
 "Cari folder...": [
  "Cari folder...",
  "Search folders...",
  "Cari folder...",
  "搜索文件夹…",
  "फ़ोल्डर खोजें...",
  "Buscar carpetas...",
  "ابحث في المجلدات...",
  "Rechercher des dossiers...",
  "Buscar pastas...",
  "Поиск папок...",
  "フォルダを検索..."
 ],
 "Filter folder": [
  "Filter folder",
  "Filter folders",
  "Tapis folder",
  "筛选文件夹",
  "फ़ोल्डर फ़िल्टर",
  "Filtrar carpetas",
  "تصفية المجلدات",
  "Filtrer les dossiers",
  "Filtrar pastas",
  "Фильтр папок",
  "フォルダを絞り込み"
 ],
 "Ganti View Mode": [
  "Ganti View Mode",
  "Change view mode",
  "Tukar mod paparan",
  "切换视图模式",
  "व्यू मोड बदलें",
  "Cambiar modo de vista",
  "تغيير وضع العرض",
  "Changer le mode d'affichage",
  "Alterar modo de visualização",
  "Сменить режим просмотра",
  "表示モードを変更"
 ],
 "Ganti puzzle": [
  "Ganti puzzle",
  "Change puzzle",
  "Tukar teka-teki",
  "更换拼图",
  "पज़ल बदलें",
  "Cambiar rompecabezas",
  "تغيير اللغز",
  "Changer de puzzle",
  "Trocar quebra-cabeça",
  "Сменить пазл",
  "パズルを変更"
 ],
 "Geser potongan puzzle": [
  "Geser potongan puzzle",
  "Slide the puzzle piece",
  "Seret kepingan teka-teki",
  "拖动拼图块",
  "पज़ल का टुकड़ा खिसकाएँ",
  "Desliza la pieza",
  "حرّك قطعة اللغز",
  "Faites glisser la pièce",
  "Deslize a peça",
  "Сдвиньте фрагмент пазла",
  "パズルのピースをスライド"
 ],
 "Kembali": [
  "Kembali",
  "Back",
  "Kembali",
  "返回",
  "वापस",
  "Atrás",
  "رجوع",
  "Retour",
  "Voltar",
  "Назад",
  "戻る"
 ],
 "Menu Folders": [
  "Menu Folder",
  "Folders menu",
  "Menu folder",
  "文件夹菜单",
  "फ़ोल्डर मेनू",
  "Menú de carpetas",
  "قائمة المجلدات",
  "Menu des dossiers",
  "Menu de pastas",
  "Меню папок",
  "フォルダメニュー"
 ],
 "Password login customer": [
  "Password login customer",
  "Customer login password",
  "Kata laluan log masuk pelanggan",
  "客户登录密码",
  "ग्राहक लॉगिन पासवर्ड",
  "Contraseña de acceso del cliente",
  "كلمة مرور دخول العميل",
  "Mot de passe de connexion du client",
  "Senha de login do cliente",
  "Пароль входа клиента",
  "顧客ログインパスワード"
 ],
 "Password login karyawan": [
  "Password login karyawan",
  "Employee login password",
  "Kata laluan log masuk pekerja",
  "员工登录密码",
  "कर्मचारी लॉगिन पासवर्ड",
  "Contraseña de acceso del empleado",
  "كلمة مرور دخول الموظف",
  "Mot de passe de connexion de l'employé",
  "Senha de login do funcionário",
  "Пароль входа сотрудника",
  "従業員ログインパスワード"
 ],
 "Pilih Semua": [
  "Pilih Semua",
  "Select all",
  "Pilih semua",
  "全选",
  "सभी चुनें",
  "Seleccionar todo",
  "تحديد الكل",
  "Tout sélectionner",
  "Selecionar tudo",
  "Выбрать все",
  "すべて選択"
 ],
 "Sebelumnya": [
  "Sebelumnya",
  "Previous",
  "Sebelumnya",
  "上一个",
  "पिछला",
  "Anterior",
  "السابق",
  "Précédent",
  "Anterior",
  "Назад",
  "前へ"
 ],
 "Tambah Customer": [
  "Tambah Customer",
  "Add Customer",
  "Tambah Pelanggan",
  "添加客户",
  "ग्राहक जोड़ें",
  "Añadir cliente",
  "إضافة عميل",
  "Ajouter un client",
  "Adicionar cliente",
  "Добавить клиента",
  "顧客を追加"
 ],
 "Tambah Karyawan": [
  "Tambah Karyawan",
  "Add Employee",
  "Tambah Pekerja",
  "添加员工",
  "कर्मचारी जोड़ें",
  "Añadir empleado",
  "إضافة موظف",
  "Ajouter un employé",
  "Adicionar funcionário",
  "Добавить сотрудника",
  "従業員を追加"
 ],
 "Ubah": [
  "Ubah",
  "Edit",
  "Ubah",
  "编辑",
  "बदलें",
  "Editar",
  "تعديل",
  "Modifier",
  "Editar",
  "Изменить",
  "編集"
 ],
 "Unnamed Folder": [
  "Folder Tanpa Nama",
  "Unnamed Folder",
  "Folder Tanpa Nama",
  "未命名文件夹",
  "बिना नाम का फ़ोल्डर",
  "Carpeta sin nombre",
  "مجلد بدون اسم",
  "Dossier sans nom",
  "Pasta sem nome",
  "Папка без названия",
  "名称未設定フォルダ"
 ],
 "Tanpa Tanggal": [
  "Tanpa Tanggal",
  "No Date",
  "Tanpa Tarikh",
  "无日期",
  "बिना तारीख़",
  "Sin fecha",
  "بدون تاريخ",
  "Sans date",
  "Sem data",
  "Без даты",
  "日付なし"
 ],
 "Sebelum Pekan 1": [
  "Sebelum Pekan 1",
  "Before Week 1",
  "Sebelum Minggu 1",
  "第1周之前",
  "सप्ताह 1 से पहले",
  "Antes de la semana 1",
  "قبل الأسبوع 1",
  "Avant la semaine 1",
  "Antes da semana 1",
  "До недели 1",
  "第1週より前"
 ],
 "Folder dipindahkan ke Sampah": [
  "Folder dipindahkan ke Sampah",
  "Folder moved to Trash",
  "Folder dialihkan ke Tong Sampah",
  "文件夹已移至回收站",
  "फ़ोल्डर ट्रैश में ले जाया गया",
  "Carpeta movida a la papelera",
  "تم نقل المجلد إلى سلة المحذوفات",
  "Dossier déplacé dans la corbeille",
  "Pasta movida para a lixeira",
  "Папка перемещена в корзину",
  "フォルダをゴミ箱に移動しました"
 ],
 "Dihapus permanen": [
  "Dihapus permanen",
  "Permanently deleted",
  "Dipadam secara kekal",
  "已永久删除",
  "स्थायी रूप से हटाया गया",
  "Eliminado permanentemente",
  "تم الحذف نهائيًا",
  "Supprimé définitivement",
  "Excluído permanentemente",
  "Удалено навсегда",
  "完全に削除しました"
 ],
 "Sampah dikosongkan": [
  "Sampah dikosongkan",
  "Trash emptied",
  "Tong sampah dikosongkan",
  "回收站已清空",
  "ट्रैश खाली किया गया",
  "Papelera vaciada",
  "تم إفراغ سلة المحذوفات",
  "Corbeille vidée",
  "Lixeira esvaziada",
  "Корзина очищена",
  "ゴミ箱を空にしました"
 ],
 "Link login disalin": [
  "Link login disalin",
  "Login link copied",
  "Pautan log masuk disalin",
  "登录链接已复制",
  "लॉगिन लिंक कॉपी हुआ",
  "Enlace de acceso copiado",
  "تم نسخ رابط تسجيل الدخول",
  "Lien de connexion copié",
  "Link de login copiado",
  "Ссылка для входа скопирована",
  "ログインリンクをコピーしました"
 ],
 "Folder dipulihkan": [
  "Folder dipulihkan",
  "Folder restored",
  "Folder dipulihkan",
  "文件夹已恢复",
  "फ़ोल्डर पुनर्स्थापित हुआ",
  "Carpeta restaurada",
  "تمت استعادة المجلد",
  "Dossier restauré",
  "Pasta restaurada",
  "Папка восстановлена",
  "フォルダを復元しました"
 ],
 "Catatan dipulihkan": [
  "Catatan dipulihkan",
  "Note restored",
  "Nota dipulihkan",
  "笔记已恢复",
  "नोट पुनर्स्थापित हुआ",
  "Nota restaurada",
  "تمت استعادة الملاحظة",
  "Note restaurée",
  "Nota restaurada",
  "Заметка восстановлена",
  "ノートを復元しました"
 ],
 "Hapus Folder?": [
  "Hapus Folder?",
  "Delete Folder?",
  "Padam Folder?",
  "删除文件夹？",
  "फ़ोल्डर हटाएँ?",
  "¿Eliminar carpeta?",
  "حذف المجلد؟",
  "Supprimer le dossier ?",
  "Excluir pasta?",
  "Удалить папку?",
  "フォルダを削除しますか？"
 ],
 "Ya, Hapus": [
  "Ya, Hapus",
  "Yes, Delete",
  "Ya, Padam",
  "是，删除",
  "हाँ, हटाएँ",
  "Sí, eliminar",
  "نعم، احذف",
  "Oui, supprimer",
  "Sim, excluir",
  "Да, удалить",
  "はい、削除"
 ],
 "Hapus Permanen?": [
  "Hapus Permanen?",
  "Delete Permanently?",
  "Padam Secara Kekal?",
  "永久删除？",
  "स्थायी रूप से हटाएँ?",
  "¿Eliminar permanentemente?",
  "حذف نهائي؟",
  "Supprimer définitivement ?",
  "Excluir permanentemente?",
  "Удалить навсегда?",
  "完全に削除しますか？"
 ],
 "Hapus Permanen": [
  "Hapus Permanen",
  "Delete Permanently",
  "Padam Secara Kekal",
  "永久删除",
  "स्थायी रूप से हटाएँ",
  "Eliminar permanentemente",
  "حذف نهائي",
  "Supprimer définitivement",
  "Excluir permanentemente",
  "Удалить навсегда",
  "完全に削除"
 ],
 "Kosongkan Sampah?": [
  "Kosongkan Sampah?",
  "Empty Trash?",
  "Kosongkan Tong Sampah?",
  "清空回收站？",
  "ट्रैश खाली करें?",
  "¿Vaciar la papelera?",
  "إفراغ سلة المحذوفات؟",
  "Vider la corbeille ?",
  "Esvaziar a lixeira?",
  "Очистить корзину?",
  "ゴミ箱を空にしますか？"
 ],
 "Hapus Akun Customer?": [
  "Hapus Akun Customer?",
  "Delete Customer Account?",
  "Padam Akaun Pelanggan?",
  "删除客户账号？",
  "ग्राहक खाता हटाएँ?",
  "¿Eliminar cuenta de cliente?",
  "حذف حساب العميل؟",
  "Supprimer le compte client ?",
  "Excluir conta de cliente?",
  "Удалить аккаунт клиента?",
  "顧客アカウントを削除しますか？"
 ],
 "Hapus Akun Karyawan?": [
  "Hapus Akun Karyawan?",
  "Delete Employee Account?",
  "Padam Akaun Pekerja?",
  "删除员工账号？",
  "कर्मचारी खाता हटाएँ?",
  "¿Eliminar cuenta de empleado?",
  "حذف حساب الموظف؟",
  "Supprimer le compte employé ?",
  "Excluir conta de funcionário?",
  "Удалить аккаунт сотрудника?",
  "従業員アカウントを削除しますか？"
 ],
 "Hapus Akun": [
  "Hapus Akun",
  "Delete Account",
  "Padam Akaun",
  "删除账号",
  "खाता हटाएँ",
  "Eliminar cuenta",
  "حذف الحساب",
  "Supprimer le compte",
  "Excluir conta",
  "Удалить аккаунт",
  "アカウントを削除"
 ],
 "Gagal memuat data — cek koneksi": [
  "Gagal memuat data — cek koneksi",
  "Failed to load data — check your connection",
  "Gagal memuatkan data — semak sambungan",
  "数据加载失败 — 请检查网络",
  "डेटा लोड नहीं हुआ — कनेक्शन जाँचें",
  "No se pudieron cargar los datos — revisa tu conexión",
  "تعذّر تحميل البيانات — تحقق من الاتصال",
  "Échec du chargement — vérifiez la connexion",
  "Falha ao carregar dados — verifique a conexão",
  "Не удалось загрузить данные — проверьте соединение",
  "データを読み込めません — 接続を確認してください"
 ],
 "Coba Lagi": [
  "Coba Lagi",
  "Try Again",
  "Cuba Lagi",
  "重试",
  "फिर कोशिश करें",
  "Reintentar",
  "إعادة المحاولة",
  "Réessayer",
  "Tentar novamente",
  "Повторить",
  "再試行"
 ],
 "Belum ada kategori": [
  "Belum ada kategori",
  "No categories yet",
  "Belum ada kategori",
  "还没有分类",
  "अभी कोई श्रेणी नहीं",
  "Aún no hay categorías",
  "لا توجد فئات بعد",
  "Aucune catégorie pour l'instant",
  "Nenhuma categoria ainda",
  "Категорий пока нет",
  "カテゴリはまだありません"
 ],
 "Akun Customer": [
  "Akun Customer",
  "Customer Accounts",
  "Akaun Pelanggan",
  "客户账号",
  "ग्राहक खाते",
  "Cuentas de clientes",
  "حسابات العملاء",
  "Comptes clients",
  "Contas de clientes",
  "Аккаунты клиентов",
  "顧客アカウント"
 ],
 "Data Customer": [
  "Data Customer",
  "Customer Data",
  "Data Pelanggan",
  "客户数据",
  "ग्राहक डेटा",
  "Datos de clientes",
  "بيانات العملاء",
  "Données clients",
  "Dados de clientes",
  "Данные клиентов",
  "顧客データ"
 ],
 "Akun Karyawan": [
  "Akun Karyawan",
  "Employee Accounts",
  "Akaun Pekerja",
  "员工账号",
  "कर्मचारी खाते",
  "Cuentas de empleados",
  "حسابات الموظفين",
  "Comptes employés",
  "Contas de funcionários",
  "Аккаунты сотрудников",
  "従業員アカウント"
 ],
 "Folder Custom": [
  "Folder Custom",
  "Custom Folders",
  "Folder Tersuai",
  "自定义文件夹",
  "कस्टम फ़ोल्डर",
  "Carpetas personalizadas",
  "مجلدات مخصصة",
  "Dossiers personnalisés",
  "Pastas personalizadas",
  "Свои папки",
  "カスタムフォルダ"
 ],
 "Memuat tahun...": [
  "Memuat tahun...",
  "Loading years...",
  "Memuatkan tahun...",
  "正在加载年份…",
  "वर्ष लोड हो रहे हैं...",
  "Cargando años...",
  "جارٍ تحميل السنوات...",
  "Chargement des années...",
  "Carregando anos...",
  "Загрузка годов...",
  "年を読み込み中..."
 ],
 "Belum ada data": [
  "Belum ada data",
  "No data yet",
  "Belum ada data",
  "暂无数据",
  "अभी कोई डेटा नहीं",
  "Aún no hay datos",
  "لا توجد بيانات بعد",
  "Aucune donnée pour l'instant",
  "Ainda sem dados",
  "Данных пока нет",
  "データはまだありません"
 ],
 "Belum ada data bertanggal": [
  "Belum ada data bertanggal",
  "No dated data yet",
  "Belum ada data bertarikh",
  "暂无带日期的数据",
  "अभी कोई तारीख़ वाला डेटा नहीं",
  "Aún no hay datos con fecha",
  "لا توجد بيانات مؤرخة بعد",
  "Aucune donnée datée",
  "Ainda sem dados com data",
  "Данных с датой пока нет",
  "日付付きのデータはまだありません"
 ],
 "Belum ada folder": [
  "Belum ada folder",
  "No folders yet",
  "Belum ada folder",
  "还没有文件夹",
  "अभी कोई फ़ोल्डर नहीं",
  "Aún no hay carpetas",
  "لا توجد مجلدات بعد",
  "Aucun dossier pour l'instant",
  "Nenhuma pasta ainda",
  "Папок пока нет",
  "フォルダはまだありません"
 ],
 "Nggak ada folder lain buat dipindahin": [
  "Nggak ada folder lain buat dipindahin",
  "No other folder to move to",
  "Tiada folder lain untuk dialihkan",
  "没有其他文件夹可移动",
  "ले जाने के लिए कोई और फ़ोल्डर नहीं",
  "No hay otra carpeta a la que mover",
  "لا يوجد مجلد آخر للنقل إليه",
  "Aucun autre dossier de destination",
  "Nenhuma outra pasta para mover",
  "Нет другой папки для перемещения",
  "移動先のフォルダがありません"
 ],
 "Note akan dipindahkan ke Sampah dan bisa dipulihkan selama 30 hari.": [
  "Note akan dipindahkan ke Sampah dan bisa dipulihkan selama 30 hari.",
  "The note will be moved to Trash and can be restored for 30 days.",
  "Nota akan dialihkan ke Tong Sampah dan boleh dipulihkan selama 30 hari.",
  "笔记将移至回收站，30 天内可恢复。",
  "नोट ट्रैश में जाएगा और 30 दिनों तक पुनर्स्थापित किया जा सकता है।",
  "La nota se moverá a la papelera y se podrá restaurar durante 30 días.",
  "ستُنقل الملاحظة إلى سلة المحذوفات ويمكن استعادتها خلال 30 يومًا.",
  "La note sera déplacée dans la corbeille et pourra être restaurée pendant 30 jours.",
  "A nota será movida para a lixeira e poderá ser restaurada por 30 dias.",
  "Заметка попадёт в корзину, её можно восстановить в течение 30 дней.",
  "ノートはゴミ箱に移動され、30日間は復元できます。"
 ],
 "Sampah kosong": [
  "Sampah kosong",
  "Trash is empty",
  "Tong sampah kosong",
  "回收站为空",
  "ट्रैश खाली है",
  "La papelera está vacía",
  "سلة المحذوفات فارغة",
  "La corbeille est vide",
  "A lixeira está vazia",
  "Корзина пуста",
  "ゴミ箱は空です"
 ],
 "Pulihkan": [
  "Pulihkan",
  "Restore",
  "Pulihkan",
  "恢复",
  "पुनर्स्थापित करें",
  "Restaurar",
  "استعادة",
  "Restaurer",
  "Restaurar",
  "Восстановить",
  "復元"
 ],
 "Belum ada customer. Tekan tombol + untuk menambahkan.": [
  "Belum ada customer. Tekan tombol + untuk menambahkan.",
  "No customers yet. Tap the + button to add one.",
  "Belum ada pelanggan. Tekan butang + untuk menambah.",
  "还没有客户。点按 + 按钮添加。",
  "अभी कोई ग्राहक नहीं। जोड़ने के लिए + बटन दबाएँ।",
  "Aún no hay clientes. Toca el botón + para añadir.",
  "لا يوجد عملاء بعد. اضغط زر + للإضافة.",
  "Aucun client pour l'instant. Appuyez sur + pour en ajouter.",
  "Nenhum cliente ainda. Toque em + para adicionar.",
  "Клиентов пока нет. Нажмите +, чтобы добавить.",
  "顧客はまだいません。+ ボタンで追加してください。"
 ],
 "Belum ada karyawan. Tekan tombol + untuk menambahkan.": [
  "Belum ada karyawan. Tekan tombol + untuk menambahkan.",
  "No employees yet. Tap the + button to add one.",
  "Belum ada pekerja. Tekan butang + untuk menambah.",
  "还没有员工。点按 + 按钮添加。",
  "अभी कोई कर्मचारी नहीं। जोड़ने के लिए + बटन दबाएँ।",
  "Aún no hay empleados. Toca el botón + para añadir.",
  "لا يوجد موظفون بعد. اضغط زر + للإضافة.",
  "Aucun employé pour l'instant. Appuyez sur + pour en ajouter.",
  "Nenhum funcionário ainda. Toque em + para adicionar.",
  "Сотрудников пока нет. Нажмите +, чтобы добавить.",
  "従業員はまだいません。+ ボタンで追加してください。"
 ],
 "Salin Link Login": [
  "Salin Link Login",
  "Copy Login Link",
  "Salin Pautan Log Masuk",
  "复制登录链接",
  "लॉगिन लिंक कॉपी करें",
  "Copiar enlace de acceso",
  "نسخ رابط الدخول",
  "Copier le lien de connexion",
  "Copiar link de login",
  "Копировать ссылку входа",
  "ログインリンクをコピー"
 ],
 "Pilih folder dulu sebelum bikin catatan baru.": [
  "Pilih folder dulu sebelum bikin catatan baru.",
  "Choose a folder before creating a new note.",
  "Pilih folder dahulu sebelum buat nota baharu.",
  "请先选择文件夹再新建笔记。",
  "नया नोट बनाने से पहले फ़ोल्डर चुनें।",
  "Elige una carpeta antes de crear una nota nueva.",
  "اختر مجلدًا قبل إنشاء ملاحظة جديدة.",
  "Choisissez un dossier avant de créer une note.",
  "Escolha uma pasta antes de criar uma nota.",
  "Выберите папку, прежде чем создавать заметку.",
  "新しいノートを作る前にフォルダを選んでください。"
 ],
 "Sesi admin habis, silakan login ulang.": [
  "Sesi admin habis, silakan login ulang.",
  "Admin session expired, please log in again.",
  "Sesi admin tamat, sila log masuk semula.",
  "管理员会话已过期，请重新登录。",
  "एडमिन सत्र समाप्त, कृपया फिर से लॉगिन करें।",
  "La sesión de administrador expiró, inicia sesión de nuevo.",
  "انتهت جلسة المشرف، يرجى تسجيل الدخول مجددًا.",
  "Session administrateur expirée, veuillez vous reconnecter.",
  "Sessão de administrador expirada, faça login novamente.",
  "Сессия администратора истекла, войдите снова.",
  "管理者セッションの有効期限が切れました。再度ログインしてください。"
 ],
 "Tabel ini belum ada isinya, nggak ada yang bisa di-export.": [
  "Tabel ini belum ada isinya, nggak ada yang bisa di-export.",
  "This table is empty, nothing to export.",
  "Jadual ini belum ada isi, tiada apa untuk dieksport.",
  "此表格暂无内容，无法导出。",
  "यह तालिका खाली है, निर्यात करने के लिए कुछ नहीं।",
  "Esta tabla está vacía, no hay nada que exportar.",
  "هذا الجدول فارغ، لا يوجد ما يمكن تصديره.",
  "Ce tableau est vide, rien à exporter.",
  "Esta tabela está vazia, nada para exportar.",
  "Таблица пуста, экспортировать нечего.",
  "この表は空のため、書き出せるものがありません。"
 ],
 "Gagal menghapus folder": [
  "Gagal menghapus folder",
  "Failed to delete folder",
  "Gagal memadam folder",
  "删除文件夹失败",
  "फ़ोल्डर हटाने में विफल",
  "No se pudo eliminar la carpeta",
  "تعذّر حذف المجلد",
  "Échec de la suppression du dossier",
  "Falha ao excluir a pasta",
  "Не удалось удалить папку",
  "フォルダを削除できませんでした"
 ],
 "Gagal memindahkan note": [
  "Gagal memindahkan note",
  "Failed to move note",
  "Gagal mengalihkan nota",
  "移动笔记失败",
  "नोट ले जाने में विफल",
  "No se pudo mover la nota",
  "تعذّر نقل الملاحظة",
  "Échec du déplacement de la note",
  "Falha ao mover a nota",
  "Не удалось переместить заметку",
  "ノートを移動できませんでした"
 ],
 "Gagal menghapus note": [
  "Gagal menghapus note",
  "Failed to delete note",
  "Gagal memadam nota",
  "删除笔记失败",
  "नोट हटाने में विफल",
  "No se pudo eliminar la nota",
  "تعذّر حذف الملاحظة",
  "Échec de la suppression de la note",
  "Falha ao excluir a nota",
  "Не удалось удалить заметку",
  "ノートを削除できませんでした"
 ],
 "Gagal memulihkan": [
  "Gagal memulihkan",
  "Failed to restore",
  "Gagal memulihkan",
  "恢复失败",
  "पुनर्स्थापित करने में विफल",
  "No se pudo restaurar",
  "تعذّرت الاستعادة",
  "Échec de la restauration",
  "Falha ao restaurar",
  "Не удалось восстановить",
  "復元できませんでした"
 ],
 "Gagal menghapus permanen": [
  "Gagal menghapus permanen",
  "Failed to delete permanently",
  "Gagal memadam secara kekal",
  "永久删除失败",
  "स्थायी रूप से हटाने में विफल",
  "No se pudo eliminar permanentemente",
  "تعذّر الحذف النهائي",
  "Échec de la suppression définitive",
  "Falha ao excluir permanentemente",
  "Не удалось удалить навсегда",
  "完全に削除できませんでした"
 ],
 "Gagal mengosongkan Sampah": [
  "Gagal mengosongkan Sampah",
  "Failed to empty Trash",
  "Gagal mengosongkan Tong Sampah",
  "清空回收站失败",
  "ट्रैश खाली करने में विफल",
  "No se pudo vaciar la papelera",
  "تعذّر إفراغ سلة المحذوفات",
  "Échec du vidage de la corbeille",
  "Falha ao esvaziar a lixeira",
  "Не удалось очистить корзину",
  "ゴミ箱を空にできませんでした"
 ],
 "Gagal menghapus": [
  "Gagal menghapus",
  "Failed to delete",
  "Gagal memadam",
  "删除失败",
  "हटाने में विफल",
  "No se pudo eliminar",
  "تعذّر الحذف",
  "Échec de la suppression",
  "Falha ao excluir",
  "Не удалось удалить",
  "削除できませんでした"
 ],
 "Gagal terhubung ke server": [
  "Gagal terhubung ke server",
  "Failed to connect to server",
  "Gagal menyambung ke pelayan",
  "无法连接服务器",
  "सर्वर से कनेक्ट नहीं हो सका",
  "No se pudo conectar con el servidor",
  "تعذّر الاتصال بالخادم",
  "Impossible de se connecter au serveur",
  "Falha ao conectar ao servidor",
  "Не удалось подключиться к серверу",
  "サーバーに接続できませんでした"
 ],
 "Gagal menyimpan perubahan folder": [
  "Gagal menyimpan perubahan folder",
  "Failed to save folder changes",
  "Gagal menyimpan perubahan folder",
  "保存文件夹更改失败",
  "फ़ोल्डर बदलाव सहेजने में विफल",
  "No se pudieron guardar los cambios de la carpeta",
  "تعذّر حفظ تغييرات المجلد",
  "Échec de l'enregistrement des modifications du dossier",
  "Falha ao salvar as alterações da pasta",
  "Не удалось сохранить изменения папки",
  "フォルダの変更を保存できませんでした"
 ],
 "Gagal membuat kategori": [
  "Gagal membuat kategori",
  "Failed to create category",
  "Gagal mencipta kategori",
  "创建分类失败",
  "श्रेणी बनाने में विफल",
  "No se pudo crear la categoría",
  "تعذّر إنشاء الفئة",
  "Échec de la création de la catégorie",
  "Falha ao criar a categoria",
  "Не удалось создать категорию",
  "カテゴリを作成できませんでした"
 ],
 "Gagal membuat PDF": [
  "Gagal membuat PDF",
  "Failed to create PDF",
  "Gagal mencipta PDF",
  "创建 PDF 失败",
  "PDF बनाने में विफल",
  "No se pudo crear el PDF",
  "تعذّر إنشاء ملف PDF",
  "Échec de la création du PDF",
  "Falha ao criar o PDF",
  "Не удалось создать PDF",
  "PDFを作成できませんでした"
 ],
 "Gagal membuat gambar": [
  "Gagal membuat gambar",
  "Failed to create image",
  "Gagal mencipta imej",
  "创建图片失败",
  "छवि बनाने में विफल",
  "No se pudo crear la imagen",
  "تعذّر إنشاء الصورة",
  "Échec de la création de l'image",
  "Falha ao criar a imagem",
  "Не удалось создать изображение",
  "画像を作成できませんでした"
 ],
 "Gagal memuat Sampah": [
  "Gagal memuat Sampah",
  "Failed to load Trash",
  "Gagal memuatkan Tong Sampah",
  "加载回收站失败",
  "ट्रैश लोड करने में विफल",
  "No se pudo cargar la papelera",
  "تعذّر تحميل سلة المحذوفات",
  "Échec du chargement de la corbeille",
  "Falha ao carregar a lixeira",
  "Не удалось загрузить корзину",
  "ゴミ箱を読み込めませんでした"
 ],
 "Gagal memuat": [
  "Gagal memuat",
  "Failed to load",
  "Gagal memuatkan",
  "加载失败",
  "लोड करने में विफल",
  "No se pudo cargar",
  "تعذّر التحميل",
  "Échec du chargement",
  "Falha ao carregar",
  "Не удалось загрузить",
  "読み込めませんでした"
 ],
 "Tanggal": [
  "Tanggal",
  "Date",
  "Tarikh",
  "日期",
  "तारीख़",
  "Fecha",
  "التاريخ",
  "Tanggal",
  "Data",
  "Дата",
  "日付"
 ],
 "Jam": [
  "Jam",
  "Time",
  "Masa",
  "时间",
  "समय",
  "Hora",
  "الوقت",
  "Heure",
  "Hora",
  "Время",
  "時刻"
 ],
 "Customer": [
  "Customer",
  "Customer",
  "Pelanggan",
  "客户",
  "ग्राहक",
  "Cliente",
  "العميل",
  "Client",
  "Cliente",
  "Клиент",
  "顧客"
 ],
 "Barang": [
  "Barang",
  "Item",
  "Barang",
  "商品",
  "सामान",
  "Artículo",
  "الصنف",
  "Article",
  "Item",
  "Товар",
  "品目"
 ],
 "Barang Keluar": [
  "Barang Keluar",
  "Items Out",
  "Barang Keluar",
  "出库商品",
  "निकला सामान",
  "Artículos salidos",
  "الأصناف الخارجة",
  "Articles sortis",
  "Itens saídos",
  "Расход товара",
  "出庫品目"
 ],
 "Stok Barang": [
  "Stok Barang",
  "Item Stock",
  "Stok Barang",
  "商品库存",
  "सामान का स्टॉक",
  "Existencias",
  "مخزون الأصناف",
  "Stock d'articles",
  "Estoque",
  "Остаток товара",
  "在庫"
 ],
 "Keterangan": [
  "Keterangan",
  "Remarks",
  "Keterangan",
  "备注",
  "विवरण",
  "Observaciones",
  "ملاحظات",
  "Remarques",
  "Observações",
  "Примечание",
  "備考"
 ],
 "Harga": [
  "Harga",
  "Price",
  "Harga",
  "价格",
  "कीमत",
  "Precio",
  "السعر",
  "Prix",
  "Preço",
  "Цена",
  "価格"
 ],
 "Bukti": [
  "Bukti",
  "Proof",
  "Bukti",
  "凭证",
  "प्रमाण",
  "Comprobante",
  "الإثبات",
  "Justificatif",
  "Comprovante",
  "Подтверждение",
  "証拠"
 ],
 "Nama": [
  "Nama",
  "Name",
  "Nama",
  "名称",
  "नाम",
  "Nombre",
  "الاسم",
  "Nom",
  "Nome",
  "Имя",
  "名前"
 ],
 "Total Tagihan": [
  "Total Tagihan",
  "Total Bill",
  "Jumlah Bil",
  "账单总额",
  "कुल बिल",
  "Total de factura",
  "إجمالي الفاتورة",
  "Total facturé",
  "Total da fatura",
  "Сумма счёта",
  "請求合計"
 ],
 "Dibayar": [
  "Dibayar",
  "Paid",
  "Dibayar",
  "已付",
  "भुगतान किया",
  "Pagado",
  "المدفوع",
  "Payé",
  "Pago",
  "Оплачено",
  "支払済み"
 ],
 "Sisa Tagihan": [
  "Sisa Tagihan",
  "Remaining Bill",
  "Baki Bil",
  "剩余账单",
  "बकाया बिल",
  "Factura pendiente",
  "المتبقي من الفاتورة",
  "Reste à payer",
  "Fatura restante",
  "Остаток по счёту",
  "未払い残高"
 ],
 "Jenis": [
  "Jenis",
  "Type",
  "Jenis",
  "类型",
  "प्रकार",
  "Tipo",
  "النوع",
  "Jenis",
  "Tipo",
  "Тип",
  "種類"
 ],
 "Total": [
  "Total",
  "Total",
  "Jumlah",
  "合计",
  "कुल",
  "Total",
  "الإجمالي",
  "Total",
  "Total",
  "Итого",
  "合計"
 ],
 "Sisa": [
  "Sisa",
  "Remaining",
  "Baki",
  "剩余",
  "शेष",
  "Resto",
  "المتبقي",
  "Reste",
  "Resta",
  "Остаток",
  "残り"
 ],
 "Nama Barang": [
  "Nama Barang",
  "Item Name",
  "Nama Barang",
  "商品名称",
  "सामान का नाम",
  "Nombre del artículo",
  "اسم الصنف",
  "Nom de l'article",
  "Nome do item",
  "Название товара",
  "品名"
 ],
 "Jumlah": [
  "Jumlah",
  "Quantity",
  "Kuantiti",
  "数量",
  "मात्रा",
  "Cantidad",
  "الكمية",
  "Quantité",
  "Quantidade",
  "Количество",
  "数量"
 ]
};

  /* pola berangka: {1} diganti hasil tangkapan regex */
  var RULES = [{re:/^Found (\d+) results?$/,t:["Ditemukan {1} hasil", "Found {1} results", "{1} hasil ditemui", "找到 {1} 个结果", "{1} परिणाम मिले", "{1} resultados encontrados", "تم العثور على {1} نتيجة", "{1} résultats trouvés", "{1} resultados encontrados", "Найдено результатов: {1}", "{1} 件見つかりました"]},{re:/^(\d+) Item Selected$/,t:["{1} item dipilih", "{1} item selected", "{1} item dipilih", "已选择 {1} 项", "{1} आइटम चुने गए", "{1} seleccionado(s)", "تم تحديد {1}", "{1} élément(s) sélectionné(s)", "{1} item(ns) selecionado(s)", "Выбрано: {1}", "{1} 件を選択中"]},{re:/^(\d+) note dipindahkan$/,t:["{1} note dipindahkan", "{1} notes moved", "{1} nota dialihkan", "已移动 {1} 条笔记", "{1} नोट ले जाए गए", "{1} notas movidas", "تم نقل {1} ملاحظة", "{1} notes déplacées", "{1} notas movidas", "Перемещено заметок: {1}", "{1} 件のノートを移動しました"]},{re:/^(\d+) note dipindahkan ke Sampah$/,t:["{1} note dipindahkan ke Sampah", "{1} notes moved to Trash", "{1} nota dialihkan ke Tong Sampah", "{1} 条笔记已移至回收站", "{1} नोट ट्रैश में ले जाए गए", "{1} notas movidas a la papelera", "تم نقل {1} ملاحظة إلى سلة المحذوفات", "{1} notes déplacées dans la corbeille", "{1} notas movidas para a lixeira", "В корзину перемещено заметок: {1}", "{1} 件のノートをゴミ箱に移動しました"]},{re:/^Pekan (\d+)$/,t:["Pekan {1}", "Week {1}", "Minggu {1}", "第{1}周", "सप्ताह {1}", "Semana {1}", "الأسبوع {1}", "Semaine {1}", "Semana {1}", "Неделя {1}", "第{1}週"]}];

  var MON = { januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5, juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
              jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, agu: 7, ags: 7, sep: 8, sept: 8, okt: 9, nov: 10, des: 11 };
  var MON_RE = '(?:' + Object.keys(MON).sort(function (a, b) { return b.length - a.length; }).join('|') + ')';
  var DATE_ONLY = new RegExp('^(?:\\d{1,4}|' + MON_RE + '|[\u2013\\-]|\\s)+$', 'i');
  var HAS_MONTH = new RegExp('\\b' + MON_RE + '\\b', 'i');
  var MONTH_TOKEN = new RegExp('\\b' + MON_RE + '\\b', 'gi');
  var TITLE_RE = new RegExp('^(.+) - (' + MON_RE + ') (\\d{4})$', 'i');

  var LOWER = {};
  Object.keys(DICT).forEach(function (k) { LOWER[k.toLowerCase()] = k; });

  function createTranslator(code) {
    var idx = CODES.indexOf(code);
    if (idx < 0) return function () { return null; };

    function monthLabel(token) {
      var lower = token.toLowerCase();
      var long = token.length > 3 || lower === 'mei';
      var out;
      try {
        out = new Intl.DateTimeFormat(code, { month: long ? 'long' : 'short' }).format(new Date(2026, MON[lower], 15));
      } catch (e) { return token; }
      return (token.length > 1 && token === token.toUpperCase()) ? out.toUpperCase() : out;
    }

    function lookup(core) {
      var e = DICT[core];
      if (e) return e[idx];
      var base = LOWER[core.toLowerCase()];
      if (!base) return null;
      var out = DICT[base][idx];
      if (core === core.toUpperCase() && /[A-Za-z]/.test(core)) return out.toUpperCase();
      var first = core.charAt(0);
      if (first !== base.charAt(0)) {
        return (first === first.toLowerCase() ? out.charAt(0).toLowerCase() : out.charAt(0).toUpperCase()) + out.slice(1);
      }
      return out;
    }

    function viaRules(core) {
      for (var i = 0; i < RULES.length; i++) {
        var m = core.match(RULES[i].re);
        if (m) return RULES[i].t[idx].replace(/\{(\d)\}/g, function (_, n) { return m[+n]; });
      }
      var tm = core.match(TITLE_RE);
      if (tm) return tm[1] + ' - ' + monthLabel(tm[2]) + ' ' + tm[3];
      if (DATE_ONLY.test(core) && HAS_MONTH.test(core)) return core.replace(MONTH_TOKEN, monthLabel);
      return null;
    }

    function viaPrefix(core) {
      var p = core.indexOf(': ');
      if (p < 3) return null;
      var head = lookup(core.slice(0, p));
      return head ? head + core.slice(p) : null;
    }

    /* Kembalikan teks terjemahan, atau null kalau tidak ada yang perlu diganti */
    return function tr(src) {
      var core = String(src).replace(/\s+/g, ' ').trim();
      if (!core) return null;
      var out = lookup(core);
      if (out == null) out = viaRules(core);
      if (out == null) out = viaPrefix(core);
      if (out == null || out === core) return null;
      return src.match(/^\s*/)[0] + out + src.match(/\s*$/)[0];
    };
  }

  /* ---------- Bagian DOM ---------- */
  var api = { CODES: CODES, createTranslator: createTranslator };

  if (root.document) {
    var d = root.document;
    var pref = null;
    try { pref = localStorage.getItem('bm-lang'); } catch (e) {}

    var explicit = CODES.indexOf(pref) > -1;
    var code = explicit ? pref : null;
    if (!code) {
      var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'id'];
      code = 'id';
      for (var i = 0; i < list.length; i++) {
        var c = String(list[i]).toLowerCase().split('-')[0];
        if (c === 'in') c = 'id';
        if (CODES.indexOf(c) > -1) { code = c; break; }
      }
    }

    /* "Default perangkat" + HP berbahasa Indonesia = tampilan asli tidak diubah */
    var active = explicit || code !== 'id';
    var tr = active ? createTranslator(code) : function () { return null; };

    api.code = code;
    api.active = active;
    api.t = function (s) { var o = tr(s); return o === null ? s : o; };

    if (active) {
      d.documentElement.lang = code;

      var SKIP = 'script,style,textarea,[data-no-i18n],[contenteditable="true"]';
      var ATTRS = ['placeholder', 'aria-label', 'title'];
      var doneText = new WeakMap();
      var doneAttr = new WeakMap();

      var procText = function (n) {
        var cur = n.nodeValue;
        if (!cur || doneText.get(n) === cur) return;
        var out = tr(cur);
        if (out === null) return;
        var p = n.parentNode;
        if (p && p.closest && p.closest(SKIP)) return;
        doneText.set(n, out);
        n.nodeValue = out;
      };

      var procAttrs = function (el) {
        for (var a = 0; a < ATTRS.length; a++) {
          var name = ATTRS[a], v = el.getAttribute(name);
          if (!v) continue;
          var rec = doneAttr.get(el) || {};
          if (rec[name] === v) continue;
          var out = tr(v);
          if (out === null) continue;
          rec[name] = out;
          doneAttr.set(el, rec);
          el.setAttribute(name, out);
        }
      };

      var walk = function (n) {
        if (n.nodeType === 3) { procText(n); return; }
        if (n.nodeType !== 1 || n.tagName === 'SCRIPT' || n.tagName === 'STYLE') return;
        procAttrs(n);
        var withAttrs = n.querySelectorAll('[placeholder],[aria-label],[title]');
        for (var k = 0; k < withAttrs.length; k++) procAttrs(withAttrs[k]);
        var tw = d.createTreeWalker(n, 4, null);
        var t;
        while ((t = tw.nextNode())) procText(t);
      };

      new MutationObserver(function (muts) {
        for (var m = 0; m < muts.length; m++) {
          var mu = muts[m];
          if (mu.type === 'childList') {
            for (var j = 0; j < mu.addedNodes.length; j++) walk(mu.addedNodes[j]);
          } else if (mu.type === 'characterData') {
            procText(mu.target);
          } else if (mu.type === 'attributes') {
            procAttrs(mu.target);
          }
        }
      }).observe(d.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });

      if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', function () { walk(d.body); });
      else if (d.body) walk(d.body);

      /* alert/confirm bawaan browser ikut diterjemahkan */
      ['alert', 'confirm'].forEach(function (fn) {
        var orig = root[fn];
        if (typeof orig !== 'function') return;
        root[fn] = function (msg) {
          var args = Array.prototype.slice.call(arguments);
          if (typeof msg === 'string') args[0] = api.t(msg);
          return orig.apply(root, args);
        };
      });
    }
  }

  root.BMLang = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
