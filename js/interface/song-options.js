    {
      const content = document.getElementById('songOptionsContent');
      ['restartSong','favoriteSong','renameSong','deleteSong','importLegacy'].forEach(id => {
        content.appendChild(document.getElementById(id));
      });
      document.addEventListener('click', event => {
        document.querySelectorAll('.compact-options[open]').forEach(menu => {
          if (!menu.contains(event.target)) menu.open = false;
        });
      });
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        document.querySelectorAll('.compact-options[open]').forEach(menu => {
          menu.open = false;
          menu.querySelector('summary').focus();
        });
      });
      content.addEventListener('click', event => {
        if (event.target.closest('button')) document.getElementById('songOptions').open = false;
      });
    }
