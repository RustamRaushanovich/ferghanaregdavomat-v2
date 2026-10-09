let schoolIllegalXorijCount = 0;
let currentStep = 1;
let isPro = false;
let deferredPrompt;
const PAGE_SIZE = 50;
let tumanPage = 1;
let absentPage = 1;
let monitorPage = 1;
let parentPage = 1;
const parentLimit = 25;
const monitorLimit = 20;

// Init
document.addEventListener('DOMContentLoaded', async () => {
    const pName = (window.location.pathname.split('/').pop().replace('.html', '') || 'index');
    document.body.classList.add('page-' + pName);
    initThemeAndLang();
    initIntroSplash();
        startQuoteRotation();
    initTelegramWebApp();
    checkAccessTime();
    startLiveClock();
    startCountdown();
    fetchWeather();
    injectTestModeBanner();
    initHolidayGreeting();
    updateProMiniBtn();

    setTimeout(() => {
        const params = new URLSearchParams(window.location.search);
        const t = params.get('tab');
        if (t && typeof showTab === 'function') showTab(t);
    }, 500);


    // Admin Mode Indicator
    if (localStorage.getItem('dashboard_token')) {
        const badge = document.createElement('div');
        badge.innerHTML = '<i class="fas fa-user-shield"></i> Admin Access';
        badge.style.cssText = 'position:fixed; bottom:20px; right:20px; background:linear-gradient(135deg, #6366f1, #8b5cf6); color:white; padding:10px 20px; border-radius:30px; font-size:13px; font-weight:600; z-index:9999; box-shadow:0 10px 25px rgba(99,102,241,0.4); display:flex; align-items:center; gap:8px; border:1px solid rgba(255,255,255,0.2);';
        document.body.appendChild(badge);
    }

    // Load Districts
    const distSelect = document.getElementById('district');
    if (distSelect) {
        try {
            const dRes = await fetch('/api/districts');
            const districts = await dRes.json();
            districts.forEach(d => {
                const opt = document.createElement('option');
                opt.value = opt.textContent = d;
                distSelect.appendChild(opt);
            });
        } catch (e) { console.error("Districts load error:", e); }
    }

    const inputs = document.querySelectorAll('input[type="number"]');
    inputs.forEach(input => {
        input.addEventListener('input', calculateTotals);
    });

    // Navigation Buttons Logic
    document.querySelectorAll('.btn-next').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (btn.getAttribute('type') === 'submit') return;
            e.preventDefault();
            nextStep(currentStep + 1);
        });
    });

    document.querySelectorAll('.btn-prev').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            goToStep(currentStep - 1);
        });
    });

    // PWA Install Logic
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const installBtns = document.querySelectorAll('.install-trigger');
        installBtns.forEach(btn => btn.style.display = 'flex');
    });

    // Load saved info
    const fioInput = document.getElementById('fio');
    const phoneInput = document.getElementById('phone');
    if (fioInput) fioInput.value = localStorage.getItem('d_fio') || '';
    if (phoneInput) {
        phoneInput.value = localStorage.getItem('d_phone') || '';
        if (phoneInput.value) checkProUser();
    }

    // Display User Info
    displayUserInfo();
});


const translations = {
    uz: {
        sidebar_org_title: "Farg‘ona viloyati maktabgacha va maktab ta'limi boshqarmasi",
        president_quote_home: "«Biz yangi O‘zbekistonni barpo etishda faqat va faqat ilmga, ta’limga tayanamiz. Dunyoda ilmdan boshqa najot yo‘q va bo‘lishi ham mumkin emas!»",
        president_author: "— Shavkat Mirziyoyev",
        president_edu_title: "Ta'lim — Millat Najoti va Kelajagi",
        president_edu_quote: "«Maktab – bu faqatgina ta’lim maskani emas, balki jamiyatning ma’naviy poydevori, ertangi kunimizni belgilovchi eng muqaddas dargohdir. O‘qituvchi va murabbiylarning mehnati har qanday e’tirofdan ustundir.»",
        btn_pay_receipt: "To'lov qilish / Chek yuklash",
        btn_submit_receipt: "Chekni Adminlarga Yuborish",

        // Top Header & Nav
        site_title: "DAVOMAT",
        site_sub: "Farg'ona VMMTB",
        nav_login: "Kirish",
        nav_logout: "Chiqish",
        btn_weather: "Farg'ona: ",
        
        // Slidebar Menu
        sec_main: "Asosiy Bo'limlar",
        sec_mgmt: "Boshqaruv & Tizim",
        menu_home: "Bosh Sahifa",
        menu_attendance: "Davomat Kiritish",
        menu_foreign: "Xorij Nazorati",
        menu_inspector: "Inspektor Nazorati",
        menu_dashboard: "Dashboard",
        menu_v_svod: "Viloyat Svod",
        menu_xarita: "Xarita (SVG)",
        menu_t_svod: "Tuman Svod",
        menu_absents: "Sababsizlar",
        menu_monitor: "Jonli Monitor",
        menu_analysis: "Tahlil & Grafika",
        menu_ranking: "MMIBDO‘ Reyting",
        menu_profile: "Profil",
        menu_admin: "Admin Panel",
        menu_oferta: "Ommaviy Oferta",
        menu_docs: "Me'yoriy Hujjatlar",
        menu_about: "Biz Haqimizda",

        // Home Page
        welcome_badge: "✨ Xush kelibsiz! Farg'ona VMMTB Rasmiy Davomat Portali",
        hero_title: "Farg'ona Viloyati Davomat Nazorati",
        hero_desc: "Maktabgacha va maktab ta'limi boshqarmasi tizimidagi o'quvchilar davomatini real vaqt rejimida monitoring qilish va tahlil qilish platformasi.",
        btn_quick_davomat: "Tezkor Davomat Kiritish",

        // Attendance Steps
        step1_title: "Shaxsiy ma'lumotlar",
        step2_title: "Hudud va Maktab",
        step3_title: "Jami ko'rsatkichlar",
        step4_title: "Sababli kelmaganlar",
        step5_title: "Sababsiz kelmaganlar",
        step6_title: "Tasdiqlash",
        label_fio: "F.I.SH (MMIBDO')",
        label_phone: "Telefon raqam",
        label_district: "Tuman / Shahar",
        label_school: "Maktab / Muassasa",
        label_classes: "Sinf soni",
        label_total_students: "Jami o'quvchilar soni",
        btn_next: "Keyingi",
        btn_prev: "Oldingi",
        btn_submit: "Davomatni Tasdiqlash va Yuborish",

        // Dashboard & Tables
        date_label: "Sana",
        district_label: "Tuman / Shahar tanlang",
        tv_mode: "TV-Rejim",
        excel_export: "Excel Yuklash",
        map_title: "Farg'ona Viloyati Interaktiv Xaritasi (19 ta hudud)",
        stat_entries: "Jami kiritilgan",
        stat_schools: "Jami maktablar",
        stat_students: "Jami o'quvchilar",
        stat_rate: "O'rtacha davomat",

        // Footer
        footer_org_name: "Farg'ona viloyati Maktabgacha va maktab ta'limi boshqarmasi",
        footer_org_sub: "Davomat va dars jarayonlarini monitoring qilish yagona hududiy axborot tizimi.",
        footer_org_addr: "Farg'ona sh., Dodxox ko'chasi 2-uy | Tel: +998 (73) 244-XX-XX",
        footer_gov_badge: "UZINFOCOM tomonidan nazoratdan o'tgan",
        footer_gov_desc: "Davlat axborot xavfsizligi talablariga to'liq mos keladi.",
        footer_partner_title: "Rasmiy strategik hamkor: Between Us",
        footer_partner_desc: "Yoshlar va ta'lim texnologiyalari jamoasi",
        footer_copyright: "Barcha huquqlar himoyalangan."
    },

    oz: {
        sidebar_org_title: "Фарғона вилояти мактабгача ва мактаб таълими бошқармаси",
        president_quote_home: "«Биз янги Ўзбекистонни барпо этишда фақат ва фақат илмга, таълимга таянамиз. Дунёда илмдан бошқа нажот йўқ ва бўлиши ҳам мумкин эмас!»",
        president_author: "— Шавкат Мирзиёев",
        president_edu_title: "Таълим — Миллат Нажоти ва Келажаги",
        president_edu_quote: "«Мактаб – бу фақатгина таълим маскани эмас, балки жамиятнинг маънавий пойдевори, эртанги кунимизни белгиловчи энг муқаддас даргоҳдир. Ўқитувчи ва мураббийларнинг меҳнати ҳар қандай эътирофдан устундир.»",
        btn_pay_receipt: "Тўлов қилиш / Чек юклаш",
        btn_submit_receipt: "Чекни Админларга Юбориш",

        // Top Header & Nav
        site_title: "ДАВОМАТ",
        site_sub: "Фарғона ВММТБ",
        nav_login: "Кириш",
        nav_logout: "Чиқиш",
        btn_weather: "Фарғона: ",
        
        // Slidebar Menu
        sec_main: "Асосий Бўлимлар",
        sec_mgmt: "Бошқарув & Тизим",
        menu_home: "Бош Саҳифа",
        menu_attendance: "Давомат Кириcollect",
        menu_foreign: "Хориж Назорати",
        menu_inspector: "Инспектор Назорати",
        menu_dashboard: "Dashboard",
        menu_v_svod: "Вилоят Свод",
        menu_xarita: "Харита (SVG)",
        menu_t_svod: "Туман Свод",
        menu_absents: "Сабабсизлар",
        menu_monitor: "Жонли Монитор",
        menu_analysis: "Таҳлил & Графика",
        menu_ranking: "ММИБДЎ Рейтинг",
        menu_profile: "Профил",
        menu_admin: "Админ Панел",
        menu_oferta: "Оммавий Оферта",
        menu_docs: "Меъёрий Ҳужжатлар",
        menu_about: "Биз Ҳақимизда",

        // Home Page
        welcome_badge: "✨ Хуш келибсиз! Фарғона ВММТБ Расмий Давомат Портали",
        hero_title: "Фарғона Вилояти Давомат Назорати",
        hero_desc: "Мактабгача ва мактаб таълими бошқармаси тизимидаги ўқувчилар давоматини реал вақт режимида мониторинг қилиш ва таҳлил қилиш платформаси.",
        btn_quick_davomat: "Тезкор Давомат Кириcollect",

        // Attendance Steps
        step1_title: "Шахсий маълумотлар",
        step2_title: "Ҳудуд ва Мактаб",
        step3_title: "Жами кўрсаткичлар",
        step4_title: "Сабабли келмаганлар",
        step5_title: "Сабабсиз келмаганлар",
        step6_title: "Тасдиқлаш",
        label_fio: "Ф.И.Ш (ММИБДЎ)",
        label_phone: "Телефон рақам",
        label_district: "Туман / Шаҳар",
        label_school: "Мактаб / Муассаса",
        label_classes: "Синф сони",
        label_total_students: "Жами ўқувчилар сони",
        btn_next: "Кейинги",
        btn_prev: "Олдинги",
        btn_submit: "Давоматни Тасдиқлаш ва Юбориш",

        // Dashboard & Tables
        date_label: "Сана",
        district_label: "Туман / Шаҳар танланг",
        tv_mode: "ТВ-Режим",
        excel_export: "Excel Юклаш",
        map_title: "Фарғона Вилояти Интерактив Харитаси (19 та ҳудуд)",
        stat_entries: "Жами киритилган",
        stat_schools: "Жами мактаблар",
        stat_students: "Жами ўқувчилар",
        stat_rate: "Ўртача давомат",

        // Footer
        footer_org_name: "Фарғона вилояти Мактабгача ва мактаб таълими бошқармаси",
        footer_org_sub: "Давомат ва дарс жараёнларини мониторинг қилиш ягона ҳудудий ахборот тизими.",
        footer_org_addr: "Фарғона ш., Додхох кўчаси 2-уй | Тел: +998 (73) 244-XX-XX",
        footer_gov_badge: "UZINFOCOM томонидан назоратдан ўтган",
        footer_gov_desc: "Давлат ахборот хавфсизлиги талабларига тўлиқ мос келади.",
        footer_partner_title: "Расмий стратегик ҳамкор: Between Us",
        footer_partner_desc: "Ёшлар ва таълим технологиялари жамоаси",
        footer_copyright: "Барча ҳуқуқлар ҳимояланган."
    },

    ru: {
        sidebar_org_title: "Управление дошкольного и школьного образования Ферганской области",
        president_quote_home: "«В строительстве нового Узбекистана мы опираемся исключительно на науку и просвещение. В мире нет и не может быть иного спасения, кроме знаний!»",
        president_author: "— Шавкат Мирзиёев",
        president_edu_title: "Образование — Спасение и Будущее Нации",
        president_edu_quote: "«Школа – это не просто образовательное учреждение, а духовный фундамент общества, священная обитель, определяющая наше завтрашний день. Труд учителей и наставников выше любого признания.»",
        btn_pay_receipt: "Оплата / Загрузить чек",
        btn_submit_receipt: "Отправить чек администраторам",

        // Top Header & Nav
        site_title: "ДАВОМАТ",
        site_sub: "УДШО Ферганы",
        nav_login: "Войти",
        nav_logout: "Выйти",
        btn_weather: "Фергана: ",
        
        // Slidebar Menu
        sec_main: "Основные Разделы",
        sec_mgmt: "Управление и Система",
        menu_home: "Главная Страница",
        menu_attendance: "Ввод Посещаемости",
        menu_foreign: "Контроль Выезда",
        menu_inspector: "Контроль Инспектора",
        menu_dashboard: "Дашборд",
        menu_v_svod: "Областная Сводка",
        menu_xarita: "Карта (SVG)",
        menu_t_svod: "Районная Сводка",
        menu_absents: "Без Причины",
        menu_monitor: "Живой Монитор",
        menu_analysis: "Анализ и Графика",
        menu_ranking: "Рейтинг ЗДВР",
        menu_profile: "Профиль",
        menu_admin: "Панель Админа",
        menu_oferta: "Публичная Оферта",
        menu_docs: "Нормативные Документы",
        menu_about: "О нас",

        // Home Page
        welcome_badge: "✨ Добро пожаловать! Официальный портал посещаемости УДШО Ферганы",
        hero_title: "Контроль Посещаемости Ферганской Области",
        hero_desc: "Единая платформа мониторинга и анализа посещаемости учащихся общеобразовательных школ в режиме реального времени.",
        btn_quick_davomat: "Быстрый Ввод Посещаемости",

        // Attendance Steps
        step1_title: "Личные данные",
        step2_title: "Район и Школа",
        step3_title: "Общие показатели",
        step4_title: "Отсутствующие по причине",
        step5_title: "Отсутствующие без причины",
        step6_title: "Подтверждение",
        label_fio: "Ф.И.О (ЗДВР)",
        label_phone: "Номер телефона",
        label_district: "Район / Город",
        label_school: "Школа / Учреждение",
        label_classes: "Количество классов",
        label_total_students: "Всего учащихся",
        btn_next: "Далее",
        btn_prev: "Назад",
        btn_submit: "Подтвердить и Отправить",

        // Dashboard & Tables
        date_label: "Дата",
        district_label: "Выберите район / город",
        tv_mode: "ТВ-Режим",
        excel_export: "Скачать Excel",
        map_title: "Интерактивная карта Ферганской области (19 районов)",
        stat_entries: "Всего записей",
        stat_schools: "Всего школ",
        stat_students: "Всего учащихся",
        stat_rate: "Средняя посещаемость",

        // Footer
        footer_org_name: "Управление дошкольного и школьного образования Ферганской области",
        footer_org_sub: "Единая региональная информационная система мониторинга посещаемости.",
        footer_org_addr: "г. Фергана, ул. Додхох 2 | Тел: +998 (73) 244-XX-XX",
        footer_gov_badge: "Проверено и одобрено UZINFOCOM",
        footer_gov_desc: "Полное соответствие требованиям информационной безопасности.",
        footer_partner_title: "Официальный партнер: Between Us",
        footer_partner_desc: "Команда образовательных и молодежных технологий",
        footer_copyright: "Все права защищены."
    }
};

// Theme & Language Logic
function initThemeAndLang() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const isLight = (savedTheme === 'light');
    if (isLight) {
        document.documentElement.classList.add('light-mode');
        updateThemeIcons(true);
    } else {
        document.documentElement.classList.remove('light-mode');
        updateThemeIcons(false);
    }
    const savedLang = localStorage.getItem('lang') || 'uz';
    updateLangButtons(savedLang);
    applyTranslations(savedLang);
    updateTopHeaderAuth();

    setTimeout(() => {
        document.querySelectorAll('iframe').forEach(iframe => {
            try {
                iframe.contentWindow.postMessage({ type: 'changeTheme', isLight: isLight }, '*');
                iframe.contentWindow.postMessage({ type: 'changeLang', lang: savedLang }, '*');
                if (window.lastViloyatData) {
                    iframe.contentWindow.postMessage({ type: 'updateStats', data: window.lastViloyatData }, '*');
                }
            } catch(e) {}
        });
    }, 300);
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'mapWidgetReady') {
        const isLight = document.documentElement.classList.contains('light-mode');
        const lang = localStorage.getItem('lang') || 'uz';
        document.querySelectorAll('iframe').forEach(iframe => {
            try {
                iframe.contentWindow.postMessage({ type: 'changeTheme', isLight: isLight }, '*');
                iframe.contentWindow.postMessage({ type: 'changeLang', lang: lang }, '*');
                if (window.lastViloyatData) {
                    iframe.contentWindow.postMessage({ type: 'updateStats', data: window.lastViloyatData }, '*');
                }
            } catch(err) {}
        });
    }
    if (e.data && e.data.type === 'openDistrictStats' && e.data.district) {
        if (typeof openDistrictStats === 'function') {
            openDistrictStats(e.data.district);
        }
    }
});

function updateLangButtons(lang) {
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${lang}'`));
    });
}

function applyTranslations(lang) {
    if (!lang) lang = localStorage.getItem('lang') || 'uz';
    const t = translations[lang] || translations['uz'];
    if (!t) return;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) {
            if (el.tagName === 'INPUT') {
                el.placeholder = t[key];
            } else if (el.tagName === 'BUTTON' && el.hasAttribute('title')) {
                el.title = t[key];
                const icon = el.querySelector('i');
                if (icon) {
                    el.innerHTML = icon.outerHTML + ' ' + t[key];
                } else {
                    el.textContent = t[key];
                }
            } else {
                const icon = el.querySelector('i');
                if (icon) {
                    el.innerHTML = icon.outerHTML + ' ' + t[key];
                } else {
                    el.textContent = t[key];
                }
            }
        }
    });

    // Auto-translate UI elements (headings, buttons, labels, tables) on Admin, Dashboard & Home
    if (typeof autoTranslateUI === 'function') {
        autoTranslateUI(lang);
    }
    // Broadcast language to embedded map iframe
    const mapIframe = document.querySelector('.map-transparent-wrapper iframe');
    if (mapIframe && mapIframe.contentWindow) {
        try {
            mapIframe.contentWindow.postMessage({ type: 'changeLang', lang: lang }, '*');
        } catch(e) {}
    }

    // Update active lang button highlight
    document.querySelectorAll('.lang-btn').forEach(b => {
        const bLang = b.getAttribute('onclick')?.match(/['"]([a-z]+)['"]/)?.[1];
        b.classList.toggle('active', bLang === lang);
    });

    updateTopHeaderAuth();
}

function toggleTheme() {
    document.documentElement.classList.toggle('light-mode');
    const isLight = document.documentElement.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    updateThemeIcons(isLight);
    document.querySelectorAll('iframe').forEach(iframe => {
        try {
            iframe.contentWindow.postMessage({ type: 'changeTheme', isLight: isLight }, '*');
        } catch(e) {}
    });
}

function updateThemeIcons(isLight) {
    const icons = document.querySelectorAll('.theme-toggle-btn i');
    icons.forEach(icon => {
        icon.className = isLight ? 'fas fa-sun' : 'fas fa-moon';
    });
}

function changeLang(lang) {
    localStorage.setItem('lang', lang);
    updateLangButtons(lang);
    applyTranslations(lang);
    updateTopHeaderAuth();
    document.querySelectorAll('iframe').forEach(iframe => {
        try {
            iframe.contentWindow.postMessage({ type: 'changeLang', lang: lang }, '*');
        } catch(e) {}
    });
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
    showToast(translations[lang]?.lang_changed || "Til o'zgartirildi", 'success');
}

async function installApp() {
    if (!deferredPrompt) {
        showToast("Ilova allaqachon o'rnatilgan yoki brauzeringiz buni qo'llab-quvvatlamaydi.", "info");
        return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`Install outcome: ${outcome}`);
    if (outcome === 'accepted') {
        deferredPrompt = null;
        const installBtns = document.querySelectorAll('.install-trigger');
        installBtns.forEach(btn => btn.style.display = 'none');
    }
}

// Global Toast function
window.showToast = window.showToast || function (msg, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'exclamation-circle' : 'info-circle');
    const color = type === 'success' ? '#10b981' : (type === 'error' ? '#ef4444' : '#6366f1');
    toast.style.borderLeftColor = color;
    toast.innerHTML = `<i class="fas fa-${icon}" style="color:${color}"></i> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 4000);
};

// Time & Access Logic
async function checkAccessTime() {
    // 1. Never block if we are on the login, home, or about pages
    const path = window.location.pathname;
    if (path.includes('login.html') || path.includes('index.html') || path.includes('about.html') || path.includes('inspektor.html') || path.includes('admin.html') || path === '/') {
        return;
    }

    // 2. Admins are never blocked
    const role = localStorage.getItem('dashboard_role');
    if (role === 'superadmin') return;

    // Fetch settings to check maintenance mode
    try {
        const res = await fetch('/api/admin/settings');
        const settings = await res.json();
        if (settings.maintenance_mode) {
            showMaintenanceOverlay();
            return;
        }
    } catch (e) { }

    // 3. Only block if the attendance form exists
    if (!document.getElementById('attendanceForm')) return;

    // Faqat agar admin panelda time_lock maxsus yoqilgan bo'lsa cheklanadi
    try {
        const savedSettings = JSON.parse(localStorage.getItem('system_settings') || localStorage.getItem('system_settings_cache') || '{}');
        if (savedSettings.attendance_time_lock === true) {
            if (day === 0) {
                showJokeOverlay("Bugun yakshanba - dam olish kuni! 😴<br>Hatto botlar ham bugun uxlashadi.");
                return;
            }
            if (hour < 8) {
                showJokeOverlay("Hali juda barvaqt-ku! 🥱<br>Soat 08:00 da qayta ochamiz.");
                return;
            } else if (hour >= 16) {
                showJokeOverlay("Vaqt tugadi! 🌙<br>Hamma uy-uyiga tarqalgan mahalda davomat kiritish kechikdi. Ertaga barvaqtroq kiring!");
                return;
            }
        }
    } catch(e) {}
}

function showMaintenanceOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100vh;
        display: flex; flex-direction: column; justify-content: center; align-items: center;
        background: #0f172a; color: white; text-align: center; padding: 2rem;
        font-family: 'Outfit', sans-serif; z-index: 999999;
    `;
    overlay.innerHTML = `
        <div style="background: rgba(255, 255, 255, 0.03); padding: 3rem; border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.1); backdrop-filter: blur(15px); max-width: 500px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
            <i class="fas fa-tools" style="font-size: 5rem; color: #facc15; margin-bottom: 2rem; display: block;"></i>
            <h2 style="margin-bottom: 15px; font-size: 1.8rem; font-weight: 600;">Texnik ishlar olib borilmoqda</h2>
            <p style="color: #94a3b8; margin-bottom: 30px; font-size: 1.1rem; line-height: 1.6;">Tizimda profilaktika ishlari ketayotganligi sababli dashboard vaqtincha yopiq. Iltimos, birozdan so'ng qayta urinib ko'ring.</p>
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <a href="index.html" style="color:white; text-decoration:none; padding:12px 25px; border:1px solid rgba(255,255,255,0.2); border-radius:12px; font-weight:600; transition:0.3s; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-home"></i> Bosh sahifa
                </a>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
}

function showJokeOverlay(msg) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100vh;
        display: flex; flex-direction: column; justify-content: center; align-items: center;
        background: #0f172a; color: white; text-align: center; padding: 2rem;
        font-family: 'Outfit', sans-serif; z-index: 999999;
    `;
    overlay.innerHTML = `
        <div style="background: rgba(255, 255, 255, 0.03); padding: 3rem; border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.1); backdrop-filter: blur(15px); max-width: 500px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
            <i class="fas fa-clock-rotate-left" style="font-size: 5rem; color: #6366f1; margin-bottom: 2rem; display: block;"></i>
            <h2 style="margin-bottom: 15px; font-size: 1.8rem; font-weight: 600;">${msg}</h2>
            <p style="color: #94a3b8; margin-bottom: 30px; font-size: 1.1rem; line-height: 1.6;">Davomat kiritish vaqti 08:00 dan 16:00 gacha belgilangan. Hozirgi vaqtda ma'lumot qabul qilinmaydi.</p>
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <a href="index.html" style="color:white; text-decoration:none; padding:12px 25px; border:1px solid rgba(255,255,255,0.2); border-radius:12px; font-weight:600; transition:0.3s; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-home"></i> Bosh sahifa
                </a>
                <a href="login.html" style="background: #6366f1; color:white; text-decoration:none; padding:12px 25px; border-radius:12px; font-weight:600; box-shadow: 0 10px 20px rgba(99, 102, 241, 0.3); display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-sign-in-alt"></i> Kirish
                </a>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Hide other fixed elements that might bleed through
    const widgets = document.querySelector('.top-widgets-bar');
    if (widgets) widgets.style.display = 'none';
    const navbar = document.querySelector('.navbar');
    if (navbar) navbar.style.display = 'none';

    document.body.style.overflow = 'hidden';
}

function startLiveClock() {
    setInterval(() => {
        const now = new Date();
        const el = document.getElementById('liveClock');
        if (el) {
            const months = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
            const days = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

            const dayName = days[now.getDay()];
            const day = now.getDate();
            const monthName = months[now.getMonth()];

            const dateStr = `${day}-${monthName}, ${dayName}`;
            const timeStr = now.toLocaleTimeString('en-GB'); // 24-hour format

            el.innerHTML = `<span class="clock-date-part" style="font-size:0.85em; margin-right:5px">${dateStr} |</span> <span class="clock-time-part">${timeStr}</span>`;
        }
    }, 1000);
}

function injectTestModeBanner() {
    if (document.getElementById("testModeBanner")) return;
    if (window.location.pathname.includes('login.html')) return; // Do not break login form

    const banner = document.createElement('div');
    banner.id = "testModeBanner";
    banner.className = "app-system-test-banner";
    banner.innerHTML = `
        <span style="margin-right:8px; font-size:15px;">⚠️</span>
        <marquee scrollamount="6" behavior="scroll" direction="left" style="vertical-align: middle;">
            DIQQAT: TIZIM HOZIRDA TEST REJIMIDA ISHLAMOQDA! BARCHA KIRITILGAN MA'LUMOTLAR SINOV TARIQASIDA QABUL QILINADI.
        </marquee>
    `;

    // Insert at bottom of main viewport right above the footer
    const main = document.querySelector('.main-content-wrapper') || document.querySelector('.app-main-viewport') || document.querySelector('.container') || document.body;
    const footer = main.querySelector('.app-compact-footer') || main.querySelector('footer');
    if (footer) {
        main.insertBefore(banner, footer);
    } else {
        main.appendChild(banner);
    }
}

function startCountdown() {
    const timerEl = document.getElementById('submissionTimer');
    const timerText = document.querySelector('.widget-item.countdown'); // Parent for styling
    if (!timerEl) return;

    setInterval(() => {
        const now = new Date();
        const hour = now.getHours();

        // Define opening (08:00) and closing (16:00) times for TODAY
        const openTime = new Date();
        openTime.setHours(8, 0, 0, 0);

        const closeTime = new Date();
        closeTime.setHours(16, 0, 0, 0);

        let diff = 0;
        let prefix = "";
        let color = "";

        if (now < openTime) {
            // Before 08:00 -> Count down to opening
            diff = openTime - now;
            prefix = "Ochilishiga:";
            color = "#facc15"; // Yellow warning
        } else if (now >= openTime && now < closeTime) {
            // Between 08:00 and 16:00 -> Count down to closing
            diff = closeTime - now;
            prefix = "Qolgan vaqt:";
            color = "#10b981"; // Green good to go
        } else {
            // After 16:00 -> Count down to TOMORROW'S opening
            const tomorrowOpen = new Date();
            tomorrowOpen.setDate(tomorrowOpen.getDate() + 1);
            tomorrowOpen.setHours(8, 0, 0, 0);
            diff = tomorrowOpen - now;
            prefix = "Ochilishiga:";
            color = "#f43f5e"; // Red closed
        }

        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);

        timerEl.innerText = `${prefix} ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        
        // Critical Warning Logic (Under 30 mins)
        if (prefix === "Qolgan vaqt:" && h === 0 && m < 60) {
            color = (m < 30) ? "#f43f5e" : "#facc15";
            if (m < 30) {
                timerText.style.transform = 'scale(1.15)';
                timerText.style.fontWeight = '700';
            } else {
                timerText.style.transform = 'scale(1)';
            }
        } else {
            timerText.style.transform = 'scale(1)';
        }

        if (timerText) timerText.style.color = color;
    }, 1000);
}

