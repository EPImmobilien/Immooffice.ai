  // PDF.js Worker-Konfiguration: pdf.js 3.x exportiert global als window.pdfjsLib,
  // aeltere Versionen als window['pdfjs-dist/build/pdf']. Wir setzen beides.
  (function() {
    var lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    if (lib && lib.GlobalWorkerOptions) {
      lib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      // Aliases setzen, damit der Parser beide Namen findet
      window.pdfjsLib = lib;
      window._pdfJsReady = true;
      console.log('[ImmoOffice] pdf.js geladen, Version:', lib.version);
    } else {
      console.warn('[ImmoOffice] pdf.js nicht gefunden im window-Objekt');
    }
  })();
