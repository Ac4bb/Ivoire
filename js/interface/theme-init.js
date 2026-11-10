try {
  const theme = localStorage.getItem('ivoire:theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
} catch (_) {}
