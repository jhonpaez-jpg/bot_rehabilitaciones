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

        for (let i = 0; i < 15; i++) {
            for (const pg of await browser.pages()) {
                if (pg.url().includes('about:blank')) continue;
                try {
                    if (await pg.evaluate(() => document.body?.innerText?.length > 50)) {
                        targetPage = pg;
                        break;
                    }
                } catch (e) { }
            }
            if (targetPage) break;
            await new Promise(r => setTimeout(r, 2000));
        }

        if (!targetPage) throw new Error("❌ No se encontró pestaña activa");

        await targetPage.bringToFront();
        await new Promise(r => setTimeout(r, 1500));
        console.log(`✅ Conectado a: ${targetPage.url()}`);

        await takeSnap(targetPage, "00_Reconexion");

        // ── 2. Presionar Rehabilitar ─────────────────────────────────────────
        console.log("🔘 Buscando botón Rehabilitar...");
        await targetPage.waitForSelector('[id="frmRehabilitaAnula:btnRehabiltar"]', { visible: true, timeout: 10000 });
        await targetPage.click('[id="frmRehabilitaAnula:btnRehabiltar"]');
        await new Promise(r => setTimeout(r, 4000));
        await takeSnap(targetPage, "01_Btn_Rehabilitar");

        // ── 3. Confirmar Rehabilitación ──────────────────────────────────────
        console.log("🔘 Buscando botón Confirmar...");
        await targetPage.waitForSelector('[id="btnConfirmPpalAceptar2"]', { visible: true, timeout: 10000 });
        await targetPage.click('[id="btnConfirmPpalAceptar2"]');
        await new Promise(r => setTimeout(r, 4000));
        await takeSnap(targetPage, "02_Btn_Confirmar");

        // ── 4. Aceptar Operación ─────────────────────────────────────────────
        console.log("🔘 Buscando botón Aceptar...");
        await targetPage.waitForSelector('[id="aceptar1"]', { visible: true, timeout: 10000 });
        await targetPage.click('[id="aceptar1"]');
        await new Promise(r => setTimeout(r, 4000));
        await takeSnap(targetPage, "03_Btn_Aceptar_Final");

        // ── 5. Finalización ──────────────────────────────────────────────────
        await new Promise(r => setTimeout(r, 1000));

        browser.disconnect();

        return [{
            json: {
                ...item,
                success: true,
                nodo: "6_Confirmar_Rehabilitar",
                status: "REHABILITACION_COMPLETADA",
                mensaje: "Rehabilitación ejecutada exitosamente",
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
                nodo: "6_Confirmar_Rehabilitar",
                status: "ERROR_CONFIRMAR_REHABILITACION",
                error: e.message,
                timestamp: new Date().toISOString()
            },
            binary: screenshots
        }];
    }
}

return run();