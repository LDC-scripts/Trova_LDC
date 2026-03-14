// ==UserScript==
// @name         Trova LDC v15.03
// @namespace    http://tampermonkey.net/
// @version      15.03
// @description  Mostra la chiave fisica in qualsiasi vista ServiceNow con colonna Rack.
//               Pulsante QR (280x280) per ogni riga — leggibile dall'app LDC Keys.
// @author       LDC
// @match        *://*.service-now.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      docs.google.com
// @connect      googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/LDC-scripts/Trova_LDC/main/Trova%20LDC%20v15.02-15.02.user.js
// @downloadURL  https://raw.githubusercontent.com/LDC-scripts/Trova_LDC/main/Trova%20LDC%20v15.02-15.02.user.js
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const REFRESH_MIN = 5;
    const COL = { etichettaAsset:0, rack:1, categoriaModello:2, nomeCompleto:3, assetModel:4, piattaformaSupportata:5, chiave:6 };

    let db = { rows: [], idx: {} };
    let dbPronto = false;

    // ============================================================
    // CONFIGURAZIONE LINK CSV
    // Al primo avvio chiede il link CSV e lo salva localmente.
    // Per cambiarlo: Tampermonkey → Trova LDC → Storage → cancella "csv_url"
    // ============================================================
    function getCSVUrl() {
        return GM_getValue('csv_url', '');
    }

    function chiediCSVUrl() {
        const url = prompt(
            '🔑 Trova LDC — Configurazione\n\n' +
            'Inserisci il link CSV del foglio Database_Chiavi:\n' +
            '(ti verrà chiesto solo questa volta — verrà salvato localmente)',
            ''
        );
        if (url && url.trim().startsWith('https://')) {
            GM_setValue('csv_url', url.trim());
            return url.trim();
        } else if (url !== null) {
            alert('Link non valido. Deve iniziare con https://\nRicarica la pagina per riprovare.');
        }
        return null;
    }

    function inizializza() {
        let url = getCSVUrl();
        if (!url) {
            url = chiediCSVUrl();
            if (!url) return; // utente ha annullato
        }
        caricaCSV(url, () => elaboraTabella());

        // Refresh CSV periodico
        setInterval(() => {
            caricaCSV(getCSVUrl(), () => {
                document.querySelectorAll('[data-ldc-v15]').forEach(el => {
                    el.removeAttribute('data-ldc-v15');
                    el.querySelectorAll('span').forEach(s => {
                        if (s.style.cssText.includes('border-radius') || s.innerText === 'QR') s.remove();
                    });
                });
                elaboraTabella();
            });
        }, REFRESH_MIN * 60 * 1000);

        // Scansione per righe caricate dinamicamente
        setInterval(elaboraTabella, 1500);
    }

    // ============================================================
    // CARICAMENTO CSV
    // ============================================================
    function caricaCSV(url, callback) {
        if (!url) return;
        GM_xmlhttpRequest({
            method: "GET",
            url: url + (url.includes('?') ? '&' : '?') + "nocache=" + Date.now(),
            headers: { "Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache" },
            onload: function (res) {
                const nuova = { rows: [], idx: {} };
                const lines = res.responseText.split(/\r?\n/);
                const sep   = lines[0].includes(';') ? ';' : ',';
                lines.forEach((line, i) => {
                    if (i === 0 || !line.trim()) return;
                    const c      = line.split(sep).map(x => x.replace(/^["']|["']$/g,'').trim());
                    const chiave = (c[COL.chiave] || "").trim();
                    if (!chiave || chiave.toUpperCase() === "DA ASSEGNARE") return;
                    const row = {
                        etichetta:   (c[COL.etichettaAsset]        || "").trim(),
                        rack:        (c[COL.rack]                  || "").trim(),
                        categoria:   (c[COL.categoriaModello]      || "").trim(),
                        sala:        (c[COL.nomeCompleto]          || "").trim(),
                        modello:     (c[COL.assetModel]            || "").trim(),
                        piattaforma: (c[COL.piattaformaSupportata] || "").trim(),
                        chiave
                    };
                    const idx = nuova.rows.length;
                    nuova.rows.push(row);
                    [row.etichetta, row.rack, row.piattaforma].forEach(v => {
                        if (!v) return;
                        const k = v.toUpperCase();
                        if (!nuova.idx[k]) nuova.idx[k] = [];
                        nuova.idx[k].push(idx);
                    });
                });
                db = nuova; dbPronto = true;
                console.log("Trova LDC v15.03: DB pronto — " + db.rows.length + " righe.");
                if (callback) callback();
            },
            onerror: () => console.error("Trova LDC v15.03: Errore caricamento CSV.")
        });
    }

    // ============================================================
    // RICERCA
    // ============================================================
    function cercaRiga(testo) {
        if (!testo || testo.trim() === "" || testo.toLowerCase() === "(vuoto)") return null;
        const k = testo.trim().toUpperCase();
        const i = db.idx[k] || [];
        return i.length > 0 ? db.rows[i[0]] : null;
    }

    // ============================================================
    // ELABORA TABELLA
    // ============================================================
    function elaboraTabella() {
        if (!dbPronto) return;
        const headers = document.querySelectorAll('th');
        let idxRack = -1, idxEt = -1, idxPf = -1;
        headers.forEach((th, i) => {
            const l = (th.innerText || th.textContent || "").trim().toLowerCase();
            if (l === "rack")                                              idxRack = i;
            if (l === "etichetta asset" || l === "asset tag")             idxEt   = i;
            if (l === "piattaforma supportata" || l === "platform" ||
                l === "supported platform")                                idxPf   = i;
        });
        if (idxRack === -1) return;

        document.querySelectorAll('tr.list_row, tr.list_odd, tr.list_even').forEach(riga => {
            const celle = riga.querySelectorAll('td');
            const cRack = celle[idxRack];
            if (!cRack || cRack.getAttribute('data-ldc-v15')) return;

            const tRack = cRack.innerText.trim();
            const tEt   = (idxEt !== -1 && celle[idxEt])  ? celle[idxEt].innerText.trim()  : "";
            const tPf   = (idxPf !== -1 && celle[idxPf])  ? celle[idxPf].innerText.trim()  : "";

            const rigaDb = cercaRiga(tRack) || cercaRiga(tEt) || cercaRiga(tPf);

            cRack.style.cssText += "display:flex;justify-content:space-between;align-items:center;gap:6px;";

            const badge = document.createElement('span');
            badge.style.cssText = "padding:2px 8px!important;border-radius:3px!important;font-weight:bold!important;font-size:12px!important;white-space:nowrap!important;margin-left:auto!important;display:inline-block!important;flex-shrink:0!important;";

            if (rigaDb) {
                badge.style.setProperty("background", "#cc0000", "important");
                badge.style.setProperty("color",      "white",   "important");
                badge.innerText = "🔑 " + rigaDb.chiave;

                const btnQR = document.createElement('span');
                btnQR.style.cssText = [
                    "cursor:pointer",
                    "font-size:11px",
                    "font-weight:bold",
                    "font-family:monospace",
                    "letter-spacing:1px",
                    "flex-shrink:0",
                    "background:#f0f0ee",
                    "border:1.5px solid #c0bdb7",
                    "border-radius:4px",
                    "padding:2px 6px",
                    "color:#333",
                    "transition:background 0.15s"
                ].join("!important;") + "!important;";
                btnQR.innerText = "QR";
                btnQR.title = "Genera QR per app LDC Keys";
                btnQR.onmouseover = () => {
                    btnQR.style.setProperty("background",    "#cc0000", "important");
                    btnQR.style.setProperty("color",         "white",   "important");
                    btnQR.style.setProperty("border-color",  "#cc0000", "important");
                };
                btnQR.onmouseout = () => {
                    btnQR.style.setProperty("background",    "#f0f0ee", "important");
                    btnQR.style.setProperty("color",         "#333",    "important");
                    btnQR.style.setProperty("border-color",  "#c0bdb7", "important");
                };
                btnQR.onclick = (e) => { e.stopPropagation(); mostraQR(rigaDb); };
                cRack.appendChild(btnQR);
            } else {
                badge.style.setProperty("color",     "#cc0000", "important");
                badge.style.setProperty("font-size", "16px",    "important");
                badge.innerText = "/";
            }

            cRack.appendChild(badge);
            cRack.setAttribute('data-ldc-v15', 'true');
        });
    }

    // ============================================================
    // OVERLAY QR
    // ============================================================
    function creaOverlay() {
        if (document.getElementById('ldc-qr-overlay')) return;
        const s = document.createElement('script');
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
        document.head.appendChild(s);

        const ov = document.createElement('div');
        ov.id = 'ldc-qr-overlay';
        ov.style.cssText = "position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.88);display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;font-family:monospace;";
        ov.innerHTML = `
          <div style="background:#f5f3ef;border:1.5px solid #d5d2cc;border-radius:12px;padding:22px;display:flex;flex-direction:column;align-items:center;gap:14px;max-width:340px;width:92vw;">
            <div style="font-size:10px;letter-spacing:3px;color:#888880;text-transform:uppercase;font-family:monospace;">QR per LDC Keys</div>
            <div id="ldc-qr-box" style="background:white;padding:12px;border-radius:8px;border:1.5px solid #d5d2cc;"></div>
            <div id="ldc-qr-info" style="font-size:12px;color:#1c1a18;text-align:center;line-height:1.7;font-family:monospace;"></div>
            <button id="ldc-qr-close"
              style="background:#cc0000;color:white;border:none;border-radius:6px;padding:10px 28px;font-weight:bold;font-size:14px;cursor:pointer;letter-spacing:2px;font-family:monospace;">
              ✕  CHIUDI
            </button>
          </div>`;
        document.body.appendChild(ov);

        document.getElementById('ldc-qr-close').onclick = chiudiOverlay;
        ov.onclick = e => { if (e.target === ov) chiudiOverlay(); };
    }

    function chiudiOverlay() {
        const ov = document.getElementById('ldc-qr-overlay');
        if (ov) { ov.style.display = 'none'; document.getElementById('ldc-qr-box').innerHTML = ''; }
    }

    function mostraQR(rigaDb) {
        creaOverlay();
        const ov   = document.getElementById('ldc-qr-overlay');
        const box  = document.getElementById('ldc-qr-box');
        const info = document.getElementById('ldc-qr-info');
        box.innerHTML = '';

        const payload = JSON.stringify({
            chiave:      rigaDb.chiave,
            rack:        rigaDb.rack,
            etichetta:   rigaDb.etichetta,
            sala:        rigaDb.sala,
            piattaforma: rigaDb.piattaforma,
            categoria:   rigaDb.categoria,
            modello:     rigaDb.modello
        });

        info.innerHTML =
            "<b style='color:#cc0000;font-size:20px;letter-spacing:3px'>🔑 " + rigaDb.chiave + "</b><br>" +
            (rigaDb.rack        ? "Rack: <b>"        + rigaDb.rack        + "</b><br>" : "") +
            (rigaDb.etichetta   ? "Etichetta: <b>"   + rigaDb.etichetta   + "</b><br>" : "") +
            (rigaDb.piattaforma ? "Piattaforma: <b>" + rigaDb.piattaforma + "</b><br>" : "") +
            (rigaDb.sala        ? "Sala: <b>"        + rigaDb.sala        + "</b>"      : "");

        ov.style.display = 'flex';

        setTimeout(() => {
            if (typeof QRCode === 'undefined') {
                box.innerHTML = '<div style="color:#cc0000;padding:12px;font-size:11px;">Libreria QR non caricata.<br>Riprova tra qualche secondo.</div>';
                return;
            }
            try {
                new QRCode(box, {
                    text:         payload,
                    width:        280,
                    height:       280,
                    colorDark:    "#000000",
                    colorLight:   "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                });
            } catch (e) {
                box.innerHTML = '<div style="color:#cc0000;padding:12px;">Errore generazione QR</div>';
            }
        }, 120);
    }

    // ── AVVIO ──
    inizializza();

})();
