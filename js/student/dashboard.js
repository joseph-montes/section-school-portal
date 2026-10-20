/* =========================================================
   STUDENT DASHBOARD PAGE
   Handles top navigation between Home, About, Program, and Contact.
========================================================= */

document.documentElement.dataset.cecPage = "student-dashboard";

/* =========================================================
   TOP NAVIGATION
========================================================= */

function setupStudentTopNavigation() {
    const links = document.querySelectorAll(".dashboard-top-link");

    links.forEach((link) => {
        link.addEventListener("click", () => {
            const sectionName = link.dataset.topSection;

            links.forEach((item) => {
                item.classList.toggle(
                    "active",
                    item.dataset.topSection === sectionName
                );
            });
        });
    });

    const sections = document.querySelectorAll(".dashboard-top-section, .dashboard-info-section");

    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
            (entries) => {
                const visibleEntries = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

                if (!visibleEntries.length) {
                    return;
                }

                const visibleSection = visibleEntries[0].target;
                const sectionId = visibleSection.id;

                links.forEach((link) => {
                    link.classList.toggle(
                        "active",
                        link.dataset.topSection === sectionId
                    );
                });
            },
            {
                root: null,
                threshold: [0.25, 0.5, 0.75]
            }
        );

        sections.forEach((section) => observer.observe(section));
    }
}

/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    setupStudentTopNavigation();
});
