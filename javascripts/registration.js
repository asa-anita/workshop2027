/*
 * ANITA 2027 registration form (registration.html).
 *
 * Plain JavaScript, no dependencies. Everything lives inside an IIFE so
 * nothing leaks into the global scope.
 *
 * What this script does:
 *   1. Shows or hides the conditional parts of the form (school questions,
 *      workshop questions, social events, the "own project" pitch, the talk
 *      details). Hidden parts have their inputs DISABLED, so the browser's
 *      built-in validation and the submission both skip them.
 *   2. Enforces "attend at least one of the school / the workshop".
 *   3. Counts the words in the talk abstract and flags an over-long one.
 *   4. Submits the form according to CONFIG (see below), or, while no
 *      endpoint is configured ("preview mode"), sends nothing and shows a
 *      summary of what would have been submitted.
 */
(function () {
    'use strict';

    /* ------------------------------------------------------------------
     * CONFIG: the only part that needs editing once a backend is chosen.
     * ------------------------------------------------------------------
     *
     * endpoint
     *   Where to POST the registration. Leave as "" for PREVIEW MODE: the
     *   form sends nothing anywhere and instead shows a readable summary of
     *   what would be submitted, plus a "not yet connected" notice on the
     *   page.
     *
     *   Option (a): a Google Form (past ANITA years used these).
     *     1. Build a Google Form whose questions match this form. Option
     *        text for dropdown, radio and checkbox questions must match the
     *        value attributes in registration.html EXACTLY (Google rejects
     *        non-matching values silently).
     *     2. Use the form's "Get pre-filled link" feature to find the entry
     *        id of each question (entry.123456789).
     *     3. Set endpoint to the form's response URL, i.e. the viewform URL
     *        with "viewform" replaced by "formResponse":
     *          https://docs.google.com/forms/d/e/<FORM_ID>/formResponse
     *     4. Fill in fieldMap below: our field name -> "entry.NNNN".
     *     Google does not allow cross-origin reads, so the request is sent
     *     with mode "no-cors" and the response cannot be inspected: the
     *     page can only detect network failures, not a rejected submission.
     *     Check the first few responses in the Form's Responses tab.
     *
     *   Option (b): a form service such as Formspree (https://formspree.io).
     *     Set endpoint to the service's form URL, leave fieldMap empty (the
     *     field names are then sent as they are) and set mode to "cors" so
     *     that HTTP errors are detected and reported to the person
     *     registering.
     *
     * fieldMap
     *   Maps our field names to the names the endpoint expects (Google Form
     *   "entry.NNNN" ids). If empty, field names are sent unchanged. If
     *   non-empty, fields missing from the map are NOT sent and a warning
     *   is logged to the browser console. Multi-value fields (attend,
     *   social, project_themes) are sent as repeated keys, which is what
     *   Google Forms expects for checkbox questions.
     *
     * mode
     *   fetch() mode: "no-cors" (default; needed for Google Forms) or
     *   "cors" (for services that send CORS headers, such as Formspree).
     *
     * abstractWordLimit
     *   Maximum words in the talk abstract.
     */
    var CONFIG = {
        endpoint: '',
        fieldMap: {
            // Example (uncomment and complete when using a Google Form):
            // full_name: 'entry.1111111111',
            // email: 'entry.2222222222',
        },
        mode: 'no-cors',
        abstractWordLimit: 250
    };

    /* Human-readable labels, used only for the summary shown after submit. */
    var FIELD_LABELS = {
        full_name: 'Full name',
        email: 'Email',
        pronouns: 'Pronouns',
        institution: 'Institution',
        career_stage: 'Career stage',
        asa_member: 'ASA member',
        anita_member: 'ANITA member',
        attend: 'Attending',
        social: 'Social events',
        ai_experience: 'Experience with AI tools',
        cli_comfort: 'Command-line comfort',
        git_experience: 'Git experience',
        laptop_os: 'Laptop operating system',
        github_username: 'GitHub username',
        school_goals: 'Hopes for the school',
        project_themes: 'Project themes of interest',
        project_pitch: 'Own-project pitch',
        mentor: 'Happy to mentor',
        give_talk: 'Give a talk',
        talk_title: 'Talk title',
        talk_abstract: 'Talk abstract',
        dietary: 'Dietary requirements',
        accessibility: 'Parental and accessibility needs',
        comments: 'Other comments',
        code_of_conduct: 'Agrees to ASA code of conduct'
    };

    var CONTACT_EMAIL = 'dcroton@swin.edu.au';

    /* ------------------------------------------------------------------
     * Element lookups
     * ------------------------------------------------------------------ */

    function byId(id) {
        return document.getElementById(id);
    }

    var form = byId('registration-form');
    if (!form) {
        return; // Not the registration page; nothing to do.
    }

    var el = {
        previewNote: byId('preview-note'),
        result: byId('result'),
        submitBtn: byId('submit-btn'),
        attendSchool: byId('attend-school'),
        attendWorkshop: byId('attend-workshop'),
        attendError: byId('attend-error'),
        socialBlock: byId('social-block'),
        socialWelcome: byId('social-welcome-wrap'),
        socialDinner: byId('social-dinner-wrap'),
        schoolSection: byId('school-section'),
        workshopSection: byId('workshop-section'),
        themeByo: byId('theme-byo'),
        pitchField: byId('pitch-field'),
        talkYes: byId('talk-yes'),
        talkDetails: byId('talk-details'),
        abstract: byId('talk_abstract'),
        abstractCount: byId('abstract-count'),
        abstractWarning: byId('abstract-warning'),
        abstractLimit: byId('abstract-limit')
    };

    /* ------------------------------------------------------------------
     * 1. Conditional sections
     * ------------------------------------------------------------------ */

    /**
     * Show or hide a container and disable or enable every control inside
     * it. Disabled controls are skipped by browser validation and are not
     * submitted, so hidden questions can never block or pollute a
     * registration.
     *
     * @param {HTMLElement} container Element wrapping the controls.
     * @param {boolean} active True to show and enable, false to hide and disable.
     */
    function setActive(container, active) {
        var controls = container.querySelectorAll('input, select, textarea');
        var i;
        container.hidden = !active;
        for (i = 0; i < controls.length; i += 1) {
            controls[i].disabled = !active;
        }
    }

    /**
     * Bring every conditional part of the form in line with the current
     * answers. Parents are processed before children: enabling a section
     * enables everything inside it, and the nested conditions (pitch, talk
     * details) are then applied on top.
     */
    function updateConditionals() {
        var school = el.attendSchool.checked;
        var workshop = el.attendWorkshop.checked;

        // Whole sections.
        setActive(el.schoolSection, school);
        setActive(el.workshopSection, workshop);

        // Social events: the block is shown if either event is ticked, and
        // each option only if its own event is ticked.
        el.socialBlock.hidden = !(school || workshop);
        setActive(el.socialWelcome, school);
        setActive(el.socialDinner, workshop);

        // Nested conditions (applied after their parents).
        setActive(el.pitchField, school && el.themeByo.checked);
        setActive(el.talkDetails, workshop && el.talkYes.checked);

        // Abstract state depends on whether its field is currently active.
        updateAbstract();
    }

    /* ------------------------------------------------------------------
     * 2. "Attend at least one" validation
     * ------------------------------------------------------------------ */

    var ATTEND_MESSAGE = 'Please choose at least one: the summer school, the science workshop, or both.';

    /**
     * Flag the first "attend" checkbox as invalid while neither is ticked.
     * The browser then blocks submission and shows its message; the inline
     * message (a role="alert" panel) is revealed by the invalid event below.
     */
    function validateAttend() {
        var any = el.attendSchool.checked || el.attendWorkshop.checked;
        el.attendSchool.setCustomValidity(any ? '' : ATTEND_MESSAGE);
        if (any) {
            el.attendError.hidden = true;
        }
    }

    // The invalid event fires on each failing control when submission is attempted.
    el.attendSchool.addEventListener('invalid', function () {
        el.attendError.hidden = false;
    });

    /* ------------------------------------------------------------------
     * 3. Abstract word counter
     * ------------------------------------------------------------------ */

    /**
     * Count whitespace-separated words.
     * @param {string} text
     * @returns {number}
     */
    function countWords(text) {
        var trimmed = text.trim();
        return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
    }

    /**
     * Update the live word count and the over-limit warning, and make an
     * over-long abstract fail validation (a disabled textarea is skipped,
     * so this never matters when the talk section is hidden).
     */
    function updateAbstract() {
        var limit = CONFIG.abstractWordLimit;
        var words = countWords(el.abstract.value);
        var over = words > limit;

        el.abstractCount.textContent = words + ' / ' + limit + ' words';
        // The warning sits in an aria-live region; its text only changes
        // when the over/under state changes, so it is not announced on
        // every keystroke.
        el.abstractWarning.textContent = over
            ? 'Over the limit: please shorten your abstract to ' + limit + ' words or fewer.'
            : '';
        el.abstract.setCustomValidity(over
            ? 'Please shorten your abstract to ' + limit + ' words or fewer.'
            : '');
        el.abstract.setAttribute('aria-invalid', over ? 'true' : 'false');
    }

    /* ------------------------------------------------------------------
     * 4. Collecting and submitting the data
     * ------------------------------------------------------------------ */

    /**
     * Collect the submittable [name, value] pairs, in document order.
     * Disabled (hidden) controls, unticked boxes and empty answers are
     * left out. Checkboxes sharing a name yield one pair each.
     *
     * @returns {Array<Array<string>>}
     */
    function collectPairs() {
        var pairs = [];
        Array.prototype.forEach.call(form.elements, function (control) {
            var type = control.type;
            var value;
            if (!control.name || control.disabled || type === 'submit' || type === 'button') {
                return;
            }
            if ((type === 'checkbox' || type === 'radio') && !control.checked) {
                return;
            }
            value = control.value.trim();
            if (value !== '') {
                pairs.push([control.name, value]);
            }
        });
        return pairs;
    }

    /**
     * Group pairs by name, preserving order of first appearance.
     * @param {Array<Array<string>>} pairs
     * @returns {Array<{name: string, values: string[]}>}
     */
    function groupPairs(pairs) {
        var groups = [];
        var index = {};
        pairs.forEach(function (pair) {
            if (!Object.prototype.hasOwnProperty.call(index, pair[0])) {
                index[pair[0]] = groups.length;
                groups.push({ name: pair[0], values: [] });
            }
            groups[index[pair[0]]].values.push(pair[1]);
        });
        return groups;
    }

    /**
     * Build the URL-encoded request body, applying CONFIG.fieldMap.
     * @param {Array<Array<string>>} pairs
     * @returns {URLSearchParams}
     */
    function buildBody(pairs) {
        var map = CONFIG.fieldMap || {};
        var useMap = Object.keys(map).length > 0;
        var params = new URLSearchParams();
        pairs.forEach(function (pair) {
            var key = pair[0];
            if (useMap) {
                key = map[key];
                if (!key) {
                    console.warn('registration.js: no fieldMap entry for "' + pair[0] + '"; field not sent.');
                    return;
                }
            }
            params.append(key, pair[1]);
        });
        return params;
    }

    /**
     * POST the registration to CONFIG.endpoint.
     * @param {Array<Array<string>>} pairs
     * @returns {Promise}
     */
    function send(pairs) {
        return fetch(CONFIG.endpoint, {
            method: 'POST',
            mode: CONFIG.mode,
            // A URLSearchParams body is sent as application/x-www-form-urlencoded.
            body: buildBody(pairs)
        }).then(function (response) {
            // "no-cors" responses are opaque (status 0): treat them as sent.
            if (response.type !== 'opaque' && !response.ok) {
                throw new Error('The server replied with status ' + response.status + '.');
            }
        });
    }

    /* ------------------------------------------------------------------
     * 5. Result panel (all content built with the DOM API, never innerHTML,
     *    so nothing a visitor types can be interpreted as markup)
     * ------------------------------------------------------------------ */

    /**
     * Create an element with optional text.
     * @param {string} tag
     * @param {string} [text]
     * @returns {HTMLElement}
     */
    function make(tag, text) {
        var node = document.createElement(tag);
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    }

    /** Append a (possibly multi-line) string to a node, keeping line breaks. */
    function appendMultiline(node, text) {
        text.split('\n').forEach(function (line, i) {
            if (i > 0) {
                node.appendChild(document.createElement('br'));
            }
            node.appendChild(document.createTextNode(line));
        });
    }

    /**
     * Build a two-column table (question, answer) from grouped answers.
     * @param {Array<{name: string, values: string[]}>} groups
     * @returns {HTMLElement} A .table-wrap element.
     */
    function buildSummary(groups) {
        var wrap = make('div');
        var table = make('table');
        var head = make('thead');
        var headRow = make('tr');
        var body = make('tbody');

        wrap.className = 'table-wrap';
        table.className = 'table-clean';
        headRow.appendChild(make('th', 'Field'));
        headRow.appendChild(make('th', 'Answer'));
        head.appendChild(headRow);

        groups.forEach(function (group) {
            var row = make('tr');
            var answer = make('td');
            row.appendChild(make('td', FIELD_LABELS[group.name] || group.name));
            group.values.forEach(function (value, i) {
                if (i > 0) {
                    answer.appendChild(document.createElement('br'));
                }
                appendMultiline(answer, value);
            });
            row.appendChild(answer);
            body.appendChild(row);
        });

        table.appendChild(head);
        table.appendChild(body);
        wrap.appendChild(table);
        return wrap;
    }

    /** Create a button that returns the visitor to the form. */
    function backButton(label) {
        var button = make('button', label);
        button.type = 'button';
        button.className = 'btn btn-ghost';
        button.addEventListener('click', showForm);
        return button;
    }

    /**
     * Replace the form with the result panel and move focus to it.
     * @param {boolean} warm True for the warm (error) style.
     * @param {HTMLElement[]} children Panel content.
     */
    function showPanel(warm, children) {
        el.result.className = warm ? 'callout callout-warm' : 'callout';
        el.result.textContent = '';
        children.forEach(function (child) {
            el.result.appendChild(child);
        });
        el.result.hidden = false;
        form.hidden = true;
        el.result.focus();
        el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /** Return from the result panel to the (still filled-in) form. */
    function showForm() {
        el.result.hidden = true;
        form.hidden = false;
        el.submitBtn.disabled = false;
        el.submitBtn.textContent = 'Submit registration';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        byId('full_name').focus();
    }

    /** Preview mode: nothing is sent; show what would have been. */
    function showPreview(groups) {
        showPanel(false, [
            make('h2', 'Preview only: nothing was sent'),
            make('p', 'This form is not yet connected to a registration system, so your answers have not been sent anywhere. Below is what would be submitted.'),
            buildSummary(groups),
            backButton('Back to the form')
        ]);
    }

    /** A real submission went through. */
    function showSuccess(groups) {
        var nameGroup = groups.filter(function (g) { return g.name === 'full_name'; })[0];
        var thanks = 'Thank you' + (nameGroup ? ', ' + nameGroup.values[0] : '') + '. Your registration has been submitted.';
        var note = make('p');
        var link = make('a', CONTACT_EMAIL);

        link.href = 'mailto:' + CONTACT_EMAIL;
        note.appendChild(document.createTextNode('We will be in touch by email; school places are confirmed after registration closes. If anything needs changing, contact '));
        note.appendChild(link);
        note.appendChild(document.createTextNode('.'));

        showPanel(false, [make('h2', 'Registration received'), make('p', thanks), note, make('h3', 'Your answers'), buildSummary(groups)]);
    }

    /** The submission failed (network error or a server error in "cors" mode). */
    function showError(error) {
        var note = make('p');
        var link = make('a', CONTACT_EMAIL);

        link.href = 'mailto:' + CONTACT_EMAIL;
        note.appendChild(document.createTextNode('Your answers are still in the form. Please try again, or email '));
        note.appendChild(link);
        note.appendChild(document.createTextNode(' to register.'));

        console.error('registration.js: submission failed.', error);
        showPanel(true, [make('h2', 'Sorry, your registration could not be sent'), note, backButton('Back to the form')]);
    }

    /* ------------------------------------------------------------------
     * Wiring
     * ------------------------------------------------------------------ */

    /** Re-evaluate everything that depends on the current answers. */
    function refresh() {
        validateAttend();
        updateConditionals();
    }

    // One delegated listener covers every checkbox and radio button.
    form.addEventListener('change', refresh);
    el.abstract.addEventListener('input', updateAbstract);

    // Only fires when the browser's validation has passed.
    form.addEventListener('submit', function (event) {
        var pairs;
        var groups;
        event.preventDefault();

        pairs = collectPairs();
        groups = groupPairs(pairs);

        if (!CONFIG.endpoint) {
            showPreview(groups);
            return;
        }

        el.submitBtn.disabled = true;
        el.submitBtn.textContent = 'Submitting…';
        send(pairs).then(function () {
            showSuccess(groups);
        }).catch(showError);
    });

    // Initial state. Also needed because browsers restore ticked boxes when
    // a page is reloaded or revisited with the back button.
    el.abstractLimit.textContent = String(CONFIG.abstractWordLimit);
    el.previewNote.hidden = Boolean(CONFIG.endpoint);
    refresh();
}());
