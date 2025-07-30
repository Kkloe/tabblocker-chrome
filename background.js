const DEBUG_MODE = true; // Set to true for debugging
let closedTabCounter = {};

/**
 * LISTENERS
 */

/**
 * When the extension is installed or updated, create the context menu.
 */
chrome.runtime.onInstalled.addListener(() => {
    logDebug("Extension installed or updated");
    createContextMenu(); // The callback in createContextMenu will now call updateTabBlockerContextMenu
});

/**
 * When a tab is updated, check if it is reloaded and update the tab icon.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete") {
        if (!tab || !tab.url) {
            logDebug("No valid tab found for tabId in onUpdated:", tabId);
            return;
        }
        getTabBlockerFrozenDomains().then((domains) => {
            logDebug("Tab updated: ", tab);
            const isFrozen = isTabFrozen(tab, domains);
            // Handle the tab icon based on the frozen state
            handleTabIcon(tab, isFrozen);
        });
    }
});

/**
 * When the extension icon is clicked, toggle the frozen state of the current tab's domain.
 */
chrome.action.onClicked.addListener((tab) => {
    handleIconClick(tab);
});

/**
 * When a new tab is created
 */
chrome.tabs.onCreated.addListener((newTab) => {
    handleNewTab(newTab);
});

/**
 * When the context menu item is clicked it should open the link in a new tab
 * even if the domain is frozen.
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "tabBlockerForceOpenLink" && info.linkUrl && tab?.index !== undefined) {
        chrome.tabs.create({
            url: info.linkUrl,
            index: tab.index + 1 // Place it right after the current tab
        });
        logDebug("Opened link in new tab next to current:", info.linkUrl);
    }
});


/**
 * When a tab is activated, selected, or switched, update the tab icon.
 * Context menu visibility is now handled globally by documentUrlPatterns.
 */
chrome.tabs.onActivated.addListener(({ tabId }) => {
    getTabBlockerFrozenDomains().then((domains) => {
        chrome.tabs.get(tabId, (tab) => {
            if (!tab || !tab.url) {
                logDebug("No valid tab found for tabId in onActivated:", tabId);
                return;
            }
            logDebug("Tab activated:", tab);
            const isFrozen = isTabFrozen(tab, domains);
            handleTabIcon(tab, isFrozen);
        });
    });
});


/**
 * CONTEXT MENU LOGIC
 * This section handles the creation and management of context menu items
 */

/**
 * When the extension is installed, create a context menu item for opening links even if they are frozen.
 */
function createContextMenu() {
    logDebug("Creating context menu");
    chrome.contextMenus.create({
        id: "tabBlockerForceOpenLink",
        title: "Open new tab (override freeze)",
        contexts: ["link"]
    }, () => {
        if (chrome.runtime.lastError) {
            console.error("Error creating context menu:", chrome.runtime.lastError);
        } else {
            // Immediately update the context menu patterns after creation
            updateTabBlockerContextMenu();
        }
    });
}

/**
 * Update the context menu's visibility and document URL patterns
 * based on the currently frozen domains. This ensures the menu item
 * only appears on links within frozen domains.
 */
function updateTabBlockerContextMenu() {
    logDebug("Updating context menu with documentUrlPatterns.");
    getTabBlockerFrozenDomains().then((domains) => {
        let hostPatterns = [];
        for (const domain in domains) {
            if (domains[domain] === true) {
                // Construct the pattern to match the exact hostname
                hostPatterns.push(`*://${domain}/*`);
            }
        }

        // The context menu should only be overall visible if there are
        // actually domains frozen. If not, it won't show anywhere.
        let menuOverallVisible = hostPatterns.length > 0;

        chrome.contextMenus.update(
            "tabBlockerForceOpenLink", // The ID of your context menu item
            {
                documentUrlPatterns: hostPatterns,
                visible: menuOverallVisible // Set overall visibility
            },
            () => {
                if (chrome.runtime.lastError) {
                    console.error("Error updating context menu patterns:", chrome.runtime.lastError);
                } else {
                    logDebug("Context menu patterns updated:", hostPatterns, "Overall Visibility:", menuOverallVisible);
                }
            }
        );
    });
}

/**
 * ICON LOGIC
 * This section handles the logic when the extension icon is clicked
 * or when a tab is updated.
 */

/**
 * When the extension icon is clicked, toggle the current domain in the list of frozen domains.
 */
function handleIconClick(tab) {
    logDebug("clicked on the icon ");
    const domain = new URL(tab.url).hostname;
    logDebug("domain", domain);

    getTabBlockerFrozenDomains().then((domains) => {
        logDebug("domains", domains);
        const isFrozen = isTabFrozen(tab, domains);
        logDebug("isFrozen", isFrozen);

        if (isFrozen) {
            logDebug("removing domain from the list");
            delete domains[domain];
        } else {
            logDebug("adding domain to the list");
            domains[domain] = true;
        }

        // handle the tab icon based on the new state
        handleTabIcon(tab, !isFrozen);

        // save the current domain to the list of frozen domains
        chrome.storage.local.set({ tabBlockerFrozenDomains: domains }, () => {
            logDebug("updated domains", domains);
            // Update the context menu to reflect the new frozen domains
            updateTabBlockerContextMenu();
        });
    });
}