async function fetchWeather() {
    const el = document.getElementById('weatherWidget');
    if (!el) return;
    try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=40.3833&longitude=71.7833&current_weather=true');
        const data = await res.json();
        const temp = Math.round(data.current_weather.temperature);
        const code = data.current_weather.weathercode;
        let icon = 'fa-sun';
        if (code >= 1 && code <= 3) icon = 'fa-cloud-sun';
        else if (code >= 45) icon = 'fa-smog';
        else if (code >= 51) icon = 'fa-cloud-rain';

        el.innerHTML = `<i class="fas ${icon}"></i> <span>Farg'ona: ${temp > 0 ? '+' : ''}${temp}°C</span>`;
    } catch (e) {
        el.innerHTML = `<i class="fas fa-sun"></i> <span>Farg'ona: +12°C</span>`;
    }
}

async function checkProUser() {
    const phoneInput = document.getElementById('phone');
    const phone = phoneInput ? phoneInput.value.replace(/\D/g, '') : '';
    if (!phone) return;
    try {
        const res = await fetch(`/api/check-pro?phone=${phone}`);
        const data = await res.json();
        isPro = data.is_pro;
        const badge = document.getElementById('premiumBadge');
        if (badge && isPro) badge.classList.remove('hidden');

        // Update Global PRO state if needed
        if (isPro) {
            localStorage.setItem('d_is_pro', 'true');
            localStorage.setItem('d_pro_expire', data.pro_expire_date);
            localStorage.setItem('d_pro_purchase', data.pro_purchase_date);
        }
    } catch (e) { }
}


function nextStep(step) {
    if (!validateStep(currentStep)) return;
    if (currentStep === 1) {
        localStorage.setItem('d_fio', document.getElementById('fio').value);
        localStorage.setItem('d_phone', document.getElementById('phone').value);
    }
    goToStep(step);
}

function goToStep(step) {
    document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`step${step}`);
    if (target) target.classList.add('active');
    updateProgress(step);
    currentStep = step;
    window.scrollTo(0, 0);
}

function updateProgress(step) {
    const bar = document.getElementById('progressBar');
    if (bar) bar.style.width = (step / 6) * 100 + '%';
    document.querySelectorAll('.step').forEach((s) => {
        const sNum = parseInt(s.dataset.step);
        s.classList.toggle('completed', sNum < step);
        s.classList.toggle('active', sNum === step);
    });
}

function validateStep(step) {
    const activeStep = document.getElementById(`step${step}`);
    if (!activeStep) return true;
    const required = activeStep.querySelectorAll('[required]');
    for (let el of required) {
        if (!el.value) {
            el.style.borderColor = '#ef4444';
            el.focus();
            return false;
        }
        el.style.borderColor = 'rgba(255, 255, 255, 0.08)';
    }
    return true;
}

async function loadSchools() {
    const dist = document.getElementById('district').value;
    const schoolSelect = document.getElementById('school');
    const badge = document.getElementById('schoolAccessBadge');
    if (badge) badge.style.display = 'none';
    schoolSelect.innerHTML = '<option value="">Yuklanmoqda...</option>';
    schoolSelect.disabled = true;
    try {
        const response = await fetch(`/api/schools?district=${encodeURIComponent(dist)}`);
        const schools = await response.json();
        console.log('Schools loaded:', schools.length, schools);
        schoolSelect.innerHTML = '<option value="">Maktabni tanlang...</option>';
        schools.forEach(s => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = s;
            schoolSelect.appendChild(opt);
        });
        schoolSelect.disabled = false;
    } catch (e) {
        console.error('School load error:', e);
        schoolSelect.innerHTML = '<option value="">Xatolik</option>';
        schoolSelect.disabled = false;
    }
}

function calculateTotals() {
    let sababliTotal = 0;
    document.querySelectorAll('.sababli').forEach(i => sababliTotal += (parseInt(i.value) || 0));
    const s_total_el = document.getElementById('sababli_total');
    if (s_total_el) s_total_el.value = sababliTotal;

    let sababsizTotal = 0;
    document.querySelectorAll('.sababsiz').forEach(i => sababsizTotal += (parseInt(i.value) || 0));
    const ss_total_el = document.getElementById('sababsiz_total');
    if (ss_total_el) ss_total_el.value = sababsizTotal;

    const total = parseInt(document.getElementById('total_students').value) || 0;
    const jamiKelmagan = sababliTotal + sababsizTotal;
    const percent = total > 0 ? (((total - jamiKelmagan) / total) * 100).toFixed(1) : 0;

    const sum_absent = document.getElementById('sum_absent');
    const sum_percent = document.getElementById('sum_percent');
    if (sum_absent) sum_absent.textContent = jamiKelmagan;
    if (sum_percent) sum_percent.textContent = percent + '%';
}


function processAfterStep5() {
    if (!validateStep(5)) return;
    calculateTotals();
    const sababsiz = parseInt(document.getElementById('sababsiz_total').value) || 0;
    // Validation for file moved to final submit


    const container = document.getElementById('studentInputsContainer');
    const header = document.getElementById('studentDetailsHeader');
    const lang = localStorage.getItem('lang') || 'uz';
    const t = translations[lang] || translations.uz;

    if (sababsiz > 0) {
        header.classList.remove('hidden');
        const msg = t.absents_msg || "Sizda sababsiz kelmagan o‘quvchilar soni {count} nafarni tashkil etadi.";
        document.getElementById('absentInfoMsg').innerHTML = msg.replace('{count}', `<b>${sababsiz}</b>`);
        generateStudentInputs(sababsiz);
    } else {
        header.classList.add('hidden');
        container.innerHTML = `<div class="input-group"><label>${t.label_psixolog || 'Inspektor psixolog'} F.I.SH</label><input type="text" id="inspektor_fio" required></div>`;
    }
    goToStep(6);
}

function generateStudentInputs(count) {
    const container = document.getElementById('studentInputsContainer');
    const lang = localStorage.getItem('lang') || 'uz';
    const t = translations[lang] || translations.uz;
    container.innerHTML = '';

    // 1. Students inputs
    for (let i = 1; i <= count; i++) {
        container.insertAdjacentHTML('beforeend', `
            <div class="stat-card" style="margin-bottom:1.5rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1);">
                <h4 style="color:var(--primary); margin-bottom:1rem; font-size:1rem;"><i class="fas fa-user-graduate"></i> ${i}-o'quvchi</h4>
                <div class="input-grid">
                    <input type="text" class="st-class" placeholder="${t.col_class || 'Sinf'}" required>
                    <input type="text" class="st-fio" placeholder="${t.col_fio || 'F.I.SH'}" required>
                    <input type="text" class="st-address" placeholder="${t.col_address || 'Manzil'}" required>
                    <input type="text" class="st-parent-fio" placeholder="${t.col_parent || 'Ota-ona'}" required>
                    <input type="tel" class="st-parent-phone" placeholder="${t.col_phone_t || 'Telefon'}" required>
                </div>
            </div>
        `);
    }

    // 2. Inspector
    container.insertAdjacentHTML('beforeend', `
        <div class="input-group" style="margin-top:20px;">
            <label style="font-weight:600;"><i class="fas fa-user-shield"></i> ${t.label_psixolog || 'Inspektor psixolog'} F.I.SH</label>
            <input type="text" id="inspektor_fio" placeholder="Masalan: Azizov A." required>
        </div>
    `);

    // 3. Bildirgi Upload Logic (RESTORING THIS FOR EVERYONE)
    let uploadHtml = `
        <div class="stat-card" style="margin-top:25px; border: 2px dashed #f43f5e; background: rgba(244, 63, 94, 0.03); padding: 25px;">
            <h4 style="color:#f43f5e; margin-bottom:15px; display:flex; align-items:center; gap:10px;">
                <i class="fas fa-file-signature"></i> 3-ILOVA (BILDIRISHNOMA) YUKLASH
            </h4>
            <p style="color:#94a3b8; font-size:0.9rem; margin-bottom:20px; line-height:1.5;">
                Sababsiz kelmagan o'quvchilar uchun tasdiqlangan bildirgi (3-ilova) nusxasini yuklash majburiy.
            </p>
            <div class="input-group">
                <input type="file" id="bildirgiFile" accept="image/*,application/pdf" required 
                    style="padding:15px; background:white; color:#1e293b; width:100%; border-radius:12px; border:1px solid #e2e8f0; cursor:pointer;">
            </div>
        </div>
    `;

    if (isPro) {
        uploadHtml += `
            <div class="stat-card" style="margin-top:15px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); padding: 12px;">
                <p style="font-size:0.85rem; color:#10b981; margin:0; display:flex; align-items:center; gap:8px;">
                    <i class="fas fa-magic"></i> <b>PRO:</b> Sizda avtomatik bildirgi yaratish imkoniyati ham bor, lekin bu yerda qo'lda yuklash ham mumkin.
                </p>
            </div>
        `;
    }

    container.insertAdjacentHTML('beforeend', uploadHtml);
}

const form = document.getElementById('attendanceForm');
if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append('district', document.getElementById('district').value);
    formData.append('school', document.getElementById('school').value);
    formData.append('fio', document.getElementById('fio').value);
    formData.append('phone', document.getElementById('phone').value);
    formData.append('classes_count', document.getElementById('classes_count').value);
    formData.append('total_students', document.getElementById('total_students').value);
    formData.append('sababli_total', document.getElementById('sababli_total').value);
    formData.append('sababsiz_total', document.getElementById('sababsiz_total').value);
    formData.append('inspektor_fio', document.getElementById('inspektor_fio').value);

    // Detailed breakdown
    ['sababli_kasal', 'sababli_tadbirlar', 'sababli_oilaviy', 'sababli_ijtimoiy', 'sababli_boshqa',
        'sababsiz_muntazam', 'sababsiz_qidiruv', 'sababsiz_chetel', 'sababsiz_boyin', 'sababsiz_ishlab',
        'sababsiz_qarshilik', 'sababsiz_jazo', 'sababsiz_nazoratsiz', 'sababsiz_turmush', 'sababsiz_boshqa'
    ].forEach(id => {
        const val = document.getElementById(id)?.value || 0;
        formData.append(id, val);
    });

    // Students
    const students = [];
    const classes = document.querySelectorAll('.st-class');
    classes.forEach((c, i) => {
        students.push({
            class: c.value,
            name: document.querySelectorAll('.st-fio')[i].value,
            address: document.querySelectorAll('.st-address')[i].value,
            parent_name: document.querySelectorAll('.st-parent-fio')[i].value,
            parent_phone: document.querySelectorAll('.st-parent-phone')[i].value
        });
    });
    formData.append('absent_students', JSON.stringify(students));

    // File
    const fileInput = document.getElementById('bildirgiFile');
    const sababsizNum = parseInt(document.getElementById('sababsiz_total').value) || 0;

    // Final Validation Checklist
    if (sababsizNum > 0 && !isPro) {
        if (!fileInput || !fileInput.files[0]) {
            alert("Sababsiz kelmagan o'quvchilar mavjud! Iltimos, 3-ilova (bildirishnoma) faylini yuklang.");
            return;
        }
    }

    if (fileInput && fileInput.files[0]) {
        formData.append('bildirgi', fileInput.files[0]);
    }

    try {
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Yuborilmoqda...';
        btn.disabled = true;

        const submitUrl = (window.location.protocol === 'file:') ? 'http://localhost:3000/api/submit' : '/api/submit';
        let res = await fetch(submitUrl, {
            method: 'POST',
            body: formData
        });

        // Handle Duplicate (409)
        if (res.status === 409) {
            const errData = await res.json();
            if (confirm(errData.message || "Diqqat! Bugun uchun ma'lumot allaqachon kiritilgan.\n\nEski ma'lumotni o'chirib, yangisini saqlashni xohlaysizmi?")) {
                formData.append('overwrite', 'true');
                res = await fetch('/api/submit', {
                    method: 'POST',
                    body: formData
                });
            } else {
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }
        }

        if (res.ok) {
            const data = await res.json();
            document.getElementById('successOverlay').classList.remove('hidden');

            // PRO: Show download button if bildirgi was generated
            if (data.bildirgi) {
                const downloadBtn = document.getElementById('downloadBildirgiBtn');
                const proSection = document.getElementById('proDownloadSection');
                if (downloadBtn && proSection) {
                    proSection.classList.remove('hidden');
                    downloadBtn.onclick = () => {
                        window.open(`/api/admin/reports/download/${data.bildirgi}`, '_blank');
                    };
                }
            }
        } else {
            const err = await res.json();
            if (res.status === 402) {
                showPaymentModal(err);
            } else {
                alert('Xatolik: ' + (err.error || 'Server xatosi'));
            }
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    } catch (e) {
        console.error("Attendance submission error:", e);
        const btn = form.querySelector('button[type="submit"]');
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }

        if (window.location.protocol === 'file:') {
            alert("⚠️ DIQQAT: Sayt brauzerda fayl sifatida ochilgan (file:/// protokoli)!\n\n" +
                  "Brauzer xavfsizlik cheklovlari tufayli 'file://' protokoli orqali serverga so'rov yuborib bo'lmaydi.\n\n" +
                  "Davomat ma'lumotlarini bazaga yozish va Telegramga yuborish uchun:\n" +
                  "1. Loyiha papkasidagi 'run.bat' faylini ishga tushiring;\n" +
                  "2. Brauzerda http://localhost:3000/davomat.html manziliga kiring.\n\n" +
                  "(Kiritgan ma'lumotlaringiz xotirada saqlandi)");
        } else {
            alert("Tarmoq xatoligi! Server bilan aloqa o'rnatib bo'lmadi.\nIltimos, internet yoki server holatini tekshiring.");
        }
    }
});

async function checkSchoolSubscription() {
    const distEl = document.getElementById('district');
    const schoolEl = document.getElementById('school');
    const badge = document.getElementById('schoolAccessBadge');
    if (!badge || !distEl || !schoolEl) return;

    const district = distEl.value;
    const school = schoolEl.value;
    if (!district || !school) {
        badge.style.display = 'none';
        return;
    }

    try {
        badge.style.display = 'block';
        badge.style.background = 'rgba(255,255,255,0.05)';
        badge.style.border = '1px solid rgba(255,255,255,0.1)';
        badge.style.color = '#94a3b8';
        badge.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Maktab to\'lov holati tekshirilmoqda...';

        const res = await fetch(`/api/check-school-access?district=${encodeURIComponent(district)}&school=${encodeURIComponent(school)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.hasAccess) {
                badge.style.background = 'rgba(16, 185, 129, 0.15)';
                badge.style.border = '1px solid rgba(16, 185, 129, 0.3)';
                badge.style.color = '#34d399';
                badge.innerHTML = `<i class="fas fa-check-circle"></i> <b>Maktab uchun to'lov faol!</b> (${data.expire_date} gacha ruxsat mavjud. Qayta to'lov talab etilmaydi)`;
            } else {
                badge.style.background = 'rgba(245, 158, 11, 0.12)';
                badge.style.border = '1px solid rgba(245, 158, 11, 0.25)';
                badge.style.color = '#fbbf24';
                badge.innerHTML = `<i class="fas fa-info-circle"></i> Maktab to'lovi kiritilmagan bo'lsa, pastdagi "To'lov qilish / Chek yuklash" tugmasi orqali chek yuborishingiz mumkin (10 000 so'm/oy).`;
            }
        } else {
            badge.style.display = 'none';
        }
    } catch (e) {
        console.error("checkSchoolSubscription error:", e);
        badge.style.display = 'none';
    }
}

