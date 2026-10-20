/* Landing page controller. Shared behavior lives in core/app-core.js. */
document.documentElement.dataset.cecPage = 'landing';

/*
 * Mobile landing-page navigation.
 * Uses the existing public-nav links so desktop behavior and all
 * existing data-scroll functionality remain unchanged.
 */
document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.public-index-page .public-header');
    const nav = document.querySelector('.public-index-page .public-nav');
    if (!header || !nav || document.getElementById('landingMobileMenuBtn')) return;

    const menuButton = document.createElement('button');
    menuButton.id = 'landingMobileMenuBtn';
    menuButton.className = 'landing-mobile-menu-btn';
    menuButton.type = 'button';
    menuButton.setAttribute('aria-label', 'Open navigation menu');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.innerHTML = '☰';

    const closeButton = document.createElement('button');
    closeButton.id = 'landingMobileMenuClose';
    closeButton.className = 'landing-mobile-menu-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close navigation menu');
    closeButton.innerHTML = '×';

    const overlay = document.createElement('div');
    overlay.id = 'landingMobileMenuOverlay';
    overlay.className = 'landing-mobile-menu-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    nav.insertBefore(closeButton, nav.firstElementChild);
    document.body.appendChild(overlay);
    header.appendChild(menuButton);

    const closeMenu = () => {
        nav.classList.remove('mobile-open');
        overlay.classList.remove('show');
        menuButton.setAttribute('aria-expanded', 'false');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('mobile-menu-open');
    };

    const openMenu = () => {
        nav.classList.add('mobile-open');
        overlay.classList.add('show');
        menuButton.setAttribute('aria-expanded', 'true');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('mobile-menu-open');
    };

    menuButton.addEventListener('click', () => {
        if (nav.classList.contains('mobile-open')) closeMenu();
        else openMenu();
    });

    closeButton.addEventListener('click', closeMenu);
    overlay.addEventListener('click', closeMenu);

    nav.querySelectorAll('button[data-scroll]').forEach(link => {
        const navigateToSection = (event) => {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }

            const targetId = link.getAttribute('data-scroll');
            const target = document.getElementById(targetId);
            if (!target) return;

            // Use an explicit page scroll instead of scrollIntoView().
            // This avoids mobile drawer/fixed-header interactions and keeps
            // the section title visible below the fixed CEC header.
            const headerHeight = header.offsetHeight || 62;
            const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - headerHeight - 8);
            window.scrollTo({ top, behavior: 'smooth' });

            closeMenu();
        };

        // Assign directly so this mobile handler takes priority over the
        // shared data-scroll handler in app-core.js.
        link.onclick = navigateToSection;
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeMenu();
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 520) closeMenu();
    });
});
