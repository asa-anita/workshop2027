/*
 * Shared page behaviour for the ANITA 2027 site.
 *
 * Pages include the header, navigation and footer snippets with
 * w3IncludeHTML() (javascripts/w3data.js), which loads them asynchronously.
 * Once the navigation snippet has arrived, highlight the link for the
 * current page.
 */
(function () {
    function currentPage() {
        var page = window.location.pathname.split("/").pop();
        return page === "" ? "index.html" : page;
    }

    function markActiveLink() {
        var links = document.querySelectorAll(".navbar-nav a");
        if (links.length === 0) {
            return false;
        }
        links.forEach(function (link) {
            if (link.getAttribute("href") === currentPage()) {
                link.parentNode.classList.add("active");
            }
        });
        return true;
    }

    document.addEventListener("DOMContentLoaded", function () {
        w3IncludeHTML();
        if (markActiveLink()) {
            return;
        }
        var observer = new MutationObserver(function () {
            if (markActiveLink()) {
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
})();
