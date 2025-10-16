/**
 * app.js - Account Details Web App
 *
 * This script handles all client-side logic for the account management app.
 * Works with index.html and style.css to provide a complete PWA-ready experience.
 *
 * FEATURES:
 * - Dark/Light mode with system preference detection
 * - Bank logo support with fallbacks
 * - QR code generation
 * - PDF export (individual and bulk)
 * - Enhanced sharing with Web Share API
 * - Offline detection and graceful fallbacks
 * - Accessibility features and keyboard navigation
 * - Responsive design with iPhone 5 support
 *
 * CONFIGURATION:
 * - Change DATA_URL below to point to your accounts.json file
 * - Set DEBUG to true for development console logging
 * - Modify DEBOUNCE_DELAY for search responsiveness
 * - Set DEFAULT_THEME to 'light', 'dark', or 'system' to control initial theme
 */

// ============================================
// CONFIGURATION & CONSTANTS
// ============================================

const CONFIG = {
  DATA_URL: "./accounts.json",
  DEBOUNCE_DELAY: 250,
  DEBUG: false,
  FAVORITES_KEY: "accounts:favs",
  THEME_KEY: "accounts:theme",
  VERSION_KEY: "accounts:version",
  QR_API: "https://api.qrserver.com/v1/create-qr-code/",
  MAX_FAVORITES_DISPLAY: 3,
  LOGO_FALLBACK_TIMEOUT: 3000,

  // App Version (increment when localStorage structure changes)
  APP_VERSION: "2.0",

  // Theme Configuration
  // Options: 'light', 'dark', 'system' (follows user's system preference)
  DEFAULT_THEME: "light",
  SHARE_BASE_URL: window.location.origin + window.location.pathname,
};

// ============================================
// MAIN APP MODULE (IIFE Pattern)
// ============================================

