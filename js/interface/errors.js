window.addEventListener('error', function(e){
  var b = document.getElementById('errorBanner');
  b.style.display = 'block';
  b.textContent = '⚠ Erreur JS : ' + e.message + ' (ligne ' + e.lineno + ', colonne ' + e.colno + ')';
});
