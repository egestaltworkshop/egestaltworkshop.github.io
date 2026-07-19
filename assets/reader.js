(() => {
  const root = document.documentElement;
  const body = document.body;
  const progress = document.querySelector(".reading-progress span");
  const content = document.querySelector("#content");
  const toc = document.querySelector("#table-of-contents");
  const currentPath = window.location.pathname.split("/").pop() || "index.html";
  const storageKey = "egw-reader";
  const activeSectionListeners = [];
  let activeSectionId = "";

  const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
  if (stored.theme) root.dataset.theme = stored.theme;
  if (stored.measure) root.style.setProperty("--measure", stored.measure);
  if (stored.readingMode) body.classList.add("reading-mode");

  if (toc && toc.parentElement !== body) {
    body.appendChild(toc);
  }

  const save = () => {
    localStorage.setItem(storageKey, JSON.stringify({
      theme: root.dataset.theme || "light",
      measure: root.style.getPropertyValue("--measure") || "72ch",
      readingMode: body.classList.contains("reading-mode")
    }));
  };

  const scrollTocToActive = () => {
    if (!toc) return;
    const active = toc.querySelector("a.is-active") || toc.querySelector("a[href^='#']");
    active?.scrollIntoView({ block: "center" });
  };

  const actions = {
    "toggle-search": () => {
      body.classList.toggle("search-open");
      updateControlStates();
    },
    "toggle-toc": () => {
      if (!toc) return;
      body.classList.toggle("toc-open");
      updateControlStates();
      if (body.classList.contains("toc-open")) {
        requestAnimationFrame(scrollTocToActive);
      }
    },
    "toggle-reading-mode": () => {
      body.classList.toggle("reading-mode");
      if (body.classList.contains("reading-mode")) body.classList.remove("toc-open");
      save();
      updateControlStates();
    },
    "toggle-theme": () => {
      root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
      save();
      updateControlStates();
    },
    narrow: () => {
      const current = parseInt((root.style.getPropertyValue("--measure") || "72ch").replace("ch", ""), 10);
      root.style.setProperty("--measure", `${Math.max(58, current - 6)}ch`);
      save();
    },
    wide: () => {
      const current = parseInt((root.style.getPropertyValue("--measure") || "72ch").replace("ch", ""), 10);
      root.style.setProperty("--measure", `${Math.min(92, current + 6)}ch`);
      save();
    }
  };

  const escapeHTML = (value) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const normalize = (value) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const onActiveSectionChange = (callback) => {
    activeSectionListeners.push(callback);
    if (activeSectionId) callback(activeSectionId);
  };

  const setActiveSection = (id) => {
    if (!id || id === activeSectionId) return;
    activeSectionId = id;
    activeSectionListeners.forEach((callback) => callback(id));
  };

  const buttons = Array.from(document.querySelectorAll("[data-reader-action]"));
  const updateControlStates = () => {
    buttons.forEach((button) => {
      const action = button.dataset.readerAction;
      const label = button.getAttribute("aria-label");
      if (label) button.title = label;

      if (action === "toggle-toc") {
        button.hidden = !toc;
        button.disabled = !toc;
        button.setAttribute("aria-pressed", body.classList.contains("toc-open") ? "true" : "false");
      }
      if (action === "toggle-search") {
        button.setAttribute("aria-pressed", body.classList.contains("search-open") ? "true" : "false");
      }
      if (action === "toggle-theme") {
        button.setAttribute("aria-pressed", root.dataset.theme === "dark" ? "true" : "false");
      }
      if (action === "toggle-reading-mode") {
        button.setAttribute("aria-pressed", body.classList.contains("reading-mode") ? "true" : "false");
      }
    });
  };

  const snippet = (text, query) => {
    const normalizedText = normalize(text);
    const normalizedQuery = normalize(query);
    const index = normalizedText.indexOf(normalizedQuery);
    const start = Math.max(0, index - 90);
    const end = Math.min(text.length, (index < 0 ? 0 : index) + query.length + 130);
    const prefix = start > 0 ? "…" : "";
    const suffix = end < text.length ? "…" : "";
    return `${prefix}${text.slice(start, end)}${suffix}`;
  };

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-reader-action]");
    if (!button) return;
    actions[button.dataset.readerAction]?.();
  });

  updateControlStates();

  const updateProgress = () => {
    if (!progress || !content) return;
    const rect = content.getBoundingClientRect();
    const total = Math.max(1, rect.height - window.innerHeight);
    const read = Math.min(total, Math.max(0, -rect.top));
    progress.style.width = `${(read / total) * 100}%`;
  };

  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);
  updateProgress();

  if (toc) {
    const links = Array.from(toc.querySelectorAll("a[href^='#']"));
    const targets = links
      .map((link) => document.querySelector(link.getAttribute("href")))
      .filter(Boolean);

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        setActiveSection(entry.target.id);
      });
    }, { rootMargin: "-20% 0px -70% 0px" });

    targets.forEach((target) => observer.observe(target));
    onActiveSectionChange((id) => {
      links.forEach((link) => link.classList.toggle("is-active", link.getAttribute("href") === `#${id}`));
    });

    const syncActiveFromHash = () => {
      const id = window.location.hash.slice(1);
      if (id && document.getElementById(id)) {
        setActiveSection(id);
      } else if (targets[0]) {
        setActiveSection(targets[0].id);
      }
    };
    window.addEventListener("hashchange", syncActiveFromHash);
    syncActiveFromHash();

    links.forEach((link) => {
      link.addEventListener("click", () => {
        setActiveSection(link.getAttribute("href").slice(1));
        body.classList.remove("toc-open");
        updateControlStates();
      });
    });
  }

  const normalizeAssetPath = (src) => src.replace(/^assets\//, "").replace(/^UC-images\//, "UC-images/");

  const createSearchPanel = (model) => {
    const panel = document.createElement("aside");
    panel.className = "search-panel";
    panel.setAttribute("aria-label", "Search readings");
    panel.innerHTML = `
      <div class="search-panel__header">
        <label for="reader-search">Search</label>
        <button type="button" class="icon-button" data-reader-action="toggle-search" aria-label="Close search">×</button>
      </div>
      <input id="reader-search" type="search" autocomplete="off" placeholder="Search both readings" />
      <div class="search-panel__results" role="list"></div>
    `;
    document.body.appendChild(panel);

    const input = panel.querySelector("input");
    const results = panel.querySelector(".search-panel__results");
    const entries = model.documents.flatMap((doc) => {
      const entriesForDoc = doc.search_entries || [];
      return entriesForDoc.map((entry) => ({ ...entry, doc_title: doc.title }));
    });

    const render = () => {
      const query = input.value.trim();
      results.innerHTML = "";
      if (query.length < 2) {
        results.innerHTML = '<p class="search-panel__hint">Type at least two characters.</p>';
        return;
      }

      const terms = normalize(query).split(/\s+/).filter(Boolean);
      const matches = entries
        .map((entry) => {
          const haystack = normalize(`${entry.doc_title} ${entry.section_title} ${entry.text}`);
          const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
          return { entry, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.entry.doc_title.localeCompare(b.entry.doc_title))
        .slice(0, 24);

      if (!matches.length) {
        results.innerHTML = '<p class="search-panel__hint">No matches.</p>';
        return;
      }

      const list = document.createElement("ol");
      matches.forEach(({ entry }) => {
        const item = document.createElement("li");
        item.innerHTML = `
          <a href="${entry.url}">
            <strong>${escapeHTML(entry.section_title)}</strong>
            <span>${escapeHTML(entry.doc_title)}</span>
            <em>${escapeHTML(snippet(entry.text, query))}</em>
          </a>
        `;
        list.appendChild(item);
      });
      results.appendChild(list);
    };

    input.addEventListener("input", render);
    results.addEventListener("click", (event) => {
      const link = event.target.closest("a");
      if (!link) return;
      body.classList.remove("search-open");
      updateControlStates();
    });
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        body.classList.add("search-open");
        updateControlStates();
        input.focus();
      }
      if (event.key === "Escape") {
        body.classList.remove("search-open");
        updateControlStates();
      }
    });

    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-reader-action='toggle-search']")) {
        setTimeout(() => input.focus(), 0);
      }
    });

    render();
  };

  const createChapterOverview = (doc) => {
    if (!content || doc.kind === "index") return;
    const topSections = doc.sections.filter((section) => section.level === 1);
    if (topSections.length < 2 || content.querySelector(".chapter-overview")) return;
    const topSectionFor = (id) => {
      const section = doc.sections.find((item) => item.id === id);
      if (!section) return topSections[0];
      return topSections.filter((item) => item.line <= section.line).pop() || topSections[0];
    };

    const entriesBySection = new Map((doc.search_entries || [])
      .map((entry) => [entry.section_id, entry]));
    const overview = document.createElement("nav");
    overview.className = "chapter-overview";
    overview.setAttribute("aria-label", "Section overview");
    overview.innerHTML = "<h2>Sections</h2>";

    const list = document.createElement("ol");
    topSections.forEach((section, index) => {
      const entry = entriesBySection.get(section.id);
      const excerpt = entry?.text ? snippet(entry.text, entry.text.slice(0, 12)).replace(/^…/, "") : "";
      const item = document.createElement("li");
      item.innerHTML = `
        <a href="#${section.id}">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <strong>${escapeHTML(section.title)}</strong>
          ${excerpt ? `<em>${escapeHTML(excerpt.slice(0, 210))}${excerpt.length > 210 ? "…" : ""}</em>` : ""}
        </a>
      `;
      list.appendChild(item);
    });

    overview.appendChild(list);
    const title = content.querySelector("h1.title");
    const openingPlate = content.querySelector(".archive-plate");
    const anchor = openingPlate || title;
    anchor?.insertAdjacentElement("afterend", overview);

    const links = Array.from(overview.querySelectorAll("a[href^='#']"));
    onActiveSectionChange((id) => {
      const top = topSectionFor(id);
      links.forEach((link) => link.classList.toggle("is-active", link.getAttribute("href") === `#${top.id}`));
    });
  };

  const createReaderPosition = (doc) => {
    if (!content || doc.kind === "index") return;
    const topSections = doc.sections.filter((section) => section.level === 1);
    if (topSections.length < 2 || document.querySelector(".reader-position")) return;
    const topSectionFor = (id) => {
      const section = doc.sections.find((item) => item.id === id);
      if (!section) return topSections[0];
      return topSections.filter((item) => item.line <= section.line).pop() || topSections[0];
    };

    root.style.setProperty("--position-offset", "42px");

    const nav = document.createElement("nav");
    nav.className = "reader-position";
    nav.setAttribute("aria-label", "Current reading position");
    nav.innerHTML = `
      <a class="reader-position__step reader-position__prev" href="#" aria-label="Previous section">←</a>
      <a class="reader-position__current" href="#"></a>
      <a class="reader-position__step reader-position__next" href="#" aria-label="Next section">→</a>
    `;
    document.querySelector(".site-bar")?.insertAdjacentElement("afterend", nav);

    const prev = nav.querySelector(".reader-position__prev");
    const currentLink = nav.querySelector(".reader-position__current");
    const next = nav.querySelector(".reader-position__next");

    const setCurrent = (id) => {
      const resolved = topSectionFor(id);
      const index = Math.max(0, topSections.findIndex((section) => section.id === resolved.id));
      const current = topSections[index];
      const previous = topSections[index - 1];
      const following = topSections[index + 1];

      if (!current) return;
      currentLink.href = `#${current.id}`;
      currentLink.textContent = `${String(index + 1).padStart(2, "0")} / ${String(topSections.length).padStart(2, "0")} · ${current.title}`;

      prev.hidden = !previous;
      next.hidden = !following;
      if (previous) {
        prev.href = `#${previous.id}`;
        prev.setAttribute("aria-label", `Previous section: ${previous.title}`);
      }
      if (following) {
        next.href = `#${following.id}`;
        next.setAttribute("aria-label", `Next section: ${following.title}`);
      }
    };

    setCurrent(topSections[0].id);
    onActiveSectionChange(setCurrent);
  };

  const createSectionNavigator = (doc) => {
    if (!content || doc.kind === "index") return;
    const topSections = doc.sections.filter((section) => section.level === 1);
    if (topSections.length < 2) return;
    const topSectionFor = (id) => {
      const section = doc.sections.find((item) => item.id === id);
      if (!section) return topSections[0];
      return topSections.filter((item) => item.line <= section.line).pop() || topSections[0];
    };

    const nav = document.createElement("nav");
    nav.className = "section-nav";
    nav.setAttribute("aria-label", "Chapter navigation");
    nav.innerHTML = `
      <a class="section-nav__link section-nav__prev" href="#"></a>
      <span class="section-nav__current"></span>
      <a class="section-nav__link section-nav__next" href="#"></a>
    `;
    content.appendChild(nav);

    const prev = nav.querySelector(".section-nav__prev");
    const next = nav.querySelector(".section-nav__next");
    const currentLabel = nav.querySelector(".section-nav__current");

    const setCurrent = (id) => {
      const resolved = topSectionFor(id);
      const index = Math.max(0, topSections.findIndex((section) => section.id === resolved.id));
      const current = topSections[index];
      const previous = topSections[index - 1];
      const following = topSections[index + 1];

      currentLabel.textContent = current?.title || "";

      prev.hidden = !previous;
      next.hidden = !following;
      if (previous) {
        prev.href = `#${previous.id}`;
        prev.textContent = `← ${previous.title}`;
        prev.setAttribute("aria-label", `Previous section: ${previous.title}`);
      }
      if (following) {
        next.href = `#${following.id}`;
        next.textContent = `${following.title} →`;
        next.setAttribute("aria-label", `Next section: ${following.title}`);
      }
    };

    setCurrent(topSections[0].id);
    onActiveSectionChange(setCurrent);
  };

  const enhanceWithModel = async () => {
    try {
      const response = await fetch("assets/content-model.json");
      if (!response.ok) return;
      const model = await response.json();
      const doc = model.documents.find((item) => item.url === currentPath);
      if (!doc) return;

      createSearchPanel(model);
      createReaderPosition(doc);
      createChapterOverview(doc);
      createSectionNavigator(doc);

      const brand = document.querySelector(".site-bar__brand");
      if (brand && doc.kind !== "index") {
        const meta = document.createElement("span");
        meta.className = "site-bar__meta";
        const bits = [`${doc.stats.section_count} sections`];
        if (doc.stats.figure_count) bits.push(`${doc.stats.figure_count} figures`);
        if (doc.stats.transcript_turn_count) bits.push(`${doc.stats.transcript_turn_count} turns`);
        meta.textContent = bits.join(" · ");
        brand.appendChild(meta);
      }

      const indexedFigures = doc.figures.filter((figure) => figure.role === "figure");

      if (doc.kind === "technical" && toc && indexedFigures.length) {
        const details = document.createElement("details");
        details.className = "figure-index";
        details.innerHTML = `<summary>Figures (${indexedFigures.length})</summary>`;
        const list = document.createElement("ol");

        indexedFigures.forEach((figure) => {
          const item = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = figure.label || figure.src.split("/").pop();
          button.title = figure.caption || "";
          button.addEventListener("click", () => {
            const image = Array.from(document.querySelectorAll(".figure img"))
              .find((candidate) => normalizeAssetPath(candidate.getAttribute("src") || "") === figure.src);
            image?.closest(".figure")?.scrollIntoView({ behavior: "smooth", block: "center" });
          });
          item.appendChild(button);
          list.appendChild(item);
        });

        details.appendChild(list);
        toc.appendChild(details);
      }
    } catch {
      // The reader remains fully usable without the optional content model.
    }
  };

  enhanceWithModel();

  const figures = Array.from(document.querySelectorAll(".figure img"));
  if (figures.length) {
    const lightbox = document.createElement("div");
    lightbox.className = "lightbox";
    lightbox.innerHTML = '<button type="button" class="icon-button" aria-label="Close image">×</button><img alt="" />';
    document.body.appendChild(lightbox);

    const lightboxImage = lightbox.querySelector("img");
    const close = () => lightbox.classList.remove("is-open");

    figures.forEach((image) => {
      image.addEventListener("click", () => {
        lightboxImage.src = image.currentSrc || image.src;
        lightboxImage.alt = image.alt || "";
        lightbox.classList.add("is-open");
      });
    });

    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox || event.target.closest("button")) close();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
  }
})();
