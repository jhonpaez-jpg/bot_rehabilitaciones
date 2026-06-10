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

// ── Extracción de datos de la fila ──────────────────────────────
const rowData = item.row || item;
const PRODUCTO_VALOR = (String(rowData.SECCION || rowData.PRODUCTO || "")).trim();
const NUMERO_POLIZA = (String(rowData.POLIZA || "")).trim();

console.log("🎯 Producto:", PRODUCTO_VALOR, "| Póliza:", NUMERO_POLIZA);

if (!WS_URL) throw new Error("⛔ No se encontró wsUrl en el input.");
if (NUMERO_POLIZA.length < 3) throw new Error(
    `⛔ Póliza vacía. Keys en item: ${Object.keys(item).join(', ')}, Keys en rowData: ${Object.keys(rowData).join(', ')}`
);

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

        // ── 2. Localizar frame del formulario ────────────────────────────────
        console.log("🔍 Buscando frame del formulario...");
        let formFrame = null;

        for (const frame of targetPage.frames()) {
            const found = await frame.$("#frmConsultaGeneral\\:seccion").catch(() => null);
            if (found) {
                formFrame = frame;
                break;
            }
        }

        if (!formFrame) throw new Error("No se encontró el frame con ID frmConsultaGeneral");

        await takeSnap(targetPage, "01_Formulario_Encontrado");

        // ── 3. Seleccionar Producto ──────────────────────────────────────────
        console.log(`🔘 Seleccionando Producto: ${PRODUCTO_VALOR}`);
        const selProducto = "#frmConsultaGeneral\\:seccion";
        await formFrame.waitForSelector(selProducto);
        await formFrame.select(selProducto, PRODUCTO_VALOR);
        await new Promise(r => setTimeout(r, 1000));
        await takeSnap(targetPage, "02_Producto_Seleccionado");

        // ── 4. Ingresar Número de Póliza ─────────────────────────────────────
        console.log(`🔘 Ingresando Póliza: ${NUMERO_POLIZA}`);
        const inputPoliza = "#frmConsultaGeneral\\:numPoliza";
        await takeSnap(targetPage, "03_Antes_Ingresar_Poliza");

        await formFrame.click(inputPoliza, { clickCount: 3 });
        await targetPage.keyboard.press('Backspace');
        await formFrame.type(inputPoliza, NUMERO_POLIZA, { delay: 100 });
        await targetPage.keyboard.press('Tab');
        await takeSnap(targetPage, "04_Poliza_Ingresada");

        // ── 5. Click en Buscar ───────────────────────────────────────────────
        console.log("🔘 Buscando botón Buscar...");
        await takeSnap(targetPage, "05_Antes_Click_Buscar");
        const [btnBuscar] = await formFrame.$x("//input[@value='Buscar']");
        if (btnBuscar) {
            await btnBuscar.click();
            await takeSnap(targetPage, "06_Despues_Click_Buscar");
        }

        await new Promise(r => setTimeout(r, 2000));
        await takeSnap(targetPage, "07_Esperando_Resultados");
        await new Promise(r => setTimeout(r, 2000));
        await takeSnap(targetPage, "08_Resultados_Busqueda");

        // ── 6. Click robusto en botón de resultado ───────────────────────────
        console.log("🎯 Iniciando clic robusto en botón de resultado...");
        const btnResultadoId = "#frmConsultaGeneral\\:lstPolizasCotizPresu\\:0\\:j_idt681";

        const clickConValidaciones = async () => {

            // Estrategia 1: Click por ID específico con validaciones
            let btnFinal = await formFrame.$(btnResultadoId).catch(() => null);

            if (btnFinal) {
                console.log("✅ Botón encontrado por ID");
                await takeSnap(targetPage, "09_Boton_Resultado_Encontrado");

                const isVisible = await formFrame.evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                }, btnFinal);

                if (!isVisible) {
                    console.log("⚠️ Botón no visible, haciendo scroll");
                    await takeSnap(targetPage, "10_Boton_No_Visible");
                    await formFrame.evaluate(el => el.scrollIntoView({ block: "center", behavior: "smooth" }), btnFinal);
                    await new Promise(r => setTimeout(r, 500));
                    await takeSnap(targetPage, "11_Despues_Scroll_Boton");
                }

                const isEnabled = await formFrame.evaluate(
                    el => !el.disabled && !el.hasAttribute('disabled'), btnFinal
                );

                if (!isEnabled) {
                    console.log("⚠️ Botón deshabilitado, esperando habilitación...");
                    await takeSnap(targetPage, "12_Boton_Deshabilitado");
                    await new Promise(r => setTimeout(r, 2000));
                    btnFinal = await formFrame.$(btnResultadoId).catch(() => null);
                    await takeSnap(targetPage, "13_Despues_Esperar_Habilitacion");
                }

                for (let intento = 1; intento <= 3; intento++) {
                    try {
                        console.log(`🖱️ Intento ${intento} de clic en botón...`);

                        if (intento === 1) {
                            await btnFinal.click({ delay: 100 });
                        } else if (intento === 2) {
                            await formFrame.evaluate(el => el.click(), btnFinal);
                        } else {
                            await formFrame.evaluate(el => {
                                el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                                el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                                el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                            }, btnFinal);
                        }

                        console.log(`✅ Click ${intento} ejecutado exitosamente`);
                        await takeSnap(targetPage, `14_Click_Exitoso_Intento_${intento}`);
                        await new Promise(r => setTimeout(r, 1000));
                        return true;

                    } catch (clickError) {
                        console.log(`⚠️ Error en intento ${intento}: ${clickError.message}`);
                        await takeSnap(targetPage, `15_Click_Fallido_Intento_${intento}`);
                        if (intento < 3) await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }

            // Estrategia 2: Buscar por XPath en la tabla con la póliza
            console.log("🔍 Estrategia 2: Buscando botón por XPath en tabla...");
            await takeSnap(targetPage, "16_Iniciando_Estrategia_XPath");

            const xpathStrategies = [
                `//tr[contains(., '${NUMERO_POLIZA}')]/td[last()]//*[self::a or self::input or self::button]`,
                `//tr[contains(., '${NUMERO_POLIZA}')]//a[contains(@id, 'j_idt')]`,
                `//tr[contains(., '${NUMERO_POLIZA}')]//input[@type='image' or @type='button']`,
                `//table[@id='frmFiltroModificacion:lstPolizasCotizPresu']//tr[1]//a[last()]`
            ];

            for (const xpath of xpathStrategies) {
                const [btnFallback] = await formFrame.$x(xpath).catch(() => []);
                if (btnFallback) {
                    console.log(`✅ Botón encontrado con XPath: ${xpath.substring(0, 50)}...`);
                    try {
                        await formFrame.evaluate(el => el.scrollIntoView({ block: "center" }), btnFallback);
                        await new Promise(r => setTimeout(r, 300));
                        await formFrame.evaluate(el => el.click(), btnFallback);
                        console.log("✅ Click ejecutado en botón fallback");
                        return true;
                    } catch (fbError) {
                        console.log(`⚠️ Error con fallback: ${fbError.message}`);
                    }
                }
            }

            // Estrategia 3: Primer botón disponible en primera fila de resultados
            console.log("🔍 Estrategia 3: Buscando cualquier botón en primera fila...");
            const [firstRowButton] = await formFrame.$x(
                "//table[@id='frmFiltroModificacion:lstPolizasCotizPresu']//tbody/tr[1]//a[1] | " +
                "//table[@id='frmFiltroModificacion:lstPolizasCotizPresu']//tbody/tr[1]//input[1]"
            ).catch(() => []);

            if (firstRowButton) {
                try {
                    await formFrame.evaluate(el => el.click(), firstRowButton);
                    console.log("✅ Click ejecutado en primer botón de fila");
                    return true;
                } catch (err) {
                    console.log(`⚠️ Error en estrategia 3: ${err.message}`);
                }
            }

            return false;
        };

        const clickExitoso = await clickConValidaciones();

        if (!clickExitoso) {
            console.log("⚠️ ADVERTENCIA: No se pudo hacer clic en ningún botón después de todas las estrategias");
            await takeSnap(targetPage, "17_Error_Sin_Boton");
        } else {
            console.log("✅ Clic en botón de resultado completado exitosamente");
        }

        // ── 7. Finalización ──────────────────────────────────────────────────
        await new Promise(r => setTimeout(r, 1000));

        const newWsUrl = browser.wsEndpoint();
        const newFinalUrl = targetPage.url();

        browser.disconnect();

        return [{
            json: {
                ...item,
                success: true,
                nodo: "8_Poliza_Encontrada",
                status: "POLIZA_ENCONTRADA",
                mensaje: "Consulta de póliza ejecutada exitosamente",
                wsUrl: newWsUrl,
                finalUrl: newFinalUrl,
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
                nodo: "8_Poliza_Encontrada",
                status: "ERROR_CONSULTAR_POLIZA",
                error: e.message,
                timestamp: new Date().toISOString()
            },
            binary: screenshots
        }];
    }
}

return run();
