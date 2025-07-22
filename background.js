let closedTabCounter = {};

chrome.action.onClicked.addListener((tab) => {
    console.log("clicked on the icon ");
    const domain = new URL(tab.url).hostname;
    console.log("domain", domain);

    chrome.storage.local.get('tabBlockerDomains', (domains) => {
        console.log("domains", domains);
        // get the domains from storage if it exists, otherwise initialize it
        const domainsList = domains.tabBlockerDomains || {};
        // check if the current domain is already in the list
        const isNotListed = !domainsList[domain];
        console.log("isNotListed", isNotListed);
        if (!isNotListed) {
            // if listed remove it from the list
            console.log("removing domain from the list");
            delete domainsList[domain];
            setTabIcon(tab.id, false);
        } else {
            // if not listed add it to the list
            console.log("adding domain to the list");
            domainsList[domain] = true;
            setTabIcon(tab.id, true);
        }
        // save the the current domain to the list of frozen domains
        chrome.storage.local.set({ tabBlockerDomains: domainsList }, () => {
            console.log("updated domains", domainsList);
        });
    });
});

chrome.tabs.onCreated.addListener((newTab) => {
    let tabBlockerDomains = {};
    chrome.tabs.get(newTab.openerTabId, (openerTab) => {
        if (!openerTab) {
            return;
        }
        console.log("New tab created with opener tab:", openerTab);
        const domain = new URL(openerTab.url).hostname;
        console.log("Opener tab domain:", domain);
        chrome.storage.local.get('tabBlockerDomains', (data) => {
            tabBlockerDomains = data.tabBlockerDomains || {};
            console.log("Current tab blocker domains:", tabBlockerDomains);
        });
        if (tabBlockerDomains[domain]) {
            chrome.tabs.remove(newTab.id);
            closedTabCounter[domain] = (closedTabCounter[domain] || 0) + 1;
            chrome.action.setBadgeText({ tabId: openerTab.id, text: closedTabCounter[domain].toString() });
        } else {
            console.log("New tab not blocked for domain:", domain);
        }
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const domain = new URL(tab.url).hostname;
    console.log(`Tab reloaded: ${domain}`);

    chrome.storage.local.get('tabBlockerDomains', (data) => {
        const domains = data.tabBlockerDomains || {};
        if (domains[domain]) {
            setTabIcon(tabId, true);
        } else {
            setTabIcon(tabId, false);
        }
    });
  }
});

function returnTabBlockerDomains() {
    return new Promise((resolve) => {
        chrome.storage.local.get('tabBlockerDomains', (data) => {
            resolve(data.tabBlockerDomains || {});
        });
    });
}

function setTabIcon(tabId, isFrozen) {
    console.log(`Setting icon for tab ${tabId} to ${isFrozen ? 'on' : 'off'}`);
    const iconPath = isFrozen ? 'images/icons/icon128frozen.png' : 'images/icons/icon128.png';

    chrome.action.setIcon({ path: iconPath, tabId });
}


