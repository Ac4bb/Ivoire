    {
      const select = document.getElementById('themeSelect');
      select.value = document.documentElement.dataset.theme || 'default';
      select.addEventListener('change', () => {
        const theme = select.value;
        if (theme === 'default') delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = theme;
        try { localStorage.setItem('ivoire:theme', theme); } catch (_) {}
      });
    }
