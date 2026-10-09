// Between Us Interactive Partner Promo Widget (Shatter Exit & Minimized Right Tab)
(function() {
    if (document.getElementById('betweenus-promo-container')) return;

    // Inject Styles
    const style = document.createElement('style');
    style.id = 'betweenus-promo-advanced-styles';
    style.textContent = `
        .bu-promo-container {
            position: fixed;
            bottom: 30px;
            right: 24px;
            z-index: 9999;
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
        }
        .bu-promo-card {
            background: rgba(15, 23, 42, 0.94);
            backdrop-filter: blur(25px);
            -webkit-backdrop-filter: blur(25px);
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 20px;
            box-shadow: 0 15px 45px rgba(0, 0, 0, 0.5), 0 0 25px rgba(99, 102, 241, 0.25);
            padding: 16px 20px;
            width: 290px;
            color: #ffffff;
            position: relative;
            transform-origin: bottom right;
        }
        .bu-promo-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 10px;
        }
        .bu-badge {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            background: linear-gradient(135deg, #6366f1, #a855f7);
            color: #fff;
            padding: 3px 10px;
            border-radius: 10px;
            font-weight: 700;
        }
        .bu-close-btn {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #cbd5e1;
            cursor: pointer;
            font-size: 13px;
            width: 26px;
            height: 26px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.25s ease;
        }
        .bu-close-btn:hover {
            color: #fff;
            background: rgba(239, 68, 68, 0.7);
            border-color: #ef4444;
            transform: scale(1.15) rotate(90deg);
        }
        .bu-content-flex {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
        }
        .bu-logo-img {
            width: 52px;
            height: 52px;
            border-radius: 12px;
            object-fit: contain;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.12);
            padding: 2px;
            flex-shrink: 0;
        }
        .bu-title {
            font-size: 14.5px;
            font-weight: 700;
            margin-bottom: 2px;
            color: #f8fafc;
        }
        .bu-desc {
            font-size: 11.5px;
            color: #cbd5e1;
            line-height: 1.35;
            margin: 0;
        }
        .bu-buttons {
            display: flex;
            gap: 8px;
        }
        .bu-btn {
            flex: 1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 8px 12px;
            font-size: 12px;
            font-weight: 700;
            border-radius: 10px;
            text-decoration: none;
            color: #ffffff;
            transition: all 0.2s ease;
        }
        .bu-btn-tg {
            background: linear-gradient(135deg, #0284c7, #0ea5e9);
            box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
        }
        .bu-btn-tg:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(2, 132, 199, 0.5);
        }
        .bu-btn-ig {
            background: linear-gradient(135deg, #ec4899, #f43f5e);
            box-shadow: 0 4px 12px rgba(236, 72, 153, 0.35);
        }
        .bu-btn-ig:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(236, 72, 153, 0.5);
        }

        /* Shatter Animation */
        @keyframes glassShatterExit {
            0% { transform: scale(1) rotate(0deg); opacity: 1; }
            25% { transform: scale(1.04) rotate(-3deg); box-shadow: 0 0 35px rgba(236, 72, 153, 0.8); }
            100% { transform: translateX(130%) rotate(14deg) scale(0.6); opacity: 0; filter: blur(8px); }
        }
        .bu-promo-container.shattered {
            animation: glassShatterExit 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
            pointer-events: none;
        }

        /* Persistent Re-open Pill Tab on Right Edge */
        .bu-minimized-tab {
            position: fixed;
            bottom: 120px;
            right: 0;
            background: linear-gradient(135deg, #ec4899, #8b5cf6);
            color: #ffffff;
            padding: 8px 14px 8px 10px;
            border-radius: 14px 0 0 14px;
            box-shadow: -4px 0 18px rgba(236, 72, 153, 0.45);
            cursor: pointer;
            display: none;
            align-items: center;
            gap: 6px;
            font-size: 11.5px;
            font-weight: 700;
            z-index: 9998;
            transition: all 0.25s ease;
        }
        .bu-minimized-tab:hover {
            transform: translateX(-5px);
            box-shadow: -6px 0 22px rgba(236, 72, 153, 0.65);
        }
    `;
    document.head.appendChild(style);

    // Create Elements
    const container = document.createElement('div');
    container.id = 'betweenus-promo-container';
    container.className = 'bu-promo-container';

    container.innerHTML = `
        <div class="bu-promo-card" id="buPromoCard">
            <div class="bu-promo-header">
                <span class="bu-badge">✨ RASMIY HAMKOR</span>
                <button class="bu-close-btn" id="buCloseBtn" title="Yopish (Kichraytirish)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="bu-content-flex">
                <img src="assets/partners/between_us_2.png" onerror="this.src='../assets/partners/between_us_2.png'" alt="Between Us" class="bu-logo-img">
                <div>
                    <div class="bu-title">Between Us</div>
                    <p class="bu-desc">Ta'lim va yoshlar loyihalari hamkori rasmiy sahifalariga obuna bo'ling!</p>
                </div>
            </div>
            <div class="bu-buttons">
                <a href="https://t.me/between_us_team" target="_blank" class="bu-btn bu-btn-tg">
                    <i class="fab fa-telegram-plane"></i> Telegram
                </a>
                <a href="https://instagram.com/betweenus_uz" target="_blank" class="bu-btn bu-btn-ig">
                    <i class="fab fa-instagram"></i> Instagram
                </a>
            </div>
        </div>
    `;

    // Minimized right edge tab
    const tab = document.createElement('div');
    tab.id = 'betweenus-minimized-tab';
    tab.className = 'bu-minimized-tab';
    tab.innerHTML = `<i class="fas fa-handshake" style="color:#facc15;"></i> <span>Hamkor</span>`;
    tab.title = "Between Us hamkorlik kartasini ochish";

    document.body.appendChild(container);
    document.body.appendChild(tab);

    const closeBtn = container.querySelector('#buCloseBtn');
    
    // Check initial state
    const isMinimized = localStorage.getItem('bu_minimized') === 'true';
    if (isMinimized) {
        container.style.display = 'none';
        tab.style.display = 'flex';
    }

    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        container.classList.add('shattered');
        localStorage.setItem('bu_minimized', 'true');
        setTimeout(() => {
            container.style.display = 'none';
            container.classList.remove('shattered');
            tab.style.display = 'flex';
        }, 480);
    });

    tab.addEventListener('click', () => {
        tab.style.display = 'none';
        container.style.display = 'block';
        container.style.transform = 'scale(0.8) translateX(60px)';
        container.style.opacity = '0';
        localStorage.setItem('bu_minimized', 'false');
        setTimeout(() => {
            container.style.transform = 'scale(1) translateX(0)';
            container.style.opacity = '1';
        }, 50);
    });
})();