function showPaymentModal(data) {
    let modal = document.getElementById('webPaymentModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'webPaymentModal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.85); backdrop-filter:blur(10px); z-index:999999; display:flex; align-items:center; justify-content:center; padding:20px; overflow-y:auto;';
        document.body.appendChild(modal);
    }

    const currentLang = localStorage.getItem('lang') || 'uz';
    const humo = (data && data.cards && data.cards.humo) || '9860 0366 3576 1863';
    const visa = (data && data.cards && data.cards.visa) || '4187 8000 0132 1124';

    const modalTexts = {
        uz: {
            title: "Davomat Kiritish Obunasi",
            desc: (data && data.message) || "Kunlik davomat kiritish 10 000 so'm/oy to'lovli hisoblanadi. Bir kishi to'lasa, butun maktab uchun 1 oy davomida bot va webda cheklovlarsiz ishlaydi!",
            humoLabel: "HUMO Karta: (10 000 so'm / oyiga)",
            visaLabel: "VISA Karta:",
            copyBtn: "Nusxalash",
            copiedHumo: "Humo karta raqami nusxalandi!",
            copiedVisa: "VISA karta raqami nusxalandi!",
            uploadTitle: "Web orqali chekni yuborish:",
            uploadDesc: "To'lov qilganingizdan so'ng chek rasmini (yoki PDF) tanlang. Adminlar tasdiqlashi bilan maktabingiz 1 oyga faollashtiriladi:",
            submitBtn: "Chekni Adminlarga Yuborish",
            tgDesc: "Yoki chekni rasmiy Telegram botimiz orqali ham yuborishingiz mumkin:",
            tgBtn: "Telegram Botga Yuborish",
            closeBtn: "Yopish"
        },
        oz: {
            title: "Давомат Киритиш Обунаси",
            desc: (data && data.message) || "Кунлик давомат киритиш 10 000 сўм/ойига тўловли ҳисобланади. Бир киши тўласа, бутун мактаб учун 1 ой давомида бот ва webда чекловларсиз ишлайди!",
            humoLabel: "HUMO Карта: (10 000 сўм / ойига)",
            visaLabel: "VISA Карта:",
            copyBtn: "Нусхалаш",
            copiedHumo: "Humo карта рақами нусхаланди!",
            copiedVisa: "VISA карта рақами нусхаланди!",
            uploadTitle: "Web орқали чекни юбориш:",
            uploadDesc: "Тўлов қилганингиздан сўнг чек расмини (ёки PDF) танланг. Админлар тасдиқлаши билан мактабингиз 1 ойга фаоллаштирилади:",
            submitBtn: "Чекни Админларга Юбориш",
            tgDesc: "Ёки чекни расмий Телеграм ботимиз орқали ҳам юборишингиз мумкин:",
            tgBtn: "Телеграм Ботга Юбориш",
            closeBtn: "Ёпиш"
        },
        ru: {
            title: "Подписка на ввод посещаемости",
            desc: (data && data.message) || "Ежедневный ввод посещаемости составляет 10 000 сум/месяц. При разовой оплате школа активируется на 1 месяц в боте и на веб-сайте без ограничений!",
            humoLabel: "Карта HUMO: (10 000 сум / месяц)",
            visaLabel: "Карта VISA:",
            copyBtn: "Копировать",
            copiedHumo: "Номер карты Humo скопирован!",
            copiedVisa: "Номер карты VISA скопирован!",
            uploadTitle: "Отправка чека через Web:",
            uploadDesc: "После совершения оплаты выберите фото чека (или PDF). После проверки администратором школа активируется на 1 месяц:",
            submitBtn: "Отправить чек администраторам",
            tgDesc: "Либо отправьте чек через наш официальный Telegram бот:",
            tgBtn: "Отправить через Telegram бот",
            closeBtn: "Закрыть"
        }
    };

    const t = modalTexts[currentLang] || modalTexts.uz;

    modal.innerHTML = `
        <div style="background:#1e293b; border:1px solid rgba(255,255,255,0.15); border-radius:24px; padding:25px; max-width:440px; width:100%; color:#fff; text-align:center; box-shadow:0 20px 40px rgba(0,0,0,0.5); position:relative; font-family:sans-serif; max-height:90vh; overflow-y:auto;">
            <button onclick="document.getElementById('webPaymentModal').style.display='none'" style="position:absolute; top:15px; right:15px; background:none; border:none; color:#94a3b8; font-size:22px; cursor:pointer;">&times;</button>
            
            <div style="width:54px; height:54px; background:linear-gradient(135deg, #fbbf24, #d97706); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 12px; font-size:24px; color:#1e293b;">
                <i class="fas fa-credit-card"></i>
            </div>
            
            <h3 style="margin:0 0 8px; font-size:19px; font-weight:700;">${t.title}</h3>
            <p style="font-size:12.5px; color:#cbd5e1; line-height:1.5; margin-bottom:16px;">${t.desc}</p>

            <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:12px; text-align:left; margin-bottom:14px;">
                <div style="font-size:12px; color:#94a3b8; margin-bottom:5px;">💳 <b>${t.humoLabel}</b></div>
                <div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:8px 12px; border-radius:10px; font-family:monospace; font-size:14px; letter-spacing:1px; color:#fbbf24; font-weight:700;">
                    <span>${humo}</span>
                    <button onclick="navigator.clipboard.writeText('${humo.replace(/\s/g, '')}'); alert('${t.copiedHumo}');" style="background:#0284c7; color:#fff; border:none; border-radius:6px; padding:4px 10px; font-size:11px; cursor:pointer;">${t.copyBtn}</button>
                </div>

                <div style="font-size:12px; color:#94a3b8; margin-top:10px; margin-bottom:5px;">💳 <b>${t.visaLabel}</b></div>
                <div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:8px 12px; border-radius:10px; font-family:monospace; font-size:14px; letter-spacing:1px; color:#fbbf24; font-weight:700;">
                    <span>${visa}</span>
                    <button onclick="navigator.clipboard.writeText('${visa.replace(/\s/g, '')}'); alert('${t.copiedVisa}');" style="background:#0284c7; color:#fff; border:none; border-radius:6px; padding:4px 10px; font-size:11px; cursor:pointer;">${t.copyBtn}</button>
                </div>
            </div>

            <!-- Web Direct Receipt Upload -->
            <div style="background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.25); border-radius:16px; padding:14px; text-align:left; margin-bottom:14px;">
                <div style="font-size:13px; font-weight:700; color:#818cf8; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                    <i class="fas fa-file-upload"></i> ${t.uploadTitle}
                </div>
                <div style="font-size:11.5px; color:#94a3b8; margin-bottom:8px; line-height:1.4;">
                    ${t.uploadDesc}
                </div>
                <input type="file" id="webReceiptFileInput" accept="image/*,application/pdf" style="width:100%; box-sizing:border-box; padding:7px; background:#0f172a; border:1px solid #334155; border-radius:8px; color:#cbd5e1; font-size:11.5px; margin-bottom:8px; cursor:pointer;" />
                <button id="webReceiptSubmitBtn" onclick="submitWebReceipt()" style="width:100%; background:linear-gradient(135deg, #10b981, #059669); color:#fff; border:none; padding:9px; border-radius:9px; font-size:12.5px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                    <i class="fas fa-cloud-upload-alt"></i> ${t.submitBtn}
                </button>
                <div id="webReceiptStatusMsg" style="font-size:11.5px; margin-top:8px; display:none; line-height:1.4;"></div>
            </div>

            <div style="font-size:11.5px; color:#94a3b8; margin-bottom:14px; line-height:1.4;">
                ${t.tgDesc}
            </div>

            <div style="display:flex; gap:10px;">
                <a href="https://t.me/ferghanaregdavomat_bot" target="_blank" style="flex:1; background:linear-gradient(135deg, #0088cc, #229ed9); color:#fff; text-decoration:none; padding:10px; border-radius:10px; font-size:12px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:6px;">
                    <i class="fab fa-telegram-plane"></i> ${t.tgBtn}
                </a>
                <button onclick="document.getElementById('webPaymentModal').style.display='none'" style="background:rgba(255,255,255,0.1); color:#cbd5e1; border:none; padding:10px 16px; border-radius:10px; font-size:12px; cursor:pointer;">
                    ${t.closeBtn}
                </button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
}

async function submitWebReceipt() {
    const fileInput = document.getElementById('webReceiptFileInput');
    const statusMsg = document.getElementById('webReceiptStatusMsg');
    const submitBtn = document.getElementById('webReceiptSubmitBtn');

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert("Iltimos, to'lov cheki faylini (rasm yoki PDF) tanlang!");
        return;
    }

    const file = fileInput.files[0];
    const district = document.getElementById('district') ? document.getElementById('district').value : '';
    const school = document.getElementById('school') ? document.getElementById('school').value : '';
    const phone = document.getElementById('phone') ? document.getElementById('phone').value : '';
    const fio = document.getElementById('fio') ? document.getElementById('fio').value : '';

    const formData = new FormData();
    formData.append('receipt', file);
    formData.append('district', district);
    formData.append('school', school);
    formData.append('phone', phone);
    formData.append('fio', fio);

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Yuklanmoqda...';
    statusMsg.style.display = 'block';
    statusMsg.style.color = '#38bdf8';
    statusMsg.innerText = 'Chek yuklanmoqda va adminlarga yuborilmoqda...';

    try {
        const res = await fetch('/api/upload-receipt', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (res.ok && data.success) {
            statusMsg.style.color = '#10b981';
            statusMsg.innerHTML = '✅ ' + (data.message || "To'lov cheki muvaffaqiyatli qabul qilindi!");
            submitBtn.innerHTML = '✅ Yuborildi';
            setTimeout(() => {
                const modal = document.getElementById('webPaymentModal');
                if (modal) modal.style.display = 'none';
                if (typeof checkSchoolSubscription === 'function') checkSchoolSubscription();
                alert("Chekingiz adminlarga yetkazildi! Adminlar tasdiqlashi bilan maktabingiz 1 oyga faollashtiriladi.");
            }, 2500);
        } else {
            statusMsg.style.color = '#ef4444';
            statusMsg.innerText = '❌ Xatolik: ' + (data.error || 'Yuklashda xatolik yuz berdi');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Qayta urinish';
        }
    } catch (e) {
        statusMsg.style.color = '#ef4444';
        statusMsg.innerText = '❌ Tarmoq xatoligi: ' + e.message;
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Qayta urinish';
    }
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => {
        console.log('SW Registered');
        subscribeToPush(reg);
    });
}

async function subscribeToPush(registration) {
    try {
        const sub = await registration.pushManager.getSubscription();
        if (sub) return; // Already subscribed

        const publicVapidKey = 'BD1ZLasi98wuNKAGl9VBehMVJxAd7_6iB2fJxuK8cWp7NMVljHkDM_cZuqkHo5kpRD1tkHIA6zfihbawpKfvin8';
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
        });

        await fetch('/api/push/subscribe', {
            method: 'POST',
            body: JSON.stringify(subscription),
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('Push Subscribed');
    } catch (e) {
        console.warn('Push registration failed:', e);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}


function displayUserInfo() {
    const userContainer = document.getElementById('userProfileDisplay');
    if (!userContainer) return;

    const token = localStorage.getItem('dashboard_token');
    const role = localStorage.getItem('dashboard_role');
    const district = localStorage.getItem('dashboard_district');

    // Helper to shorten name: "Turdiyev Rustam Raushanovich" -> "R.R.Turdiyev"
    const shorten = (name) => {
        if (!name) return '';
        const p = name.replace('qirol ', '').trim().split(/\s+/);
        if (p.length < 2) return name;
        const fam = p[0];
        const ism = p[1];
        const sharif = p[2];
        if (sharif) return `${ism[0]}.${sharif[0]}.${fam}`;
        return `${ism[0]}.${fam}`;
    };

    // Update login buttons
    const loginBtns = document.querySelectorAll('.login-btn, .login-mini-btn, .nav-link[onclick*="login.html"], [data-i18n="nav_login"]');
    const lang = localStorage.getItem('lang') || 'uz';
    const t_logout = translations[lang]?.nav_logout || 'Chiqish';
    const t_login = translations[lang]?.nav_login || 'Kirish';

    loginBtns.forEach(btn => {
        if (token) {
            btn.innerHTML = `<i class="fas fa-sign-out-alt"></i> ${t_logout}`;
            btn.setAttribute('onclick', 'logout()');
            // Style adjust for logout state
            if (btn.classList.contains('login-btn')) {
                btn.classList.add('logout-mode');
                btn.style.background = 'rgba(239, 68, 68, 0.1)';
                btn.style.color = '#f87171';
                btn.style.border = '1px solid rgba(239, 68, 68, 0.2)';
            }
        } else {
            btn.innerHTML = `<i class="fas fa-sign-in-alt"></i> ${t_login}`;
            btn.setAttribute('onclick', "location.href='login.html'");
            btn.classList.remove('logout-mode');
            btn.style.background = '';
            btn.style.color = '';
            btn.style.border = '';
        }
    });

    if (!token) {
        userContainer.innerHTML = `
            <a href="login.html" class="btn" style="padding: 6px 14px; font-size: 0.82rem; border-radius: 20px; text-decoration: none; background: rgba(99, 102, 241, 0.2); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.4); display: inline-flex; align-items: center; gap: 6px; font-weight: 600;">
                <i class="fas fa-sign-in-alt"></i> Kirish
            </a>
        `;
        return;
    }

    // Hide Main Login Button if logged in (since we have profile)
    // But wait, the previous code converted the Login Button to Logout.
    // User wants "R.R.Turdiyev" display.
    // I will show Profile Badge AND Logout button? Or Profile Badge IS the menu?
    // Let's keep Profile Badge on left of Logout button.

    let displayName = "Foydalanuvchi";
    let displayRole = role || "Foydalanuvchi";

    if (role === 'superadmin') {
        displayName = "R.R.Turdiyev";
        displayRole = "Superadmin";
    } else if (district) {
        const names = {
            "Marg‘ilon shahar": "Kodirov Abdullajon",
            "Farg‘ona shahar": "Teshaboev Boburjon",
            "Quvasoy shahar": "Qurbonov Ulug‘bek",
            "Qo‘qon shahar": "Alieva Laziza",
            "Bag‘dod tumani": "Isaboeva Elmira",
            "Beshariq tumani": "Po‘latov Dilshodjon",
            "Buvayda tumani": "Axmadjonov Aliyorbek",
            "Dang‘ara tumani": "Miraminov Abdulaziz",
            "Yozyovon tumani": "Usmonov Shoxrux",
            "Oltiariq tumani": "Latipov Zoxidjon",
            "Qo‘shtepa tumani": "Ergasheva Mamlakatxon",
            "Rishton tumani": "Raximov Abdumutal",
            "So‘x tumani": "Ibragimov Gulshan",
            "Toshloq tumani": "Ibragimov Ergashali",
            "Uchko‘prik tumani": "Yunusova Marg‘uba",
            "Farg‘ona tumani": "Raximova Mahliyoxon",
            "Furqat tumani": "Mirzaev Mirzaxamdamjon",
            "O‘zbekiston tumani": "Ochildieva Gulmiraxon",
            "Quva tumani": "Xolikov Jaxongir"
        };
        const raw = names[district] || district;
        displayName = shorten(raw);
    }

    userContainer.innerHTML = `
        <div class="user-badge ${role}" style="display:flex; align-items:center; gap:8px; padding:4px 12px; background:rgba(255,255,255,0.06); border-radius:30px; border:1px solid rgba(255,255,255,0.12);">
            <div style="width:30px; height:30px; background:linear-gradient(135deg, #6366f1, #a855f7); border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; font-size:0.85rem;">
                ${displayName[0]}
            </div>
            <div class="user-details" style="display:flex; flex-direction:column; text-align:left;">
                <span class="user-name" style="font-size:0.85rem; font-weight:600; color:var(--text-main); line-height:1.2;">${displayName}</span>
                <span class="user-role" style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase;">${displayRole}</span>
            </div>
            <button onclick="logout()" title="Tizimdan chiqish" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; border-radius: 50%; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; margin-left: 4px; transition: 0.2s;" onmouseover="this.style.background='#ef4444'; this.style.color='white';" onmouseout="this.style.background='rgba(239, 68, 68, 0.2)'; this.style.color='#f87171';">
                <i class="fas fa-sign-out-alt" style="font-size: 0.75rem;"></i>
            </button>
        </div>
    `;

    const elements = {
        'profile_fish': displayName,
        'profile_role': displayRole,
        'nav_user_fish': displayName
    };

    Object.entries(elements).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    });

    // Hide PRO card if already Superadmin or Pro logic
    const proCard = document.getElementById('proSubCard');
    const proDetails = document.getElementById('proDetails');
    const isProStored = localStorage.getItem('d_is_pro') === 'true';
    const isActuallyPro = role === 'superadmin' || isPro || isProStored;

    if (isActuallyPro) {
        if (proCard) proCard.style.display = 'none';
        if (role === 'school') {
            document.getElementById('schoolProInsights')?.classList.remove('hidden');
        }
        if (proDetails && role !== 'superadmin') {
            proDetails.style.display = 'block';
            const expire = localStorage.getItem('d_pro_expire') || localStorage.getItem('d_access_expire');
            const purchase = localStorage.getItem('d_pro_purchase');

            const pdEl = document.getElementById('proPurchaseDate');
            if (pdEl) pdEl.textContent = purchase || '-';

            const peEl = document.getElementById('proExpireDate');
            if (peEl) peEl.textContent = expire || '-';

            // Calculate days left
            if (expire) {
                const diff = new Date(expire) - new Date();
                const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
                const daysEl = document.getElementById('proDaysLeft');
                if (daysEl) {
                    daysEl.textContent = days > 0 ? `${days} kun qoldi` : "Muddati tugagan";
                    if (days <= 0) daysEl.style.background = '#ef4444';
                }
            }
        }
    } else {
        if (proCard) proCard.style.display = 'block';
        if (proDetails) proDetails.style.display = 'none';
        document.getElementById('schoolProInsights')?.classList.add('hidden');
    }

    // Load dynamic subscription badge from server
    loadSubscriptionBadge();

    // Admin Link Logic
    const adminTab = document.getElementById('tab_admin');

    if (role === 'superadmin') {
        if (adminTab) adminTab.style.display = 'flex';
        // If there's a nav-right, let's add it there too
        const navRight = document.querySelector('.nav-right');
        if (navRight && !navRight.querySelector('a[href="admin.html"]')) {
            const a = document.createElement('a');
            a.href = 'admin.html';
            a.className = 'nav-link';
            a.style.color = '#10b981';
            a.style.fontWeight = 'bold';
            a.innerHTML = '<i class="fas fa-user-shield"></i> Admin';
            navRight.insertBefore(a, navRight.querySelector('a[href="/about.html"]'));
        }
    } else {
        if (adminTab) adminTab.style.display = 'none';
    }

    updateProMiniBtn(isActuallyPro);
}

async function loadSubscriptionBadge() {
    try {
        const token = localStorage.getItem('dashboard_token');
        const role = localStorage.getItem('dashboard_role');
        const phone = localStorage.getItem('dashboard_phone') || '';
        
        let url = '/api/user/subscription';
        if (phone) url += `?phone=${encodeURIComponent(phone)}`;
        
        const headers = token ? { 'Authorization': token } : {};
        const res = await fetch(url, { headers });
        if (!res.ok) return;
        const sub = await res.json();
        
        if (sub.is_pro) localStorage.setItem('d_is_pro', 'true');
        if (sub.pro_expire_date) localStorage.setItem('d_pro_expire', sub.pro_expire_date);
        if (sub.access_expire_date) localStorage.setItem('d_access_expire', sub.access_expire_date);
        if (sub.has_access) localStorage.setItem('d_has_access', 'true');
        
        renderUserSubBadge(sub, role);
    } catch(e) {
        console.warn("loadSubscriptionBadge error:", e.message);
    }
}

function renderUserSubBadge(sub, role) {
    const container = document.getElementById('userSubBadgeContainer');
    if (!container) return;

    if (role === 'superadmin') {
        container.innerHTML = `
            <span class="sub-status-badge badge-pro" title="Superadmin: To'liq ruxsat">
                <i class="fas fa-crown"></i> SUPERADMIN
            </span>
        `;
        return;
    }

    const now = new Date();
    if (sub.is_pro && sub.pro_expire_date && new Date(sub.pro_expire_date) > now) {
        const days = sub.days_left !== undefined ? sub.days_left : Math.max(0, Math.ceil((new Date(sub.pro_expire_date) - now) / (1000 * 60 * 60 * 24)));
        container.innerHTML = `
            <span class="sub-status-badge badge-pro" onclick="showTab('profile')" title="PRO status: ${sub.pro_expire_date} gacha faol">
                <i class="fas fa-crown"></i> PRO: ⏳ ${days} kun
            </span>
        `;
    } else if (sub.has_access && sub.access_expire_date && new Date(sub.access_expire_date) > now) {
        const days = sub.days_left !== undefined ? sub.days_left : Math.max(0, Math.ceil((new Date(sub.access_expire_date) - now) / (1000 * 60 * 60 * 24)));
        container.innerHTML = `
            <span class="sub-status-badge badge-standard" onclick="showTab('profile')" title="Standart davomat: ${sub.access_expire_date} gacha faol">
                <i class="fas fa-check-circle"></i> Standart: ⏳ ${days} kun
            </span>
        `;
    } else if (sub.access_expire_date || sub.pro_expire_date) {
        container.innerHTML = `
            <span class="sub-status-badge badge-expired" onclick="showTab('profile')" title="Obunani yangilang">
                <i class="fas fa-exclamation-triangle"></i> Obuna tugagan
            </span>
        `;
    } else {
        container.innerHTML = `
            <span class="sub-status-badge badge-inactive" onclick="showTab('profile')" title="Davomat uchun obuna talab etiladi">
                <i class="fas fa-clock"></i> Obuna: Noaktiv
            </span>
        `;
    }

    // Also update Profile card
    const proDetails = document.getElementById('proDetails');
    if (proDetails) {
        if (sub.is_pro || sub.has_access || sub.access_expire_date || sub.pro_expire_date) {
            proDetails.style.display = 'block';
            const daysEl = document.getElementById('proDaysLeft');
            const expEl = document.getElementById('proExpireDate');
            const purEl = document.getElementById('proPurchaseDate');
            const titleEl = document.getElementById('subStatusTitle');

            if (titleEl) {
                titleEl.innerHTML = sub.is_pro ? '<i class="fas fa-crown"></i> PRO STATUS' : '<i class="fas fa-check-circle"></i> STANDART DAVOMAT';
            }
            if (expEl) expEl.textContent = sub.pro_expire_date || sub.access_expire_date || '-';
            if (purEl) purEl.textContent = sub.purchase_date || '-';
            if (daysEl) {
                if (sub.days_left > 0) {
                    daysEl.textContent = `${sub.days_left} kun qoldi`;
                    daysEl.style.background = '#10b981';
                } else {
                    daysEl.textContent = "Muddati tugagan";
                    daysEl.style.background = '#ef4444';
                }
            }
        }
    }
}

const UZ_HOLIDAYS = {
    "01-01": { uz: "Yangi yil bayrami bilan tabriklaymiz! 🎉", ru: "C Новым годом! 🎉" },
    "14-01": { uz: "Vatan himoyachilari kuni muborak bo'lsin! 🛡️", ru: "С Днем защитников Родины! 🛡️" },
    "08-03": { uz: "Xalqaro xotin-qizlar kuni muborak bo'lsin! 🌷", ru: "С Международным женским днем! 🌷" },
    "21-03": { uz: "Navro'z ayyomingiz muborak bo'lsin! 🌱", ru: "С праздником Навru'z! 🌱" },
    "09-05": { uz: "Xotira va qadrlash kuni. 🕯️", ru: "День памяти и почестей. 🕯️" },
    "01-06": { uz: "Bolalarni himoya qilish kuni! 🎈", ru: "День защиты детей! 🎈" },
    "01-09": { uz: "Mustaqillik kuni muborak bo'lsin! 🇺🇿", ru: "С Днем независимости! 🇺🇿" },
    "01-10": { uz: "O'qituvchi va murabbiylar kuni muborak bo'lsin! 📚", ru: "С Днем учителей и наставников! 📚" },
    "21-10": { uz: "O'zbek tili bayrami kuni muborak bo'lsin! 🗣️", ru: "С Днем uzbekskogo yazyka! 🗣️" },
    "18-11": { uz: "Davlat bayrog'i qabul qilingan kun! 🇺🇿", ru: "День принятия Государственного флага! 🇺🇿" },
    "08-12": { uz: "Konstitutsiya kuni muborak bo'lsin! 📜", ru: "С Днем Konstitutsii! 📜" }
};

function initHolidayGreeting() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const key = `${day}-${month}`;

    if (UZ_HOLIDAYS[key]) {
        const lang = localStorage.getItem('lang') || 'uz';
        const msg = UZ_HOLIDAYS[key][lang] || UZ_HOLIDAYS[key].uz;
        const container = document.getElementById('holidayGreeting');
        const textEl = document.getElementById('holidayText');
        if (container && textEl) {
            textEl.textContent = msg;
            container.style.display = 'flex';
        }
    }
}

function updateProMiniBtn(isActuallyPro = null) {
    if (isActuallyPro === null) {
        const role = localStorage.getItem('dashboard_role');
        const isProStored = localStorage.getItem('d_is_pro') === 'true';
        isActuallyPro = role === 'superadmin' || isProStored;
    }

    const btn = document.getElementById('proMiniBtn');
    if (btn) {
        btn.style.display = isActuallyPro ? 'none' : 'flex';
    }
}

function subscribePro() {
    window.location.href = 'pro.html';
}

function downloadArchiveReport() {
    const date = document.getElementById('archiveReportDate').value;
    if (!date) return alert("Iltimos, sanani tanlang!");
    const token = localStorage.getItem('dashboard_token');
    window.location.href = `/api/export/archive?date=${date}&token=${token}`;
}

function downloadWeeklyReport() {
    const date = document.getElementById('archiveReportDate').value || new Date().toISOString().split('T')[0];
    const token = localStorage.getItem('dashboard_token');
    window.location.href = `/api/export/weekly?date=${date}&token=${token}`;
}

function downloadMonthlyReport() {
    const date = document.getElementById('archiveReportDate').value || new Date().toISOString().split('T')[0];
    const token = localStorage.getItem('dashboard_token');
    window.location.href = `/api/export/monthly?date=${date}&token=${token}`;
}



function logout() {
    if (confirm("Haqiqatan ham hisobingizdan chiqmoqchimisiz?")) {
        localStorage.removeItem('dashboard_token');
        localStorage.removeItem('dashboard_role');
        localStorage.removeItem('dashboard_username');
        localStorage.removeItem('dashboard_district');
        localStorage.removeItem('dashboard_school');
        localStorage.removeItem('dashboard_fio');
        localStorage.removeItem('dashboard_phone');
        localStorage.removeItem('token');
        sessionStorage.removeItem('dashboard_token');
        sessionStorage.removeItem('dashboard_role');
        sessionStorage.removeItem('dashboard_username');
        window.location.href = 'login.html';
    }
}
window.logout = logout;
window.siteLogout = logout;

/* DASHBOARD LOGIC START */
const API_BASE = (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '3000'))
    ? 'http://localhost:3000/api'
    : '/api';

function getAuthHeaders() {
    const token = localStorage.getItem('dashboard_token') || localStorage.getItem('token') || sessionStorage.getItem('dashboard_token') || 'test-token';
    return { 'Authorization': token, 'Content-Type': 'application/json' };
}

async function apiFetch(url, options = {}) {
    try {
        if (!url.startsWith('http')) {
            const hostPort = window.location.port;
            const isLocalBackend = hostPort === '3000';
            const prefix = (window.location.protocol === 'file:' || !isLocalBackend) ? 'http://localhost:3000' : '';
            url = prefix + (url.startsWith('/') ? url : '/' + url);
        }
        const headers = getAuthHeaders();
        const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
        if (res.status === 401) {
            console.warn("apiFetch 401 Unauthorized for:", url);
            return { error: "Avtorizatsiya talab etiladi" };
        }
        if (!res.ok) {
            return { error: `Server xatosi: ${res.status}` };
        }
        return await res.json();
    } catch (e) {
        console.warn("apiFetch connection error:", e.message);
        return { error: e.message };
    }
}

function showTab(tabId) {
    document.querySelectorAll('.report-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.sidebar-sub-item').forEach(b => b.classList.remove('active'));

    const view = document.getElementById(tabId + 'View');
    const btn = document.getElementById('tab_' + tabId);

    if (view) view.classList.add('active');
    if (btn) btn.classList.add('active');

    document.querySelectorAll('.sidebar-sub-item').forEach(item => {
        if (item.getAttribute('onclick') && item.getAttribute('onclick').includes(`'${tabId}'`)) {
            item.classList.add('active');
        }
    });

    if (tabId === 'viloyat') loadViloyatData();
    if (tabId === 'tuman') loadTumanData();
    if (tabId === 'students') loadAbsentDetails();
    if (tabId === 'recent') loadRecentActivity();
    if (tabId === 'parents') { loadParentFilters(); loadParentList(1); }
    if (tabId === 'analysis') loadAnalysisData();
    if (tabId === 'ranking') showLeaderboard();
    if (tabId === 'profile') displayUserInfo();
    if (tabId === 'admin') loadAdminData();
    if (tabId === 'inspector') loadInspectorData();
    if (tabId === 'reports' && !document.getElementById('archiveReportDate').value) {
        document.getElementById('archiveReportDate').value = new Date().toISOString().split('T')[0];
    }
}

async function showLeaderboard() {
    const container = document.getElementById('rankingContent');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:50px;"><i class="fas fa-spinner fa-spin fa-3x"></i><br>Reyting hisoblanmoqda...</div>';

    try {
        const res = await fetch('/api/premium/leaderboard', { headers: getAuthHeaders() });
        const data = await res.json();

        let html = `
            <div class="leaderboard-grid">
                <style>
                    .leaderboard-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                    .leaderboard-card { background: rgba(255,255,255,0.05); border-radius: 20px; padding: 25px; border: 1px solid rgba(255,255,255,0.1); }
                    .ranking-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                    .ranking-table th { text-align: left; opacity: 0.6; font-size: 0.8rem; padding: 10px; }
                    .ranking-table td { padding: 12px 10px; border-bottom: 1px solid rgba(255,255,255,0.05); }
                    .top-rank { background: rgba(99, 102, 241, 0.1); }
                    .badge-percent { background: #6366f1; color: white; padding: 4px 8px; border-radius: 8px; font-weight: bold; font-size: 0.85rem; }
                    .winner-item { display: flex; justify-content: space-between; align-items: center; padding: 15px; background: rgba(255,255,255,0.03); border-radius: 12px; margin-bottom: 10px; }
                    .winner-info { display: flex; flex-direction: column; }
                    .dist-name { font-size: 0.75rem; opacity: 0.6; }
                    .winner-percent { color: #10b981; font-weight: bold; }
                    @media (max-width: 900px) { .leaderboard-grid { grid-template-columns: 1fr; } }
                </style>
                <div class="leaderboard-card">
                    <h3>🏆 Viloyat bo'yicha TOP-10 maktablar</h3>
                    <p class="subtitle">Oxirgi 7 kunlik o'rtacha davomat ko'rsatkichi asosida</p>
                    <table class="ranking-table">
                        <thead>
                            <tr><th>№</th><th>Maktab</th><th>Hudud</th><th>O'rtacha %</th></tr>
                        </thead>
                        <tbody>
                            ${data.viloyat.map((s, i) => `
                                <tr class="${i < 3 ? 'top-rank' : ''}">
                                    <td>${i + 1}</td>
                                    <td><b>${s.school}</b></td>
                                    <td>${s.district}</td>
                                    <td><span class="badge-percent">${parseFloat(s.avg_p).toFixed(1)}%</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div class="leaderboard-card">
                    <h3>📈 Hududiy yetakchilar</h3>
                    <p class="subtitle">Har bir tumandan 1-o'rindagi maktablar</p>
                    <div class="district-winners" style="max-height: 600px; overflow-y: auto;">
                        ${data.districts.map(d => `
                            <div class="winner-item">
                                <div class="winner-info">
                                    <span class="dist-name">${d.district}</span>
                                    <span class="school-name"><b>${d.school}</b></span>
                                </div>
                                <span class="winner-percent">${parseFloat(d.avg_p).toFixed(1)}%</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div class="error-msg">❌ Reytingni yuklashda xatolik yuz berdi.</div>';
    }
}

async function loadParentFilters() {
    try {
        const res = await fetch('/api/stats/parents', { headers: getAuthHeaders() });
        const data = await res.json();

        // Populate filters
        const dSelect = document.getElementById('parentDistrictFilter');
        const sSelect = document.getElementById('parentSchoolFilter');
        if (dSelect && sSelect) {
            const districts = [...new Set(data.map(p => p.district))].sort();
            const schools = [...new Set(data.map(p => p.school))].sort();

            if (dSelect.options.length <= 1) {
                districts.forEach(d => { if (d !== '-') dSelect.innerHTML += `<option value="${d}">${d}</option>`; });
            }
            if (sSelect.options.length <= 1) {
                schools.forEach(s => { if (s !== '-') sSelect.innerHTML += `<option value="${s}">${s}</option>`; });
            }
        }

        // Add search input if it doesn't exist
        const filterControls = document.querySelector('#parentsView .controls');
        if (filterControls && !document.getElementById('parentSearch')) {
            const searchGrp = document.createElement('div');
            searchGrp.className = 'filter-group';
            searchGrp.innerHTML = `
                <label>Qidirish (F.I.SH / Tel)</label>
                <input type="text" id="parentSearch" placeholder="Ism yoki tel..." oninput="loadParentList(1)" style="min-width:200px; padding:12px 20px;">
            `;
            filterControls.appendChild(searchGrp);
        }

        return data;
    } catch (e) { console.error(e); return []; }
}

async function loadParentList(page = 1) {
    parentPage = page;
    const dFilter = document.getElementById('parentDistrictFilter') ? document.getElementById('parentDistrictFilter').value : '';
    const sFilter = document.getElementById('parentSchoolFilter') ? document.getElementById('parentSchoolFilter').value : '';
    const qFilter = document.getElementById('parentSearch') ? document.getElementById('parentSearch').value.toLowerCase() : '';

    const tbody = document.querySelector('#parentsTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center"><i class="fas fa-spinner fa-spin"></i> Yuklanmoqda...</td></tr>';

    try {
        const res = await fetch('/api/stats/parents', { headers: getAuthHeaders() });
        let data = await res.json();

        // Update Stats (only once or for the whole dataset)
        const totalEl = document.getElementById('parent_total_count');
        const topDistEl = document.getElementById('parent_top_district');

        if (totalEl) totalEl.textContent = data.length;

        if (topDistEl) {
            const distStats = {};
            data.forEach(p => { if (p.district !== '-') distStats[p.district] = (distStats[p.district] || 0) + 1; });
            const topD = Object.entries(distStats).sort((a, b) => b[1] - a[1])[0];
            topDistEl.textContent = topD ? topD[0] : '-';
        }

        // Filter
        if (dFilter) data = data.filter(p => p.district === dFilter);
        if (sFilter) data = data.filter(p => p.school === sFilter);
        if (qFilter) {
            data = data.filter(p =>
                (p.fio || '').toLowerCase().includes(qFilter) ||
                (p.phone || '').toString().includes(qFilter) ||
                (p.child_name || '').toLowerCase().includes(qFilter)
            );
        }

        const totalItems = data.length;
        const offset = (page - 1) * parentLimit;
        const pageData = data.slice(offset, offset + parentLimit);

        tbody.innerHTML = '';
        if (pageData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Ma\'lumot topilmadi</td></tr>';
            renderPagination('parentPagination', totalItems, page, parentLimit, 'loadParentList');
            return;
        }

        const role = localStorage.getItem('dashboard_role');
        const isSuper = role === 'superadmin';

        pageData.forEach(p => {
            const phoneStr = (p.phone || '').toString();
            const maskedPhone = isSuper ? phoneStr :
                (phoneStr.length > 7 ? phoneStr.substring(0, 6) + '***' + phoneStr.substring(phoneStr.length - 2) : '***');

            const fio = p.fio || '-';
            const maskedFio = isSuper ? fio : fio.split(' ').map((n, i) => i === 0 ? n : '***').join(' ');

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${maskedFio}</b></td>
                <td style="color:#818cf8">${maskedPhone}</td>
                <td>${p.district || '-'}</td>
                <td>${p.school || '-'}</td>
                <td style="font-size:11px; color:#94a3b8">${p.joined_at || '-'}</td>
            `;
            tbody.appendChild(tr);
        });

        renderPagination('parentPagination', totalItems, page, parentLimit, 'loadParentList');
    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red">Xatolik: ${e.message}</td></tr>`;
    }
}

// Alias for compatibility if showTab calls loadParentStats
const loadParentStats = loadParentList;

function safeSetText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

async function loadInspectorData() {
    const role = localStorage.getItem('dashboard_role');

    // Check if the user is explicitly set as 'inspektor_psixolog' from backend
    if (role === 'inspektor_psixolog') {
        const assigned = JSON.parse(localStorage.getItem('dashboard_assigned_schools') || '[]');
        const district = localStorage.getItem('dashboard_district');
        if (!district || assigned.length === 0) {
            document.getElementById('inspectorSetup').style.display = 'block';
            document.getElementById('inspectorDashboard').style.display = 'none';
            openInspectorSetup();
        } else {
            document.getElementById('inspectorSetup').style.display = 'none';
            document.getElementById('inspectorDashboard').style.display = 'block';
            loadInspectorDash();
        }
    } else {
        // Local setup for any user to act as an inspector
        const myDist = localStorage.getItem('ins_my_district');
        const mySchools = JSON.parse(localStorage.getItem('ins_my_schools') || '[]');

        if (!myDist || mySchools.length === 0) {
            document.getElementById('inspectorSetup').style.display = 'block';
            document.getElementById('inspectorDashboard').style.display = 'none';
            openInspectorSetup();
        } else {
            document.getElementById('inspectorSetup').style.display = 'none';
            document.getElementById('inspectorDashboard').style.display = 'block';
            loadInspectorDash();
        }
    }
}

async function openInspectorSetup() {
    document.getElementById('inspectorSetup').style.display = 'block';
    document.getElementById('inspectorDashboard').style.display = 'none';

    const distSelect = document.getElementById('insSetupDistrict');
    distSelect.innerHTML = '<option value="">Tanlang...</option>';
    DISTRICTS_LIST.forEach(d => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = d;
        distSelect.appendChild(opt);
    });

    const role = localStorage.getItem('dashboard_role');
    const backendDist = localStorage.getItem('dashboard_district');
    const myDist = localStorage.getItem('ins_my_district') || backendDist;

    if (myDist) {
        distSelect.value = myDist;
        if (role === 'inspektor_psixolog') distSelect.disabled = true;
        inspektorDistrictChanged();
    }
}

async function inspektorDistrictChanged() {
    const dist = document.getElementById('insSetupDistrict').value;
    const listDiv = document.getElementById('insSetupSchoolsList');
    if (!dist) {
        listDiv.innerHTML = '<span style="color:#94a3b8; font-size:0.9rem;">Avval hududni tanlang</span>';
        return;
    }
    listDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Yuklanmoqda...';
    try {
        const res = await fetch(`/api/schools?district=${encodeURIComponent(dist)}`);
        const schools = await res.json();
        listDiv.innerHTML = '';

        const role = localStorage.getItem('dashboard_role');
        let savedSchools = [];
        if (role === 'inspektor_psixolog') {
            savedSchools = JSON.parse(localStorage.getItem('dashboard_assigned_schools') || '[]');
        } else {
            savedSchools = JSON.parse(localStorage.getItem('ins_my_schools') || '[]');
        }

        schools.forEach((s, idx) => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.gap = '10px';
            label.style.color = '#e2e8f0';
            label.style.cursor = 'pointer';
            label.style.alignItems = 'center';
            label.style.padding = '5px';
            label.style.borderRadius = '5px';

            const isChecked = savedSchools.includes(s) ? 'checked' : '';
            if (isChecked) label.style.background = 'rgba(99, 102, 241, 0.2)';

            let disabled = '';
            if (role === 'inspektor_psixolog') disabled = 'disabled'; // From backend only

            label.innerHTML = `<input type="checkbox" value="${s.replace(/"/g, '&quot;')}" class="ins-school-cb" ${isChecked} ${disabled}> <span>${s}</span>`;

            if (!disabled) {
                label.querySelector('input').addEventListener('change', (e) => {
                    const checkedCount = document.querySelectorAll('.ins-school-cb:checked').length;
                    if (checkedCount > 10) {
                        e.target.checked = false;
                        alert("Maksimum 10 ta maktab tanlash mumkin!");
                    } else {
                        if (e.target.checked) label.style.background = 'rgba(99, 102, 241, 0.2)';
                        else label.style.background = 'transparent';
                    }
                });
            }
            listDiv.appendChild(label);
        });
    } catch (e) {
        listDiv.innerHTML = '<span style="color:red">Xatolik yuz berdi</span>';
    }
}

function inspektorSaveSetup() {
    const role = localStorage.getItem('dashboard_role');
    if (role === 'inspektor_psixolog') {
        const assigned = JSON.parse(localStorage.getItem('dashboard_assigned_schools') || '[]');
        if (assigned.length === 0) {
            alert("Sizga hali maktablar biriktirilmagan. Superadmin bilan bog'laning.");
            return;
        }
        document.getElementById('inspectorSetup').style.display = 'none';
        document.getElementById('inspectorDashboard').style.display = 'block';
        loadInspectorDash();
        return;
    }

    const dist = document.getElementById('insSetupDistrict').value;
    const cbs = document.querySelectorAll('.ins-school-cb:checked');
    const schools = Array.from(cbs).map(cb => cb.value);

    if (!dist) return alert("Hududni tanlang!");
    if (schools.length === 0) return alert("Kamida 1 ta maktab tanlang!");

    localStorage.setItem('ins_my_district', dist);
    localStorage.setItem('ins_my_schools', JSON.stringify(schools));

    document.getElementById('inspectorSetup').style.display = 'none';
    document.getElementById('inspectorDashboard').style.display = 'block';
    loadInspectorDash();
}

async function loadInspectorDash() {
    const dateInput = document.getElementById('insDashDate');
    const date = dateInput.value || new Date().toISOString().split('T')[0];
    dateInput.value = date;

    const role = localStorage.getItem('dashboard_role');
    let district = '', assigned = [];
    if (role === 'inspektor_psixolog') {
        district = localStorage.getItem('dashboard_district');
        assigned = JSON.parse(localStorage.getItem('dashboard_assigned_schools') || '[]');
    } else {
        district = localStorage.getItem('ins_my_district');
        assigned = JSON.parse(localStorage.getItem('ins_my_schools') || '[]');
    }

    document.getElementById('insDashTitle').textContent = district;
    document.getElementById('insDashSchools').innerHTML = `Tanlangan maktablar (${assigned.length} ta): <br><small style="opacity:0.8">${assigned.join(', ')}</small>`;

    const tbodySch = document.querySelector('#insDashSchoolsTable tbody');
    const tbodyStu = document.querySelector('#insDashStudentsTable tbody');
    tbodySch.innerHTML = '<tr><td colspan="6" style="text-align:center"><i class="fas fa-spinner fa-spin"></i> Yuklanmoqda...</td></tr>';
    tbodyStu.innerHTML = '<tr><td colspan="6" style="text-align:center"><i class="fas fa-spinner fa-spin"></i> Yuklanmoqda...</td></tr>';

    try {
        // Fetch from tuman endpoint because the customized list is client-side 
        // OR hit the backend if the user is actually 'inspektor_psixolog'. 
        // For simplicity, we just leverage the `tuman` stats and filter locally.

        let allAbsents = [];
        let allTumanData = [];

        if (role === 'inspektor_psixolog') {
            const resDavomat = await apiFetch(`/api/inspektor/davomat?date=${date}`);
            const resSababsiz = await apiFetch(`/api/inspektor/sababsizlar?date=${date}`);
            allTumanData = resDavomat.rows || [];
            allAbsents = resSababsiz.rows || [];
        } else {
            const tumanRes = await fetch(`${API_BASE}/stats/tuman?tuman=${encodeURIComponent(district)}&date=${date}&limit=500&offset=0`, { headers: getAuthHeaders() });
            const tumanData = await tumanRes.json();
            const absentsRes = await fetch(`${API_BASE}/stats/absentees?date=${date}&limit=500&offset=0`, { headers: getAuthHeaders() });
            const absentsData = await absentsRes.json();

            allTumanData = (tumanData.rows || []).filter(r => assigned.includes(r.school));
            allAbsents = (absentsData.rows || []).filter(r => r.district === district && assigned.includes(r.school));

            // Generate placeholders for not submitted schools
            assigned.forEach(s => {
                if (!allTumanData.find(d => d.school === s)) {
                    allTumanData.push({ school: s, total_students: 0, total_absent: 0, sababsiz_jami: 0, percent: 0, submitted: false });
                }
            });
        }

        // 1. Schools Table
        tbodySch.innerHTML = '';
        let totalSt = 0, totalAb = 0, totalSababsiz = 0, totalPercents = 0, submittedCount = 0;

        allTumanData.forEach(r => {
            const st = parseInt(r.total_students) || 0;
            const ab = parseInt(r.total_absent) || 0;
            const sababsiz = parseInt(r.sababsiz_jami) || 0;
            if (st > 0) {
                totalSt += st; totalAb += ab; totalSababsiz += sababsiz;
                totalPercents += parseFloat(r.percent);
                submittedCount++;
            }
            const p = parseFloat(r.percent) || 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${r.school}</b></td>
                <td>${st || '<span style="color:#ef4444; font-size:12px;">Kiritilmadi</span>'}</td>
                <td><span style="color:#f59e0b; font-weight:bold">${ab}</span></td>
                <td><span style="color:#ef4444; font-weight:bold">${sababsiz}</span></td>
                <td><span class="status-badge" style="background:${p >= 95 ? '#10b981' : (p >= 85 ? '#f59e0b' : '#ef4444')}; color:white">${st > 0 ? p.toFixed(1) + '%' : '-'}</span></td>
                <td>${r.bildirgi ? `<a href="/api/admin/reports/download/${r.bildirgi.split(/[\\/]/).pop()}" target="_blank" style="color:#10b981; font-size:12px; text-decoration:none;"><i class="fas fa-file-pdf"></i> Bildirgi</a>` : '-'}</td>
            `;
            tbodySch.appendChild(tr);
        });

        safeSetText('ins_avg_percent', submittedCount > 0 ? (totalPercents / submittedCount).toFixed(1) + '%' : '0%');
        safeSetText('ins_sababsiz_count', totalSababsiz);

        // 2. Students Table
        tbodyStu.innerHTML = '';
        if (allAbsents.length === 0) {
            tbodyStu.innerHTML = '<tr><td colspan="6" style="text-align:center">Ma\'lumot topilmadi</td></tr>';
        } else {
            allAbsents.forEach(r => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><b>${r.school}</b></td>
                    <td>${r.class}</td>
                    <td><b>${r.name}</b></td>
                    <td style="font-size: 0.85rem">${r.parent_name || '-'}</td>
                    <td><span style="color:#818cf8">${r.parent_phone || '-'}</span></td>
                    <td><span class="status-badge" style="background:${(r.streak || 1) >= 3 ? '#ef4444' : '#f59e0b'}; color:white">${(r.streak || 1) >= 3 ? '🔴 Muntazam' : '🟡 Odatiy'}</span></td>
                `;
                tbodyStu.appendChild(tr);
            });
        }
    } catch (e) {
        tbodySch.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red">Xatolik yuz berdi</td></tr>';
        tbodyStu.innerHTML = '';
    }
}

// Ensure `openInspectorSetup` exists if they want to click it.


const DISTRICTS_LIST = [
    "Farg'ona shahri", "Marg'ilon shahri", "Qo'qon shahri", "Quvasoy shahri",
    "Bag'dod tumani", "Beshariq tumani", "Buvayda tumani", "Dang'ara tumani",
    "Yozyovon tumani", "Oltiariq tumani", "Qo'shtepa tumani", "Rishton tumani",
    "So'x tumani", "Toshloq tumani", "Uchko'prik tumani", "Farg'ona tumani",
    "Furqat tumani", "O'zbekiston tumani", "Quva tumani"
];

function openDistrictStats(dist) {
    const selector = document.getElementById('tumanSelect');
    if (selector) {
        let exists = Array.from(selector.options).some(o => o.value === dist);
        if (!exists) {
            const opt = document.createElement('option');
            opt.value = opt.textContent = dist;
            selector.appendChild(opt);
        }
        selector.value = dist;
    }
    showTab('tuman');
    setTimeout(() => loadTumanData(1), 50);
}

async function loadViloyatData() {
    const dateInput = document.getElementById('viloyatDate');
    const date = dateInput ? (dateInput.value || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0];
    if (dateInput && !dateInput.value) dateInput.value = date;

    try {
        const data = await apiFetch(`${API_BASE}/stats/viloyat?date=${date}`);
        const tbody = document.querySelector('#viloyatTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!Array.isArray(data)) throw new Error("Ma'lumot topilmadi");

        let t_entries = 0, t_students = 0, t_sababsiz = 0, t_absent = 0;

        data.forEach(item => {
            t_entries += parseInt(item.entries) || 0;
            t_students += parseInt(item.students) || 0;
            t_sababsiz += parseInt(item.sababsiz) || 0;
            t_absent += parseInt(item.total_absent) || 0;

            const p = item.avg_percent || 0;
            let colorClass = '#64748b';
            if (item.entries > 0) {
                if (p >= 95) colorClass = '#10b981';
                else if (p >= 85) colorClass = '#f59e0b';
                else colorClass = '#ef4444';
            }

            const tr = `<tr>
                <td class="clickable-dist" onclick="openDistrictStats('${item.district.replace(/'/g, "\\'")}')"><i class="fas fa-search-location"></i> ${item.district}</td>
                <td style="text-align:center"><b>${item.entries || 0}</b> / <span style="opacity:0.6">${item.total_schools || '-'}</span></td>
                <td style="text-align:center">${item.classes || 0}</td>
                <td style="text-align:center"><b>${item.students || 0}</b></td>
                <td style="text-align:center; color:#14b8a6">${item.sk || 0}</td>
                <td style="text-align:center; color:#14b8a6">${item.st || 0}</td>
                <td style="text-align:center; color:#14b8a6">${item.so || 0}</td>
                <td style="text-align:center; color:#14b8a6">${item.si || 0}</td>
                <td style="text-align:center; color:#14b8a6">${item.sb || 0}</td>
                <td style="text-align:center; color:#f59e0b">${item.sm || 0}</td>
                <td style="text-align:center; color:#f59e0b">${item.sq || 0}</td>
                <td style="text-align:center; color:#f59e0b">${item.sc || 0}</td>
                <td style="text-align:center; color:#f59e0b">${item.sbt || 0}</td>
                <td style="text-align:center; color:#f59e0b">${item.si_ish || 0}</td>
                <td style="text-align:center; color:#f59e0b">${item.sqar || 0}</td>
                <td style="text-align:center; color:#f59e0b">${item.sjaz || 0}</td>
                <td style="text-align:center; color:#f59e0b">${item.snaz || 0}</td>
                <td style="text-align:center; color:#f59e0b">${item.stur || 0}</td>
                <td style="text-align:center; color:#f59e0b">${item.ssb || 0}</td>
                <td style="text-align:center; font-weight:bold; color:#ef4444">${item.total_absent || 0}</td>
                <td style="text-align:center; opacity:0.6">${(Number(item.yesterday_percent) || 0).toFixed(1)}%</td>
                <td style="text-align:center"><span class="status-badge" style="background:${colorClass}; color:white;">${p.toFixed(1)}%</span></td>
                <td style="font-size:10px; opacity:0.6">${item.head_name || '-'}</td>
            </tr>`;
            tbody.innerHTML += tr;
        });

        safeSetText('v_total_entries', t_entries);
        safeSetText('v_total_students', t_students);
        safeSetText('v_total_sababsiz', t_sababsiz);
        safeSetText('v_avg_percent', (t_students > 0 ? ((t_students - t_absent) / t_students * 100).toFixed(1) : 0) + '%');

        renderHeatmap(data, 'mapContainer');

        // Broadcast stats data directly to embedded map widget
        window.lastViloyatData = data;
        document.querySelectorAll('iframe').forEach(iframe => {
            try {
                iframe.contentWindow.postMessage({ type: 'updateStats', data: data }, '*');
            } catch(e) {}
        });
    } catch (e) { console.error("Viloyat Load Error:", e); }
}

function renderHeatmap(data, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const districtGrid = [
        { n: "Beshariq", x: 1, y: 3 }, { n: "Furqat", x: 2, y: 3 }, { n: "O'zbekiston", x: 2, y: 4 },
        { n: "Dang'ara", x: 3, y: 2 }, { n: "Qo'qon", x: 3, y: 3 }, { n: "Uchko'prik", x: 4, y: 3 },
        { n: "Buvayda", x: 4, y: 2 }, { n: "Bag'dod", x: 5, y: 3 }, { n: "Yozyovon", x: 6, y: 1 },
        { n: "Oltiariq", x: 5, y: 4 }, { n: "Rishton", x: 4, y: 4 }, { n: "Qo'shtepa", x: 6, y: 3 },
        { n: "Toshloq", x: 7, y: 2 }, { n: "Marg'ilon", x: 7, y: 3 }, { n: "Quva", x: 8, y: 3 },
        { n: "Farg'ona sh.", x: 7, y: 4 }, { n: "Farg'ona t.", x: 8, y: 4 }, { n: "Quvasoy", x: 8, y: 5 },
        { n: "So'x", x: 4, y: 5 }
    ];

    districtGrid.forEach(pos => {
        const item = data.find(d => d.district.toLowerCase().includes(pos.n.toLowerCase().split(' ')[0])) || { avg_percent: 0, district: pos.n };
        const node = document.createElement('div');
        node.className = 'map-node';
        node.style.gridColumn = pos.x;
        node.style.gridRow = pos.y;

        const p = item.avg_percent || 0;
        let color = '#f43f5e';
        if (p >= 95) color = '#10b981';
        else if (p >= 90) color = '#facc15';
        else if (p === 0) color = 'rgba(255,255,255,0.05)';

        node.style.borderTop = `4px solid ${color}`;
        node.innerHTML = `
            <div class="name" style="font-size:9px;">${pos.n}</div>
            <div class="val" style="color:${color}; font-weight:bold;">${p > 0 ? p.toFixed(1) + '%' : '-'}</div>
        `;
        node.onclick = () => { if (item.entries > 0) openDistrictStats(item.district); };
        container.appendChild(node);
    });
}

let districtChartObj, reasonsChartObj, trendChartObj;
let deepAnalysisData = null;

async function loadDeepAnalysis() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const res = await apiFetch(`/api/stats/non-submitting-deep?date=${today}`).catch(() => null);
        if (!res) return;
        deepAnalysisData = res;

        // 1. Fill count cards
        const cats = res.categories || {};
        const setVal = (id, count) => {
            const el = document.getElementById(id);
            if (el) el.textContent = count;
        };

        setVal('missing_today', cats.today ? cats.today.length : 0);
        setVal('missing_3days', cats.days3 ? cats.days3.length : 0);
        setVal('missing_1week', cats.week1 ? cats.week1.length : 0);
        setVal('missing_2weeks', cats.week2 ? cats.week2.length : 0);
        setVal('missing_3weeks', cats.week3 ? cats.week3.length : 0);
        setVal('missing_never', cats.never ? cats.never.length : 0);

        // 2. Fill nonSubmittingTable (Tuman, Jami maktab, Kiritdi, Kiritmadi)
        const tbody = document.querySelector('#nonSubmittingTable tbody');
        if (tbody && res.districtsData) {
            tbody.innerHTML = '';
            const distKeys = Object.keys(res.districtsData).sort();
            distKeys.forEach(d => {
                const dInfo = res.districtsData[d];
                const total = dInfo.totalSchools || 0;
                const missing = dInfo.missingToday ? dInfo.missingToday.length : 0;
                const submitted = Math.max(0, total - missing);
                const percent = total > 0 ? ((submitted / total) * 100).toFixed(0) : 0;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="color:#f8fafc; font-weight:600; padding:10px;">
                        <i class="fas fa-map-marker-alt" style="color:var(--accent); margin-right:6px;"></i> ${d}
                    </td>
                    <td style="text-align:center; font-weight:bold; color:#cbd5e1; padding:10px;">${total}</td>
                    <td style="text-align:center; font-weight:bold; color:#10b981; padding:10px;">
                        ${submitted} <span style="font-size:0.75rem; color:#6ee7b7;">(${percent}%)</span>
                    </td>
                    <td style="text-align:center; font-weight:bold; color:#ef4444; padding:10px;">
                        ${missing}
                        ${missing > 0 ? `<button onclick="showDistrictMissingModal('${d.replace(/'/g, "\\'")}')" style="margin-left:8px; padding:3px 8px; border-radius:6px; background:rgba(239,68,68,0.2); border:1px solid #ef4444; color:#f87171; font-size:11px; cursor:pointer;"><i class="fas fa-list"></i> Maktablar</button>` : ''}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (e) {
        console.error("Deep Analysis fetch failed:", e);
    }
}

function showMissingModal(catKey) {
    const modal = document.getElementById('missingModal');
    const titleEl = document.getElementById('missingModalTitle');
    const contentEl = document.getElementById('missingModalContent');
    if (!modal || !contentEl) return;

    if (!deepAnalysisData || !deepAnalysisData.categories) {
        alert("Ma'lumotlar yuklanmoqda... Iltimos 'Yangilash' tugmasini bosing.");
        return;
    }

    const titles = {
        'today': "Bugun davomat kiritmagan maktablar",
        'days3': "3 kundan beri davomat kiritmagan maktablar",
        'week1': "1 haftadan beri davomat kiritmagan maktablar",
        'week2': "2 haftadan beri davomat kiritmagan maktablar",
        'week3': "3 haftadan beri davomat kiritmagan maktablar",
        'never': "Umuman davomat kiritmagan maktablar"
    };

    if (titleEl) titleEl.innerHTML = `<i class="fas fa-exclamation-triangle" style="color:#f43f5e; margin-right:8px;"></i> ${titles[catKey] || 'Kiritmagan maktablar'}`;

    const list = deepAnalysisData.categories[catKey] || [];
    if (list.length === 0) {
        contentEl.innerHTML = `<div style="text-align:center; padding:30px; color:#10b981;"><i class="fas fa-check-circle" style="font-size:2rem; margin-bottom:10px; display:block;"></i> Ushbu toifada kiritmagan maktablar mavjud emas!</div>`;
    } else {
        contentEl.innerHTML = `
            <div style="font-size:0.85rem; color:#94a3b8; margin-bottom:12px;">Jami: <b style="color:#fff;">${list.length} ta</b> maktab</div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${list.map((item, idx) => `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.08);">
                        <div>
                            <span style="color:#64748b; font-size:0.8rem; margin-right:8px;">#${idx + 1}</span>
                            <b style="color:#fff;">${item.school}</b>
                            <div style="font-size:0.8rem; color:#94a3b8; margin-top:2px;"><i class="fas fa-map-marker-alt" style="color:var(--accent);"></i> ${item.district}</div>
                        </div>
                        ${item.days ? `<span class="status-badge status-low" style="font-size:11px;">${item.days} kun</span>` : `<span class="status-badge" style="background:#475569; color:#fff; font-size:11px;">0 kiritish</span>`}
                    </div>
                `).join('')}
            </div>
        `;
    }

    modal.style.display = 'flex';
}

function showDistrictMissingModal(districtName) {
    const modal = document.getElementById('missingModal');
    const titleEl = document.getElementById('missingModalTitle');
    const contentEl = document.getElementById('missingModalContent');
    if (!modal || !contentEl) return;

    if (!deepAnalysisData || !deepAnalysisData.districtsData || !deepAnalysisData.districtsData[districtName]) {
        alert("Ma'lumot topilmadi");
        return;
    }

    const dInfo = deepAnalysisData.districtsData[districtName];
    const missingSchools = dInfo.missingToday || [];

    if (titleEl) titleEl.innerHTML = `<i class="fas fa-school" style="color:#f43f5e; margin-right:8px;"></i> ${districtName} (Bugun kiritmaganlar)`;

    if (missingSchools.length === 0) {
        contentEl.innerHTML = `<div style="text-align:center; padding:30px; color:#10b981;"><i class="fas fa-check-circle" style="font-size:2rem; margin-bottom:10px; display:block;"></i> Barcha maktablar davomatni kiritgan!</div>`;
    } else {
        contentEl.innerHTML = `
            <div style="font-size:0.85rem; color:#94a3b8; margin-bottom:12px;">Bugun kiritmagan: <b style="color:#ef4444;">${missingSchools.length} ta</b> (Jami ${dInfo.totalSchools} tadan)</div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${missingSchools.map((sch, idx) => `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.08);">
                        <div>
                            <span style="color:#64748b; font-size:0.8rem; margin-right:8px;">#${idx + 1}</span>
                            <b style="color:#fff;">${sch}</b>
                        </div>
                        <span class="status-badge status-low" style="font-size:11px;">Kiritilmagan</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    modal.style.display = 'flex';
}

async function loadAnalysisData(event) {
    const btn = event ? (event.currentTarget || event.target.closest('button')) : document.getElementById('btnRefreshAnalysis');
    const icon = btn ? btn.querySelector('i') : null;
    if (icon) icon.classList.add('fa-spin');

    try {
        // 1. Load Deep Missing Schools Analysis (cards & table)
        await loadDeepAnalysis();

        // 2. Load Attendance Comparison
        const fargonaNow = new Date(new Date().getTime() + (5 * 60 + new Date().getTimezoneOffset()) * 60000);
        const today = fargonaNow.toISOString().split('T')[0];
        const dayOfWeek = fargonaNow.getDay();

        let yesterdayCount = 1;
        if (dayOfWeek === 1) yesterdayCount = 2; // Monday vs Saturday

        const yesterdayDate = new Date(fargonaNow);
        yesterdayDate.setDate(yesterdayDate.getDate() - yesterdayCount);
        const yesterday = yesterdayDate.toISOString().split('T')[0];

        let [todayData, yesterdayData] = await Promise.all([
            apiFetch(`/api/stats/viloyat?date=${today}`).catch(() => []),
            apiFetch(`/api/stats/viloyat?date=${yesterday}`).catch(() => [])
        ]);

        if (!Array.isArray(todayData)) todayData = [];
        if (!Array.isArray(yesterdayData)) yesterdayData = [];

        // Filter out zero entries for better average
        const todayActive = todayData.filter(d => d.entries > 0);
        const yesterdayActive = yesterdayData.filter(d => d.entries > 0);

        // 1. Summary
        const calcAvg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + (parseFloat(b.avg_percent) || 0), 0) / arr.length : 0;
        const todayAvg = calcAvg(todayActive.length > 0 ? todayActive : todayData);
        const yesterdayAvg = calcAvg(yesterdayActive.length > 0 ? yesterdayActive : yesterdayData);
        const diff = todayAvg - yesterdayAvg;

        const summaryDiv = document.getElementById('analysisSummary');
        if (summaryDiv) {
            summaryDiv.innerHTML = `
                <div class="stat-card">
                    <h4>Viloyat O'rtacha (Bugun)</h4>
                    <div class="value">${todayAvg.toFixed(1)}%</div>
                    <div style="font-size:0.9rem; color:${diff >= 0 ? '#10b981' : '#f43f5e'}">
                        <i class="fas fa-caret-${diff >= 0 ? 'up' : 'down'}"></i> ${Math.abs(diff).toFixed(1)}% (Kecha: ${yesterdayAvg.toFixed(1)}%)
                    </div>
                </div>
                <div class="stat-card">
                    <h4>Jami O'quvchilar</h4>
                    <div class="value">${todayData.reduce((a, b) => a + (parseInt(b.students) || 0), 0)}</div>
                </div>
                <div class="stat-card">
                    <h4>Sababsiz Kelmaganlar</h4>
                    <div class="value red">${todayData.reduce((a, b) => a + (parseInt(b.sababsiz) || 0), 0)}</div>
                </div>
            `;
        }

        if (typeof renderHeatmap === 'function') {
            renderHeatmap(todayData, 'mapContainerAnalysis');
        }

        // 2. AI Text & Leaderboard
        const aiText = document.getElementById('aiText');
        if (aiText) {
            if (todayData.length === 0 || todayActive.length === 0) {
                aiText.innerHTML = `<i class="fas fa-info-circle"></i> Bugungi ma'lumotlar hali to'liq kiritilmagan. <br>Hozircha ${todayData.filter(d => d.entries > 0).length} ta hududdan ma'lumot keldi.`;
            } else {
                const sorted = [...todayActive].sort((a, b) => (parseFloat(a.avg_percent) || 0) - (parseFloat(b.avg_percent) || 0));
                const worst = sorted[0];
                const best = sorted[sorted.length - 1];
                aiText.innerHTML = `<i class="fas fa-robot"></i> Bugungi holat bo'yicha eng yaxshi ko'rsatkich: <b>${best.district}</b> (${best.avg_percent.toFixed(1)}%). <br> Eng past ko'rsatkich (E'tibor talab): <b>${worst.district}</b> (${worst.avg_percent.toFixed(1)}%).`;

                const topDiv = document.getElementById('topDistricts');
                const bottomDiv = document.getElementById('bottomDistricts');
                if (topDiv) topDiv.innerHTML = sorted.slice(-3).reverse().map(d => `<div class="l-item top"><span><b>${d.district}</b></span><span class="status-badge status-high">${d.avg_percent.toFixed(1)}%</span></div>`).join('');
                if (bottomDiv) bottomDiv.innerHTML = sorted.slice(0, 3).map(d => `<div class="l-item bottom"><span><b>${d.district}</b></span><span class="status-badge status-low">${d.avg_percent.toFixed(1)}%</span></div>`).join('');
            }
        }

        // 3. Charts safely
        try {
            const ctx1 = document.getElementById('districtChart');
            if (ctx1 && typeof Chart !== 'undefined' && todayData.length > 0) {
                if (districtChartObj) districtChartObj.destroy();
                districtChartObj = new Chart(ctx1, {
                    type: 'bar',
                    data: {
                        labels: todayData.map(d => d.district.split(' ')[0]),
                        datasets: [
                            { label: 'Bugun', data: todayData.map(d => parseFloat(d.avg_percent) || 0), backgroundColor: 'rgba(99, 102, 241, 0.7)', borderRadius: 5 },
                            { label: 'Kecha', data: yesterdayData.map(d => parseFloat(d.avg_percent) || 0), backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 5 }
                        ]
                    },
                    options: {
                        responsive: true,
                        scales: { y: { beginAtZero: true, max: 100, ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8', font: { size: 10 } } } },
                        plugins: { legend: { labels: { color: '#fff' } } }
                    }
                });
            }

            const ctx2 = document.getElementById('reasonsChart');
            if (ctx2 && typeof Chart !== 'undefined' && todayData.length > 0) {
                if (reasonsChartObj) reasonsChartObj.destroy();
                const sababli = todayData.reduce((a, b) => a + (parseInt(b.sababli) || 0), 0);
                const sababsiz = todayData.reduce((a, b) => a + (parseInt(b.sababsiz) || 0), 0);
                reasonsChartObj = new Chart(ctx2, {
                    type: 'doughnut',
                    data: {
                        labels: ['Sababli', 'Sababsiz'],
                        datasets: [{ data: [sababli, sababsiz], backgroundColor: ['#10b981', '#ef4444'], borderWidth: 0 }]
                    },
                    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#fff' } } } }
                });
            }

            const ctx3 = document.getElementById('trendChart');
            if (ctx3 && typeof Chart !== 'undefined') {
                const trendData = await apiFetch('/api/stats/trends').catch(() => []);
                if (trendData && trendData.length > 0) {
                    if (trendChartObj) trendChartObj.destroy();
                    trendChartObj = new Chart(ctx3, {
                        type: 'line',
                        data: {
                            labels: trendData.map(d => d.date ? d.date.split('-').slice(1).join('.') : ''),
                            datasets: [{ label: 'Davomat %', data: trendData.map(d => parseFloat(d.avg_percent) || 0), borderColor: '#8b5cf6', tension: 0.4, fill: true, backgroundColor: 'rgba(139, 92, 246, 0.1)' }]
                        },
                        options: {
                            responsive: true,
                            scales: { y: { min: 70, max: 100, ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } },
                            plugins: { legend: { display: false } }
                        }
                    });
                }
            }
        } catch (chartErr) {
            console.warn("Chart rendering warning:", chartErr);
        }

        if (typeof showToast === 'function') {
            showToast("Tahlil ma'lumotlari muvaffaqiyatli yangilandi!", 'success');
        }
    } catch (e) {
        console.error("Analysis Load Error:", e);
        if (typeof showToast === 'function') {
            showToast("Tahlil ma'lumotlarini yuklashda xatolik yuz berdi", 'error');
        }
    } finally {
        if (icon) icon.classList.remove('fa-spin');
    }
}


async function loadTumanData(page = 1) {
    tumanPage = page;
    const tumanSelect = document.getElementById('tumanSelect');
    if (!tumanSelect) return;

    if (tumanSelect.options.length === 0) {
        DISTRICTS_LIST.forEach(d => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = d;
            tumanSelect.appendChild(opt);
        });
    }

    const userDist = localStorage.getItem('dashboard_district');
    const userRole = localStorage.getItem('dashboard_role') || 'public';
    let tuman = tumanSelect.value;
    if (userDist && userRole === 'district') {
        tuman = userDist;
        tumanSelect.value = userDist;
        tumanSelect.disabled = true;
    } else if (!tuman && tumanSelect.options.length > 0) {
        tumanSelect.selectedIndex = 0;
        tuman = tumanSelect.value;
    }

    if (!tuman) return;

    const dateInput = document.getElementById('tumanDate');
    const date = dateInput ? (dateInput.value || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0];
    if (dateInput && !dateInput.value) dateInput.value = date;

    const tbody = document.querySelector('#tumanTable tbody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="23" style="text-align:center; padding:25px; color:#94a3b8;"><i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i> ${tuman} maktablari yuklanmoqda...</td></tr>`;
    }

    const offset = (page - 1) * PAGE_SIZE;
    try {
        const res = await fetch(`${API_BASE}/stats/tuman?tuman=${encodeURIComponent(tuman)}&date=${date}&limit=${PAGE_SIZE}&offset=${offset}`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (!tbody) return;
        tbody.innerHTML = '';

        const rows = Array.isArray(data) ? data : (data && data.rows ? data.rows : []);
        const total = data && typeof data.total === 'number' ? data.total : rows.length;

        if (rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="23" style="text-align:center; padding:30px; color:#94a3b8;">${tuman} bo'yicha maktablar topilmadi.</td></tr>`;
            return;
        }

        rows.forEach(item => {
            const isSent = item.fio && item.fio !== 'Kiritilmagan';
            const p = parseFloat(item.percent) || 0;
            const row = `<tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                <td style="text-align:center">
                    ${isSent 
                        ? '<i class="fas fa-check-circle" style="color:#10b981; font-size:1.15rem" title="Kiritilgan"></i>' 
                        : '<i class="fas fa-times-circle" style="color:#ef4444; font-size:1.15rem" title="Kiritilmagan"></i>'}
                </td>
                <td style="font-weight:600; color:#e2e8f0; text-align:left;">${item.school}</td>
                <td style="color:#94a3b8; font-size:0.85em">${item.time || '-'}</td>
                <td style="color:#e2e8f0; font-weight:500;">${item.classes_count || 0}</td>
                <td style="color:#e2e8f0; font-weight:bold;">${item.total_students || 0}</td>
                
                <!-- Sababli (Cyan tint text) -->
                <td style="color:#2dd4bf; font-weight:600">${item.sababli_kasal || 0}</td>
                <td style="color:#2dd4bf">${item.sababli_tadbirlar || 0}</td>
                <td style="color:#2dd4bf">${item.sababli_oilaviy || 0}</td>
                <td style="color:#2dd4bf">${item.sababli_ijtimoiy || 0}</td>
                <td style="color:#2dd4bf">${item.sababli_boshqa || 0}</td>
                
                <!-- Sababsiz (Orange/Red tint text) -->
                <td style="color:#fbbf24; font-weight:bold">${item.sababsiz_muntazam || 0}</td>
                <td style="color:#f87171">${item.sababsiz_qidiruv || 0}</td>
                <td style="color:#f87171">${item.sababsiz_chetel || 0}</td>
                <td style="color:#f87171">${item.sababsiz_boyin || 0}</td>
                <td style="color:#f87171">${item.sababsiz_ishlab || 0}</td>
                <td style="color:#f87171">${item.sababsiz_qarshilik || 0}</td>
                <td style="color:#f87171">${item.sababsiz_jazo || 0}</td>
                <td style="color:#f87171">${item.sababsiz_nazoratsiz || 0}</td>
                <td style="color:#f87171">${item.sababsiz_turmush || 0}</td>
                <td style="color:#f87171">${item.sababsiz_boshqa || 0}</td>
                
                <td style="text-align:center"><span class="status-badge ${isSent && p >= 95 ? 'status-high' : 'status-low'}" style="font-size:11px">${p.toFixed(1)}%</span></td>
                <td style="text-align:center">
                    ${isSent ? (item.source === 'web' ? '<i class="fas fa-globe" style="color:#3b82f6" title="Web saytdan"></i>' : '<i class="fab fa-telegram" style="color:#0088cc" title="Botdan"></i>') : '-'} ${item.bildirgi ? '<a href="/uploads/'+item.bildirgi+'" target="_blank" title="Bildirgi" style="margin-left:5px; color:#10b981;"><i class="fas fa-file-pdf"></i></a>' : ''}
                </td>
                <td style="font-size:11px; color:#cbd5e1; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${item.fio || ''}">${item.fio || '-'}</td>
            </tr>`;
            tbody.innerHTML += row;
        });

        if (typeof renderPagination === 'function') {
            renderPagination('tumanPagination', total, page, PAGE_SIZE, 'loadTumanData');
        }
    } catch (e) {
        console.error("Tuman Data Error:", e);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="23" style="text-align:center; padding:30px; color:#ef4444">Xatolik: ${e.message}</td></tr>`;
        }
    }
}

async function loadAbsentDetails(page = 1) {
    absentPage = page;
    const dateInput = document.getElementById('absentDate');
    const date = dateInput ? (dateInput.value || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0];
    if (dateInput && !dateInput.value) dateInput.value = date;

    const offset = (page - 1) * PAGE_SIZE;
    try {
        const res = await fetch(`${API_BASE}/stats/absentees?date=${date}&limit=${PAGE_SIZE}&offset=${offset}`, { headers: getAuthHeaders() });
        const data = await res.json();
        const tbody = document.querySelector('#absentTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        const role = localStorage.getItem('dashboard_role');
        const isSuper = role === 'superadmin';

        const rows = data.rows || [];
        const total = data.total || 0;

        if (Array.isArray(rows)) {
            rows.forEach(row => {
                const phoneStr = (row.parent_phone || '').toString();
                const maskedPhone = isSuper ? phoneStr : (phoneStr.length > 7 ? phoneStr.substring(0, 6) + '***' + phoneStr.substring(phoneStr.length - 2) : '***');
                const name = row.name || '-';
                const maskedName = isSuper ? name : name.split(' ').map((n, i) => i === 0 ? n : '***').join(' ');
                const parent_name = row.parent_name || '-';
                const maskedParent = isSuper ? parent_name : parent_name.split(' ').map((n, i) => i === 0 ? n : '***').join(' ');
                const address = row.address || '-';
                const maskedAddress = isSuper ? address : '***';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.district}</td>
                    <td><b>${row.school}</b></td>
                    <td>${row.class}</td>
                    <td><b>${maskedName}</b></td>
                    <td>${maskedAddress}</td>
                    <td style="font-size: 0.85rem">${maskedParent}</td>
                    <td>${isSuper ? `<a href="tel:${row.parent_phone}">${row.parent_phone}</a>` : `<span style="color:#818cf8">${maskedPhone}</span>`}</td>
                    <td style="font-size: 0.85rem">${row.inspector || '-'}</td>
                    <td style="font-size: 0.85rem">
                        <b>${row.submitter_fio || '-'}</b><br>
                        <a href="tel:${row.submitter_phone}" style="color:var(--primary); text-decoration:none;">${row.submitter_phone || ''}</a>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
        renderPagination('absentPagination', total, page, PAGE_SIZE, 'loadAbsentDetails');
    } catch (e) { console.error(e); }
}

function renderPagination(containerId, total, page, limit, methodName) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const totalPages = Math.ceil(total / limit);
    if (totalPages <= 1) {
        container.innerHTML = `<span style="opacity:0.6; font-size:0.9rem;">Jami: ${total} ta ma'lumot</span>`;
        return;
    }

    let html = `
        <button class="pag-btn" ${page === 1 ? 'disabled' : ''} onclick="${methodName}(${page - 1})"><i class="fas fa-chevron-left"></i> Oldingi</button>
        <span class="pag-info">${page} / ${totalPages}</span>
        <button class="pag-btn" ${page === totalPages ? 'disabled' : ''} onclick="${methodName}(${page + 1})">Keyingi <i class="fas fa-chevron-right"></i></button>
    `;
    container.innerHTML = html;
}


async function loadRecentActivity(page = 1) {
    monitorPage = page;
    const offset = (page - 1) * monitorLimit;
    const tbody = document.querySelector('#recentTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px"><i class="fas fa-spinner fa-spin"></i> Yuklanmoqda...</td></tr>';
    try {
        const data = await apiFetch(`/api/stats/recent?limit=${monitorLimit}&offset=${offset}`);
        const rows = data.rows || [];
        const total = data.total || 0;

        tbody.innerHTML = '';
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px">Ma\'lumotlar mavjud emas</td></tr>';
            return;
        }

        rows.forEach(item => {
            const sourceIcon = item.source === 'web' ? '<i class="fas fa-globe" style="color:#3b82f6" title="Web Sahifa"></i> web' : '<i class="fab fa-telegram" style="color:#0088cc" title="Telegram Bot"></i> bot';
            const d = item.date.split('-');
            const displayDate = d.length === 3 ? `${d[2]}.${d[1]}.${d[0]}` : item.date;

            const tr = `<tr>
                <td style="color: #94a3b8; font-size: 0.9em;">${displayDate}</td>
                <td style="font-weight: 500; color: #818cf8;">${item.time}</td>
                <td>${item.district}</td>
                <td><b>${item.school}</b></td>
                <td style="text-align:center"><span class="status-badge ${item.percent >= 95 ? 'status-high' : 'status-low'}">${(Number(item.percent) || 0).toFixed(1)}%</span></td>
                <td style="text-align:center; font-weight:bold; color:${item.sababsiz_jami > 0 ? '#f43f5e' : '#10b981'}">${item.sababsiz_jami || 0}</td>
                <td style="text-align:center">${sourceIcon}</td>
                <td style="font-size: 11px;">
                    ${item.fio}
                    ${item.bildirgi ? `<br><a href="/api/admin/reports/download/${item.bildirgi.split(/[\\/]/).pop()}" target="_blank" style="color:#10b981; font-size:10px; text-decoration:none;"><i class="fas fa-file-pdf"></i> Bildirgi</a>` : ''}
                </td>
            </tr>`;
            tbody.innerHTML += tr;
        });

        renderPagination('recentPagination', total, page, monitorLimit, 'loadRecentActivity');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#ef4444">Xatolik: ${e.message}</td></tr>`;
    }
}

// Auto-refresh Monitor
setInterval(() => {
    const recentView = document.getElementById('recentView');
    if (recentView && recentView.classList.contains('active')) {
        if (monitorPage === 1) loadRecentActivity(1); // Auto refresh only if on page 1
    }
}, 60000);


function exportViloyatExcel() {
    const date = document.getElementById('viloyatDate').value;
    const token = localStorage.getItem('dashboard_token');
    window.location.href = `${API_BASE}/export/viloyat?date=${date}&token=${token}`;
}

function exportTuman() {
    const tuman = document.getElementById('tumanSelect').value;
    const date = document.getElementById('tumanDate').value;
    const token = localStorage.getItem('dashboard_token');
    if (!tuman) return alert("Tumanni tanlang");
    window.location.href = `${API_BASE}/export/tuman?tuman=${encodeURIComponent(tuman)}&date=${date}&token=${token}`;
}
/* ADMIN LOGIC */
async function loadAdminPanel() {
    const container = document.getElementById('adminView');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:20px"><i class="fas fa-spinner fa-spin"></i> Yuklanmoqda...</div>';

    try {
        // 1. Users
        const res = await fetch(`${API_BASE}/admin/users`, { headers: getAuthHeaders() });
        if (res.status !== 200) {
            container.innerHTML = '<h3 style="color:red; text-align:center; padding:50px">Ruxsat yo\'q. Faqat Superadmin uchun.</h3>';
            return;
        }

        const users = await res.json();

        let html = `
            <h2>👥 Foydalanuvchilar Boshqaruvi</h2>
            <div class="table-wrapper">
            <table class="fl-table">
                <thead>
                    <tr>
                        <th>Login</th>
                        <th>Parol</th>
                        <th>Rol</th>
                        <th>Hudud</th>
                        <th>Amallar</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const sortedUsers = Object.entries(users).sort((a, b) => {
            if (a[1].role === 'superadmin') return -1;
            if (b[1].role === 'superadmin') return 1;
            return a[0].localeCompare(b[0]);
        });

        sortedUsers.forEach(([login, u]) => {
            if (u.role === 'system') return;
            html += `
                <tr>
                    <td>${login}</td>
                    <td>${u.password || '***'}</td>
                    <td><span class="badge" style="background:${u.role === 'superadmin' ? '#e11d48' : '#0ea5e9'}">${u.role}</span></td>
                    <td>${u.district || '-'}</td>
                    <td>
                        <button onclick="changePass('${login}')" style="padding:4px 8px; background:#f59e0b; color:white; border:none; border-radius:4px; cursor:pointer;">🔑 Parol</button>
                    </td>
                </tr>
            `;
        });
        html += '</tbody></table></div>';

        // 2. Archived Reports
        try {
            const repRes = await fetch(`${API_BASE}/admin/reports`, { headers: getAuthHeaders() });
            const reports = await repRes.json();

            if (Array.isArray(reports) && reports.length > 0) {
                html += `<div style="margin-top:40px;">
                    <h2>📚 Arxivlangan Hisobotlar (Excel)</h2>
                    <div class="table-wrapper">
                    <table class="fl-table">
                        <thead><tr><th>Fayl Nomi</th><th>Hajmi</th><th>Sana</th><th>Yuklash</th></tr></thead>
                        <tbody>`;

                const token = localStorage.getItem('dashboard_token') || localStorage.getItem('token');
                reports.forEach(f => {
                    html += `<tr>
                        <td>${f.name}</td>
                        <td>${f.size}</td>
                        <td>${new Date(f.date).toLocaleString()}</td>
                        <td><a href="${API_BASE}/admin/reports/download/${f.name}?token=${token}" target="_blank" style="text-decoration:none; color:white; background:#10b981; padding:5px 10px; border-radius:4px;">📥 Yuklab olish</a></td>
                    </tr>`;
                });

                html += `</tbody></table></div></div>`;
            }
        } catch (e) { console.error("Report Fetch Error", e); }

        container.innerHTML = html;

    } catch (e) {
        console.error(e);
        container.innerHTML = '<div style="color:red; text-align:center">Xatolik yuz berdi!</div>';
    }
}

async function changePass(username) {
    const newPass = prompt(`Yangi parol (${username}):`);
    if (newPass && newPass.trim()) {
        try {
            await fetch(`${API_BASE}/admin/reset-password`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ targetLogin: username, newPassword: newPass })
            });
            alert('Parol o\'zgartirildi');
            loadAdminPanel();
        } catch (e) { alert('Xatolik'); }
    }
}

/* DASHBOARD LOGIC END */

let tgUsersData = [];

async function loadTgUsers() {
    const tbody = document.querySelector('#tgUsersTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Yuklanmoqda...</td></tr>';

    try {
        const data = await apiFetch(`${API_BASE}/admin/tg-users`);
        tgUsersData = data || [];
        renderTgUsers(tgUsersData);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red">Xatolik: ${e.message}</td></tr>`;
    }
}

function renderTgUsers(users) {
    const tbody = document.querySelector('#tgUsersTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    users.forEach(u => {
        const d = u.data || {};
        const isPro = d.is_pro && new Date(d.pro_expire_date) > new Date();
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td><code>${u.id}</code></td>
            <td><b>${d.name || '-'}</b><br><small>@${d.username || '-'}</small></td>
            <td>${d.phone || '-'}</td>
            <td><span class="pro-badge" style="background:${isPro ? '#10b981' : '#64748b'}">${isPro ? 'PRO' : 'ODATIY'}</span></td>
            <td>${d.pro_expire_date || '-'}</td>
            <td>
                <select id="months_${u.id}" style="width:70px; padding:2px; font-size:12px">
                    <option value="1">1 oy</option>
                    <option value="3">3 oy</option>
                    <option value="6">6 oy</option>
                    <option value="12">1 yil</option>
                </select>
                <button onclick="setPro('${u.id}')" style="background:#6366f1; color:white; border:none; padding:4px 8px; border-radius:5px; cursor:pointer">
                    <i class="fas fa-check"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filterTgUsers() {
    const q = document.getElementById('tgSearch').value.toLowerCase();
    const filtered = tgUsersData.filter(u => {
        const d = u.data || {};
        return u.id.toString().includes(q) ||
            (d.name || '').toLowerCase().includes(q) ||
            (d.phone || '').includes(q) ||
            (d.username || '').toLowerCase().includes(q);
    });
    renderTgUsers(filtered);
}

async function setPro(uid) {
    const months = document.getElementById(`months_${uid}`).value;
    if (!confirm(`${uid} ga ${months} oy PRO berilsinmi?`)) return;

    try {
        await apiFetch(`${API_BASE}/admin/set-pro`, {
            method: 'POST',
            body: JSON.stringify({ uid, months })
        });
        alert('Muvaffaqiyatli bajarildi');
        loadTgUsers();
    } catch (e) {
        alert('Xatolik: ' + e.message);
    }
}



async function fetchSchoolXorijCount() {
    const d = document.getElementById("district").value;
    const s = document.getElementById("school").value;
    if(!d || !s) return;
    try {
        const res = await fetch("/api/xorij", {headers:{"Authorization": "test-token"}}); 
        const json = await res.json();
        const data = json.data || json || [];
        // count how many illegal departures for this school
        schoolIllegalXorijCount = data.filter(k => k.district === d && k.school === s && !k.is_returned && k.qonuniylik !== "legal").length;
        
        let el = document.getElementById("sababsiz_chetel");
        if(el) {
            el.value = schoolIllegalXorijCount;
        }
    } catch(e){}
}

document.addEventListener("DOMContentLoaded", () => {
    const sch = document.getElementById("school");
    if(sch) sch.addEventListener("change", fetchSchoolXorijCount);
    
    setTimeout(() => {
        const chetelInput = document.getElementById("sababsiz_chetel");
        if(chetelInput) {
            chetelInput.addEventListener("input", (e) => {
                const val = parseInt(e.target.value) || 0;
                if(val > schoolIllegalXorijCount) {
                    const diff = val - schoolIllegalXorijCount;
                    alert("Alohida Diqqat! Ushbu kiritilayotgan ro'yxatda tizimli xatolik: \nIltimos, Xorij bo'limiga o'tib, yana " + diff + " nafar noqonuniy ketgan o'quvchining ma'lumotlarini batafsil kiriting! \n\nHozircha " + schoolIllegalXorijCount + " ta ba'zadagi tasdiqlangan hujjat qabul qilinadi.");
                    e.target.value = schoolIllegalXorijCount;
                    if(typeof calculateTotals === 'function') calculateTotals();
                }
            });
        }
    }, 2000);
});


// ==========================================
// UNIVERSAL SIDEBAR TOGGLE & RESPONSIVE LOGIC
// ==========================================
function toggleSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const main = document.querySelector('.app-main-viewport') || document.querySelector('.main-content-wrapper');
    if (!sidebar) return;

    if (window.innerWidth <= 992) {
        sidebar.classList.toggle('mobile-open');
    } else {
        sidebar.classList.toggle('collapsed');
        if (main) main.classList.toggle('sidebar-collapsed');
    }
    const isCollapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem('sidebar_collapsed', isCollapsed ? '1' : '0');
}

// Restore sidebar state
window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('sidebar_collapsed') === '1' && window.innerWidth > 992) {
        const sidebar = document.getElementById('appSidebar');
        const main = document.querySelector('.app-main-viewport') || document.querySelector('.main-content-wrapper');
        if (sidebar) sidebar.classList.add('collapsed');
        if (main) main.classList.add('sidebar-collapsed');
    }
    // Auto-init table pagination
    initAutoPagination();
});

// ==========================================
// UNIVERSAL TABLE PAGINATION (20 tadan oshsa)
// ==========================================
function applyTablePagination(tableElement, pageSize = 20) {
    if (typeof tableElement === 'string') tableElement = document.getElementById(tableElement);
    if (!tableElement) return;

    const tbody = tableElement.querySelector('tbody') || tableElement;
    const rows = Array.from(tbody.querySelectorAll('tr:not(.no-paginate)'));
    
    // Find or create pagination container
    let pagContainer = tableElement.nextElementSibling;
    const isOurNav = pagContainer && pagContainer.classList.contains('table-pagination-nav');

    if (rows.length <= pageSize) {
        if (isOurNav) pagContainer.style.display = 'none';
        rows.forEach(r => r.style.display = '');
        return;
    }

    if (!isOurNav) {
        pagContainer = document.createElement('div');
        pagContainer.className = 'table-pagination-nav';
        pagContainer.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-top:14px; padding:12px 18px; background:rgba(255,255,255,0.04); border-radius:14px; border:1px solid rgba(255,255,255,0.08); font-size:13px; color:#94a3b8; flex-wrap:wrap; gap:12px;';
        tableElement.parentNode.insertBefore(pagContainer, tableElement.nextSibling);
    } else {
        pagContainer.style.display = 'flex';
    }

    let currentPage = 1;
    const totalPages = Math.ceil(rows.length / pageSize);

    function renderPage(page) {
        currentPage = page;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;

        rows.forEach((row, i) => {
            row.style.display = (i >= start && i < end) ? '' : 'none';
        });

        // Build numbered page buttons (show up to 7 buttons)
        let pageBtnsHtml = '';
        let startP = Math.max(1, page - 2);
        let endP = Math.min(totalPages, page + 2);
        if (startP > 1) pageBtnsHtml += `<button class="pag-num-btn" data-page="1" style="padding:5px 10px; border-radius:8px; background:rgba(255,255,255,0.06); color:#cbd5e1; border:none; cursor:pointer;">1</button>${startP > 2 ? '<span style="color:#64748b;">...</span>' : ''}`;
        
        for (let p = startP; p <= endP; p++) {
            const isActive = p === page;
            pageBtnsHtml += `<button class="pag-num-btn" data-page="${p}" style="padding:5px 11px; border-radius:8px; font-weight:700; background:${isActive ? 'linear-gradient(135deg, #0284c7, #2563eb)' : 'rgba(255,255,255,0.06)'}; color:${isActive ? '#fff' : '#cbd5e1'}; border:none; cursor:pointer;">${p}</button>`;
        }

        if (endP < totalPages) pageBtnsHtml += `${endP < totalPages - 1 ? '<span style="color:#64748b;">...</span>' : ''}<button class="pag-num-btn" data-page="${totalPages}" style="padding:5px 10px; border-radius:8px; background:rgba(255,255,255,0.06); color:#cbd5e1; border:none; cursor:pointer;">${totalPages}</button>`;

        pagContainer.innerHTML = `
            <div style="font-size:0.85rem;">
                Ko'rsatilmoqda: <strong style="color:#38bdf8; font-weight:700;">${start + 1} - ${Math.min(end, rows.length)}</strong> / jami <strong style="color:#fff;">${rows.length}</strong> ta qator
            </div>
            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                <button class="btn btn-sm" ${page === 1 ? 'disabled style="opacity:0.35; cursor:not-allowed; padding:6px 12px; border-radius:8px; background:rgba(255,255,255,0.08); color:#fff; border:none;"' : 'style="padding:6px 12px; border-radius:8px; background:rgba(255,255,255,0.08); color:#fff; border:none; cursor:pointer;"'} id="prevPageBtn">
                    <i class="fas fa-chevron-left"></i> Oldingi
                </button>
                <div style="display:flex; gap:4px; align-items:center;">
                    ${pageBtnsHtml}
                </div>
                <button class="btn btn-sm" ${page === totalPages ? 'disabled style="opacity:0.35; cursor:not-allowed; padding:6px 12px; border-radius:8px; background:rgba(255,255,255,0.08); color:#fff; border:none;"' : 'style="padding:6px 12px; border-radius:8px; background:rgba(255,255,255,0.08); color:#fff; border:none; cursor:pointer;"'} id="nextPageBtn">
                    Keyingi <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        `;

        const prevBtn = pagContainer.querySelector('#prevPageBtn');
        const nextBtn = pagContainer.querySelector('#nextPageBtn');
        if (prevBtn && page > 1) prevBtn.onclick = () => renderPage(page - 1);
        if (nextBtn && page < totalPages) nextBtn.onclick = () => renderPage(page + 1);

        pagContainer.querySelectorAll('.pag-num-btn').forEach(btn => {
            btn.onclick = () => {
                const targetPage = parseInt(btn.getAttribute('data-page'));
                if (targetPage && targetPage !== currentPage) renderPage(targetPage);
            };
        });
    }

    renderPage(1);
}

function initAutoPagination() {
    document.querySelectorAll('table').forEach(table => {
        const rows = table.querySelectorAll('tbody tr');
        if (rows.length > 20) {
            applyTablePagination(table, 20);
        }
    });
}

// Global exposure
window.applyTablePagination = applyTablePagination;
window.initAutoPagination = initAutoPagination;
window.toggleSidebar = toggleSidebar;

// Recurring observer to auto-paginate dynamic tables
let paginationObserverTimer;
const tableObserver = new MutationObserver(() => {
    clearTimeout(paginationObserverTimer);
    paginationObserverTimer = setTimeout(() => {
        initAutoPagination();
    }, 600);
});
tableObserver.observe(document.body, { childList: true, subtree: true });



// ==========================================
// UNIVERSAL SIDEBAR TOGGLE & PERSISTENCE
// ==========================================
function toggleSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const main = document.querySelector('.main-content-wrapper') || document.querySelector('.app-main-viewport');
    if (!sidebar) return;

    if (window.innerWidth <= 992) {
        sidebar.classList.toggle('mobile-open');
        const backdrop = document.getElementById('mobileSidebarBackdrop');
        if (backdrop) backdrop.classList.toggle('active', sidebar.classList.contains('mobile-open'));
    } else {
        sidebar.classList.toggle('collapsed');
        document.body.classList.toggle('sidebar-collapsed', sidebar.classList.contains('collapsed'));
        if (main) main.classList.toggle('sidebar-collapsed', sidebar.classList.contains('collapsed'));
        localStorage.setItem('sidebar_collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
    }
}

function updateTopHeaderAuth() {
    const container = document.getElementById('topHeaderAuthContainer');
    if (!container) return;
    const token = localStorage.getItem('dashboard_token') || localStorage.getItem('token') || sessionStorage.getItem('dashboard_token');
    const role = (localStorage.getItem('dashboard_role') || sessionStorage.getItem('dashboard_role') || 'Admin').toUpperCase();
    const username = (localStorage.getItem('dashboard_username') || sessionStorage.getItem('dashboard_username') || 'MRQIROL').toUpperCase();

    if (token) {
        container.innerHTML = `
            <a href="admin.html" class="top-header-auth-badge" title="Boshqaruv paneliga o'tish">
                <i class="fas fa-user-shield"></i>
                <span>${username}</span>
            </a>
            <button onclick="logout()" class="top-header-auth-logout" title="Tizimdan chiqish">
                <i class="fas fa-sign-out-alt"></i>
                <span>Chiqish</span>
            </button>
        `;
    } else {
        container.innerHTML = `
            <a href="login.html" class="top-header-login-btn" id="topHeaderLoginBtn">
                <i class="fas fa-sign-in-alt"></i> <span>Kirish</span>
            </a>
        `;
    }
}
window.updateTopHeaderAuth = updateTopHeaderAuth;


// Auto-extend translations dictionary with complete layout, cards, dashboard & admin keys
if (typeof translations !== 'undefined') {
    const extraUz = {
        // Bank Cards
        'cards_section_title': "Tizim Obunasi va To'lov Uchun Rasmiy Bank Kartalari",
        'cards_section_desc': "(Karta raqami ustiga bosing — raqamdan avtomatik nusxa olinadi)",
        'card_bank_badge': "BANK KARTASI",
        'card_country': "O'zbekiston Respublikasi",
        'card_holder_label': "KARTA EGASI",
        'card_copy_btn': "Nusxa olish",
        // Dashboard
        'label_date': "Sana",
        'label_district_sel': "Tumanni tanlang",
        'label_boshqa': "Tanlang...",
        'btn_excel': "Excelga saqlash",
        'btn_tv_mode': "TV-Rejim",
        'btn_excel_export': "Excel Yuklash",
        'btn_large_map': "Katta xarita",
        'map_section_title': "Farg'ona Viloyati Interaktiv Xaritasi (19 ta hudud)",
        'stat_entries': "Jami kiritilgan",
        'stat_avg': "O'rtacha davomat",
        'stat_abroad_students': "Xorijdagi O'quvchilar",
        'stat_legal': "Qonuniy:",
        'stat_illegal': "Noqonuniy:",
        'stat_returned': "Qaytarilganlar:",
        'btn_more_foreign': "Batafsil Svodni ochish",
        'stat_absents': "Sababsizlar",
        'stat_total_students': "Jami o'quvchi",
        'col_district': "Hudud",
        'col_schools': "Maktab",
        'col_class': "Sinf",
        'col_fio': "O'quvchi F.I.SH",
        'col_address': "Yashash manzili",
        'col_parent': "Ota-onasi",
        'col_phone_t': "Telefon",
        'col_date': "Sana",
        'col_time': "Vaqt",
        'col_percent': "Davomat",
        'col_sababsiz': "Sababsiz",
        'col_source': "Manba",
        'col_responsible': "Mas'ul",
        // Admin
        'admin_scan': "Tizimni Tekshirish (Scan)",
        'admin_autorepair': "1-Klik Avto-Tuzatish",
        'admin_settings': "Tizim Sozlamalari",
        'admin_save': "Saqlash",
        'admin_stats': "Tizim Statistikasi",
        'admin_logs': "Oxirgi Amallar (Logs)",
        'admin_refresh': "Yangilash",
        'admin_quick': "Tezkor Havolalar",
        'legend_excel': "85-100% (A'lo)",
        'legend_mid': "50-84% (O'rta)",
        'legend_low': "1-49% (Past)",
        'legend_zero': "0% (Kiritilmagan)",
        'work_time_mgmt': "09:00 - 18:00",
        'work_lunch': "Tushlik",
        'work_days': "Ish kunlari: Dush-Jum",
        'work_weekend': "Shan-Yak: Dam olish",
        'work_lunch_mgmt': "13:00 - 14:00",
        'hero_subtitle': "Boshqarma va tuman (shahar) mas'ul xodimlari",
        'about_title': "Biz haqimizda",
        'tab_boshqarma': "Viloyat Boshqarmasi",
        'tab_tuman_shahar': "Tuman va Shaharlar",
        'tab_docs': "Me'yoriy Hujjatlar"
    };

    const extraOz = {
        // Bank Cards
        'cards_section_title': "Тизим Обунаси ва Тўлов Учун Расмий Банк Карталари",
        'cards_section_desc': "(Карта рақами устига босинг — рақамдан автоматик нусха олинади)",
        'card_bank_badge': "БАНК КАРТАСИ",
        'card_country': "Ўзбекистон Республикаси",
        'card_holder_label': "КАРТА ЭГАСИ",
        'card_copy_btn': "Нусха олиш",
        // Dashboard
        'label_date': "Сана",
        'label_district_sel': "Туманни танланг",
        'label_boshqa': "Танланг...",
        'btn_excel': "Excelга сақлаш",
        'btn_tv_mode': "ТВ-Режим",
        'btn_excel_export': "Excel Юклаш",
        'btn_large_map': "Катта харита",
        'map_section_title': "Фарғона Вилояти Интерактив Харитаси (19 та ҳудуд)",
        'stat_entries': "Жами киритилган",
        'stat_avg': "Ўртача давомат",
        'stat_abroad_students': "Хориждаги Ўқувчилар",
        'stat_legal': "Қонуний:",
        'stat_illegal': "Ноқонуний:",
        'stat_returned': "Қайтарилганлар:",
        'btn_more_foreign': "Батафсил Сводни очиш",
        'stat_absents': "Сабабсизлар",
        'stat_total_students': "Жами ўқувчи",
        'col_district': "Ҳудуд",
        'col_schools': "Мактаб",
        'col_class': "Синф",
        'col_fio': "Ўқувчи Ф.И.Ш",
        'col_address': "Яшаш манзили",
        'col_parent': "Ота-онаси",
        'col_phone_t': "Телефон",
        'col_date': "Сана",
        'col_time': "Вақт",
        'col_percent': "Давомат",
        'col_sababsiz': "Сабабсиз",
        'col_source': "Манба",
        'col_responsible': "Масъул",
        // Admin
        'admin_scan': "Тизимни Текшириш (Scan)",
        'admin_autorepair': "1-Клик Авто-Тузатиш",
        'admin_settings': "Тизим Созламалари",
        'admin_save': "Сақлаш",
        'admin_stats': "Тизим Статистикаси",
        'admin_logs': "Охирги Амаллар (Logs)",
        'admin_refresh': "Янгилаш",
        'admin_quick': "Тезкор Ҳаволалар",
        'legend_excel': "85-100% (Аъло)",
        'legend_mid': "50-84% (Ўрта)",
        'legend_low': "1-49% (Паст)",
        'legend_zero': "0% (Киритилмаган)",
        'work_time_mgmt': "09:00 - 18:00",
        'work_lunch': "Тушлик",
        'work_days': "Иш кунлари: Душ-Жум",
        'work_weekend': "Шан-Як: Дам олиш",
        'work_lunch_mgmt': "13:00 - 14:00",
        'hero_subtitle': "Бошқарма ва туман (шаҳар) масъул ходимлари",
        'about_title': "Биз ҳақимизда",
        'tab_boshqarma': "Вилоят Бошқармаси",
        'tab_tuman_shahar': "Туман ва Шаҳарлар",
        'tab_docs': "Меъёрий Ҳужжатлар"
    };

    const extraRu = {
        // Bank Cards
        'cards_section_title': "Официальные Банковские Карты для Подписки и Оплаты",
        'cards_section_desc': "(Нажмите на номер карты — он будет скопирован автоматически)",
        'card_bank_badge': "БАНКОВСКАЯ КАРТА",
        'card_country': "Республика Узбекистан",
        'card_holder_label': "ВЛАДЕЛЕЦ КАРТЫ",
        'card_copy_btn': "Скопировать",
        // Dashboard
        'label_date': "Дата",
        'label_district_sel': "Выберите район",
        'label_boshqa': "Выберите...",
        'btn_excel': "Сохранить в Excel",
        'btn_tv_mode': "ТВ-Режим",
        'btn_excel_export': "Экспорт в Excel",
        'btn_large_map': "Большая карта",
        'map_section_title': "Интерактивная карта Ферганской области (19 районов)",
        'stat_entries': "Всего введено",
        'stat_avg': "Средняя посещаемость",
        'stat_abroad_students': "Учащиеся за границей",
        'stat_legal': "Законно:",
        'stat_illegal': "Незаконно:",
        'stat_returned': "Возвращённые:",
        'btn_more_foreign': "Подробный свод",
        'stat_absents': "Без уваж. причины",
        'stat_total_students': "Всего учащихся",
        'col_district': "Регион",
        'col_schools': "Школа",
        'col_class': "Класс",
        'col_fio': "Ф.И.О. учащегося",
        'col_address': "Адрес проживания",
        'col_parent': "Родители",
        'col_phone_t': "Телефон",
        'col_date': "Дата",
        'col_time': "Время",
        'col_percent': "Посещаемость",
        'col_sababsiz': "Неуваж.",
        'col_source': "Источник",
        'col_responsible': "Ответственный",
        // Admin
        'admin_scan': "Сканировать Систему",
        'admin_autorepair': "1-Клик Авто-Исправление",
        'admin_settings': "Настройки Системы",
        'admin_save': "Сохранить",
        'admin_stats': "Статистика Системы",
        'admin_logs': "Журнал действий (Logs)",
        'admin_refresh': "Обновить",
        'admin_quick': "Быстрые Ссылки",
        'legend_excel': "85-100% (Отлично)",
        'legend_mid': "50-84% (Средне)",
        'legend_low': "1-49% (Низко)",
        'legend_zero': "0% (Не введено)",
        'work_time_mgmt': "09:00 - 18:00",
        'work_lunch': "Обед",
        'work_days': "Рабочие дни: Пн-Пт",
        'work_weekend': "Сб-Вс: Выходной",
        'work_lunch_mgmt': "13:00 - 14:00",
        'hero_subtitle': "Ответственные сотрудники управления и районов (городов)",
        'about_title': "О нас",
        'tab_boshqarma': "Областное управление",
        'tab_tuman_shahar': "Районы и города",
        'tab_docs': "Нормативные документы"
    };

    translations.uz = Object.assign(translations.uz || {}, extraUz);
    translations.oz = Object.assign(translations.oz || {}, extraOz);
    translations.ru = Object.assign(translations.ru || {}, extraRu);
}

// -------------------------------------------------------------
// INTELLIGENT AUTO-TRANSLATOR FOR HEADINGS, BUTTONS, CARDS & TABLES
// -------------------------------------------------------------
const UI_TRANSLATIONS = {
    // Bank Cards & Home
    "Tizim Obunasi va To'lov Uchun Rasmiy Bank Kartalari": {
        oz: "Тизим Обунаси ва Тўлов Учун Расмий Банк Карталари",
        ru: "Официальные Банковские Карты для Подписки и Оплаты"
    },
    "(Karta raqami ustiga bosing — raqamdan avtomatik nusxa olinadi)": {
        oz: "(Карта рақами устига босинг — рақамдан автоматик нусха олинади)",
        ru: "(Нажмите на номер карты — он будет скопирован автоматически)"
    },
    "BANK KARTASI": { oz: "БАНК КАРТАСИ", ru: "БАНКОВСКАЯ КАРТА" },
    "O'zbekiston Respublikasi": { oz: "Ўзбекистон Республикаси", ru: "Республика Узбекистан" },
    "KARTA EGASI": { oz: "КАРТА ЭГАСИ", ru: "ВЛАДЕЛЕЦ КАРТЫ" },
    "Nusxa olish": { oz: "Нусха олиш", ru: "Скопировать" },
    "Nusxa olish uchun bosing": { oz: "Нусха олиш учун босинг", ru: "Нажмите для копирования" },

    // Admin Panel - AI & Diagnostics
    "AI & Tizim Diagnostikasi va Avtomatik Tuzatish": {
        oz: "AI & Тизим Диагностикаси ва Автоматик Тузатиш",
        ru: "AI и Диагностика Системы / Автоисправление"
    },
    "Tizimni Tekshirish (Scan)": { oz: "Тизимни Текшириш (Scan)", ru: "Сканировать Систему" },
    "1-Klik Avto-Tuzatish": { oz: "1-Клик Авто-Тузатиш", ru: "1-Клик Авто-Исправление" },
    "AI Yordamida Tuzatish": { oz: "AI Ёрдамида Тузатиш", ru: "Исправить с помощью AI" },

    // Admin Panel - Documents
    "Me'yoriy Hujjatlarni Yuklash": { oz: "Меъёрий Ҳужжатларни Юклаш", ru: "Загрузка Нормативных Документов" },
    "Hujjat nomi va qisqacha izohi (Kimlar uchunligi)": {
        oz: "Ҳужжат номи ва қисқача изоҳи (Кимлар учунлиги)",
        ru: "Название документа и краткое описание"
    },
    "Hujjat (PDF/Doc/Rasm)": { oz: "Ҳужжат (PDF/Doc/Расм)", ru: "Документ (PDF/Doc/Изображение)" },
    "Saytga e'lon qilish": { oz: "Сайтга эълон қилиш", ru: "Опубликовать на сайте" },

    // Admin Panel - System Settings & Toggles
    "Tizim Sozlamalari": { oz: "Тизим Созламалари", ru: "Настройки Системы" },
    "To'lovsiz bepul davomat kiritish davri (Aksiya / Sinov)": {
        oz: "Тўловсиз бепул давомат киритиш даври (Аксия / Синов)",
        ru: "Бесплатный период ввода посещаемости (Акция / Тест)"
    },
    "Belgilangan sana oralig'ida barcha maktablar to'lovsiz/bepul davomat kiritishi mumkin (obunasiz ham qabul qilinadi)": {
        oz: "Белгиланган сана оралиғида барча мактаблар тўловсиз/бепул давомат киритиши мумкин (обунасиз ҳам қабул қилинади)",
        ru: "В указанный период все школы могут вводить посещаемость бесплатно (без активной подписки)"
    },
    "Boshlanish sanasi:": { oz: "Бошланиш санаси:", ru: "Дата начала:" },
    "Tugash sanasi:": { oz: "Тугаш санаси:", ru: "Дата окончания:" },
    "Saqlash": { oz: "Сақлаш", ru: "Сохранить" },
    "Davomat kiritish vaqt cheklovi (08:00 - 16:00)": {
        oz: "Давомат киритиш вақт чеклови (08:00 - 16:00)",
        ru: "Ограничение времени ввода посещаемости (08:00 - 16:00)"
    },
    "Davomat kiritishni faqat dushanba-shanba 08:00 dan 16:00 gacha cheklash (o'chirilgan holatda 24/7 ochiq)": {
        oz: "Давомат киритишни фақат душанба-шанба 08:00 дан 16:00 гача чеклаш (ўчирилган ҳолатда 24/7 очиқ)",
        ru: "Разрешить ввод только с пн по сб с 08:00 до 16:00 (в выкл. состоянии доступно 24/7)"
    },
    "Ta'til rejimi (Holiday)": { oz: "Таътил режими (Holiday)", ru: "Режим каникул (Holiday)" },
    "Bot xabarlarini to'xtatadi": { oz: "Бот хабарларини тўхтатади", ru: "Приостанавливает отправку сообщений ботом" },
    "1 kunga to'lovsiz davomat (Free Day)": {
        oz: "1 кунга тўловсиз давомат (Free Day)",
        ru: "Бесплатная посещаемость на 1 день (Free Day)"
    },
    "Bir kunga avtomatik to'lov tekshiruvini o'chirish (barcha maktablarga bepul kiritish)": {
        oz: "Бир кунга автоматик тўлов текширувини ўчириш (барча мактабларга бепул киритиш)",
        ru: "Отключить проверку оплаты на 1 день (бесплатный ввод для всех школ)"
    },
    "Manzil yig'ish": { oz: "Манзил йиғиш", ru: "Сбор адресов / геопозиций" },
    "Barcha school koordinatalari": { oz: "Барча мактаб координатлари", ru: "Координаты всех школ" },
    "Geolokatsiya tekshiruvi": { oz: "Геолокация текшируви", ru: "Проверка геолокации" },
    "Kiritishda joylashuvni talab qilish": { oz: "Киритишда жойлашувни талаб қилиш", ru: "Требовать координаты при вводе" },
    "Texnik ishlar (Maintenance)": { oz: "Техник ишлар (Maintenance)", ru: "Технические работы (Maintenance)" },
    "⚠️ Texnik ishlar (Maintenance)": { oz: "⚠️ Техник ишлар (Maintenance)", ru: "⚠️ Технические работы (Maintenance)" },
    "Dashboardni vaqtincha yopish": { oz: "Дашбордни вақтинча ёпиш", ru: "Временно закрыть доступ к дашборду" },
    "🔴 O'chirilgan (24/7 ochiq)": { oz: "🔴 Ўчирилган (24/7 очиқ)", ru: "🔴 Отключено (24/7 открыто)" },
    "🔴 O'chirilgan": { oz: "🔴 Ўчирилган", ru: "🔴 Отключено" },
    "🟢 Yoqilgan": { oz: "🟢 Ёқилган", ru: "🟢 Включено" },

    // Admin Panel - Broadcast & Stats
    "Xabar Yuborish (Broadcasting)": { oz: "Хабар Юбориш (Broadcasting)", ru: "Рассылка сообщений (Broadcasting)" },
    "Kimga:": { oz: "Кимга:", ru: "Кому:" },
    "Barcha foydalanuvchilar": { oz: "Барча фойдаланувчилар", ru: "Все пользователи" },
    "Faqat mas'ullar (Maktab/Tuman)": { oz: "Фақат масъуллар (Мактаб/Туман)", ru: "Только ответственные (Школа/Район)" },
    "Faqat ota-onalar": { oz: "Фақат ота-оналар", ru: "Только родители" },
    "Xabar matni (HTML):": { oz: "Хабар матни (HTML):", ru: "Текст сообщения (HTML):" },
    "Fayl biriktirish (PDF/Rasm):": { oz: "Файл бириктириш (PDF/Расм):", ru: "Прикрепить файл (PDF/Изображение):" },
    "Xabarni yuborish": { oz: "Хабарни юбориш", ru: "Отправить сообщение" },
    "Tizim Statistikasi": { oz: "Тизим Статистикаси", ru: "Статистика Системы" },
    "Jami TG foydalanuvchilar:": { oz: "Жами TG фойдаланувчилар:", ru: "Всего пользователей TG:" },
    "Ota-onalar soni:": { oz: "Ота-оналар сони:", ru: "Количество родителей:" },
    "PRO obunachilar:": { oz: "PRO обуначилар:", ru: "PRO подписчики:" },
    "Bugun kiritgan maktablar:": { oz: "Бугун киритган мактаблар:", ru: "Школы, сдавшие сегодня:" },
    "Server holati:": { oz: "Сервер ҳолати:", ru: "Состояние сервера:" },
    "Baza holati (Postgres):": { oz: "База ҳолати (Postgres):", ru: "Статус базы данных (Postgres):" },
    "ULANGAN": { oz: "УЛАНГАН", ru: "ПОДКЛЮЧЕНО" },
    "ONLINE": { oz: "ONLINE", ru: "ОНЛАЙН" },
    "Oxirgi Amallar (Logs)": { oz: "Охирги Амаллар (Logs)", ru: "Журнал действий (Logs)" },
    "Yangilash": { oz: "Янгилаш", ru: "Обновить" },
    "Tezkor Havolalar": { oz: "Тезкор Ҳаволалар", ru: "Быстрые ссылки" },
    "Obunalar / Maktablar": { oz: "Обуналар / Мактаблар", ru: "Подписки / Школы" },
    "To'lov Cheklari": { oz: "Тўлов Чеклари", ru: "Чеки об оплате" },
    "Inspektorlar": { oz: "Инспекторлар", ru: "Инспекторы" },
    "Hisobotlar (Excel)": { oz: "Ҳисоботлар (Excel)", ru: "Отчёты (Excel)" },

    // Admin Panel - Emergency Manual Access
    "Favqulodda: Qo'lda Ruxsat / Limit Berish": {
        oz: "Фавқулодда: Қўлда Рухсат / Лимит Бериш",
        ru: "Срочно: Ручная выдача доступа / лимита"
    },
    "Maktab bo'yicha": { oz: "Мактаб бўйича", ru: "По школе" },
    "Telefon bo'yicha": { oz: "Телефон бўйича", ru: "По телефону" },
    "Tuman / Shahar:": { oz: "Туман / Шаҳар:", ru: "Район / Город:" },
    "-- Tumanni tanlang --": { oz: "-- Туманни танланг --", ru: "-- Выберите район --" },
    "Maktab nomi:": { oz: "Мактаб номи:", ru: "Название школы:" },
    "-- Avval tumanni tanlang --": { oz: "-- Аввал туманни танланг --", ru: "-- Сначала выберите район --" },
    "Foydalanuvchi telefoni:": { oz: "Фойдаланувчи телефони:", ru: "Телефон пользователя:" },
    "Ruxsat turi:": { oz: "Рухсат тури:", ru: "Тип доступа:" },
    "✅ Standart Davomat Ruxsati": { oz: "✅ Стандарт Давомат Рухсати", ru: "✅ Стандартный доступ" },
    "👑 PRO Rejim (Barcha imkoniyatlar)": { oz: "👑 PRO Режим (Барча имкониятлар)", ru: "👑 PRO Режим (Все функции)" },
    "Muddat:": { oz: "Муддат:", ru: "Срок:" },
    "1 oy muddat": { oz: "1 ой муддат", ru: "Срок 1 месяц" },
    "2 oy muddat": { oz: "2 ой муддат", ru: "Срок 2 месяца" },
    "3 oy muddat": { oz: "3 ой муддат", ru: "Срок 3 месяца" },
    "6 oy muddat": { oz: "6 ой муддат", ru: "Срок 6 месяцев" },
    "1 yil muddat": { oz: "1 йил муддат", ru: "Срок 1 год" },
    "Ruxsatni Darhol Faollashtirish": { oz: "Рухсатни Дарҳол Фаоллаштириш", ru: "Активировать доступ немедленно" },
    "Baza ma'lumotlarini yuklab olish": { oz: "База маълумотларини юклаб олиш", ru: "Резервное копирование базы (Бэкап)" },
    "Ma'lumotlarni saqlash (Backup)": { oz: "Маълумотларни сақлаш (Backup)", ru: "Сохранить данные (Backup)" },

    // Admin Panel - Subscriptions & Receipts
    "Maktablar va Foydalanuvchilar To'lov / Obuna Boshqaruvi": {
        oz: "Мактаблар ва Фойдаланувчилар Тўлов / Обуна Бошқаруви",
        ru: "Управление оплатой и подписками школ / пользователей"
    },
    "Hududlar bo'yicha aktiv va to'lov qilgan maktablarni ko'rish, ortiqcha berilgan limitlarni to'g'rilash va muddatlarini tahrirlash.": {
        oz: "Ҳудудлар бўйича актив ва тўлов қилган мактабларни кўриш, ортиқча берилган лимитларни тўғрилаш ва муддатларини таҳрирлаш.",
        ru: "Просмотр активных и оплативших школ по регионам, корректировка лишних лимитов и продление сроков."
    },
    "📍 Hudud (Tuman/Shahar):": { oz: "📍 Ҳудуд (Туман/Шаҳар):", ru: "📍 Регион (Район/Город):" },
    "-- Barcha Hududlar --": { oz: "-- Барча Ҳудудлар --", ru: "-- Все Регионы --" },
    "⚡ Holati:": { oz: "⚡ Ҳолати:", ru: "⚡ Статус:" },
    "📁 Barchasi": { oz: "📁 Барчаси", ru: "📁 Все" },
    "✅ Faol obunalar": { oz: "✅ Фаол обуналар", ru: "✅ Активные подписки" },
    "⚠️ Ortiqcha limit berilganlar (>35 kun)": { oz: "⚠️ Ортиқча лимит берилганлар (>35 кун)", ru: "⚠️ Избыточный лимит (>35 дней)" },
    "❌ Muddati tugaganlar": { oz: "❌ Муддати тугаганлар", ru: "❌ Истёкшие" },
    "🔍 Qidiruv (Maktab / F.I.SH / Tel):": { oz: "🔍 Қидирув (Мактаб / Ф.И.Ш / Тел):", ru: "🔍 Поиск (Школа / ФИО / Тел):" },
    "Faol Maktablar": { oz: "Фаол Мактаблар", ru: "Активные Школы" },
    "Ortiqcha Limit (>35 kun)": { oz: "Ортиқча Лимит (>35 кун)", ru: "Лишний лимит (>35 дней)" },
    "Jami Ko'rsatilayotgan": { oz: "Жами Кўрсатилаётган", ru: "Всего отображается" },
    "Hudud va Maktab": { oz: "Ҳудуд ва Мактаб", ru: "Регион и Школа" },
    "Biriktirilgan Foydalanuvchi": { oz: "Бириктирилган Фойдаланувчи", ru: "Прикреплённый Пользователь" },
    "Tugash sanasi": { oz: "Тугаш санаси", ru: "Дата окончания" },
    "Qolgan muddat": { oz: "Қолган муддат", ru: "Оставшийся срок" },
    "Amallar": { oz: "Амаллар", ru: "Действия" },
    "Har bir sahifada:": { oz: "Ҳар бир саҳифада:", ru: "На странице:" },
    "To'lov Cheklari (Kvitansiyalar va Tasdiqlash)": {
        oz: "Тўлов Чеклари (Квитанциялар ва Тасдиқлаш)",
        ru: "Чеки об оплате (Квитанции и Подтверждение)"
    },
    "⏳ Kutilayotganlar": { oz: "⏳ Кутилаётганлар", ru: "⏳ Ожидающие" },
    "✅ Tasdiqlanganlar": { oz: "✅ Тасдиқланганлар", ru: "✅ Подтверждённые" },
    "🚫 Rad etilganlar": { oz: "🚫 Рад этилганлар", ru: "🚫 Отклонённые" },
    "To'lovlar & Obunalar (Excel)": { oz: "Тўловлар & Обуналар (Excel)", ru: "Платежи & Подписки (Excel)" },
    "Desktop Dastur Foydalanuvchilari (Live Monitoring)": {
        oz: "Desktop Дастур Фойдаланувчилари (Live Monitoring)",
        ru: "Пользователи программы Desktop (Живой мониторинг)"
    },
    "Mas'ul F.I.SH va Tel": { oz: "Масъул Ф.И.Ш ва Тел", ru: "ФИО и телефон ответственного" },
    "IP Manzili": { oz: "IP Манзили", ru: "IP Адрес" },
    "Dastur Versiyasi": { oz: "Дастур Версияси", ru: "Версия программы" },
    "Holati": { oz: "Ҳолати", ru: "Статус" },
    "Oxirgi Faollik": { oz: "Охирги Фаоллик", ru: "Последняя активность" },

    // Dashboard Items
    "Sana": { oz: "Сана", ru: "Дата" },
    "TV-Rejim": { oz: "ТВ-Режим", ru: "ТВ-Режим" },
    "Excel Yuklash": { oz: "Excel Юклаш", ru: "Экспорт в Excel" },
    "Excelga saqlash": { oz: "Excelга сақлаш", ru: "Сохранить в Excel" },
    "Farg'ona Viloyati Interaktiv Xaritasi (19 ta hudud)": {
        oz: "Фарғона Вилояти Интерактив Харитаси (19 та ҳудуд)",
        ru: "Интерактивная карта Ферганской области (19 районов)"
    },
    "90-100% (A'lo)": { oz: "90-100% (Аъло)", ru: "90-100% (Отлично)" },
    "41-89% (O'rta)": { oz: "41-89% (Ўрта)", ru: "41-89% (Средне)" },
    "0-40% (Past)": { oz: "0-40% (Паст)", ru: "0-40% (Низко)" },
    "Katta xarita": { oz: "Катта харита", ru: "Большая карта" },
    "Jami kiritilgan": { oz: "Жами киритилган", ru: "Всего введено" },
    "O'rtacha davomat": { oz: "Ўртача давомат", ru: "Средняя посещаемость" },
    "Xorijdagi O'quvchilar": { oz: "Хориждаги Ўқувчилар", ru: "Учащиеся за границей" },
    "Qonuniy:": { oz: "Қонуний:", ru: "Законно:" },
    "Noqonuniy:": { oz: "Ноқонуний:", ru: "Незаконно:" },
    "Qaytarilganlar:": { oz: "Қайтарилганлар:", ru: "Возвращённые:" },
    "Batafsil Svodni ochish": { oz: "Батафсил Сводни очиш", ru: "Подробный свод" },
    "Sababsizlar": { oz: "Сабабсизлар", ru: "Без уважительной причины" },
    "Jami o'quvchi": { oz: "Жами ўқувчи", ru: "Всего учащихся" },
    "Hudud nomi": { oz: "Ҳудуд номи", ru: "Название региона" },
    "Maktablar": { oz: "Мактаблар", ru: "Школы" },
    "Sinflar": { oz: "Синфлар", ru: "Классы" },
    "O'quvchilar": { oz: "Ўқувчилар", ru: "Учащиеся" },
    "Sababli": { oz: "Сабабли", ru: "По причине" },
    "Sababli kelmaganlar": { oz: "Сабабли келмаганлар", ru: "Отсутствующие по причине" },
    "Sababsiz kelmaganlar": { oz: "Сабабсиз келмаганлар", ru: "Отсутствующие без причины" },
    "Jami kelmagan": { oz: "Жами келмаган", ru: "Всего отсутствующих" },
    "Kecha %": { oz: "Кеча %", ru: "Вчера %" },
    "Bugun %": { oz: "Бугун %", ru: "Сегодня %" },
    "Mas'ul": { oz: "Масъул", ru: "Ответственный" },
    "Davomat %": { oz: "Давомат %", ru: "Посещаемость %" },
    "Manba": { oz: "Манба", ru: "Источник" },
    "Tumanni tanlang": { oz: "Туманни танланг", ru: "Выберите район" },
    "Tanlang...": { oz: "Танланг...", ru: "Выберите..." },
    "Xolati: Jonli (Barcha kiritilgan ma'lumotlar tarixi)": {
        oz: "Ҳолати: Жонли (Барча киритилган маълумотлар тарихи)",
        ru: "Статус: В реальном времени (История всех записей)"
    },
    "Hudud": { oz: "Ҳудуд", ru: "Регион" },
    "Maktab": { oz: "Мактаб", ru: "Школа" },
    "Sinf": { oz: "Синф", ru: "Класс" },
    "O'quvchi F.I.SH": { oz: "Ўқувчи Ф.И.Ш", ru: "Ф.И.О. учащегося" },
    "Yashash manzili": { oz: "Яшаш манзили", ru: "Адрес проживания" },
    "Ota-onasi": { oz: "Ота-онаси", ru: "Родители" },
    "Telefon": { oz: "Телефон", ru: "Телефон" },
    "Mas'ul inspektor": { oz: "Масъул инспектор", ru: "Ответственный инспектор" },
    "Kiritgan mas'ul (O'rinbosar)": { oz: "Киритган масъул (Ўринбосар)", ru: "Ввёл ответственный (Зам. директора)" },
    "Vaqt": { oz: "Вақт", ru: "Время" },
    "Davomat": { oz: "Давомат", ru: "Посещаемость" },
    "Sababsiz": { oz: "Сабабсиз", ru: "Неуважительно" },
    "Ota-onalar Nazorati": { oz: "Ота-оналар Назорати", ru: "Родительский Контроль" },
    "MMIBDO‘ Reyting": { oz: "ММИБДЎ Рейтинг", ru: "Рейтинг ЗДВР" },
    "Mening profilim": { oz: "Менинг профилим", ru: "Мой профиль" },
    "Parolni almashtirish": { oz: "Паролни алмаштириш", ru: "Сменить пароль" },
    "Arxiv hisobotlar": { oz: "Архив ҳисоботлар", ru: "Архивные отчёты" },
    "Namunali maktablar reytingi": { oz: "Намунали мактаблар рейтинги", ru: "Рейтинг образцовых школ" },
    "Foydalanuvchilar boshqaruvi": { oz: "Фойдаланувчилар бошқаруви", ru: "Управление пользователями" },
    "PRO Foydalanuvchilar boshqaruvi": { oz: "PRO Фойдаланувчилар бошқаруви", ru: "Управление PRO пользователями" },
    "Mobil ilovani yuklab oling": { oz: "Мобил иловани юклаб олинг", ru: "Скачайте мобильное приложение" },
    "Ro'yxatdan o'tgan": { oz: "Рўйхатдан ўтган", ru: "Зарегистрированные" },
    "Jonli harakatlar logi": { oz: "Жонли ҳаракатлар логи", ru: "Журнал действий в реальном времени" },
    "Mening Hududim": { oz: "Менинг Ҳудудим", ru: "Мой Регион" },
    "Mening Maktabim": { oz: "Менинг Мактабим", ru: "Моя Школа" },
    "PRO AI Tahlillar": { oz: "PRO AI Таҳлиллар", ru: "PRO AI Аналитика" },
    "Viloyat davomat tahlili (Kecha va Bugun)": {
        oz: "Вилоят давомат таҳлили (Кеча ва Бугун)",
        ru: "Анализ посещаемости области (Вчера и Сегодня)"
    },
    "Kiritmagan maktablar": { oz: "Киритмаган мактаблар", ru: "Школы, не сдавшие данные" },
    "Ota-onalar qamrovi va statistikasi": { oz: "Ота-оналар қамрови ва статистикаси", ru: "Охват и статистика родителей" },
    "Jami ulangan inspektorlar": { oz: "Жами уланган инспекторлар", ru: "Всего подключено инспекторов" },
    "Bugungi faollar": { oz: "Бугунги фаоллар", ru: "Активные сегодня" },
    "Ro'yxatdan o'tgan inspektorlar": { oz: "Рўйхатдан ўтган инспекторлар", ru: "Зарегистрированные инспекторы" },
    "Maktablar soni": { oz: "Мактаблар сони", ru: "Количество школ" },
    "Harakat": { oz: "Ҳаракат", ru: "Действие" },

    // About Page (Biz haqimizda)
    "Biz haqimizda": { oz: "Биз ҳақимизда", ru: "О нас" },
    "Boshqarma va tuman (shahar) mas'ul xodimlari": { oz: "Бошқарма ва туман (шаҳар) масъул ходимлари", ru: "Ответственные сотрудники управления и районов (городов)" },
    "Viloyat Boshqarmasi": { oz: "Вилоят Бошқармаси", ru: "Областное управление" },
    "Tuman va Shaharlar": { oz: "Туман ва Шаҳарлар", ru: "Районы и города" },
    "Me'yoriy Hujjatlar": { oz: "Меъёрий Ҳужжатлар", ru: "Нормативные документы" },
    "Boshqarma boshlig‘i o‘rinbosari": { oz: "Бошқарма бошлиғи ўринбосари", ru: "Заместитель начальника управления" },
    "Sho‘ba rahbari": { oz: "Шўъба раҳбари", ru: "Руководитель отдела" },
    "Sho‘ba metodisti": { oz: "Шўъба методисти", ru: "Методист отдела" },
    "Bosh mutaxassis": { oz: "Бош мутахассис", ru: "Главный специалист" },
    "Yetakchi mutaxassis": { oz: "Етакчи мутахассис", ru: "Ведущий специалист" },
    "Tushlik": { oz: "Тушлик", ru: "Обед" },
    "Ish kunlari: Dush-Jum": { oz: "Иш кунлари: Душ-Жум", ru: "Рабочие дни: Пн-Пт" },
    "Shan-Yak: Dam olish": { oz: "Шан-Як: Дам олиш", ru: "Сб-Вс: Выходной" },
    "Shanba, Yakshanba - Dam olish": { oz: "Шанба, Якшанба - Дам олиш", ru: "Суббота, Воскресенье - Выходной" },
    "Barcha tuman mas'ullari ro'yxati": { oz: "Барча туман масъуллари рўйхати", ru: "Список ответственных по всем районам" },

    // Oferta Page (Ommaviy oferta)
    "Ommaviy Oferta": { oz: "Оммавий Оферта", ru: "Публичная Оферта" },
    "OMMAVIY OFERTA VA FOYDALANISH SHARTLARI": { oz: "ОММАВИЙ ОФЕРТА ВА ФОЙДАЛАНИШ ШАРТЛАРИ", ru: "ПУБЛИЧНАЯ ОФЕРТА И УСЛОВИЯ ИСПОЛЬЗОВАНИЯ" },
    "Ferghanaregdavomat axborot tizimidan foydalanish bo'yicha rasmiy kelishuv": { oz: "Ferghanaregdavomat ахборот тизимидан фойдаланиш бўйича расмий келишув", ru: "Официальное соглашение об использовании информационной системы Ferghanaregdavomat" },
    "1. Umumiy qoidalar": { oz: "1. Умумий қоидалар", ru: "1. Общие положения" },
    "2. Tizimning maqsadi va vazifalari": { oz: "2. Тизимнинг мақсади ва вазифалари", ru: "2. Цели и задачи системы" },
    "3. Foydalanuvchilarning huquq va majburiyatlari": { oz: "3. Фойдаланувчиларнинг ҳуқуқ ва мажбуриятлари", ru: "3. Права и обязанности пользователей" },
    "4. Obuna va to'lov tartibi": { oz: "4. Обуна ва тўлов тартиби", ru: "4. Порядок подписки и оплаты" },
    "5. Shaxsiy ma'lumotlar xavfsizligi va maxfiylik": { oz: "5. Шахсий маълумотлар хавфсизлиги ва махфийлик", ru: "5. Безопасность персональных данных и конфиденциальность" },
    "6. Javobgarlik va nizolarni hal qilish": { oz: "6. Жавобгарлик ва низоларни ҳал қилиш", ru: "6. Ответственность и разрешение споров" },
    "7. Bog'lanish va qo'llab-quvvatlash": { oz: "7. Боғланиш ва қўллаб-қувватлаш", ru: "7. Контакты и техническая поддержка" },
    "Rasmiy hujjat kuchi": { oz: "Расмий ҳужжат кучи", ru: "Сила официального документа" },
    "Bosh sahifaga qaytish": { oz: "Бош саҳифага қайтиш", ru: "Вернуться на главную" },

    // Xorij Page (Xorij Nazorati)
    "Xorijga Ketgan O'quvchilar Nazorati": { oz: "Хорижга Кетган Ўқувчилар Назорати", ru: "Контроль учащихся за рубежом" },
    "Farg'ona viloyati maktab o'quvchilarining chet elga chiqishi monitoringi": { oz: "Фарғона вилояти мактаб ўқувчиларининг чет элга чиқиши мониторинги", ru: "Мониторинг выезда учащихся школ за границу" },
    "Excel (Umumiy ro'yxat)": { oz: "Excel (Умумий рўйхат)", ru: "Excel (Общий список)" },
    "MA'LUMOT KIRITISH": { oz: "МАЪЛУМОТ КИРИТИШ", ru: "ВВОД ДАННЫХ" },
    "QAYTIB KELGANLAR": { oz: "ҚАЙТИБ КЕЛГАНЛАР", ru: "ВЕРНУВШИЕСЯ" },
    "UMUMIY SVOD": { oz: "УМУМИЙ СВОД", ru: "ОБЩИЙ СВОД" },
    "BATAFSIL RO'YXAT": { oz: "БАТАФСИЛ РЎЙХАТ", ru: "ПОДРОБНЫЙ СПИСОК" },
    "Maktab profili": { oz: "Мактаб профили", ru: "Профиль школы" },
    "O'quvchi qo'shish uchun avval quyidagi ma'lumotlarni to'ldiring.": { oz: "Ўқувчи қўшиш учун аввал қуйидаги маълумотларни тўлдиринг.", ru: "Для добавления учащегося сначала заполните форму." },
    "Hudud (Tuman/Shahar)": { oz: "Ҳудуд (Туман/Шаҳар)", ru: "Регион (Район/Город)" },
    "Hududni tanlang": { oz: "Ҳудудни танланг", ru: "Выберите регион" },
    "Maktab / Ta'lim muassasasi": { oz: "Мактаб / Таълим муассасаси", ru: "Школа / Образовательное учреждение" },
    "Maktabni tanlang": { oz: "Мактабни танланг", ru: "Выберите школу" },
    "Mas'ul shaxs (F.I.SH)": { oz: "Масъул шахс (Ф.И.Ш)", ru: "Ответственное лицо (Ф.И.О.)" },
    "Telefon raqami": { oz: "Телефон рақами", ru: "Номер телефона" },
    "Tizimga kirish": { oz: "Тизимга кириш", ru: "Войти в систему" },
    "Tizimga кириш": { oz: "Тизимга кириш", ru: "Войти в систему" },
    "Chiqish": { oz: "Чиқиш", ru: "Выход" },
    "Shablon": { oz: "Шаблон", ru: "Шаблон" },
    "Exceldan yuklash": { oz: "Excelдан юклаш", ru: "Импорт из Excel" },
    "Yangi o'quvchi qo'shish": { oz: "Янги ўқувчи қўшиш", ru: "Добавить учащегося" },
    "O'quvchi ma'lumoti": { oz: "Ўқувчи маълумоти", ru: "Данные учащегося" },
    "O'quvchi F.I.SH": { oz: "Ўқувчи Ф.И.Ш", ru: "Ф.И.О. учащегося" },
    "Tug'ilgan sanasi": { oz: "Туғилган санаси", ru: "Дата рождения" },
    "Sinfi": { oz: "Синфи", ru: "Класс" },
    "Qatiy qonuniy chiqib ketganmi?": { oz: "Қатъий қонуний чиқиб кетганми?", ru: "Законно ли выехал?" },
    "Asoslovchi Hujjatlar (Qaror / Buyruqlar)": { oz: "Асословчи Ҳужжатлар (Қарор / Буйруқлар)", ru: "Обосновывающие документы (Решения / Приказы)" },
    "Komissiya qarori sanasi": { oz: "Комиссия қарори санаси", ru: "Дата решения комиссии" },
    "Komissiya qarori raqami": { oz: "Комиссия қарори рақами", ru: "Номер решения комиссии" },
    "Qaror fayli (PDF/Rasm yuklash)": { oz: "Қарор файли (PDF/Расм юклаш)", ru: "Файл решения (PDF/Изображение)" },
    "Direktor buyrug'i sanasi": { oz: "Директор буйруғи санаси", ru: "Дата приказа директора" },
    "Buyruq raqami": { oz: "Буйруқ рақами", ru: "Номер приказа" },
    "Buyruq fayli (PDF/Rasm yuklash)": { oz: "Буйруқ файли (PDF/Расм юклаш)", ru: "Файл приказа (PDF/Изображение)" },
    "Qaysi davlatga ketgan?": { oz: "Қайси давлатга кетган?", ru: "В какую страну выехал?" },
    "Jo'nab ketgan sana": { oz: "Жўнаб кетган сана", ru: "Дата отъезда" },
    "Ketish sababi": { oz: "Кетиш сабаби", ru: "Причина отъезда" },
    "Kim bilan ketgan?": { oz: "Ким билан кетган?", ru: "С кем уехал?" },
    "Chet eldagi manzili (Yoki telefon)": { oz: "Чет элдаги манзили (Ёки телефон)", ru: "Адрес за границей (или телефон)" },
    "E-maktab platformasi holati": { oz: "E-maktab платформаси ҳолати", ru: "Статус на платформе E-maktab" },
    "Xorijdan Qaytarib Olib Kelinganlar": { oz: "Хориждан Қайтариб Олиб Келинганлар", ru: "Возвращённые из-за границы" },
    "Qaytgan Sana": { oz: "Қайтган Сана", ru: "Дата возвращения" },
    "Qabul qilingan Maktab / Sinf": { oz: "Қабул қилинган Мактаб / Синф", ru: "Принятая Школа / Класс" },
    "Mas'ul / Vaqt": { oz: "Масъул / Вақт", ru: "Ответственный / Время" },
    "Buyruq raqami va Fayl": { oz: "Буйруқ рақами ва Файл", ru: "Номер приказа и Файл" },
    "Tuman nomi": { oz: "Туман номи", ru: "Название района" },
    "Xorijdagi jami": { oz: "Хориждаги жами", ru: "Всего за рубежом" },
    "Qonuniy ketgan": { oz: "Қонуний кетган", ru: "Законно выехавшие" },
    "Noqonuniy ketgan": { oz: "Ноқонуний кетган", ru: "Незаконно выехавшие" },
    "Qaytarib kelingan": { oz: "Қайтариб келинган", ru: "Возвращённые" },
    "Hudud / Maktab": { oz: "Ҳудуд / Мактаб", ru: "Регион / Школа" },
    "Davlati / Sana": { oz: "Давлати / Сана", ru: "Страна / Дата" },
    "Qonuniylik (Asoslar)": { oz: "Қонунийлик (Асослар)", ru: "Законность (Основания)" },
    "Fayllar (PDF)": { oz: "Файллар (PDF)", ru: "Файлы (PDF)" },
    "O'quvchi maktabga qaytdi": { oz: "Ўқувчи мактабга қайтди", ru: "Учащийся вернулся в школу" },
    "Qaytgan sana": { oz: "Қайтган сана", ru: "Дата возвращения" },
    "Bekor qilish": { oz: "Бекор қилиш", ru: "Отмена" },

    // Inspektor Page (Inspektor Nazorati)
    "Inspektor-Psixolog Bo'limi": { oz: "Инспектор-Психолог Бўлими", ru: "Отдел инспектора-психолога" },
    "O'zingizga biriktirilgan maktablar davomatini kuzating va tahlil qiling": { oz: "Ўзингизга бириктирилган мактаблар давоматини кузатинг ва таҳлил қилинг", ru: "Отслеживайте и анализируйте посещаемость закреплённых школ" },
    "Shaxsiy ma'lumotlar": { oz: "Шахсий маълумотлар", ru: "Личные данные" },
    "F.I.SH (To'liq ism-familiya)": { oz: "Ф.И.Ш (Тўлиқ исм-фамилия)", ru: "Ф.И.О. (Полное имя)" },
    "Telefon raqam": { oz: "Телефон рақам", ru: "Номер телефона" },
    "Hudud va maktablar": { oz: "Ҳудуд ва мактаблар", ru: "Регион и школы" },
    "Sizning hududingizni tanlang": { oz: "Сизнинг ҳудудингизни танланг", ru: "Выберите ваш регион" },
    "Sizga biriktirilgan maktablar (Maksimum 10 ta)": { oz: "Сизга бириктирилган мактаблар (Максимум 10 та)", ru: "Закреплённые за вами школы (Максимум 10)" },
    "Avval hududni tanlang": { oz: "Аввал ҳудудни танланг", ru: "Сначала выберите регион" },
    "Tozalash": { oz: "Тозалаш", ru: "Очистить" },
    "Hisobotni ko'rish": { oz: "Ҳисоботни кўриш", ru: "Посмотреть отчёт" },
    "O'zgartirish": { oz: "Ўзгартириш", ru: "Изменить" },
    "Maktablar": { oz: "Мактаблар", ru: "Школы" },
    "Hisobot berdi": { oz: "Ҳисобот берди", ru: "Сдали отчёт" },
    "Trend (7 kun)": { oz: "Тренд (7 кун)", ru: "Тренд (7 дней)" },
    "O'quvchi": { oz: "Ўқувчи", ru: "Учащийся" },
    "Sababli": { oz: "Сабабли", ru: "Уважительно" },
    "Davomat %": { oz: "Давомат %", ru: "Посещаемость %" },
    "Holat": { oz: "Ҳолат", ru: "Статус" },
    "Bildirgi": { oz: "Билдирги", ru: "Уведомление" },
    "Ota-onasi": { oz: "Ота-онаси", ru: "Родитель" },
    "Telefon": { oz: "Телефон", ru: "Телефон" },

    // Dashboard Items & Tables
    "Hudud nomi": { oz: "Ҳудуд номи", ru: "Название региона" },
    "Sinflar": { oz: "Синфлар", ru: "Классы" },
    "O'quvchilar": { oz: "Ўқувчилар", ru: "Учащиеся" },
    "Jami kelmagan": { oz: "Жами келмаган", ru: "Всего отсутствующих" },
    "Kecha %": { oz: "Кеча %", ru: "Вчера %" },
    "Bugun %": { oz: "Бугун %", ru: "Сегодня %" },
    "Mas'ul": { oz: "Масъул", ru: "Ответственный" },
    "Kasalligi": { oz: "Касаллиги", ru: "Болезнь" },
    "Tadbirlar": { oz: "Тадбирлар", ru: "Мероприятия" },
    "Oilaviy": { oz: "Оилавий", ru: "Семейные" },
    "Ijtimoiy": { oz: "Ижтимоий", ru: "Социальные" },
    "Boshqa": { oz: "Бошқа", ru: "Другие" },
    "Muntazam": { oz: "Мунтазам", ru: "Систематически" },
    "Qidiruv": { oz: "Қидирув", ru: "Розыск" },
    "Chet el": { oz: "Чет эл", ru: "За рубежом" },
    "Bo‘yin tovlagan": { oz: "Бўйин товлаган", ru: "Уклонение" },
    "Ishlab yurgan": { oz: "Ишлаб юрган", ru: "Работающие" },
    "Qarshilik": { oz: "Қаршилик", ru: "Препятствие родителей" },
    "Jazo/Tergov": { oz: "Жазо/Тергов", ru: "Наказание/Следствие" },
    "Nazoratsiz": { oz: "Назоратсиз", ru: "Безнадзорные" },
    "Turmushga chiqqan": { oz: "Турмушга чиққан", ru: "Замужем" },
    "Boshqa sababsiz": { oz: "Бошқа сабабсиз", ru: "Другие неуважительные" },
    "Sababli kelmaganlar": { oz: "Сабабли келмаганлар", ru: "Отсутствующие по уважительной причине" },
    "Sababsiz kelmaganlar": { oz: "Сабабсиз келмаганлар", ru: "Отсутствующие по неуважительной причине" },
    "Maktab nomi": { oz: "Мактаб номи", ru: "Название школы" },
    "🏆 Eng yaxshi natijalar": { oz: "🏆 Энг яхши натижалар", ru: "🏆 Лучшие результаты" },
    "📉 E'tibor talab hududlar": { oz: "📉 Эътибор талаб ҳудудлар", ru: "📉 Регионы, требующие внимания" },
    "Hududlar kesimida davomat (Solishtirma)": { oz: "Ҳудудлар кесимида давомат (Солиштирма)", ru: "Посещаемость по регионам (Сравнение)" },
    "Davomat sabablari (Turlari bo'yicha)": { oz: "Давомат сабаблари (Турлари бўйича)", ru: "Причины отсутствия (По категориям)" },
    "30 kunlik davomat dinamikasi": { oz: "30 кунлик давомат динамикаси", ru: "Динамика посещаемости за 30 дней" },
    "PRO imkoniyatlariga ega bo'ling": { oz: "PRO имкониятларига эга бўлинг", ru: "Получите возможности PRO" },
    "Yangi parol": { oz: "Янги парол", ru: "Новый пароль" },
    "Natijalar": { oz: "Натижалар", ru: "Результаты" },

    // Table column abbreviations & terms
    "Kas.": { oz: "Кас.", ru: "Бол." },
    "Tad.": { oz: "Тад.", ru: "Мер." },
    "Oil.": { oz: "Оил.", ru: "Сем." },
    "Ijt.": { oz: "Ижт.", ru: "Соц." },
    "Bos.": { oz: "Бош.", ru: "Др." },
    "Mun.": { oz: "Мун.", ru: "Сист." },
    "Qid.": { oz: "Қид.", ru: "Роз." },
    "Ch.el": { oz: "Ч.эл", ru: "Загр." },
    "Bo‘y.": { oz: "Бўй.", ru: "Укл." },
    "Ish": { oz: "Иш", ru: "Раб." },
    "Qar.": { oz: "Қар.", ru: "Преп." },
    "Jaz.": { oz: "Жаз.", ru: "Нак." },
    "Naz.": { oz: "Наз.", ru: "Безн." },
    "Tur.": { oz: "Тур.", ru: "Зам." },
    "Holat": { oz: "Ҳолат", ru: "Статус" },

    // 19 Tuman va shaharlar
    "Farg'ona shahri": { oz: "Фарғона шаҳри", ru: "г. Фергана" },
    "Marg'ilon shahri": { oz: "Марғилон шаҳри", ru: "г. Маргилан" },
    "Qo'qon shahri": { oz: "Қўқон шаҳри", ru: "г. Коканд" },
    "Quvasoy shahri": { oz: "Қувасой шаҳри", ru: "г. Кувасай" },
    "Bag'dod tumani": { oz: "Бағдод тумани", ru: "Багдадский район" },
    "Beshariq tumani": { oz: "Бешариқ тумани", ru: "Бешарыкский район" },
    "Buvayda tumani": { oz: "Бувайда тумани", ru: "Бувайдинский район" },
    "Dang'ara tumani": { oz: "Данғара тумани", ru: "Дангаринский район" },
    "Yozyovon tumani": { oz: "Ёзёвон тумани", ru: "Язъяванский район" },
    "Oltiariq tumani": { oz: "Олтиариқ тумани", ru: "Алтыарыкский район" },
    "Qo'shtepa tumani": { oz: "Қўштепа тумани", ru: "Куштепинский район" },
    "So'x tumani": { oz: "Сўх тумани", ru: "Сохский район" },
    "Rishton tumani": { oz: "Риштон тумани", ru: "Риштанский район" },
    "Toshloq tumani": { oz: "Тошлоқ тумани", ru: "Ташлакский район" },
    "Uchko'prik tumani": { oz: "Учкўприк тумани", ru: "Учкуприкский район" },
    "Farg'ona tumani": { oz: "Фарғона тумани", ru: "Ферганский район" },
    "O'zbekiston tumani": { oz: "Ўзбекистон тумани", ru: "Узбекистанский район" },
    "Quva tumani": { oz: "Қува тумани", ru: "Кувинский район" },
    "Furqat tumani": { oz: "Фурқат тумани", ru: "Фуркатский район" },

    // Short names
    "Farg'ona": { oz: "Фарғона", ru: "Фергана" },
    "Marg'ilon": { oz: "Марғилон", ru: "Маргилан" },
    "Qo'qon": { oz: "Қўқон", ru: "Коканд" },
    "Quvasoy": { oz: "Қувасой", ru: "Кувасай" },
    "Bag'dod": { oz: "Бағдод", ru: "Багдад" },
    "Beshariq": { oz: "Бешариқ", ru: "Бешарык" },
    "Buvayda": { oz: "Бувайда", ru: "Бувайда" },
    "Dang'ara": { oz: "Данғара", ru: "Дангара" },
    "Yozyovon": { oz: "Ёзёвон", ru: "Язъяван" },
    "Oltiariq": { oz: "Олтиариқ", ru: "Алтыарык" },
    "Qo'shtepa": { oz: "Қўштепа", ru: "Куштепа" },
    "So'x": { oz: "Сўх", ru: "Сох" },
    "Rishton": { oz: "Риштон", ru: "Риштан" },
    "Toshloq": { oz: "Тошлоқ", ru: "Ташлак" },
    "Uchko'prik": { oz: "Учкўприк", ru: "Учкуприк" },
    "O'zbekiston": { oz: "Ўзбекистон", ru: "Узбекистан" },
    "Quva": { oz: "Қува", ru: "Кува" },
    "Furqat": { oz: "Фурқат", ru: "Фуркат" }
};
window.UI_TRANSLATIONS = UI_TRANSLATIONS;

function autoTranslateUI(lang) {
    if (!lang) lang = localStorage.getItem('lang') || 'uz';
    const selector = 'h1, h2, h3, h4, h5, h6, button, .btn, a.btn, a.quick-link, .quick-link span, .tab-btn, .tab-btn-ins, .sidebar-sub-item span, .sidebar-nav-link span, label, th, .stats-item span:first-child, .toggle-left div, .legend-item, .home-stat-label, .card-holder-name, .toggle-status-text, .work-tag span, .profile-post, .setup-warning, .section-title p, .ins-header p, .oferta-header p, .oferta-section h3, .oferta-section p, .oferta-section li, .oferta-badge, .stat-mini .label, select option, .form-group label';
    
    document.querySelectorAll(selector).forEach(el => {
        if (el.hasAttribute('data-i18n')) return;
        if (el.closest('tbody')) return;

        if (el._origUiText === undefined) {
            const clone = el.cloneNode(true);
            clone.querySelectorAll('i, svg, img, input, select').forEach(n => n.remove());
            el._origUiText = clone.textContent.trim();
        }

        const orig = el._origUiText;
        if (!orig || !UI_TRANSLATIONS[orig]) return;

        const trans = lang === 'uz' ? orig : (UI_TRANSLATIONS[orig][lang] || orig);

        const span = el.querySelector('span');
        const icon = el.querySelector('i');
        if (span && span.textContent.trim() === orig) {
            span.textContent = trans;
        } else if (icon) {
            el.innerHTML = icon.outerHTML + ' ' + trans;
        } else if (el.children.length === 0) {
            el.textContent = trans;
        } else {
            for (let child of el.childNodes) {
                if (child.nodeType === Node.TEXT_NODE && child.textContent.trim() === orig) {
                    child.textContent = ' ' + trans + ' ';
                }
            }
        }
    });

    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
        if (el.hasAttribute('data-i18n')) return;
        if (el._origPlaceholder === undefined) {
            el._origPlaceholder = el.placeholder.trim();
        }
        const orig = el._origPlaceholder;
        if (orig && UI_TRANSLATIONS[orig]) {
            el.placeholder = lang === 'uz' ? orig : (UI_TRANSLATIONS[orig][lang] || orig);
        }
    });

    document.querySelectorAll('select option').forEach(opt => {
        if (opt.hasAttribute('data-i18n')) return;
        if (opt._origText === undefined) {
            opt._origText = opt.textContent.trim();
        }
        const orig = opt._origText;
        if (orig && UI_TRANSLATIONS[orig]) {
            opt.textContent = lang === 'uz' ? orig : (UI_TRANSLATIONS[orig][lang] || orig);
        }
    });

    document.querySelectorAll('[title]').forEach(el => {
        if (el.hasAttribute('data-i18n')) return;
        if (el._origTitle === undefined) {
            el._origTitle = el.getAttribute('title').trim();
        }
        const orig = el._origTitle;
        if (orig && UI_TRANSLATIONS[orig]) {
            el.setAttribute('title', lang === 'uz' ? orig : (UI_TRANSLATIONS[orig][lang] || orig));
        }
    });
}
window.autoTranslateUI = autoTranslateUI;


function copyCardNumber(cardNum, cardName) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cardNum).then(() => {
            showToast(`${cardName} raqami nusxalandi: ${cardNum}`, 'success');
        }).catch(() => fallbackCopy(cardNum, cardName));
    } else {
        fallbackCopy(cardNum, cardName);
    }
}

