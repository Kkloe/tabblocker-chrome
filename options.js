document.getElementById('reset').onclick = () => {
    chrome.storage.local.clear();
    alert('All blocked domains deleted!');
};

const listEl = document.getElementById('list');

chrome.storage.local.get('tabBlockerDomains', (data) => {
    const domains = data.tabBlockerDomains || {};
    const domainKeys = Object.keys(domains);

    if (domainKeys.length === 0) {
        const emptyMsg = document.createElement('li');
        emptyMsg.textContent = 'There are no blocked domains';
        emptyMsg.style.fontStyle = 'italic';
        listEl.appendChild(emptyMsg);
    } else {
        domainKeys.forEach(domain => {
            const item = document.createElement('li');
            item.textContent = domain;
            listEl.appendChild(item);
        });
    }
});
