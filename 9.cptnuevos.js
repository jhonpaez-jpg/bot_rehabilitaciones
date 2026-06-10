const puppeteer = require('puppeteer');

const item = $input.first().json;

// ══════════════════════════════════════════════════════════════════
// 🔍 FILTRO: Detectar si la fila debe saltarse
// ══════════════════════════════════════════════════════════════════
if (item._SKIP_ROW === true) {
    console.log(`⏭️ Fila marcada para saltar: ${item._SKIP_REASON || 'Sin razón especificada'}`);
    return [{ json: item }];
}

const WS_URL = item.wsUrl;
const URL_ESPERADA = item.finalUrl;

if (!WS_URL) throw new Error("⛔ No se encontró wsUrl en el input.");

let screenshots = {};
let step = 1;

let descripcion = null;
let panelEndoso = null;
let fechaExp = null;
let fechaIni = null;
let fechaFin = null;

const takeSnap = async (pg, name) => {
    try {
        await new Promise(r => setTimeout(r, 600));
        const b64 = await pg.screenshot({ encoding: 'base64', fullPage: false });
        const fileName = `${step.toString().padStart(2, '0')}_${name}.png`;
        screenshots[fileName] = {
            data: b64,
            mimeType: 'image/png',
            fileName
        };
        step++;
        console.log(`📸 ${fileName}`);
    } catch (e) {
        console.log(`⚠️ Screenshot error: ${e.message}`);
    }
};

// =================================================================
// ⚙️ FUNCIÓN PRINCIPAL (RUN)
// =================================================================
async function run() {
    let browser, targetPage = null;

    try {
        browser = await puppeteer.connect({
            browserWSEndpoint: WS_URL,
            defaultViewport: null
        });

        // ── 1. Encontrar la pestaña activa ──────────────────────────────────
        console.log("🔍 Buscando pestaña activa...");

        const pages = await browser.pages();
        targetPage = pages.find(p => p.url() === URL_ESPERADA) || pages[pages.length - 1];
        await targetPage.bringToFront();
        await new Promise(r => setTimeout(r, 1500));
        console.log(`✅ Conectado a: ${targetPage.url()}`);

        await takeSnap(targetPage, "00_Reconexion");

        // ── 2. Copiar Panel Endoso ───────────────────────────────────────────
        console.log('📍 Leyendo Panel Endoso (endososPanel_header_content)');

        try {
            await targetPage.waitForFunction(
                () => {
                    const el = document.getElementById('endososPanel_header_content');
                    return el && el.innerText && el.innerText.trim().length > 0;
                },
                { timeout: 20000 }
            );

            panelEndoso = await targetPage.evaluate(() => {
                const el = document.getElementById('endososPanel_header_content');
                return (el.value || el.innerText || el.textContent || '').trim();
            });

            console.log(`🎉 Panel Endoso obtenido: "${panelEndoso}"`);
            await takeSnap(targetPage, '01_Panel_Endoso_OK');

        } catch (e) {
            console.log(`⚠️ No se pudo leer endososPanel_header_content: ${e.message}`);
            await takeSnap(targetPage, '02_Panel_Endoso_ERROR');
        }

        // ── 3. Leer tabla lstEndososPoliza ───────────────────────────────────
        console.log('📍 Leyendo tabla lstEndososPoliza');

        try {
            await targetPage.waitForFunction(
                () => {
                    const tabla = document.getElementById('lstEndososPoliza');
                    return tabla && tabla.rows && tabla.rows.length > 0;
                },
                { timeout: 20000 }
            );

            const resultados = await targetPage.evaluate(() => {
                const tabla = document.getElementById('lstEndososPoliza');
                const coincidencias = [];

                for (let i = 0; i < tabla.rows.length; i++) {
                    const celdaDesc = tabla.rows[i].cells[3];
                    if (!celdaDesc) continue;

                    if (celdaDesc.innerText.trim() === "REHABILITACION DE POLIZA") {
                        coincidencias.push({
                            descripcion: tabla.rows[i].cells[3].innerText.trim(),
                            fechaExp:    tabla.rows[i].cells[4].innerText.trim(),
                            fechaIni:    tabla.rows[i].cells[5].innerText.trim(),
                            fechaFin:    tabla.rows[i].cells[6].innerText.trim()
                        });
                    }
                }

                if (coincidencias.length === 0) return null;

                const parseDate = (str) => {
                    const [day, month, year] = str.split('/');
                    return new Date(`${year}-${month}-${day}`);
                };

                const hoy = new Date();
                coincidencias.sort((a, b) => {
                    const diffA = Math.abs(hoy - parseDate(a.fechaExp));
                    const diffB = Math.abs(hoy - parseDate(b.fechaExp));
                    return diffA - diffB;
                });

                return coincidencias[0];
            });

            if (resultados) {
                descripcion = resultados.descripcion;
                fechaExp    = resultados.fechaExp;
                fechaIni    = resultados.fechaIni;
                fechaFin    = resultados.fechaFin;
                console.log(`🎉 Descripción obtenida: "${descripcion}"`);
                console.log(`🎉 Fecha Exp obtenida:   "${fechaExp}"`);
                console.log(`🎉 Fecha Inicio obtenida:"${fechaIni}"`);
                console.log(`🎉 Fecha Fin obtenida:   "${fechaFin}"`);
                await takeSnap(targetPage, '03_Tabla_OK');
            } else {
                console.log('⚠️ No se encontró ninguna fila con REHABILITACION DE POLIZA');
                await takeSnap(targetPage, '04_Tabla_Sin_Rehabilitacion');
            }

        } catch (e) {
            console.log(`⚠️ Error leyendo tabla lstEndososPoliza: ${e.message}`);
            await takeSnap(targetPage, '05_Tabla_ERROR');
        }

        // ── 4. Finalización ──────────────────────────────────────────────────
        const newWsUrl   = browser.wsEndpoint();
        const newFinalUrl = targetPage.url();

        browser.disconnect();

        return [{
            json: {
                ...item,
                success: true,
                nodo: "9_Copiar_Datos_Nuevos",
                status: "COPIADO_COMPLETADO",
                mensaje: "Copia de datos ejecutada exitosamente",
                wsUrl: newWsUrl,
                finalUrl: newFinalUrl,
                descripcion_nueva:    descripcion,
                Panel_endoso_Nuevo:   panelEndoso,
                Fecha_Exp_Nueva:      fechaExp,
                Fecha_Inicio_Nueva:   fechaIni,
                Fecha_Fin_Nueva:      fechaFin,
                timestamp: new Date().toISOString()
            },
            binary: screenshots
        }];

    } catch (e) {
        console.log(`\n❌ ERROR: ${e.message}`);

        try {
            await takeSnap(targetPage, "ERROR_final");
        } catch (_) { }

        if (browser) browser.disconnect();

        return [{
            json: {
                ...item,
                success: false,
                nodo: "9_Copiar_Datos_Nuevos",
                status: "ERROR_COPIADO",
                descripcion_nueva:    descripcion,
                Panel_endoso_Nuevo:   panelEndoso,
                Fecha_Exp_Nueva:      fechaExp,
                Fecha_Inicio_Nueva:   fechaIni,
                Fecha_Fin_Nueva:      fechaFin,
                error: e.message,
                timestamp: new Date().toISOString()
            },
            binary: screenshots
        }];
    }
}

return run();