function fallbackCopy(text, name) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        showToast(`${name} raqami nusxalandi: ${text}`, 'success');
    } catch (e) {
        prompt(`${name} karta raqami:`, text);
    }
    document.body.removeChild(ta);
}

// -------------------------------------------------------------
// IMPROVED SILKY SMOOTH SIDEBAR TOGGLE
// -------------------------------------------------------------
function toggleSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const main = document.querySelector('.app-main-viewport') || document.querySelector('.main-content-wrapper');
    const floatIcon = document.getElementById('sidebarFloatingIcon');
    const edgeIcon = document.getElementById('sidebarEdgeIcon');

    if (!sidebar) return;

    if (window.innerWidth <= 992) {
        sidebar.classList.toggle('mobile-open');
        const isOpen = sidebar.classList.contains('mobile-open');
        if (floatIcon) floatIcon.className = isOpen ? 'fas fa-times' : 'fas fa-bars';
    } else {
        sidebar.classList.toggle('collapsed');
        if (main) main.classList.toggle('sidebar-collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebar_collapsed', isCollapsed ? '1' : '0');
        if (floatIcon) floatIcon.className = isCollapsed ? 'fas fa-bars' : 'fas fa-chevron-left';
        if (edgeIcon) edgeIcon.className = isCollapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
    }
}