const App = (() => {
  // localStorage.clear();
  // State management
  let allAccounts = [];
  let filteredAccounts = [];
  let favorites = [];
  let currentTheme = "light";
  let isOffline = false;
  let currentFilters = {
    search: "",
    currency: "all",
    purpose: "all",
    favoritesOnly: false,
  };

  // DOM element cache
  const DOM = {};

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  /**
   * Debug logger - only logs when DEBUG is true
   */
  function log(...args) {
    if (CONFIG.DEBUG) {
      console.log(`[Account Details]`, ...args);
    }
  }

  /**
   * Debounce function to limit rapid function calls
   */
  function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  /**
   * Sanitize HTML to prevent XSS
   */
  function sanitize(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  /**
   * Mask account number for display (show first 4 and last 4 digits)
   */
  function maskAccountNumber(number) {
    if (!number || number.length <= 8) return number;
    const first = number.slice(0, 4);
    const last = number.slice(-4);
    const middle = "•".repeat(Math.min(number.length - 8, 12));
    return `${first}${middle}${last}`;
  }

  /**
   * Mask IBAN for display
   */
  function maskIBAN(iban) {
    if (!iban || iban.length <= 8) return iban;
    const first = iban.slice(0, 4);
    const last = iban.slice(-4);
    const middle = "•".repeat(Math.min(iban.length - 8, 16));
    return `${first} ${middle} ${last}`;
  }

  /**
   * Get bank initials for logo fallback
   */
  function getBankInitials(bankName) {
    return bankName
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 3);
  }

  // ============================================
  // VERSION MIGRATION SYSTEM
  // ============================================

  /**
   * Migrate localStorage data from previous versions
   * This ensures backward compatibility when upgrading
   */
  function migrateLocalStorageData() {
    try {
      const storedVersion = localStorage.getItem(CONFIG.VERSION_KEY);
      const currentVersion = CONFIG.APP_VERSION;

      log("Checking version compatibility...", {
        stored: storedVersion,
        current: currentVersion,
      });

      // First time user or same version - no migration needed
      if (!storedVersion || storedVersion === currentVersion) {
        if (!storedVersion) {
          // Mark as current version for new users
          localStorage.setItem(CONFIG.VERSION_KEY, currentVersion);
          log("New user detected, setting version to", currentVersion);
        }
        return;
      }

      // Migration needed
      log(
        "Migration required from version",
        storedVersion,
        "to",
        currentVersion
      );

      // Preserve user preferences during migration
      const preservedData = {
        theme: localStorage.getItem(CONFIG.THEME_KEY),
        favorites: localStorage.getItem(CONFIG.FAVORITES_KEY),
      };

      // Handle specific version migrations
      if (storedVersion < "2.0") {
        log("Migrating from v1.x to v2.0...");

        // Migration rules for v1 to v2
        // - Preserve theme preference if valid
        // - Preserve favorites if valid JSON
        // - Clean up any obsolete keys

        // Validate and migrate theme
        if (
          preservedData.theme &&
          ["light", "dark"].includes(preservedData.theme)
        ) {
          log("Preserving theme:", preservedData.theme);
          // Theme is valid, keep it
        } else {
          log("Invalid theme detected, resetting to default");
          localStorage.removeItem(CONFIG.THEME_KEY);
        }

        // Validate and migrate favorites
        if (preservedData.favorites) {
          try {
            const favorites = JSON.parse(preservedData.favorites);
            if (Array.isArray(favorites)) {
              log("Preserving", favorites.length, "favorites");
              // Favorites are valid, keep them
            } else {
              throw new Error("Invalid favorites format");
            }
          } catch (error) {
            log("Invalid favorites detected, clearing:", error);
            localStorage.removeItem(CONFIG.FAVORITES_KEY);
          }
        }

        // Clean up any v1-specific keys that might conflict
        const v1Keys = [
          "accountsApp:settings",
          "accountsApp:preferences",
          "accountsApp:cache",
          "accounts:cache",
          "accounts:settings",
        ];

        v1Keys.forEach((key) => {
          if (localStorage.getItem(key)) {
            log("Removing obsolete key:", key);
            localStorage.removeItem(key);
          }
        });
      }

      // Update version marker
      localStorage.setItem(CONFIG.VERSION_KEY, currentVersion);
      log("Migration completed successfully to version", currentVersion);

      // Show migration notice to user
      showToast(
        "App updated! Your preferences have been preserved.",
        "success"
      );
    } catch (error) {
      log("Migration error:", error);

      // Safe fallback: preserve only essential data
      const essentialData = {
        theme: localStorage.getItem(CONFIG.THEME_KEY),
        favorites: localStorage.getItem(CONFIG.FAVORITES_KEY),
      };

      // Clear potentially corrupted data
      const keysToPreserve = [CONFIG.THEME_KEY, CONFIG.FAVORITES_KEY];
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("accounts:") && !keysToPreserve.includes(key)) {
          localStorage.removeItem(key);
        }
      });

      // Restore essential data if valid
      if (
        essentialData.theme &&
        ["light", "dark"].includes(essentialData.theme)
      ) {
        localStorage.setItem(CONFIG.THEME_KEY, essentialData.theme);
      }

      try {
        if (essentialData.favorites) {
          JSON.parse(essentialData.favorites); // Validate JSON
          localStorage.setItem(CONFIG.FAVORITES_KEY, essentialData.favorites);
        }
      } catch (e) {
        // Invalid favorites, ignore
      }

      localStorage.setItem(CONFIG.VERSION_KEY, CONFIG.APP_VERSION);
      showToast("App updated with clean settings.", "warning");
    }
  }

  // ============================================
  // THEME MANAGEMENT
  // ============================================

  /**
   * Initialize theme based on saved preference, config, or system setting
   */
  function initializeTheme() {
    try {
      const savedTheme = localStorage.getItem(CONFIG.THEME_KEY);

      // Determine default theme based on configuration
      let defaultTheme;
      if (CONFIG.DEFAULT_THEME === "system") {
        const systemPrefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches;
        defaultTheme = systemPrefersDark ? "dark" : "light";
      } else {
        defaultTheme = CONFIG.DEFAULT_THEME;
      }

      currentTheme = savedTheme || defaultTheme;
      applyTheme(currentTheme);

      // Listen for system theme changes (only if no saved preference and using system theme)
      if (CONFIG.DEFAULT_THEME === "system") {
        window
          .matchMedia("(prefers-color-scheme: dark)")
          .addEventListener("change", (e) => {
            if (!localStorage.getItem(CONFIG.THEME_KEY)) {
              currentTheme = e.matches ? "dark" : "light";
              applyTheme(currentTheme);
            }
          });
      }
    } catch (error) {
      log("Theme initialization error:", error);
      currentTheme = "light";
      applyTheme(currentTheme);
    }
  }

  /**
   * Apply theme to document
   */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    currentTheme = theme;

    // Update theme toggle button
    const themeToggle = DOM.darkModeToggle;
    if (themeToggle) {
      themeToggle.setAttribute(
        "aria-label",
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      );
    }
  }

  /**
   * Toggle between light and dark themes
   */
  function toggleTheme() {
    const newTheme = currentTheme === "light" ? "dark" : "light";
    applyTheme(newTheme);

    try {
      localStorage.setItem(CONFIG.THEME_KEY, newTheme);
    } catch (error) {
      log("Failed to save theme preference:", error);
    }

    showToast(`Switched to ${newTheme} mode`, "success");
  }

  // ============================================
  // OFFLINE DETECTION
  // ============================================

  /**
   * Setup offline/online event listeners
   */
  function setupOfflineDetection() {
    function updateOnlineStatus() {
      isOffline = !navigator.onLine;

      let indicator = document.querySelector(".offline-indicator");

      if (isOffline) {
        if (!indicator) {
          indicator = document.createElement("div");
          indicator.className = "offline-indicator";
          indicator.textContent =
            "You are offline. Some features may be limited.";
          document.body.appendChild(indicator);
        }
        indicator.classList.remove("hidden");
      } else {
        if (indicator) {
          indicator.classList.add("hidden");
        }
      }
    }

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    updateOnlineStatus();
  }

  // ============================================
  // DATA LOADING & PARSING
  // ============================================

  /**
   * Load accounts data from JSON file
   * Handles errors gracefully and provides fallback
   */
  async function loadData(url = CONFIG.DATA_URL) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("Invalid data format: expected an array");
      }

      allAccounts = data.map(normalizeAccount);
      log("Loaded", allAccounts.length, "accounts");

      return allAccounts;
    } catch (error) {
      log("Data loading error:", error);
      showToast("Failed to load accounts. Using sample data.", "warning");

      allAccounts = getSampleData().map(normalizeAccount);
      return allAccounts;
    }
  }

  /**
   * Normalize account object to consistent structure
   */
  function normalizeAccount(raw) {
    return {
      id: raw.id || raw.ID || String(Math.random()),
      bank: raw.Bank || raw.bank || "Unknown Bank",
      title: raw.Title || raw.title || "Account",
      acc_no: raw.acc_no || raw.acct_no || raw.account_number || "",
      iban: raw.iban || raw.IBAN || "",
      currency: raw.currency || raw.Currency || "PKR",
      purpose: raw.purpose || raw.Purpose || "General",
      note: raw.note || raw.Note || "",
      logo: raw.logo || null,
    };
  }

  /**
   * Sample fallback data if fetch fails
   */
  function getSampleData() {
    return [
      {
        "Bank": "Faysal Bank",
        "Title": "Al-Rahman Trading Co.",
        "acc_no": "4587123900456712",
        "iban": "PK36FAYS0045871239004567",
        "id": "1",
        "currency": "PKR",
        "purpose": "Business",
        "logo": "./assets/Faysal_Bank.svg"
      },
      {
        "Bank": "Allied Bank",
        "Title": "Bilal & Sons Electronics",
        "acc_no": "7890123456789012",
        "iban": "PK74ABPA0078901234567890",
        "id": "2",
        "currency": "PKR",
        "purpose": "Business",
        "logo": "./assets/allied_bank.svg"
      },
      {
        "Bank": "JazzCash",
        "Title": "Ayesha Fatima",
        "acc_no": "03211234567",
        "iban": "PK15JCMA0412900321123456",
        "id": "3",
        "currency": "PKR",
        "purpose": "Mobile Wallet",
        "logo": "./assets/jazzcash.svg"
      },
    ];
  }

  // ============================================
  // FAVORITES MANAGEMENT
  // ============================================

  /**
   * Load favorites from localStorage
   */
  function loadFavorites() {
    try {
      const stored = localStorage.getItem(CONFIG.FAVORITES_KEY);
      favorites = stored ? JSON.parse(stored) : [];
    } catch (error) {
      log("Failed to load favorites:", error);
      favorites = [];
    }
  }

  /**
   * Save favorites to localStorage
   */
  function saveFavorites() {
    try {
      localStorage.setItem(CONFIG.FAVORITES_KEY, JSON.stringify(favorites));
    } catch (error) {
      log("Failed to save favorites:", error);
    }
  }

  /**
   * Toggle favorite status for an account
   */
  function toggleFavorite(accountId) {
    const index = favorites.indexOf(accountId);

    if (index > -1) {
      favorites.splice(index, 1);
      showToast("Removed from favorites", "success");
    } else {
      favorites.push(accountId);
      showToast("Added to favorites", "success");
    }

    saveFavorites();
    updateFavoriteButton(accountId);
    renderFavoritesStrip();

    // Re-apply filters if favorites-only is active
    if (currentFilters.favoritesOnly) {
      applyFilters();
    }
  }

  /**
   * Check if account is favorited
   */
  function isFavorite(accountId) {
    return favorites.includes(accountId);
  }

  /**
   * Update favorite button state for a specific account
   */
  function updateFavoriteButton(accountId) {
    const buttons = document.querySelectorAll(
      `[data-account-id="${accountId}"] .favorite-btn`
    );
    buttons.forEach((button) => {
      const isFav = isFavorite(accountId);
      button.setAttribute("aria-pressed", isFav);

      const icon = button.querySelector(".icon");
      if (icon) {
        if (isFav) {
          icon.style.fill = "#ffc107";
        } else {
          icon.style.fill = "none";
        }
      }
    });
  }

  // ============================================
  // BANK LOGO HANDLING
  // ============================================

  /**
   * Create bank logo element with fallback
   */
  function createBankLogo(account) {
    const container = document.createElement("div");
    container.className = "bank-logo-area";

    if (account.logo) {
      const img = document.createElement("img");
      img.className = "bank-logo";
      img.alt = `${account.bank} logo`;
      img.src = account.logo;

      // Fallback to placeholder if image fails to load
      img.addEventListener("error", () => {
        container.innerHTML = "";
        container.appendChild(createLogoPlaceholder(account.bank));
      });

      // Timeout fallback
      setTimeout(() => {
        if (!img.complete || img.naturalWidth === 0) {
          container.innerHTML = "";
          container.appendChild(createLogoPlaceholder(account.bank));
        }
      }, CONFIG.LOGO_FALLBACK_TIMEOUT);

      container.appendChild(img);
    } else {
      container.appendChild(createLogoPlaceholder(account.bank));
    }

    return container;
  }

  /**
   * Create logo placeholder with bank initials
   */
  function createLogoPlaceholder(bankName) {
    const placeholder = document.createElement("div");
    placeholder.className = "bank-logo-placeholder";
    placeholder.textContent = getBankInitials(bankName);
    placeholder.setAttribute("aria-label", `${bankName} logo placeholder`);
    return placeholder;
  }

  // ============================================
  // VISIBILITY TOGGLE (Eye Button)
  // ============================================

  /**
   * Toggle visibility of account number or IBAN
   */
  function toggleVisibility(button, type) {
    const detailRow = button.closest(".detail-row");
    if (!detailRow) return;

    const isVisible = button.getAttribute("data-visible") === "true";
    const maskedElement = detailRow.querySelector(`.${type}-display`);
    const fullElement = detailRow.querySelector(`.${type}-full`);

    if (isVisible) {
      // Hide full, show masked
      maskedElement.style.display = "inline";
      fullElement.style.display = "none";
      button.setAttribute("data-visible", "false");
      button.setAttribute("aria-label", `Show full ${type.replace("-", " ")}`);
    } else {
      // Show full, hide masked
      maskedElement.style.display = "none";
      fullElement.style.display = "inline";
      button.setAttribute("data-visible", "true");
      button.setAttribute("aria-label", `Hide full ${type.replace("-", " ")}`);
    }
  }

  // ============================================
  // RENDERING FUNCTIONS
  // ============================================

  /**
   * Render all accounts in the main list
   */
  function renderAccounts(accounts = filteredAccounts) {
    const listContainer = DOM.list;

    if (!listContainer) {
      log("Error: List container not found");
      return;
    }

    // Clear existing content
    listContainer.innerHTML = "";

    // Show empty state if no accounts
    if (accounts.length === 0) {
      listContainer.innerHTML =
        '<li class="loading-placeholder">No accounts found</li>';
      return;
    }

    // Use document fragment for better performance
    const fragment = document.createDocumentFragment();

    accounts.forEach((account) => {
      const card = createAccountCard(account);
      fragment.appendChild(card);
    });

    listContainer.appendChild(fragment);
    log("Rendered", accounts.length, "accounts");

    // Handle share parameter if present
    handleShareParameter();
  }

  /**
   * Create a single account card element
   */
  function createAccountCard(account) {
    const li = document.createElement("li");
    li.setAttribute("role", "listitem");
    li.setAttribute("data-account-id", account.id);

    const article = document.createElement("article");
    article.className = "account-card";

    // Create card header
    const header = document.createElement("div");
    header.className = "card-header";

    // Bank logo
    const logoArea = createBankLogo(account);
    header.appendChild(logoArea);

    // Bank info
    const bankInfo = document.createElement("div");
    bankInfo.className = "bank-info";
    bankInfo.innerHTML = `
      <h3 class="bank-name">${sanitize(account.bank)}</h3>
      <p class="account-title">${sanitize(account.title)}</p>
    `;
    header.appendChild(bankInfo);

    // Favorite button
    const favoriteBtn = document.createElement("button");
    favoriteBtn.type = "button";
    favoriteBtn.className = "favorite-btn";
    favoriteBtn.setAttribute("aria-label", "Add to favorites");
    favoriteBtn.setAttribute("aria-pressed", isFavorite(account.id));
    favoriteBtn.setAttribute("data-action", "favorite");
    favoriteBtn.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"></polygon>
      </svg>
    `;

    if (isFavorite(account.id)) {
      favoriteBtn.querySelector(".icon").style.fill = "#ffc107";
    }

    header.appendChild(favoriteBtn);
    article.appendChild(header);

    // Card tags
    const tags = document.createElement("div");
    tags.className = "card-tags";
    tags.innerHTML = `
      <span class="tag tag-currency">${sanitize(account.currency)}</span>
      ${
        account.purpose
          ? `<span class="tag tag-purpose">${sanitize(account.purpose)}</span>`
          : ""
      }
    `;
    article.appendChild(tags);

    // Card details
    const details = document.createElement("div");
    details.className = "card-details";

    let detailsHTML = "";

    if (account.acc_no) {
      detailsHTML += `
        <div class="detail-row">
          <span class="detail-label">Account No:</span>
          <div class="detail-value-wrapper">
            <span class="detail-value account-number-display">${maskAccountNumber(
              account.acc_no
            )}</span>
            <span class="detail-value account-number-full" style="display: none;">${sanitize(
              account.acc_no
            )}</span>
            <button type="button" class="eye-btn" data-action="toggle-visibility" data-type="account-number" data-visible="false" aria-label="Show full account number">
              <svg class="icon icon-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <svg class="icon icon-eye-slash" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
              </svg>
            </button>
            <button type="button" class="copy-btn" data-action="copy-account" data-value="${sanitize(
              account.acc_no
            )}" aria-label="Copy account number">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }

    if (account.iban) {
      detailsHTML += `
        <div class="detail-row">
          <span class="detail-label">IBAN:</span>
          <div class="detail-value-wrapper">
            <span class="detail-value iban-display">${maskIBAN(
              account.iban
            )}</span>
            <span class="detail-value iban-full" style="display: none;">${sanitize(
              account.iban
            )}</span>
            <button type="button" class="eye-btn" data-action="toggle-visibility" data-type="iban" data-visible="false" aria-label="Show full IBAN">
              <svg class="icon icon-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <svg class="icon icon-eye-slash" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
              </svg>
            </button>
            <button type="button" class="copy-btn" data-action="copy-iban" data-value="${sanitize(
              account.iban
            )}" aria-label="Copy IBAN">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }

    if (account.note) {
      detailsHTML += `<p class="account-note">${sanitize(account.note)}</p>`;
    }

    details.innerHTML = detailsHTML;
    article.appendChild(details);

    // Card actions
    const actions = document.createElement("div");
    actions.className = "card-actions";
    actions.innerHTML = `
      <button type="button" class="action-btn" data-action="show-qr" aria-label="Show QR code for ${sanitize(
        account.bank
      )}" aria-controls="qr-modal">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="5" height="5"></rect>
          <rect x="16" y="3" width="5" height="5"></rect>
          <rect x="3" y="16" width="5" height="5"></rect>
          <path d="M21 16h-3a2 2 0 0 0-2 2v3"></path>
          <path d="M21 21v.01"></path>
          <path d="M12 7v3a2 2 0 0 1-2 2H7"></path>
          <path d="M3 12h.01"></path>
          <path d="M12 3h.01"></path>
          <path d="M12 16v.01"></path>
          <path d="M16 12h1"></path>
          <path d="M21 12v.01"></path>
          <path d="M12 21v-1"></path>
        </svg>
        QR Code
      </button>
      <button type="button" class="action-btn" data-action="share" aria-label="Share ${sanitize(
        account.bank
      )} details">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="18" cy="5" r="3"></circle>
          <circle cx="6" cy="12" r="3"></circle>
          <circle cx="18" cy="19" r="3"></circle>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
        </svg>
        Share
      </button>
      <button type="button" class="action-btn" data-action="download-pdf" aria-label="Download ${sanitize(
        account.bank
      )} as PDF">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7,10 12,15 17,10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        PDF
      </button>
    `;
    article.appendChild(actions);

    // Attach event listeners
    attachCardEventListeners(article, account);

    li.appendChild(article);
    return li;
  }

  /**
   * Attach event listeners to card buttons
   */
  function attachCardEventListeners(card, account) {
    const buttons = card.querySelectorAll("[data-action]");

    buttons.forEach((button) => {
      button.addEventListener("click", (e) => {
        e.preventDefault();
        const action = button.getAttribute("data-action");
        handleCardAction(action, account, button);
      });
    });
  }

  /**
   * Handle card button actions
   */
  function handleCardAction(action, account, button) {
    switch (action) {
      case "favorite":
        toggleFavorite(account.id);
        break;
      case "copy-account":
        copyToClipboard(account.acc_no, "Account number");
        break;
      case "copy-iban":
        copyToClipboard(account.iban, "IBAN");
        break;
      case "toggle-visibility":
        const type = button.getAttribute("data-type");
        toggleVisibility(button, type);
        break;
      case "show-qr":
        showQRModal(account);
        break;
      case "share":
        shareAccount(account);
        break;
      case "download-pdf":
        downloadAccountPDF(account);
        break;
      default:
        log("Unknown action:", action);
    }
  }

  /**
   * Render favorites strip at the top
   */
  function renderFavoritesStrip() {
    const container = DOM.favoritesContainer;

    if (!container) return;

    // Get favorite accounts
    const favoriteAccounts = allAccounts
      .filter((account) => isFavorite(account.id))
      .slice(0, CONFIG.MAX_FAVORITES_DISPLAY);

    // Clear container
    container.innerHTML = "";

    if (favoriteAccounts.length === 0) {
      DOM.favorites.style.display = "none";
      return;
    }

    DOM.favorites.style.display = "block";

    // Use document fragment
    const fragment = document.createDocumentFragment();

    favoriteAccounts.forEach((account) => {
      const card = createAccountCard(account);
      fragment.appendChild(card);
    });

    container.appendChild(fragment);
  }

  // ============================================
  // SEARCH & FILTER FUNCTIONS
  // ============================================

  /**
   * Apply all active filters
   */
  function applyFilters() {
    filteredAccounts = allAccounts.filter((account) => {
      // Search filter
      if (currentFilters.search) {
        const searchTerm = currentFilters.search.toLowerCase();
        const searchableFields = [
          account.bank,
          account.title,
          account.acc_no,
          account.iban,
          account.purpose,
          account.note,
        ];

        const matchesSearch = searchableFields.some(
          (field) => field && field.toLowerCase().includes(searchTerm)
        );

        if (!matchesSearch) return false;
      }

      // Currency filter
      if (currentFilters.currency !== "all") {
        if (account.currency !== currentFilters.currency) return false;
      }

      // Purpose filter
      if (currentFilters.purpose !== "all") {
        if (account.purpose !== currentFilters.purpose) return false;
      }

      // Favorites filter
      if (currentFilters.favoritesOnly) {
        if (!isFavorite(account.id)) return false;
      }

      return true;
    });

    renderAccounts(filteredAccounts);
    log("Filtered to", filteredAccounts.length, "accounts");
  }

  /**
   * Setup search functionality with debouncing
   */
  function setupSearch() {
    const searchInput = DOM.search;

    if (!searchInput) return;

    const debouncedSearch = debounce((value) => {
      currentFilters.search = value;
      applyFilters();
    }, CONFIG.DEBOUNCE_DELAY);

    searchInput.addEventListener("input", (e) => {
      debouncedSearch(e.target.value);
    });
  }

  /**
   * Setup filter chips
   */
  function setupFilters() {
    // Currency filters
    const currencyChips = document.querySelectorAll(
      ".currency-filters .filter-chip"
    );
    currencyChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        // Update active state
        currencyChips.forEach((c) => c.setAttribute("aria-pressed", "false"));
        chip.setAttribute("aria-pressed", "true");

        // Apply filter
        currentFilters.currency = chip.getAttribute("data-currency");
        applyFilters();
      });
    });

    // Purpose filter
    const purposeSelect = DOM.purposeSelect;
    if (purposeSelect) {
      purposeSelect.addEventListener("change", (e) => {
        currentFilters.purpose = e.target.value;
        applyFilters();
      });
    }

    // Favorites toggle
    const favoritesToggle = DOM.favoritesToggle;
    if (favoritesToggle) {
      favoritesToggle.addEventListener("click", () => {
        currentFilters.favoritesOnly = !currentFilters.favoritesOnly;
        favoritesToggle.setAttribute(
          "aria-pressed",
          currentFilters.favoritesOnly
        );
        applyFilters();
      });
    }
  }

  /**
   * Populate purpose dropdown with unique values
   */
  function populatePurposeOptions() {
    const purposeSelect = DOM.purposeSelect;
    if (!purposeSelect) return;

    const purposes = [
      ...new Set(allAccounts.map((acc) => acc.purpose).filter(Boolean)),
    ];

    // Clear existing options except "All Purposes"
    while (purposeSelect.children.length > 1) {
      purposeSelect.removeChild(purposeSelect.lastChild);
    }

    purposes.forEach((purpose) => {
      const option = document.createElement("option");
      option.value = purpose;
      option.textContent = purpose;
      purposeSelect.appendChild(option);
    });
  }

  // ============================================
  // CLIPBOARD FUNCTIONALITY
  // ============================================

  /**
   * Copy text to clipboard with fallback
   */
  async function copyToClipboard(text, label = "Text") {
    if (!text) {
      showToast(`No ${label.toLowerCase()} to copy`, "error");
      return;
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        showToast(`${label} copied to clipboard`, "success");
      } else {
        // Fallback for older browsers
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-999999px";
        textarea.style.top = "-999999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        const successful = document.execCommand("copy");
        textarea.remove();

        if (successful) {
          showToast(`${label} copied to clipboard`, "success");
        } else {
          throw new Error("Fallback copy failed");
        }
      }
    } catch (error) {
      log("Copy failed:", error);
      showToast(`Failed to copy ${label.toLowerCase()}`, "error");
    }
  }

  // ============================================
  // QR CODE FUNCTIONALITY
  // ============================================

  /**
   * Show QR code modal for an account
   */
  function showQRModal(account) {
    const modal = DOM.qrModal;
    const display = DOM.qrDisplay;
    const info = DOM.qrAccountInfo;

    if (!modal || !display || !info) return;

    // Determine what to encode in QR
    const qrData = account.iban || account.acc_no;
    if (!qrData) {
      showToast("No account number or IBAN available for QR code", "error");
      return;
    }

    // Update modal content
    info.textContent = `${account.bank} - ${qrData}`;

    // Generate QR code
    generateQRCode(qrData, display);

    // Show modal
    modal.setAttribute("aria-hidden", "false");
    setupModalFocusTrap(modal);
  }

  /**
   * Generate QR code using online API
   */
  function generateQRCode(data, container) {
    container.innerHTML =
      '<div style="display: flex; align-items: center; justify-content: center; height: 200px; color: var(--muted);">Generating QR code...</div>';

    if (isOffline) {
      container.innerHTML =
        '<div style="display: flex; align-items: center; justify-content: center; height: 200px; color: var(--muted);">QR code generation unavailable offline</div>';
      return;
    }

    const qrUrl = `${CONFIG.QR_API}?size=300x300&data=${encodeURIComponent(
      data
    )}`;

    const img = document.createElement("img");
    img.alt = "QR Code";
    img.style.maxWidth = "100%";
    img.style.height = "auto";

    img.onload = () => {
      container.innerHTML = "";
      container.appendChild(img);
    };

    img.onerror = () => {
      container.innerHTML =
        '<div style="display: flex; align-items: center; justify-content: center; height: 200px; color: var(--danger);">Failed to generate QR code</div>';
    };

    img.src = qrUrl;
  }

  /**
   * Close QR modal
   */
  function closeQRModal() {
    const modal = DOM.qrModal;
    if (modal) {
      modal.setAttribute("aria-hidden", "true");
    }
  }

  /**
   * Close help modal
   */
  function closeHelpModal() {
    const modal = DOM.helpModal;
    if (modal) {
      modal.setAttribute("aria-hidden", "true");
    }
  }

  /**
   * Setup focus trap inside modal
   */
  function setupModalFocusTrap(modal) {
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus first element
    if (firstElement) {
      firstElement.focus();
    }

    // Trap focus within modal
    const handleKeyDown = (e) => {
      if (e.key === "Tab") {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      } else if (e.key === "Escape") {
        closeQRModal();
        closeHelpModal();
      }
    };

    modal.addEventListener("keydown", handleKeyDown);

    // Remove listener when modal closes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.attributeName === "aria-hidden" &&
          modal.getAttribute("aria-hidden") === "true"
        ) {
          modal.removeEventListener("keydown", handleKeyDown);
          observer.disconnect();
        }
      });
    });

    observer.observe(modal, { attributes: true });
  }

  // ============================================
  // PDF GENERATION
  // ============================================

  /**
   * Download individual account as PDF
   */
  async function downloadAccountPDF(account) {
    try {
      showToast("Generating PDF...", "success");

      // Create a simple PDF content
      const pdfContent = generatePDFContent([account]);
      downloadPDF(pdfContent, `${account.bank}_${account.title}.pdf`);
    } catch (error) {
      log("PDF generation error:", error);
      showToast("Failed to generate PDF", "error");
    }
  }

  /**
   * Download all accounts as PDF
   */
  async function downloadAllAccountsPDF() {
    try {
      showToast("Generating PDF for all accounts...", "success");

      const pdfContent = generatePDFContent(allAccounts);
      downloadPDF(pdfContent, "All_Accounts.pdf");
    } catch (error) {
      log("PDF generation error:", error);
      showToast("Failed to generate PDF", "error");
    }
  }

  /**
   * Generate PDF content as HTML (for simple conversion)
   */
  function generatePDFContent(accounts) {
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Account Details</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .account { margin-bottom: 30px; border: 1px solid #ddd; padding: 15px; }
          .bank-name { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
          .account-title { font-size: 14px; color: #666; margin-bottom: 15px; }
          .detail { margin-bottom: 8px; }
          .label { font-weight: bold; display: inline-block; width: 120px; }
          .value { font-family: monospace; }
          .tags { margin-top: 10px; }
          .tag { background: #f0f0f0; padding: 3px 8px; margin-right: 5px; border-radius: 3px; font-size: 12px; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Account Details</h1>
          <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
    `;

    accounts.forEach((account) => {
      html += `
        <div class="account">
          <div class="bank-name">${sanitize(account.bank)}</div>
          <div class="account-title">${sanitize(account.title)}</div>
          
          ${
            account.acc_no
              ? `
            <div class="detail">
              <span class="label">Account No:</span>
              <span class="value">${sanitize(account.acc_no)}</span>
            </div>
          `
              : ""
          }
          
          ${
            account.iban
              ? `
            <div class="detail">
              <span class="label">IBAN:</span>
              <span class="value">${sanitize(account.iban)}</span>
            </div>
          `
              : ""
          }
          
          <div class="detail">
            <span class="label">Currency:</span>
            <span class="value">${sanitize(account.currency)}</span>
          </div>
          
          ${
            account.purpose
              ? `
            <div class="detail">
              <span class="label">Purpose:</span>
              <span class="value">${sanitize(account.purpose)}</span>
            </div>
          `
              : ""
          }
          
          ${
            account.note
              ? `
            <div class="detail">
              <span class="label">Note:</span>
              <span class="value">${sanitize(account.note)}</span>
            </div>
          `
              : ""
          }
        </div>
      `;
    });

    html += `
      </body>
      </html>
    `;

    return html;
  }

  /**
   * Download PDF using print functionality
   */
  function downloadPDF(htmlContent, filename) {
    // Create a new window with the content
    const printWindow = window.open("", "_blank");
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Wait for content to load then print
    printWindow.onload = () => {
      printWindow.document.title = filename;
      printWindow.print();

      // Close the window after printing
      setTimeout(() => {
        printWindow.close();
      }, 1000);
    };
  }

  // ============================================
  // SHARE FUNCTIONALITY
  // ============================================

  /**
   * Share account using Web Share API or fallback
   */
  async function shareAccount(account) {
    const shareData = {
      title: `${account.bank} - ${account.title}`,
      text: `Bank: ${account.bank}\n${
        account.acc_no ? `Account: ${account.acc_no}\n` : ""
      }${account.iban ? `IBAN: ${account.iban}\n` : ""}`,
      url: `${CONFIG.SHARE_BASE_URL}?share=${account.id}`,
    };

    try {
      // Try Web Share API first (mobile)
      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare(shareData)
      ) {
        await navigator.share(shareData);
        showToast("Shared successfully", "success");
      } else {
        // Fallback: copy share URL to clipboard
        await copyToClipboard(shareData.url, "Share link");
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        log("Share failed:", error);
        // Final fallback: copy account details
        const fallbackText = `${account.bank} - ${account.title}\n${
          account.acc_no ? `Account: ${account.acc_no}\n` : ""
        }${account.iban ? `IBAN: ${account.iban}` : ""}`;
        await copyToClipboard(fallbackText, "Account details");
      }
    }
  }

  // ============================================
  // TOAST NOTIFICATIONS
  // ============================================

  /**
   * Show toast notification
   */
  function showToast(message, type = "success") {
    const container = DOM.toastContainer;
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    container.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 3000);
  }

  // ============================================
  // URL PARAMETER HANDLING
  // ============================================

  /**
   * Handle share URL parameter
   */
  function handleShareParameter() {
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get("share");

    if (shareId) {
      // Find and highlight the shared account
      const accountCard = document.querySelector(
        `[data-account-id="${shareId}"]`
      );
      if (accountCard) {
        // Add highlight class
        accountCard.classList.add("shared-highlight");

        // Scroll to the account
        accountCard.scrollIntoView({ behavior: "smooth", block: "center" });

        // Remove highlight after animation
        setTimeout(() => {
          accountCard.classList.remove("shared-highlight");
        }, 3000);

        // Clean up URL
        const newUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
      }
    }
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================

  /**
   * Setup global event listeners
   */
  function setupEventListeners() {
    // Dark mode toggle
    if (DOM.darkModeToggle) {
      DOM.darkModeToggle.addEventListener("click", toggleTheme);
    }

    // Help button
    if (DOM.helpBtn) {
      DOM.helpBtn.addEventListener("click", () => {
        DOM.helpModal.setAttribute("aria-hidden", "false");
        setupModalFocusTrap(DOM.helpModal);
      });
    }

    // Download all button
    if (DOM.downloadAllBtn) {
      DOM.downloadAllBtn.addEventListener("click", downloadAllAccountsPDF);
    }

    // Modal close handlers
    document.addEventListener("click", (e) => {
      if (
        e.target.matches("[data-close-modal]") ||
        e.target.closest("[data-close-modal]")
      ) {
        closeQRModal();
        closeHelpModal();
      }
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      // Escape key closes modals
      if (e.key === "Escape") {
        closeQRModal();
        closeHelpModal();
      }

      // Ctrl/Cmd + D for dark mode toggle
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        toggleTheme();
      }

      // Ctrl/Cmd + F for search focus
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        if (DOM.search) {
          DOM.search.focus();
        }
      }
    });

    // Handle browser back/forward for share URLs
    window.addEventListener("popstate", handleShareParameter);
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  /**
   * Cache DOM elements
   */
  function cacheDOMElements() {
    DOM.search = document.getElementById("search");
    DOM.list = document.getElementById("list");
    DOM.favorites = document.getElementById("favorites");
    DOM.favoritesContainer = document.querySelector(".favorites-container");
    DOM.purposeSelect = document.getElementById("purpose-select");
    DOM.favoritesToggle = document.getElementById("favorites-toggle");
    DOM.qrModal = document.getElementById("qr-modal");
    DOM.qrDisplay = document.getElementById("qr-display");
    DOM.qrAccountInfo = document.getElementById("qr-account-info");
    DOM.helpModal = document.getElementById("help-modal");
    DOM.helpBtn = document.getElementById("help-btn");
    DOM.darkModeToggle = document.getElementById("dark-mode-toggle");
    DOM.downloadAllBtn = document.getElementById("download-all-btn");
    DOM.toastContainer = document.getElementById("toast-container");
  }

  /**
   * Initialize the app
   */
  async function init() {
    try {
      log("Initializing Account Details app...");

      // Run migration first (before any localStorage operations)
      migrateLocalStorageData();

      // Cache DOM elements
      cacheDOMElements();

      // Initialize theme
      initializeTheme();

      // Setup offline detection
      setupOfflineDetection();

      // Load favorites
      loadFavorites();

      // Load account data
      await loadData();

      // Populate dynamic content
      populatePurposeOptions();

      // Render initial content
      filteredAccounts = [...allAccounts];
      renderAccounts();
      renderFavoritesStrip();

      // Setup interactions
      setupSearch();
      setupFilters();
      setupEventListeners();

      // Update footer year
      const yearElement = document.getElementById("current-year");
      if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
      }

      // Update last updated date
      const lastUpdatedElement = document.getElementById("last-updated-date");
      if (lastUpdatedElement) {
        lastUpdatedElement.textContent = new Date().toLocaleDateString();
      }

      log("App initialized successfully");
    } catch (error) {
      log("Initialization error:", error);
      showToast("Failed to initialize app", "error");
    }
  }

  // ============================================
  // PUBLIC API (for testing/debugging)
  // ============================================

  return {
    init,
    loadData,
    render: renderAccounts,
    getFavorites: () => [...favorites],
    clearFavorites: () => {
      favorites = [];
      saveFavorites();
      renderFavoritesStrip();
      updateAllFavoriteButtons();
    },
    getAccounts: () => [...allAccounts],
    getFilteredAccounts: () => [...filteredAccounts],
    toggleTheme,
    getCurrentTheme: () => currentTheme,
    isOffline: () => isOffline,
  };
})();

// ============================================
// START THE APP
// ============================================

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", App.init);
} else {
  App.init();
}
