const puppeteer = require('puppeteer');

// ==========================================
// 1. ✏️ VARIABLES DE ENTORNO Y CONFIGURACIÓN
// ==========================================

const forceClickJS = async (frame, element) => {
    await frame.evaluate(el => { el.scrollIntoView({ block: "center" }); el.click(); }, element);
};

async function run() {
    const item = $input.first().json;

    // ✅ Reconectar al browser que dejó abierto el Nodo 1
    const wsUrl = item.wsUrl;
    const finalUrl = item.finalUrl;

    if (!wsUrl) throw new Error("⛔ No se encontró wsUrl en el input. ¿Viene del Nodo 1?");

    let browser;
    let popupPage;
    let screenshots = {};

    // ⏱️ Timeout global de 3 minutos
    const timeoutId = setTimeout(() => {
        if (browser) {
            console.error("⏱️ TIMEOUT: Cerrando browser después de 3 minutos");
            browser.close().catch(() => { });
        }
    }, 180000);

    const takeSnap = async (name) => {
        if (!popupPage) return;
        try {
            const shot = await popupPage.screenshot({
                encoding: 'base64',
                fullPage: false,
                type: 'jpeg',
                quality: 80
            });
            screenshots[`${Object.keys(screenshots).length + 1}.${name}`] = {
                data: shot, mimeType: 'image/jpeg', fileName: `${name}.jpg`
            };
        } catch (e) { console.log(`⚠️ Error capturando ${name}: ${e.message}`); }
    };

    try {
        // ✅ Reconectarse al browser existente (NO lanzar uno nuevo)
        browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });
        console.log(`✅ Reconectado al browser: ${wsUrl}`);

        // ✅ Recuperar la página que dejó abierta el Nodo 1
        const pages = await browser.pages();
        popupPage = pages.find(p => p.url() === finalUrl) || pages[pages.length - 1];
        await popupPage.bringToFront();
        console.log(`✅ Página activa: ${popupPage.url()}`);

        await takeSnap('reconexion');

        // ==========================================
        // 2. Salir Consultas Simon
        // ==========================================

        // ── Botón 1: por ID fijo
        let ventanaAtrapada = false;
        for (const frame of popupPage.frames()) {
            const btn1 = await frame.$('#endososPanel_header_controls').catch(() => null);
            if (btn1) {
                await forceClickJS(frame, btn1);
                ventanaAtrapada = true;
                console.log('✅ Click en endososPanel_header_controls');
                await new Promise(r => setTimeout(r, 2000));
                break;
            }
        }

        // ── Botón 2: por texto/xpath
        for (const frame of popupPage.frames()) {
            const [btn2] = await frame.$x("//input[contains(@value, 'Cancelar')] | //button[contains(., 'Cancelar')]");
            if (btn2) {
                await forceClickJS(frame, btn2);
                console.log('✅ Click en Cancelar');
                await new Promise(r => setTimeout(r, 2000));
                await takeSnap('Cerrar panel endoso')
                break;
            }
        }

        if (ventanaAtrapada) await new Promise(r => setTimeout(r, 5000));
        await takeSnap('Salir Simon Consultas');

        // =========================================
        // 3. Entrar Simon Modificaciones
        // =========================================
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

        await findAndHover(popupPage, "Menu Modificaciones Polizas Test");
        await new Promise(r => setTimeout(r, 1000));
        const sub = await findAndHover(popupPage, "Modificacion de Poliza Test");

        if (sub) await sub.frame.evaluate(e => e.click(), sub.element);

        await new Promise(r => setTimeout(r, 500));
        await takeSnap('Menu Modificaciones')

        await new Promise(r => setTimeout(r, 2000));
        await takeSnap('Resultado Final')


        // ==========================================
        // 4. FINALIZACIÓN
        // ==========================================
        await new Promise(r => setTimeout(r, 500));

        const newWsUrl = browser.wsEndpoint();
        const newFinalUrl = popupPage.url();

        // ⚠️ CRÍTICO: Desconectar sin cerrar el browser
        browser.disconnect();
        clearTimeout(timeoutId);

        return [{
            json: {
                ...item,
                success: true,
                nodo: "3.Navegacion Modificacion",
                status: "Navegacion Completada",
                wsUrl: newWsUrl,
                finalUrl: newFinalUrl,
                reinicio_forzado: ventanaAtrapada,
                timestamp: new Date().toISOString()
            },
            binary: screenshots
        }];

    } catch (error) {
        console.error("❌ Error en ejecución:", error.message);
        clearTimeout(timeoutId);
        if (browser) {
            try {
                await browser.close();
            } catch (closeError) {
                console.error("Error cerrando browser:", closeError.message);
            }
        }
        return [{
            json: {
                ...item,
                success: false,
                nodo: "3.Navegacion Modificacion Error",
                status: "ERROR_NAVEGACION",
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            },
            binary: screenshots
        }];
    }
}

return run();