// -------------------------------------------------------------
// TELEGRAM WEBAPP MINI-APP AUTO-INTEGRATION
// -------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
    if (window.Telegram && window.Telegram.WebApp) {
        try {
            const tg = window.Telegram.WebApp;
            tg.ready();
            tg.expand();
            
            // Sync theme with Telegram
            if (tg.colorScheme === 'dark') {
                document.documentElement.classList.remove('light-mode');
                localStorage.setItem('theme', 'dark');
            } else if (tg.colorScheme === 'light') {
                document.documentElement.classList.add('light-mode');
                localStorage.setItem('theme', 'light');
            }

            // Auto-fill MMIBDO user info if provided
            const tgUser = tg.initDataUnsafe && tg.initDataUnsafe.user;
            if (tgUser) {
                const fioInp = document.getElementById('fio');
                if (fioInp && !fioInp.value) {
                    fioInp.value = `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim();
                }
            }
        } catch (e) {
            console.warn('Telegram WebApp init exception:', e);
        }
    }
});


// =====================================================================
// TELEGRAM WEBAPP INTEGRATION & AUTOMATIC ADMIN / USER DETECTION
// =====================================================================
function initTelegramWebApp() {
    try {
        if (window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            tg.ready();
            tg.expand();

            // Admin Telegram IDs from config
            const SUPER_ADMINS = [65002404, 786314811, 5310405293];
            const user = tg.initDataUnsafe && tg.initDataUnsafe.user;

            if (user) {
                console.log('Telegram WebApp User identified:', user);
                localStorage.setItem('tg_user_id', user.id);
                localStorage.setItem('tg_user_name', user.first_name + (user.last_name ? ' ' + user.last_name : ''));

                if (SUPER_ADMINS.includes(Number(user.id))) {
                    localStorage.setItem('dashboard_token', 'tg_super_admin_' + user.id);
                    localStorage.setItem('user_role', 'admin');
                    if (typeof showToast === 'function') {
                        showToast(`Xush kelibsiz, Admin (${user.first_name})! Tizim boshqaruv huquqlari berildi.`, 'success');
                    }
                }
            }
        }
    } catch (err) {
        console.warn('Telegram WebApp init notice:', err);
    }
}



// =====================================================================
// 30-SECOND DYNAMIC ROTATING PRESIDENT QUOTES SYSTEM (3 HISTORIC SPEECHES)
// =====================================================================
const PRESIDENT_SPEECHES = [
    {
        title: {
            uz: "Ilm — Taraqqiyot Poydevori",
            oz: "Илм — Тараққиёт Пойдевори",
            ru: "Знания — Фундамент Развития"
        },
        text: {
            uz: "«Biz yangi O‘zbekistonni barpo etishda faqat va faqat ilmga, ta’limga tayanamiz. Dunyoda ilmdan boshqa najot yo‘q va bo‘lishi ham mumkin emas!»",
            oz: "«Биз янги Ўзбекистонни барпо этишда фақат ва фақат илмга, таълимга таянамиз. Дунёда илмдан бошқа нажот йўқ va бўлиши ҳам мумкин эмас!»",
            ru: "«В строительстве нового Узбекистана мы опираемся исключительно на науку и просвещение. В мире нет и не может быть иного спасения, кроме знаний!»"
        }
    },
    {
        title: {
            uz: "Ta'lim — Millat Najoti va Kelajagi",
            oz: "Таълим — Миллат Нажоти ва Келажаги",
            ru: "Образование — Спасение и Будущее Нации"
        },
        text: {
            uz: "«Maktab – bu faqatgina ta’lim maskani emas, balki jamiyatning ma’naviy poydevori, ertangi kunimizni belgilovchi eng muqaddas dargohdir. O‘qituvchi va murabbiylarning mehnati har qanday e’tirofdan ustundir.»",
            oz: "«Мактаб – бу фақатгина таълим маскани эмас, балки жамиятнинг маънавий пойдевори, эртанги кунимизни белгиловчи энг муқаддас даргоҳдир. Ўқитувчи ва мураббийларнинг меҳнати ҳар қандай эътирофдан устундир.»",
            ru: "«Школа – это не просто образовательное учреждение, а духовный фундамент общества, священная обитель, определяющая наше завтрашний день. Труд учителей и наставников выше любого признания.»"
        }
    },
    {
        title: {
            uz: "Ustoz va Murabbiylarga Ehtirom",
            oz: "Устоз ва Мураббийларга Эҳтиром",
            ru: "Уважение к Учителям и Наставникам"
        },
        text: {
            uz: "«O‘qituvchi – mehr daryosi, o‘qituvchi – ezgulik bulog‘i, o‘qituvchi – ma’rifat quyoshi! Ustozlar bugun yoshlar qalbiga qadayotgan ma’rifat va ezgulik urug‘ining hosilidan ertaga butun jamiyat bahramand bo‘ladi.»",
            oz: "«Ўқитувчи – меҳр дарёси, ўқитувчи – эзгулик булоғи, ўқитувчи – маърифат қуёши! Устозлар бугун ёшlar қалбига қадаётган маърифат ва эзгулик уруғининг ҳосилидан эртага бутун жамият баҳраманд бўлади.»",
            ru: "«Учитель – это река доброты, источник созидания, солнце просвещения! Плодами семян знаний и благородства, которые наставники сегодня закладывают в сердца молодежи, завтра будет наслаждаться все общество.»"
        }
    }
];

let currentQuoteIndex = 0;
let quoteRotateInterval = null;

function renderPresidentQuote(idx) {
    if (idx < 0 || idx >= PRESIDENT_SPEECHES.length) idx = 0;
    currentQuoteIndex = idx;
    const currentLang = localStorage.getItem('lang') || 'uz';
    const speech = PRESIDENT_SPEECHES[idx];

    const quoteTitleEl = document.getElementById('presidentQuoteTitle');
    const quoteTextEl = document.getElementById('presidentQuoteText');
    const quoteTitleDavomat = document.getElementById('presidentQuoteTitleDavomat');
    const quoteTextDavomat = document.getElementById('presidentQuoteTextDavomat');

    // Trigger smooth fade out
    [quoteTextEl, quoteTextDavomat].forEach(el => {
        if (el) el.classList.add('quote-fade-out');
    });

    setTimeout(() => {
        const titleText = speech.title[currentLang] || speech.title.uz;
        const bodyText = speech.text[currentLang] || speech.text.uz;

        if (quoteTitleEl) quoteTitleEl.textContent = titleText;
        if (quoteTextEl) quoteTextEl.textContent = bodyText;
        if (quoteTitleDavomat) quoteTitleDavomat.textContent = titleText;
        if (quoteTextDavomat) quoteTextDavomat.textContent = bodyText;

        // Update dots
        document.querySelectorAll('.quote-indicator-dots').forEach(wrap => {
            const dots = wrap.querySelectorAll('.quote-dot');
            dots.forEach((dot, dIdx) => {
                dot.classList.toggle('active', dIdx === idx);
            });
        });

        // Fade in
        [quoteTextEl, quoteTextDavomat].forEach(el => {
            if (el) el.classList.remove('quote-fade-out');
        });
    }, 380);
}

function switchPresidentQuote(idx) {
    renderPresidentQuote(idx);
    restartQuoteRotationTimer();
}
window.switchPresidentQuote = switchPresidentQuote;

function startQuoteRotation() {
    renderPresidentQuote(0);
    restartQuoteRotationTimer();
}

function restartQuoteRotationTimer() {
    if (quoteRotateInterval) clearInterval(quoteRotateInterval);
    // Cycle every 30 seconds
    quoteRotateInterval = setInterval(() => {
        currentQuoteIndex = (currentQuoteIndex + 1) % PRESIDENT_SPEECHES.length;
        renderPresidentQuote(currentQuoteIndex);
    }, 30000);
}

window.addEventListener('languageChanged', () => {
    renderPresidentQuote(currentQuoteIndex);
});


// =====================================================================
// CINEMATIC RESPONSIVE INTRO VIDEO CONTROLLER (10-SEKUNDLIK VIDEO)
// =====================================================================
let splashTimer = null;

function initIntroSplash() {
    const splash = document.getElementById('appIntroSplash');
    if (!splash) return;

    const pName = (window.location.pathname.split('/').pop().replace('.html', '') || 'index');
    if (pName !== 'index') {
        splash.style.display = 'none';
        try { splash.remove(); } catch(e){}
        return;
    }

    const video = document.getElementById('splashIntroVideo');
    const progressBar = document.getElementById('splashVideoProgressBar');
    const timerText = document.getElementById('splashVideoTimerText');
    let videoDuration = 10;
    let hasEnded = false;

    if (video) {
        video.muted = true;
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {
                console.log('Video autoplay muted fallback');
            });
        }

        video.addEventListener('loadedmetadata', () => {
            if (video.duration && !isNaN(video.duration) && video.duration > 0) {
                videoDuration = video.duration;
            }
        });

        video.addEventListener('timeupdate', () => {
            if (videoDuration > 0 && !hasEnded) {
                const current = Math.min(videoDuration, video.currentTime);
                const pct = Math.min(100, Math.floor((current / videoDuration) * 100));
                if (progressBar) progressBar.style.width = pct + '%';
                if (timerText) timerText.textContent = `${Math.floor(current)}s / ${Math.ceil(videoDuration)}s`;
            }
        });

        video.addEventListener('ended', () => {
            if (!hasEnded) {
                hasEnded = true;
                finishSplashScreen();
            }
        });
    }

    // Safety fallback: auto-finish after 10.8 seconds so it never hangs
    splashTimer = setTimeout(() => {
        if (!hasEnded) {
            hasEnded = true;
            finishSplashScreen();
        }
    }, 10800);
}

function toggleSplashSound() {
    const video = document.getElementById('splashIntroVideo');
    const icon = document.getElementById('splashSoundIcon');
    const btn = document.getElementById('splashSoundBtn');
    if (!video) return;

    video.muted = !video.muted;
    if (icon) {
        icon.className = video.muted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
    }
    if (btn) {
        const span = btn.querySelector('span');
        if (span) span.textContent = video.muted ? 'Ovoz' : 'Ovoz Yoqilgan';
    }
}
window.toggleSplashSound = toggleSplashSound;

function finishSplashScreen() {
    if (splashTimer) clearTimeout(splashTimer);
    const video = document.getElementById('splashIntroVideo');
    if (video) {
        try { video.pause(); } catch(e){}
    }

    const splash = document.getElementById('appIntroSplash');
    if (splash) {
        splash.classList.add('fade-out');
        setTimeout(() => {
            splash.style.setProperty('display', 'none', 'important');
            splash.style.setProperty('pointer-events', 'none', 'important');
            try { splash.remove(); } catch(e){}
        }, 700);
    }
}
window.finishSplashScreen = finishSplashScreen;

window.addEventListener('load', () => {
    if (typeof updateTopHeaderAuth === 'function') updateTopHeaderAuth();
});
window.addEventListener('pageshow', () => {
    if (typeof updateTopHeaderAuth === 'function') updateTopHeaderAuth();
});
