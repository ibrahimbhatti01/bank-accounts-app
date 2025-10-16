/**
 * app.js - Account List Web App
 *
 * This script handles all client-side logic for the account management app.
 * Works with index.html and styles.css to provide a complete PWA-ready experience.
 *
 * CONFIGURATION:
 * - Change DATA_URL below to point to your accounts.json file
 * - Set DEBUG to true for development console logging
 * - Modify DEBOUNCE_DELAY for search responsiveness
 */

// ============================================
// CONFIGURATION & CONSTANTS
// ============================================

const CONFIG = {
  DATA_URL: "./accounts.json",
  DEBOUNCE_DELAY: 250,
  DEBUG: false,
  FAVORITES_KEY: "accounts:favs",
  QR_API: "https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=",
  MAX_FAVORITES_DISPLAY: 3,
};

// ============================================
// MAIN APP MODULE (IIFE Pattern)
// ============================================

const App = (() => {
  // State management
  let allAccounts = [];
  let filteredAccounts = [];
  let favorites = [];
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
      console.log("[App]", ...args);
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

  // ============================================
  // DATA LOADING & PARSING
  // ============================================

  /**
   * Load accounts data from JSON file
   * Handles errors gracefully and provides fallback
   */
  async function loadData(url = CONFIG.DATA_URL) {
    try {
      log("Loading data from:", url);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Validate data structure
      if (!Array.isArray(data)) {
        throw new Error("Invalid data format: expected an array");
      }

      // Normalize data structure (handle case variations in keys)
      allAccounts = data.map((account) => normalizeAccount(account));

      log("Loaded accounts:", allAccounts.length);
      return allAccounts;
    } catch (error) {
      console.error("Failed to load accounts:", error);
      showToast("Failed to load accounts. Using sample data.", "error");

      // Fallback to embedded sample data
      allAccounts = getSampleData();
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
      log("Loaded favorites:", favorites);
    } catch (error) {
      console.error("Failed to load favorites:", error);
      favorites = [];
    }
  }

  /**
   * Save favorites to localStorage
   */
  function saveFavorites() {
    try {
      localStorage.setItem(CONFIG.FAVORITES_KEY, JSON.stringify(favorites));
      log("Saved favorites:", favorites);
    } catch (error) {
      console.error("Failed to save favorites:", error);
    }
  }

  /**
   * Toggle favorite status for an account
   */
  function toggleFavorite(accountId) {
    const index = favorites.indexOf(accountId);

    if (index > -1) {
      favorites.splice(index, 1);
    } else {
      favorites.push(accountId);
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
    const button = document.querySelector(
      `[data-account-id="${accountId}"] .favorite-btn`
    );
    if (button) {
      const isFav = isFavorite(accountId);
      button.setAttribute("aria-pressed", isFav);
      button.querySelector(".favorite-icon").textContent = isFav ? "★" : "☆";
    }
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
      button.textContent = "👁️";
      button.setAttribute("data-visible", "false");
      button.setAttribute(
        "aria-label",
        `Show full ${type === "account-number" ? "account number" : "IBAN"}`
      );
    } else {
      // Show full, hide masked
      maskedElement.style.display = "none";
      fullElement.style.display = "inline";
      fullElement.style.position = "static";
      fullElement.style.width = "auto";
      fullElement.style.height = "auto";
      fullElement.style.clip = "auto";
      button.textContent = "🙈";
      button.setAttribute("data-visible", "true");
      button.setAttribute(
        "aria-label",
        `Hide ${type === "account-number" ? "account number" : "IBAN"}`
      );
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
      console.error("List container not found");
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
    article.innerHTML = `
      <div class="card-header">
        <div class="bank-logo-area">
          <div class="bank-logo-placeholder" aria-hidden="true"></div>
        </div>
        <div class="bank-info">
          <h3 class="bank-name">${sanitize(account.bank)}</h3>
          <p class="account-title">${sanitize(account.title)}</p>
        </div>
        <button type="button" class="favorite-btn" aria-label="Add to favorites" aria-pressed="${isFavorite(
          account.id
        )}" data-action="favorite">
          <span class="favorite-icon" aria-hidden="true">${
            isFavorite(account.id) ? "★" : "☆"
          }</span>
        </button>
      </div>
      
      <div class="card-tags">
        <span class="tag tag-currency">${sanitize(account.currency)}</span>
        ${
          account.purpose
            ? `<span class="tag tag-purpose">${sanitize(
                account.purpose
              )}</span>`
            : ""
        }
      </div>
      
      <div class="card-details">
        ${
          account.acc_no
            ? `
          <div class="detail-row">
            <span class="detail-label">Account No:</span>
            <div class="detail-value-wrapper">
              <span class="detail-value account-number-display">${maskAccountNumber(
                account.acc_no
              )}</span>
              <span class="detail-value account-number-full" style="display: none;">${sanitize(
                account.acc_no
              )}</span>
              <button type="button" class="eye-btn" data-action="toggle-visibility" data-type="account-number" data-visible="false" aria-label="Show full account number">👁️</button>
            </div>
          </div>
        `
            : ""
        }
        ${
          account.iban
            ? `
          <div class="detail-row">
            <span class="detail-label">IBAN:</span>
            <div class="detail-value-wrapper">
              <span class="detail-value iban-display">${maskIBAN(
                account.iban
              )}</span>
              <span class="detail-value iban-full" style="display: none;">${sanitize(
                account.iban
              )}</span>
              <button type="button" class="eye-btn" data-action="toggle-visibility" data-type="iban" data-visible="false" aria-label="Show full IBAN">👁️</button>
            </div>
          </div>
        `
            : ""
        }
        ${
          account.note
            ? `<p class="account-note">${sanitize(account.note)}</p>`
            : ""
        }
      </div>
      
      <div class="card-actions">
        ${
          account.acc_no
            ? `
          <button type="button" class="action-btn" data-action="copy-account" data-value="${sanitize(
            account.acc_no
          )}" aria-label="Copy account number for ${sanitize(account.bank)}">
            📋 Copy Account
          </button>
        `
            : ""
        }
        ${
          account.iban
            ? `
          <button type="button" class="action-btn" data-action="copy-iban" data-value="${sanitize(
            account.iban
          )}" aria-label="Copy IBAN for ${sanitize(account.bank)}">
            📋 Copy IBAN
          </button>
        `
            : ""
        }
        <button type="button" class="action-btn" data-action="show-qr" aria-label="Show QR code for ${sanitize(
          account.bank
        )}" aria-controls="qr-modal">
          📱 QR Code
        </button>
        <button type="button" class="action-btn" data-action="share" aria-label="Share ${sanitize(
          account.bank
        )} details">
          🔗 Share
        </button>
      </div>
    `;

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
      const action = button.getAttribute("data-action");

      button.addEventListener("click", (e) => {
        e.preventDefault();
        handleCardAction(action, account, button);
      });
    });
  }

  /**
   * Handle card button actions
   */
  function handleCardAction(action, account, button) {
    switch (action) {
      case "copy-account":
        copyToClipboard(account.acc_no, "Account number");
        break;
      case "copy-iban":
        copyToClipboard(account.iban, "IBAN");
        break;
      case "show-qr":
        showQRModal(account);
        break;
      case "share":
        shareAccount(account);
        break;
      case "favorite":
        toggleFavorite(account.id);
        break;
      case "toggle-visibility":
        const type = button.getAttribute("data-type");
        toggleVisibility(button, type);
        break;
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
        const searchableText = [
          account.bank,
          account.title,
          account.acc_no,
          account.iban,
          account.purpose,
          account.note,
        ]
          .join(" ")
          .toLowerCase();

        if (!searchableText.includes(searchTerm)) {
          return false;
        }
      }

      // Currency filter
      if (currentFilters.currency !== "all") {
        if (account.currency !== currentFilters.currency) {
          return false;
        }
      }

      // Purpose filter
      if (currentFilters.purpose !== "all") {
        if (account.purpose !== currentFilters.purpose) {
          return false;
        }
      }

      // Favorites only filter
      if (currentFilters.favoritesOnly) {
        if (!isFavorite(account.id)) {
          return false;
        }
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
      // Populate purpose options
      populatePurposeOptions();

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

    // Get unique purposes
    const purposes = [
      ...new Set(allAccounts.map((a) => a.purpose).filter(Boolean)),
    ];

    // Clear existing options (except "All")
    purposeSelect.innerHTML = '<option value="all">All Purposes</option>';

    // Add purpose options
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
      showToast("Nothing to copy", "error");
      return;
    }

    try {
      // Modern Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        showToast(`${label} copied!`, "success");
        log("Copied:", label);
      } else {
        // Fallback for older browsers
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();

        const success = document.execCommand("copy");
        document.body.removeChild(textarea);

        if (success) {
          showToast(`${label} copied!`, "success");
        } else {
          throw new Error("Copy command failed");
        }
      }
    } catch (error) {
      console.error("Failed to copy:", error);
      showToast("Failed to copy. Please copy manually.", "error");
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
    const qrDisplay = DOM.qrDisplay;
    const qrInfo = DOM.qrAccountInfo;

    if (!modal || !qrDisplay) return;

    // Determine what to encode (prefer IBAN, fallback to account number)
    const qrData = account.iban || account.acc_no;

    if (!qrData) {
      showToast("No account data available for QR code", "error");
      return;
    }

    // Generate QR code using Google Chart API
    const qrUrl = `${CONFIG.QR_API}${encodeURIComponent(qrData)}`;

    // Clear and update modal
    qrDisplay.innerHTML = `<img src="${qrUrl}" alt="QR Code for ${sanitize(
      account.bank
    )}" style="max-width: 300px; height: auto;">`;
    qrInfo.textContent = `${account.bank} - ${account.title}`;

    // Show modal
    modal.setAttribute("aria-hidden", "false");

    // Focus on close button
    const closeButton = modal.querySelector(".modal-close");
    if (closeButton) {
      setTimeout(() => closeButton.focus(), 100);
    }

    // Setup focus trap
    setupModalFocusTrap(modal);

    log("Showing QR for:", account.bank);
  }

  /**
   * Close QR modal
   */
  function closeQRModal() {
    const modal = DOM.qrModal;
    if (!modal) return;

    modal.setAttribute("aria-hidden", "true");

    // Return focus to triggering element (if available)
    DOM.search?.focus();
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

    const handleTab = (e) => {
      if (e.key !== "Tab") return;

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
    };

    modal.addEventListener("keydown", handleTab);
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
      text: `Account: ${account.acc_no}\nIBAN: ${account.iban}`,
      url: `${window.location.origin}${window.location.pathname}?share=${account.id}`,
    };

    try {
      // Check if Web Share API is available
      if (navigator.share) {
        await navigator.share(shareData);
        log("Shared via Web Share API");
      } else {
        // Fallback: copy share URL to clipboard
        await copyToClipboard(shareData.url, "Share link");
      }
    } catch (error) {
      // User cancelled share or error occurred
      if (error.name !== "AbortError") {
        console.error("Share failed:", error);
        showToast("Share failed", "error");
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

    // Auto-remove after 3 seconds
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
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
      log("Share parameter detected:", shareId);

      // Find account
      const account = allAccounts.find((a) => a.id === shareId);

      if (account) {
        // Scroll to account
        setTimeout(() => {
          const accountCard = document.querySelector(
            `[data-account-id="${shareId}"]`
          );
          if (accountCard) {
            accountCard.scrollIntoView({ behavior: "smooth", block: "center" });
            accountCard.style.outline = "3px solid var(--accent)";

            // Remove outline after 3 seconds
            setTimeout(() => {
              accountCard.style.outline = "";
            }, 3000);
          }
        }, 500);
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
    // Close modal on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeQRModal();
      }
    });

    // Close modal on overlay click
    const modalOverlay = document.querySelector(".modal-overlay");
    if (modalOverlay) {
      modalOverlay.addEventListener("click", closeQRModal);
    }

    // Close modal button
    const modalCloseButtons = document.querySelectorAll("[data-close-modal]");
    modalCloseButtons.forEach((button) => {
      button.addEventListener("click", closeQRModal);
    });

    // Update footer year
    const yearElement = document.getElementById("current-year");
    if (yearElement) {
      yearElement.textContent = new Date().getFullYear();
    }

    // Online/offline status
    window.addEventListener("online", () => {
      showToast("Connection restored", "success");
    });

    window.addEventListener("offline", () => {
      showToast("No internet connection", "error");
    });
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
    DOM.qrModal = document.getElementById("qr-modal");
    DOM.qrDisplay = document.getElementById("qr-display");
    DOM.qrAccountInfo = document.getElementById("qr-account-info");
    DOM.toastContainer = document.getElementById("toast-container");
    DOM.purposeSelect = document.getElementById("purpose-select");
    DOM.favoritesToggle = document.getElementById("favorites-toggle");
    DOM.lastUpdated = document.getElementById("last-updated-date");
  }

  /**
   * Initialize the app
   */
  async function init() {
    log("Initializing app...");

    // Cache DOM elements
    cacheDOMElements();

    // Load favorites from localStorage
    loadFavorites();

    // Setup global event listeners
    setupEventListeners();

    // Load data
    await loadData();

    // Initial render
    filteredAccounts = [...allAccounts];
    renderAccounts();
    renderFavoritesStrip();

    // Setup search and filters
    setupSearch();
    setupFilters();

    // Handle share URL parameter
    handleShareParameter();

    // Update last updated date
    if (DOM.lastUpdated) {
      DOM.lastUpdated.textContent = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }

    log("App initialized successfully");
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
      applyFilters();
    },
    getAccounts: () => [...allAccounts],
    getFilteredAccounts: () => [...filteredAccounts],
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
