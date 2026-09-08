// i18n.js — система переводов интерфейса (ru/uz/oz/zh).
// Функция t(key) возвращает перевод для текущего языка.
"use strict";

const I18N = {
  // ── Навигация ───────────────────────────────────────────────────
  nav_home: { ru: "Главная", uz: "Бош сахифа", oz: "Bosh sahifa", zh: "首页" },
  nav_videos: { ru: "Видео", uz: "Видео", oz: "Video", zh: "视频" },
  nav_signs: { ru: "Знаки", uz: "Белгилар", oz: "Belgilar", zh: "标志" },
  nav_fines: { ru: "Штрафы", uz: "Жарималар", oz: "Jarimalar", zh: "罚款" },
  nav_training: { ru: "Тренировки", uz: "Машқлар", oz: "Mashqlar", zh: "练习" },
  nav_arena: { ru: "Арена", uz: "Арена", oz: "Arena", zh: "竞技场" },
  nav_search: { ru: "Поиск", uz: "Қидириш", oz: "Qidirish", zh: "搜索" },

  // ── Главная ─────────────────────────────────────────────────────
  home_badge: { ru: "ПДД Узбекистана · Готовься умнее", uz: "Ўзбекистон ЙҲҚ · Ақлли тайёрлан", oz: "O'zbekiston YHQ · Aqlli tayyorlan", zh: "乌兹别克斯坦交规 · 智能备考" },
  home_title_1: { ru: "Сдай экзамен", uz: "Имтиҳондан ўт", oz: "Imtihondan o't", zh: "通过考试" },
  home_title_2: { ru: "на 100%", uz: "100%га", oz: "100%ga", zh: "100%" },
  home_sub: { ru: "Видеоуроки, дорожные знаки, штрафы и тренировочные тесты — всё для получения водительских прав в одном месте.", uz: "Видео дарслар, йўл белгилари, жарималар ва машқ тестлари — ҳаммаси битта жойда.", oz: "Video darslar, yo'l belgilari, jarimalar va mashq testlari — hammasi bitta joyda.", zh: "视频课程、交通标志、罚款和模拟测试——考驾照所需的一切，尽在一处。" },
  home_cta_videos: { ru: "🎬 Видеоуроки", uz: "🎬 Видео дарслар", oz: "🎬 Video darslar", zh: "🎬 视频课程" },
  home_cta_train: { ru: "🎯 Начать тренировку", uz: "🎯 Машқни бошлаш", oz: "🎯 Mashqni boshlash", zh: "🎯 开始练习" },
  home_stat_videos: { ru: "Видеоуроков", uz: "Видео дарслар", oz: "Video darslar", zh: "视频课程" },
  home_stat_signs: { ru: "Дорожных знаков", uz: "Йўл белгилари", oz: "Yo'l belgilari", zh: "交通标志" },
  home_stat_fines: { ru: "Штрафов", uz: "Жарималар", oz: "Jarimalar", zh: "罚款" },
  home_stat_questions: { ru: "Вопросов", uz: "Саволлар", oz: "Savollar", zh: "题目" },
  home_sections_title: { ru: "Что внутри?", uz: "Ичарида нима бор?", oz: "Ichirida nima bor?", zh: "包含什么？" },
  home_sections_sub: { ru: "Выбирай, чему учиться сегодня.", uz: "Бугун нимани ўрганishни танланг.", oz: "Bugun nimani o'rganishni tanlang.", zh: "选择今天学什么。" },
  home_greeting: { ru: "Привет", uz: "Салом", oz: "Salom", zh: "你好" },

  // Карточки секций
  sec_videos: { ru: "Видеоуроки", uz: "Видео дарслар", oz: "Video darslar", zh: "视频课程" },
  sec_videos_d: { ru: "видео по всем темам ПДД", uz: "барча ЙҲҚ мавзулари бўйича видео", oz: "barcha YHQ mavzulari bo'yicha video", zh: "涵盖所有交规主题的视频" },
  sec_signs: { ru: "Дорожные знаки", uz: "Йўл белгилари", oz: "Yo'l belgilari", zh: "交通标志" },
  sec_signs_d: { ru: "знаков с картинками и описаниями", uz: "белгилар расм ва изоҳлар билан", oz: "belgilar rasm va izohlar bilan", zh: "带图片和说明的标志" },
  sec_fines: { ru: "Штрафы", uz: "Жарималар", oz: "Jarimalar", zh: "罚款" },
  sec_fines_d: { ru: "видов нарушений с суммами", uz: "бузилиш турлари суммалар билан", oz: "buzilish turlari summalar bilan", zh: "各类违规及罚款金额" },
  sec_training: { ru: "Тренировки", uz: "Машқлар", oz: "Mashqlar", zh: "练习" },
  sec_training_d: { ru: "вопросов: темы, билеты, коварные", uz: "саволлар: мавзулар, билетлар, қалқон", oz: "savollar: mavzular, biletlar, qalqon", zh: "题目：主题、试卷、陷阱题" },
  sec_arena: { ru: "Арена", uz: "Арена", oz: "Arena", zh: "竞技场" },
  sec_arena_d: { ru: "1v1 битвы и рейтинги лучших учеников", uz: "1v1 жанглар ва энг яхши ўқувчилар рейтинглари", oz: "1v1 janglar va eng yaxshi o'quvchilar reytinglari", zh: "1v1 对战和优秀学员排行" },

  // AI-готовность
  ai_title: { ru: "AI-оценка готовности", uz: "Тайёргарликни AI-баҳоси", oz: "Tayyorgarlikni AI-bahosi", zh: "AI 备考评估" },
  ai_sub: { ru: "Уровень твоей подготовки к экзамену, рассчитанный на основе всех занятий.", uz: "Барча машғулотлар асосида ҳисобланган имтиҳонга тайёргарлик даражангиз.", oz: "Barcha mashg'ulotlar asosida hisoblangan imtihonga tayyorgarlik darajangiz.", zh: "根据您的全部学习活动计算的备考水平。" },
  ai_ready: { ru: "готовность", uz: "тайёргарлик", oz: "tayyorgarlik", zh: "就绪度" },
  ai_cat_videos: { ru: "Видео", uz: "Видео", oz: "Video", zh: "视频" },
  ai_cat_themes: { ru: "Темы", uz: "Мавзулар", oz: "Mavzular", zh: "主题" },
  ai_cat_tickets: { ru: "Билеты", uz: "Билетлар", oz: "Biletlar", zh: "试卷" },
  ai_cat_tricky: { ru: "Коварные", uz: "Қалқон", oz: "Qalqon", zh: "陷阱题" },

  // Видео
  videos_title: { ru: "Видеоуроки", uz: "Видео дарслар", oz: "Video darslar", zh: "视频课程" },
  videos_sub: { ru: "обучающих видео по Правилам дорожного движения.", uz: "Йўл ҳаракати қоидалари бўйича ўқув видео лар.", oz: "Yo'l harakati qoidalari bo'yicha o'quv videolar.", zh: "交通规则教学视频。" },
  videos_all: { ru: "Все", uz: "Ҳаммаси", oz: "Hammasi", zh: "全部" },
  videos_search: { ru: "Поиск видео...", uz: "Видео қидириш...", oz: "Video qidirish...", zh: "搜索视频..." },
  videos_continue: { ru: "Продолжить", uz: "Давом эттириш", oz: "Davom ettirish", zh: "继续观看" },

  // Знаки
  signs_title: { ru: "Дорожные знаки", uz: "Йўл белгилари", oz: "Yo'l belgilari", zh: "交通标志" },

  // Штрафы
  fines_title: { ru: "Штрафы за нарушения ПДД", uz: "ЙҲҚ бузиш учун жарималар", oz: "YHQ buzish uchun jarimalar", zh: "交通违规罚款" },
  fines_article: { ru: "Статья", uz: "Модда", oz: "Modda", zh: "条款" },
  fines_violation: { ru: "Нарушение", uz: "Бузилиш", oz: "Buzilish", zh: "违规行为" },
  fines_amount: { ru: "Штраф", uz: "Жарима", oz: "Jarima", zh: "罚款" },
  fines_points: { ru: "Баллы", uz: "Очколар", oz: "Ochklar", zh: "扣分" },

  // Тренировки
  train_title: { ru: "Тренировки", uz: "Машқлар", oz: "Mashqlar", zh: "练习" },
  train_sub: { ru: "Закрепи знания: темы, билеты, экзамен, марафон и коварные вопросы.", uz: "Билимларни мустаҳкамланг.", oz: "Bilimlarni mustahkamlang.", zh: "巩固知识：主题、试卷、考试、马拉松和陷阱题。" },
  train_themes: { ru: "Темы", uz: "Мавзулар", oz: "Mavzular", zh: "主题" },
  train_tickets: { ru: "Билеты", uz: "Билетлар", oz: "Biletlar", zh: "试卷" },
  train_exam: { ru: "Экзамен", uz: "Имтиҳон", oz: "Imtihon", zh: "考试" },
  train_marathon: { ru: "Марафон", uz: "Марафон", oz: "Marafon", zh: "马拉松" },
  train_tricky: { ru: "Коварные вопросы", uz: "Қалқон саволлар", oz: "Qalqon savollar", zh: "陷阱题" },
  train_choose: { ru: "Выбери набор вопросов, чтобы начать.", uz: "Бошлаш учун саволлар тўпламини танланг.", oz: "Boshlash uchun savollar to'plamini tanlang.", zh: "选择一组题目开始。" },
  train_questions: { ru: "вопросов", uz: "саволлар", oz: "savollar", zh: "题" },
  train_start: { ru: "нажмите, чтобы начать", uz: "бошлаш учун босинг", oz: "boshlash uchun bosing", zh: "点击开始" },

  // Викторина
  quiz_question: { ru: "Вопрос", uz: "Савол", oz: "Savol", zh: "问题" },
  quiz_of: { ru: "из", uz: "/", oz: "/", zh: "/" },
  quiz_explanation: { ru: "💡 Пояснение.", uz: "💡 Изоҳ.", oz: "💡 Izoh.", zh: "💡 解析。" },
  quiz_next: { ru: "Следующий →", uz: "Кейинги →", oz: "Keyingi →", zh: "下一题 →" },
  quiz_result: { ru: "Посмотреть результат →", uz: "Натижани кўриш →", oz: "Natijani ko'rish →", zh: "查看结果 →" },
  quiz_great: { ru: "Отличный результат!", uz: "Ажойиб натижа!", oz: "Ajoyib natija!", zh: "出色的成绩！" },
  quiz_keep: { ru: "Продолжай готовиться!", uz: "Тайёргарликни давом эттиринг!", oz: "Tayyorgarlikni davom ettiring!", zh: "继续努力！" },
  quiz_correct_of: { ru: "Правильных ответов:", uz: "Тўғри жавоблар:", oz: "To'g'ri javoblar:", zh: "正确答案：" },
  quiz_ready_exam: { ru: "Ты готов к экзамену!", uz: "Имтиҳонга тайёрсиз!", oz: "Imtihonga tayyorsiz!", zh: "你已准备好考试！" },
  quiz_retry: { ru: "↻ Пройти заново", uz: "↻ Қайтадан ўтиш", oz: "↻ Qaytadan o'tish", zh: "↻ 重新答题" },
  quiz_to_train: { ru: "К тренировкам", uz: "Машқларга", oz: "Mashqlarga", zh: "返回练习" },

  // Арена
  arena_title: { ru: "Арена чемпионов", uz: "Чемпионлар аренаси", oz: "Chempionlar arenasi", zh: "冠军竞技场" },
  arena_sub: { ru: "Соревнуйся с другими учениками и попади в рейтинг лучших.", uz: "Бошқа ўқувчилар билан рақобатлашинг.", oz: "Boshqa o'quvchilar bilan raqobatlashing.", zh: "与其他学员竞争，进入最佳排名。" },
  arena_octagon: { ru: "Octagon — 1v1 битвы", uz: "Octagon — 1v1 жанглар", oz: "Octagon — 1v1 janglar", zh: "Octagon — 1v1 对战" },
  arena_octagon_d: { ru: "Отвечай быстрее и точнее соперника. Побеждай — поднимайся в рейтинге.", uz: "Рақибдан тезроқ ва аниқроқ жавоб беринг.", oz: "Raqibdan tezroq va aniqroq javob bering.", zh: "比对手更快更准确地回答，获胜提升排名。" },
  arena_top_week: { ru: "🏆 Топ игроков недели", uz: "🏆 Ҳафтанинг энг яхши ўйинчилари", oz: "🏆 Haftaning eng yaxshi o'yinchilari", zh: "🏆 本周顶尖玩家" },
  arena_top_week_d: { ru: "Очки за победу в 1v1 битвах. Лучшие за эту неделю.", uz: "1v1 жангларда ғалаба учун очколар.", oz: "1v1 janglarda g'alaba uchun ochklar.", zh: "1v1 对战获胜积分。本周最佳。" },
  arena_best_exam: { ru: "⚡ Лучшие результаты экзамена", uz: "⚡ Имтиҳоннинг энг яхши натижалари", oz: "⚡ Imtihonning eng yaxshi natijalari", zh: "⚡ 最佳考试成绩" },
  arena_points: { ru: "очков", uz: "очко", oz: "ocho", zh: "积分" },
  arena_wins: { ru: "побед", uz: "ғалаба", oz: "g'alaba", zh: "胜" },
  arena_winrate: { ru: "винрейт", uz: "винрейт", oz: "reyting", zh: "胜率" },
  arena_time: { ru: "время", uz: "вақт", oz: "vaqt", zh: "时间" },
  arena_correct: { ru: "правильно", uz: "тўғри", oz: "to'g'ri", zh: "正确" },

  // Профиль
  profile_title: { ru: "Профиль", uz: "Профиль", oz: "Profil", zh: "个人中心" },
  profile_sub: { ru: "Твои данные, настройки и прогресс обучения.", uz: "Сизнинг маълумотларингиз ва сўзламаларингиз.", oz: "Sizning ma'lumotlaringiz va sozlamalaringiz.", zh: "您的个人信息、设置和学习进度。" },
  profile_settings: { ru: "⚙️ Настройки", uz: "⚙️ Созламалар", oz: "⚙️ Sozlamalar", zh: "⚙️ 设置" },
  profile_name: { ru: "Имя", uz: "Исм", oz: "Ism", zh: "姓名" },
  profile_yodla_id: { ru: "Ваш Yodla ID", uz: "Сизнинг Yodla ID", oz: "Sizning Yodla ID", zh: "您的 Yodla ID" },
  profile_phone: { ru: "Телефон", uz: "Телефон", oz: "Telefon", zh: "电话" },
  profile_exam_date: { ru: "Дата экзамена", uz: "Имтиҳон санаси", oz: "Imtihon sanasi", zh: "考试日期" },
  profile_title_rank: { ru: "Отображаемое звание", uz: "Кўрсатиладиган унвон", oz: "Ko'rsatiladigan unvon", zh: "显示称号" },
  profile_language: { ru: "Язык", uz: "Тил", oz: "Til", zh: "语言" },
  profile_change_pwd: { ru: "🔑 Сменить пароль", uz: "🔑 Парольни ўзгартириш", oz: "🔑 Parolni o'zgartirish", zh: "🔑 修改密码" },
  profile_current_pwd: { ru: "Текущий пароль", uz: "Жорий пароль", oz: "Joriy parol", zh: "当前密码" },
  profile_new_pwd: { ru: "Новый пароль", uz: "Янги пароль", oz: "Yangi parol", zh: "新密码" },
  profile_update_pwd: { ru: "Обновить пароль", uz: "Парольни янгилаш", oz: "Parolni yangilash", zh: "更新密码" },
  profile_progress: { ru: "Прогресс", uz: "Тараққиёт", oz: "Taraqqiyot", zh: "进度" },
  profile_stats: { ru: "Статистика обучения", uz: "Ўқиш статистикаси", oz: "O'qish statistikasi", zh: "学习统计" },
  profile_logout: { ru: "🚪 Выйти из аккаунта", uz: "🚪 Аккаунтдан чиқиш", oz: "🚪 Akkauntdan chiqish", zh: "🚪 退出账号" },
  profile_logout_short: { ru: "Выйти", uz: "Чиқиш", oz: "Chiqish", zh: "退出" },
  profile_member_since: { ru: "С нами с", uz: "Биз билан", oz: "Biz bilan", zh: "加入于" },
  profile_saved: { ru: "✓ Сохранено", uz: "✓ Сақланди", oz: "✓ Saqlandi", zh: "✓ 已保存" },
  profile_fill_both: { ru: "Заполните оба поля", uz: "Иккала майдонни тўлдиринг", oz: "Ikkala maydonni to'ldiring", zh: "请填写两个输入框" },
  profile_pwd_changed: { ru: "✓ Пароль изменён", uz: "✓ Пароль ўзгартирилди", oz: "✓ Parol o'zgartirildi", zh: "✓ 密码已修改" },
  profile_net_err: { ru: "Ошибка сети", uz: "Тармоқ хатолиги", oz: "Tarmoq xatoligi", zh: "网络错误" },

  // Поиск
  search_placeholder: { ru: "Поиск по всему...", uz: "Ҳамма жойидан қидириш...", oz: "Hamma joyidan qidirish...", zh: "全局搜索..." },
  search_title: { ru: "Глобальный поиск", uz: "Глобал қидирув", oz: "Global qidiruv", zh: "全局搜索" },
  search_no_results: { ru: "Ничего не найдено", uz: "Ҳеч нарса топилмади", oz: "Hech narsa topilmadi", zh: "未找到结果" },
  search_results: { ru: "результатов", uz: "натижа", oz: "natija", zh: "个结果" },

  // Общие
  back: { ru: "Назад", uz: "Орқага", oz: "Orqaga", zh: "返回" },
  to_videos: { ru: "К видеоурокам", uz: "Видео дарсларга", oz: "Video darslarga", zh: "返回视频" },
  to_training: { ru: "К тренировкам", uz: "Машқларга", oz: "Mashqlarga", zh: "返回练习" },
  total_questions: { ru: "Всего вопросов", uz: "Жами саволлар", oz: "Jami savollar", zh: "题目总数" },
};

// Текущий язык (по умолчанию — из localStorage или 'ru')
let CURRENT_LANG = "ru";
try { const saved = localStorage.getItem("yodla_lang"); if (["ru", "uz", "oz"].includes(saved)) CURRENT_LANG = saved; } catch {}

const SUPPORTED_LANGS = [
  { id: "ru", label: "Русский", flag: "🇷🇺" },
  { id: "uz", label: "Ўзбекча", flag: "🇺🇿" },
  { id: "oz", label: "O'zbekcha", flag: "🇺🇿" },
];

/** Получить перевод ключа для текущего языка. */
function t(key) {
  const entry = I18N[key];
  if (!entry) return key;
  return entry[CURRENT_LANG] || entry.ru || key;
}

/** Сменить язык интерфейса. */
function setLang(lang) {
  if (!SUPPORTED_LANGS.some(l => l.id === lang)) return;
  CURRENT_LANG = lang;
  try { localStorage.setItem("yodla_lang", lang); } catch {}
}

/** Текущий язык. */
function getLang() { return CURRENT_LANG; }
