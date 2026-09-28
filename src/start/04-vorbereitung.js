  window.addEventListener('error', function(e) {
    // Harmlose Cross-Origin-Meldungen ("Script error." ohne Detail) sollen den
    // Start NICHT blockieren — nur echte Fehler mit Stack/Detail anzeigen.
    if (!e.error && (!e.message || e.message === 'Script error.')) return;
    // Hinweise des ResizeObservers ("loop completed with undelivered notifications",
    // "loop limit exceeded") sind Layout-Notizen des Browsers, keine Fehler — WebKit
    // meldet sie z. B. beim Umschalten in der Mailansicht. Sie dürfen die App nicht verdecken.
    if (/ResizeObserver loop/.test(String(e.message || ''))) return;
    try {
      var eintrag = { meldung: String(e.message || ''), stack: (e.error && e.error.stack) || '', quelle: window._sb ? 'fenster' : 'start', zeit: Date.now() };
      if (window._epFehlerWarteschlange && typeof window._epFehlerWarteschlange.push === 'function' && !Array.isArray(window._epFehlerWarteschlange)) {
        window._epFehlerWarteschlange.push(eintrag);
      } else {
        (window._epFehlerWarteschlange = window._epFehlerWarteschlange || []).push(eintrag);
        // Hauptskript (noch) nicht da: direkt melden, sonst geht der Startfehler verloren
        var sb = window.IMMO_SUPABASE_URL, roh = null;
        try { roh = JSON.parse(localStorage.getItem('sb-usguiggfciavwzkdfjgt-auth-token') || 'null'); } catch (x) {}
        var token = roh && roh.access_token;
        if (token && window.fetch && !window._epFehlerStartGemeldet) {
          window._epFehlerStartGemeldet = true;
          fetch(sb + '/rest/v1/fehler_protokoll', { method: 'POST', headers: {
            'apikey': window.IMMO_SUPABASE_KEY,
            'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ meldung: eintrag.meldung.slice(0, 2000) || '(ohne Meldung)', stack: eintrag.stack.slice(0, 8000) || null,
              quelle: 'start', url: String(location.href).slice(0, 500), browser: navigator.userAgent.slice(0, 200),
              online: navigator.onLine, benutzer_id: roh.user && roh.user.id || null }) }).catch(function () {});
        }
      }
    } catch (x) {}
    var ov = document.getElementById('errorOverlay');
    if (ov) {
      ov.style.display = 'flex';
      document.getElementById('loadingScreen').style.display = 'none';
      document.getElementById('errorDetails').textContent = (e.message || '') + '\n\n' + (e.error && e.error.stack || '');
    }
  });
