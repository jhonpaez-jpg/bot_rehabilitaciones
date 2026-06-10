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

        // ── 2. Salir Modificaciones — Botón 1 (por ID) ──────────────────────
        console.log("🔘 Buscando botón Salir Modificaciones...");
        let ventanaAtrapada = false;

        for (const frame of targetPage.frames()) {
            const btn1 = await frame.$('#frmFiltroModificacion\\:j_idt376').catch(() => null);
            if (btn1) {
                await frame.evaluate(el => { el.scrollIntoView({ block: "center" }); el.click(); }, btn1);
                ventanaAtrapada = true;
                console.log('✅ Click en frmFiltroModificacion:j_idt376');
                await new Promise(r => setTimeout(r, 2000));
                break;
            }
        }

        // ── 3. Salir Modificaciones — Botón 2 (Cancelar por XPath) ──────────
        console.log("🔘 Buscando botón Cancelar...");
        for (const frame of targetPage.frames()) {
            const [btn2] = await frame.$x("//input[contains(@value, 'Cancelar')] | //button[contains(., 'Cancelar')]");
            if (btn2) {
                await frame.evaluate(el => { el.scrollIntoView({ block: "center" }); el.click(); }, btn2);
                console.log('✅ Click en Cancelar');
                await new Promise(r => setTimeout(r, 2000));
                await takeSnap(targetPage, "01_Cerrar_Panel_Endoso");
                break;
            }
        }

        if (ventanaAtrapada) await new Promise(r => setTimeout(r, 5000));
        await takeSnap(targetPage, "02_Salir_Simon_Consultas");

        // ── 4. Navegar al menú Consultas ─────────────────────────────────────
        console.log("🔘 Navegando menú Consultas...");
        await new Promise(r => setTimeout(r, 5000));

        const findAndHover = async (pg, txt) => {
            for (const f of pg.frames()) {
                const [el] = await f.$x(`//*[normalize-space(text())='${txt}']`);
                if (el) {
                    await el.evaluate(e => e.scrollIntoView());
                    await f.evaluate(e => e.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })), el);
                    return { frame: f, element: el };
                }
            }
            return null;
        };

        await findAndHover(targetPage, "Consultas Test");
        await new Promise(r => setTimeout(r, 1000));
        const sub = await findAndHover(targetPage, "Polizas Test");
        await new Promise(r => setTimeout(r, 1000));
        const sob = await findAndHover(targetPage, "Numero poliza - seccion - Riesgo Test");

        if (sub) await sub.frame.evaluate(e => e.click(), sub.element);
        if (sob) await sob.frame.evaluate(e => e.click(), sob.element);

        await new Promise(r => setTimeout(r, 500));
        await takeSnap(targetPage, "03_Menu_Consultas");

        // ── 5. Finalización ──────────────────────────────────────────────────
        await new Promise(r => setTimeout(r, 4000));
        await takeSnap(targetPage, "04_Resultado_Final");

        const newWsUrl = browser.wsEndpoint();
        const newFinalUrl = targetPage.url();

        browser.disconnect();

        return [{
            json: {
                ...item,
                success: true,
                nodo: "7_Navegacion_Consultas",
                status: "NAVEGACION_COMPLETADA",
                mensaje: "Navegación a Consultas ejecutada exitosamente",
                wsUrl: newWsUrl,
                finalUrl: newFinalUrl,
                reinicio_forzado: ventanaAtrapada,
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
                nodo: "7_Navegacion_Consultas",
                status: "ERROR_NAVEGACION",
                error: e.message,
                timestamp: new Date().toISOString()
            },
            binary: screenshots
        }];
    }
}

return run();
