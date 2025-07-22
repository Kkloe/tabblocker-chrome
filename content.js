document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.code === 'Space') {
        localStorage.setItem('tabFreezerOverride', 'true');
        setTimeout(() => localStorage.removeItem('tabFreezerOverride'), 3000);
    }
});
