function loadDomains() {
  chrome.storage.local.get('tabBlockerFrozenDomains', (data) => {
    const domains = data.tabBlockerFrozenDomains || {};
    const list = document.getElementById('domainList');
    list.innerHTML = '';

    Object.keys(domains).forEach((domain) => {
      const li = document.createElement('li');
      li.textContent = domain;

      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.onclick = () => removeDomain(domain);

      li.appendChild(removeBtn);
      list.appendChild(li);
    });
  });
}

function removeDomain(domain) {
  chrome.storage.local.get('tabBlockerFrozenDomains', (data) => {
    const domains = data.tabBlockerFrozenDomains || {};
    delete domains[domain];

    chrome.storage.local.set({ tabBlockerFrozenDomains: domains }, () => {
      loadDomains(); // Refresh the list
    });
  });
}

document.getElementById('removeAll').addEventListener('click', () => {
  chrome.storage.local.set({ tabBlockerFrozenDomains: {} }, () => {
    loadDomains();
  });
});

document.addEventListener('DOMContentLoaded', loadDomains);
