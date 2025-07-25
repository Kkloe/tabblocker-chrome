const DEBUG_MODE = false; // Set to true for debugging
let closedTabCounter = {};

/**
 * LISTENERS
 */

/**
 * When the extension is installed or updated, create the context menu.
 */
chrome.runtime.onInstalled.addListener(() => {
    logDebug("Extension installed or updated");
    createContextMenu();
});

/**
 * When a tab is updated, check if it is reloaded and update the context menu visibility.
 * Also, handle the icon click to toggle the frozen state of the domain.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Logic for context menu visibility
    if (changeInfo.status === "complete") {
        //  updateContextMenuForTab(tabId);

        handleTabUpdate(tabId, tab);
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

/**a
 * When the context menu item is clicked it should open the link in a new tab
 * even if the domain is frozen.
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "tabBlockerForceOpenLink" && info.linkUrl && tab?.index !== undefined) {
        chrome.tabs.create({
            url: info.linkUrl,
            index: tab.index + 1  // Place it right after the current tab
        });
        logDebug("Opened link in new tab next to current:", info.linkUrl);
    }
});


/**
 * When a tab is activated, selected, or switched, update the context menu visibility.
 */
chrome.tabs.onActivated.addListener(({ tabId }) => {
    updateContextMenuForTab(tabId);
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
        contexts: ["link"],
        visible: false
    });
}

/**
 * Update the context menu visibility based on whether the current tab's domain is frozen.
 */
function updateContextMenuForTab(tabId) {
    logDebug("Updating context menu for tab:", tabId);
    chrome.tabs.get(tabId, (tab) => {
        logDebug("Tab details:", tab);

        let domain = null;
        try {
            domain = new URL(tab.url || tab.pendingUrl || "").hostname;
        } catch (err) {
            logDebug("Invalid URL detected:", err);
            domain = null;
        }

        if (!domain) {
            chrome.contextMenus.update("tabBlockerForceOpenLink", { visible: false });
            return;
        }

        getTabBlockerFrozenDomains().then((domains) => {
            logDebug("Current frozen domains:", domains);
            const isFrozen = domains?.[domain];
            logDebug("Domain frozen status:", domain, isFrozen);
            chrome.contextMenus.update("tabBlockerForceOpenLink", { visible: !!isFrozen });
        });
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
        // check if the current domain is already in the list
        const isNotListed = !domains[domain];
        logDebug("isNotListed", isNotListed);
        if (!isNotListed) {
            // if listed remove it from the list
            logDebug("removing domain from the list");
            delete domains[domain];
            setTabIcon(tab.id, false);
        } else {
            // if not listed add it to the list
            logDebug("adding domain to the list");
            domains[domain] = true;
            setTabIcon(tab.id, true);
        }
        // save the the current domain to the list of frozen domains
        chrome.storage.local.set({ tabBlockerFrozenDomains: domains }, () => {
            logDebug("updated domains", domains);
        });
    });
}

/**
 * When a tab is updated, check if it is reloaded and update the icon accordingly.
 */
function handleTabUpdate(tabId, tab) {
    if (tab.url) {
        const domain = new URL(tab.url).hostname;
        logDebug(`Tab reloaded: ${domain}`);

        getTabBlockerFrozenDomains().then((domains) => {
            if (domains[domain]) {
                setTabIcon(tabId, true);
            } else {
                setTabIcon(tabId, false);
            }
        });
    }
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
        if (!openerTab) {
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
            if (domains[domain]) {
                chrome.tabs.remove(newTab.id);
                closedTabCounter[domain] = (closedTabCounter[domain] || 0) + 1;
                chrome.action.setBadgeText({ tabId: openerTab.id, text: closedTabCounter[domain].toString() });
                logDebug("New tab blocked for domain:", domain);
            } else {
                logDebug("New tab not blocked for domain:", domain);
            }
        });
    });
}

/**
 * Helper Functions
 */

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