/**
 * TAB BLOCKING LOGIC
 * This section handles the logic for blocking new tabs based on the opener tab's domain.
 */

/**
 * When a new tab is created, check if it has an openerTabId and if the domain is blocked.
 */
function handleNewTab(newTab) {
    logDebug("New tab created:", newTab);
    // Check if the new tab has a valid openerTabId
    if (!newTab.openerTabId || typeof newTab.openerTabId !== 'number') {
        logDebug("No valid openerTabId found for new tab:", newTab);
        return;
    }
    chrome.tabs.get(newTab.openerTabId, (openerTab) => {
        // If the opener tab is not found or is invalid, skip the logic
        if (!openerTab || !openerTab.url) {
            logDebug("Opener tab not found or invalid URL:", openerTab);
            return;
        }
        logDebug("Opener tab for new tab:", openerTab);
        // Check if the new tab is a manual new tab, CTRL+T or the plus sign for new tab
        if (isChromeScheme(newTab.pendingUrl) && newTab.url === "") {
            logDebug("This tab is likely a manual new tab — skipping tab block logic.");
            return;
        }
        const domain = new URL(openerTab.url).hostname;
        logDebug("Opener tab domain:", domain);
        getTabBlockerFrozenDomains().then((domains) => {
            logDebug("Current tab blocker domains:", domains);
            const isFrozen = isTabFrozen(openerTab, domains);
            if (isFrozen) {
                chrome.tabs.remove(newTab.id);
                closedTabCounter[domain] = (closedTabCounter[domain] || 0) + 1;
                chrome.action.setBadgeText({ tabId: openerTab.id, text: closedTabCounter[domain].toString() });
                logDebug("New tab blocked for domain:", domain);
            } else {
                logDebug("New tab not blocked for domain:", domain);
                // Only handle the icon for the new tab if it's not blocked
                handleTabIcon(newTab, isFrozen);
            }
        });
    });
}

/**
 * Helper Functions
 */

/**
 * Handle the tab's icon based on its frozen state.
 * This function now *only* handles the icon.
 *
 * @param {Object} tab
 * @param {boolean} isFrozen
 */
function handleTabIcon(tab, isFrozen) {
    logDebug("Handling tab icon for tab: ", tab, "Is frozen: ", isFrozen);
    setTabIcon(tab.id, isFrozen);
}

/**
 * Check if the tab's domain is frozen.
 * @param {Object} tab - The tab object to check.
 * @param {Object} domains - The object containing frozen domains.
 *
 * @return {boolean} - Returns true if the tab's domain is frozen, false otherwise.
 */
function isTabFrozen(tab, domains) {
    // Ensure tab.url exists before creating a URL object
    if (!tab || !tab.url) {
        logDebug("Invalid tab or URL provided to isTabFrozen:", tab);
        return false;
    }
    try {
        const domain = new URL(tab.url).hostname;
        const isFrozen = domains?.[domain];
        return isFrozen || false;
    } catch (e) {
        logDebug("Error getting hostname from tab URL in isTabFrozen:", tab.url, e);
        return false;
    }
}


/**
 * Get the list of frozen domains from storage.
 *
 * @returns {Promise<Object>} A promise that resolves to the frozen domains object.
 */
function getTabBlockerFrozenDomains() {
    return new Promise((resolve) => {
        chrome.storage.local.get('tabBlockerFrozenDomains', (data) => {
            resolve(data.tabBlockerFrozenDomains || {});
        });
    });
}

/**
 * Set the icon for the tab based on whether it is frozen or not.
 *
 * @param {number} tabId
 * @param {boolean} isFrozen
 */
function setTabIcon(tabId, isFrozen) {
    logDebug(`Setting icon for tab ${tabId} to ${isFrozen ? 'on' : 'off'}`);
    const iconPath = isFrozen ? 'images/icons/icon128frozen.png' : 'images/icons/icon128.png';
    chrome.action.setIcon({ path: iconPath, tabId });

    const title = isFrozen ? "TURN OFF Freezing" : "TURN ON Freezing";
    chrome.action.setTitle({ tabId, title });
}

/**
 * Function to check if the URL is a Chrome scheme.
 *
 * @param {*} url
 * @returns boolean
 */
function isChromeScheme(url) {
    logDebug("Checking if URL is a Chrome scheme:", url);
    return /^chrome[^:]*:\/\//.test(url);
}

/**
 * For debugging purposes, log messages to the console if DEBUG_MODE is true.
 *
 * @param  {...any} args
 */
function logDebug(...args) {
    if (DEBUG_MODE) {
        console.log(...args);
    }
}
