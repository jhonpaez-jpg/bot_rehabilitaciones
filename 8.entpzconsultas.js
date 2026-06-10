const puppeteer = require('puppeteer');

// ==========================================
// 1. ✏️ VARIABLES DE ENTORNO Y CONFIGURACIÓN
// ==========================================

const item = $input.first().json;

// ✅ FIX: Los datos están en item.row
const rowData = item.row || item;

const PRODUCTO_VALOR = (String(rowData.SECCION || rowData.PRODUCTO || "")).trim();
const NUMERO_POLIZA = (String(rowData.POLIZA || "")).trim();

console.log("🎯 Producto:", PRODUCTO_VALOR, "| Póliza:", NUMERO_POLIZA);

if (NUMERO_POLIZA.length < 3) {
    throw new Error(
        `⛔ Póliza vacía. Keys en item: ${Object.keys(item).join(', ')}, Keys en rowData: ${Object.keys(rowData).join(', ')}`
    );
}

async function run() {
    const item = $input.first().json;

    const wsUrl = item.wsUrl;
    const finalUrl = item.finalUrl;

    if (! wsUrl) 
        throw new Error("⛔ No se encontró wsUrl en el input. ¿Viene del Nodo 1?");
    

    let browser;
    let popupPage;
    let screenshots = {};

    // ⏱️ Timeout global de 3 minutos
    const timeoutId = setTimeout(() => {
        if (browser) {
            console.error("⏱️ TIMEOUT: Cerrando browser después de 3 minutos");
            browser.close().catch(() => {});
        }
    }, 180000);

    const takeSnap = async (name) => {
        if (! popupPage) 
            return;
        
        try {
            const shot = await popupPage.screenshot({encoding: 'base64', fullPage: false, type: 'jpeg', quality: 80});
            screenshots[`${
                    Object.keys(screenshots).length + 1
                }.${name}`] = {
                data: shot,
                mimeType: 'image/jpeg',
                fileName: `${name}.jpg`
            };
        } catch (e) {
            console.log(`⚠️ Error capturando ${name}: ${
                e.message
            }`);
        }
    };

    try {
        browser = await puppeteer.connect({browserWSEndpoint: wsUrl});
        console.log(`✅ Reconectado al browser: ${wsUrl}`);

        const pages = await browser.pages();
        popupPage = pages.find(p => p.url() === finalUrl) || pages[pages.length - 1];
        await popupPage.bringToFront();
        console.log(`✅ Página activa: ${
            popupPage.url()
        }`);

        await takeSnap('reconexion');

        // ==========================================
        // 2. LLENADO DE FORMULARIO
        // ==========================================
        let formFrame = null;
        for (const frame of popupPage.frames()) {
            const found = await frame.$("#frmConsultaGeneral\\:seccion").catch(() => null);
            if (found) {
                formFrame = frame;
                break;
            }
        }

        if (! formFrame) 
            throw new Error("No se encontró el frame con ID frmConsultaGeneral");
        

        await takeSnap("formulario_encontrado");

        console.log(`Seleccionando Producto: ${PRODUCTO_VALOR}`);
        const selProducto = "#frmConsultaGeneral\\:seccion";
        await formFrame.waitForSelector(selProducto);

        await formFrame.select(selProducto, PRODUCTO_VALOR);
        await new Promise(r => setTimeout(r, 1000));
        await takeSnap("producto_seleccionado");

        console.log(`Ingresando Póliza: ${NUMERO_POLIZA}`);
        const inputPoliza = "#frmConsultaGeneral\\:numPoliza";
        await takeSnap("antes_ingresar_poliza");

        await formFrame.click(inputPoliza, {clickCount: 3});
        await popupPage.keyboard.press('Backspace');
        await formFrame.type(inputPoliza, NUMERO_POLIZA, {delay: 100});
        await popupPage.keyboard.press('Tab');
        await takeSnap("poliza_ingresada");

        await takeSnap("datos_ingresados");

        await takeSnap("antes_click_buscar");
        const [btnBuscar] = await formFrame.$x("//input[@value='Buscar']");
        if (btnBuscar) {
            await btnBuscar.click();
            await takeSnap("despues_click_buscar");
        }

        await new Promise(r => setTimeout(r, 2000));
        await takeSnap("esperando_resultados_2s");

        await new Promise(r => setTimeout(r, 2000));
        await takeSnap("resultados_busqueda");

        // ==========================================
        // 2.1 CLIC ROBUSTO EN BOTÓN DE RESULTADO
        // ==========================================
        const btnResultadoId = "#frmConsultaGeneral\\:lstPolizasCotizPresu\\:0\\:j_idt681";

        /**
         * Intenta hacer clic en el botón con múltiples estrategias y validaciones
         * @returns {boolean} true si el clic fue exitoso
         */
        const clickConValidaciones = async () => { // Estrategia 1: Click por ID específico con validaciones
            let btnFinal = await formFrame.$(btnResultadoId).catch(() => null);

            if (btnFinal) {
                console.log("✅ Botón encontrado por ID");
                await takeSnap("boton_resultado_encontrado");

                // Validar que el botón esté visible
                const isVisible = await formFrame.evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                }, btnFinal);

                if (! isVisible) {
                    console.log("⚠️ Botón no visible, haciendo scroll");
                    await takeSnap("boton_no_visible");
                    await formFrame.evaluate(el => el.scrollIntoView({block: "center", behavior: "smooth"}), btnFinal);
                    await new Promise(r => setTimeout(r, 500));
                    await takeSnap("despues_scroll_boton");
                }

                // Validar que el botón no esté deshabilitado
                const isEnabled = await formFrame.evaluate(el => !el.disabled && !el.hasAttribute('disabled'), btnFinal);

                if (! isEnabled) {
                    console.log("⚠️ Botón deshabilitado, esperando habilitación...");
                    await takeSnap("boton_deshabilitado");
                    await new Promise(r => setTimeout(r, 2000));
                    btnFinal = await formFrame.$(btnResultadoId).catch(() => null);
                    await takeSnap("despues_esperar_habilitacion");
                }

                // Intentar 3 estrategias de clic
                for (let intento = 1; intento <= 3; intento++) {
                    try {
                        console.log(`🖱️ Intento ${intento} de clic en botón...`);

                        if (intento === 1) { // Intento 1: Click normal de Puppeteer
                            await btnFinal.click({delay: 100});
                        } else if (intento === 2) { // Intento 2: Click con JavaScript directo
                            await formFrame.evaluate(el => el.click(), btnFinal);
                        } else { // Intento 3: Dispatch de evento de click
                            await formFrame.evaluate(el => {
                                el.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
                                el.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
                                el.dispatchEvent(new MouseEvent('click', {bubbles: true}));
                            }, btnFinal);
                        }

                        console.log(`✅ Click ${intento} ejecutado exitosamente`);
                        await takeSnap(`click_exitoso_intento_${intento}`);
                        await new Promise(r => setTimeout(r, 1000));
                        return true;

                    } catch (clickError) {
                        console.log(`⚠️ Error en intento ${intento}: ${
                            clickError.message
                        }`);
                        await takeSnap(`click_fallido_intento_${intento}`);
                        if (intento < 3) 
                            await new Promise(r => setTimeout(r, 1000));
                        
                    }
                }
            }

            // Estrategia 2: Buscar por XPath en la tabla con la póliza
            console.log("🔍 Estrategia 2: Buscando botón por XPath en tabla...");
            await takeSnap("iniciando_estrategia_xpath");
            const xpathStrategies = [`//tr[contains(., '${NUMERO_POLIZA}')]/td[last()]//*[self::a or self::input or self::button]`, `//tr[contains(., '${NUMERO_POLIZA}')]//a[contains(@id, 'j_idt')]`, `//tr[contains(., '${NUMERO_POLIZA}')]//input[@type='image' or @type='button']`, `//table[@id='frmFiltroModificacion:lstPolizasCotizPresu']//tr[1]//a[last()]`];

            for (const xpath of xpathStrategies) {
                const [btnFallback] = await formFrame.$x(xpath).catch(() => []);
                if (btnFallback) {
                    console.log(`✅ Botón encontrado con XPath: ${
                        xpath.substring(0, 50)
                    }...`);

                    try {
                        await formFrame.evaluate(el => el.scrollIntoView({block: "center"}), btnFallback);
                        await new Promise(r => setTimeout(r, 300));
                        await formFrame.evaluate(el => el.click(), btnFallback);
                        console.log("✅ Click ejecutado en botón fallback");
                        return true;
                    } catch (fbError) {
                        console.log(`⚠️ Error con fallback: ${
                            fbError.message
                        }`);
                    }
                }
            }

            // Estrategia 3: Buscar cualquier enlace o botón en la primera fila de resultados
            console.log("🔍 Estrategia 3: Buscando cualquier botón en primera fila...");
            const [firstRowButton] = await formFrame.$x("//table[@id='frmFiltroModificacion:lstPolizasCotizPresu']//tbody/tr[1]//a[1] | " + "//table[@id='frmFiltroModificacion:lstPolizasCotizPresu']//tbody/tr[1]//input[1]").catch(() => []);

            if (firstRowButton) {
                try {
                    await formFrame.evaluate(el => el.click(), firstRowButton);
                    console.log("✅ Click ejecutado en primer botón de fila");
                    return true;
                } catch (err) {
                    console.log(`⚠️ Error en estrategia 3: ${
                        err.message
                    }`);
                }
            }

            return false;
        };

        console.log("🎯 Iniciando clic robusto en botón de resultado...");
        const clickExitoso = await clickConValidaciones();

        if (! clickExitoso) {
            console.log("⚠️ ADVERTENCIA: No se pudo hacer clic en ningún botón después de todas las estrategias");
            await takeSnap("error_sin_boton");
        } else {
            console.log("✅ Clic en botón de resultado completado exitosamente");
        }

        // ==========================================
        // 3. FINALIZACIÓN
        // ==========================================
        await new Promise(r => setTimeout(r, 1000));

        const newWsUrl = browser.wsEndpoint();
        const newFinalUrl = popupPage.url();

        browser.disconnect();
        clearTimeout(timeoutId);

        return [{
                json: {
                    ... item,
                    success: true,
                    nodo: "8. Poliza Encontrada",
                    status: "Poliza Encontrada",
                    wsUrl: newWsUrl,
                    finalUrl: newFinalUrl,
                    timestamp: new Date().toISOString()
                },
                binary: screenshots
            }];

    } catch (error) {
        console.error("❌ Error en ejecución:", error.message);
        clearTimeout(timeoutId);
        if (browser) {
            try {
                browser.disconnect(); // ✅ Cambiado de close() a disconnect()
            } catch (closeError) {
                console.error("Error desconectando browser:", closeError.message);
            }
        }
        return [{
                json: {
                    ... item,
                    success: false,
                    nodo: "8.CONSULTAR POLIZA",
                    status: "ERROR CONSULTAR POLIZA",
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                },
                binary: screenshots
            }];
    }
}

return run();
