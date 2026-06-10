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
    let Alerta_1 = null;

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

        // ✅ FIX: Los datos están en item.row (directamente del Excel)
        const rowData = item.row || item;

        // ✅ Leer campos del Excel: "Producto" y "No_Poliza" (tal como vienen)
        const PRODUCTO_VALOR = (String(
           $input.first().json.PRODUCTO  || "")).trim();

        // 🔍 DEBUG - Agrega estas líneas
        console.log(`🔍 RAW rowData:`, JSON.stringify(rowData));
        console.log(`🔍 PRODUCTO_VALOR exacto: "${PRODUCTO_VALOR}"`);
        console.log(`🔍 Tipo: ${typeof PRODUCTO_VALOR}`);
        console.log(`🔍 Longitud: ${PRODUCTO_VALOR.length}`);
        console.log(`🔍 Char codes: ${[...PRODUCTO_VALOR].map(c => c.charCodeAt(0))}`);

        const NUMERO_POLIZA = (String(
            rowData.No_Poliza ||
            rowData.POLIZA ||
            rowData.no_poliza ||
            ""
        )).trim();

        console.log(`📋 Procesando - Producto: ${PRODUCTO_VALOR} | Póliza: ${NUMERO_POLIZA}`);

        // ==========================================
        // 2. BUSCAR POLIZA
        // ==========================================

        let formFrame = null;
        for (const frame of popupPage.frames()) {
            const found = await frame.$("#frmFiltroModificacion\\:producto").catch(() => null);
            if (found) { formFrame = frame; break; }
        }

        if (!formFrame) throw new Error("No se encontró el frame con ID frmFiltroModificacion");

        console.log(`Seleccionando Producto: ${PRODUCTO_VALOR}`);
        const selProducto = "#frmFiltroModificacion\\:producto";
        await formFrame.waitForSelector(selProducto);

        await formFrame.select(selProducto, PRODUCTO_VALOR);
        await new Promise(r => setTimeout(r, 1000));
        await takeSnap("producto_seleccionado");

        console.log(`Ingresando Póliza: ${NUMERO_POLIZA}`);
        const inputPoliza = "#frmFiltroModificacion\\:numPoliza";

        await formFrame.click(inputPoliza, { clickCount: 3 });
        await popupPage.keyboard.press('Backspace');
        await formFrame.type(inputPoliza, NUMERO_POLIZA, { delay: 100 });
        await popupPage.keyboard.press('Tab');
        await takeSnap("poliza_ingresada");

        await takeSnap("datos_ingresados");

        const [btnBuscar] = await formFrame.$x("//input[@value='Buscar']");
        if (btnBuscar) {
            await btnBuscar.click();
            await takeSnap("despues_click_buscar");
        }

        await new Promise(r => setTimeout(r, 2000));
        await takeSnap("resultados_busqueda");



        // ==========================================
        // 3. INGRESAR REHABILITAR
        // ==========================================

        const btnResultadoId = "#frmFiltroModificacion\\:lstPolizasCotizPresu\\:0\\:j_idt417";

        const clickConValidaciones = async () => {
            await takeSnap("inicio_busqueda_boton");
            let btnFinal = await formFrame.$(btnResultadoId).catch(() => null);

            if (btnFinal) {
                console.log("✅ Botón encontrado por ID");
                await takeSnap("boton_encontrado_por_id");

                const isVisible = await formFrame.evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                }, btnFinal);

                if (!isVisible) {
                    console.log("⚠️ Botón no visible, haciendo scroll");
                    await takeSnap("boton_no_visible_antes_scroll");
                    await formFrame.evaluate(el => el.scrollIntoView({ block: "center", behavior: "smooth" }), btnFinal);
                    await new Promise(r => setTimeout(r, 500));
                    await takeSnap("boton_despues_scroll");
                }

                const isEnabled = await formFrame.evaluate(el => !el.disabled && !el.hasAttribute('disabled'), btnFinal);

                if (!isEnabled) {
                    console.log("⚠️ Botón deshabilitado, esperando habilitación...");
                    await new Promise(r => setTimeout(r, 2000));
                    btnFinal = await formFrame.$(btnResultadoId).catch(() => null);
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
                        await new Promise(r => setTimeout(r, 1000));
                        await takeSnap(`despues_click_intento_${intento}`);
                        return true;

                    } catch (clickError) {
                        console.log(`⚠️ Error en intento ${intento}: ${clickError.message}`);
                        if (intento < 3) await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }

            console.log("🔍Buscando cualquier botón en primera fila...");
            const [firstRowButton] = await formFrame.$x(
                "//table[@id='frmFiltroModificacion:lstPolizasCotizPresu']//tbody/tr[1]//a[1] | " +
                "//table[@id='frmFiltroModificacion:lstPolizasCotizPresu']//tbody/tr[1]//input[1]"
            ).catch(() => []);

            if (firstRowButton) {
                try {
                    await takeSnap("antes_click_primer_boton_fila");
                    await formFrame.evaluate(el => el.click(), firstRowButton);
                    console.log("✅ Click ejecutado en primer botón de fila");
                    await takeSnap("despues_click_primer_boton_fila");
                    return true;
                } catch (err) {
                    console.log(`⚠️ Error en estrategia: ${err.message}`);
                }
            }

            return false;
        };

        console.log("🎯 Iniciando clic robusto en botón de resultado...");
        const clickExitoso = await clickConValidaciones();

        if (!clickExitoso) {
            console.log("⚠️ ADVERTENCIA: No se pudo hacer clic en ningún botón");
            await takeSnap("error_sin_boton");
        } else {
            console.log("✅ Clic en botón de resultado completado exitosamente");
        }

        await new Promise(r => setTimeout(r, 3000));
        await takeSnap('Resultado_Final');

        // ==========================================
        // 3.5 CAPTURAR ALERTA SI EXISTE
        // ==========================================

        console.log("🔍 Verificando si existe alerta de error...");

        // Esperar un poco más para que la alerta se renderice
        await new Promise(r => setTimeout(r, 2000));

        try {
            // Estrategia 1: Buscar en el frame actual por ID
            const alertaSelector = "#frmFiltroModificacion\\:j_idt67";
            const alertaElement = await formFrame.$(alertaSelector).catch(() => null);

            if (alertaElement) {
                const textoVisible = await formFrame.evaluate(el => {
                    const estilo = window.getComputedStyle(el);
                    return estilo.display !== 'none' && estilo.visibility !== 'hidden'
                        ? el.textContent?.trim()
                        : null;
                }, alertaElement);

                if (textoVisible) {
                    Alerta_1 = textoVisible;
                    console.log(`⚠️ Alerta capturada por ID: ${Alerta_1}`);
                    await takeSnap("alerta_1_detectada_id");
                    throw new Error(`Alerta del sistema: ${Alerta_1}`);
                }
            }

            // Estrategia 2: Buscar por XPath en el frame
            const [alertaXPath] = await formFrame.$x(
                "//*[contains(text(), 'Fecha de vigencia del endoso') or " +
                "contains(text(), 'vencimiento endoso nulo') or " +
                "contains(text(), 'Debe Rehabilitar') or " +
                "contains(@class, 'rf-msgs-err') or " +
                "contains(@class, 'error')]"
            ).catch(() => []);

            if (alertaXPath) {
                const textoVisible = await formFrame.evaluate(el => {
                    const estilo = window.getComputedStyle(el);
                    return estilo.display !== 'none' && estilo.visibility !== 'hidden'
                        ? el.textContent?.trim()
                        : null;
                }, alertaXPath);

                if (textoVisible) {
                    Alerta_1 = textoVisible;
                    console.log(`⚠️ Alerta capturada por XPath: ${Alerta_1}`);
                    await takeSnap("alerta_1_detectada_xpath");
                    throw new Error(`Alerta del sistema: ${Alerta_1}`);
                }
            }

            // Estrategia 3: Buscar en todos los frames de la página
            for (const frame of popupPage.frames()) {
                const [errorMsg] = await frame.$x(
                    "//*[contains(@class, 'rf-msgs-err') or " +
                    "contains(@class, 'error') or " +
                    "contains(@class, 'mensaje-error')]"
                ).catch(() => []);

                if (errorMsg) {
                    const textoVisible = await frame.evaluate(el => {
                        const estilo = window.getComputedStyle(el);
                        return estilo.display !== 'none' && estilo.visibility !== 'hidden'
                            ? el.textContent?.trim()
                            : null;
                    }, errorMsg);

                    if (textoVisible && textoVisible.length > 0) {
                        Alerta_1 = textoVisible;
                        console.log(`⚠️ Alerta capturada en frame: ${Alerta_1}`);
                        await takeSnap("alerta_1_detectada_frame");
                        throw new Error(`Alerta del sistema: ${Alerta_1}`);
                    }
                }
            }

            console.log("✅ No se detectó ninguna alerta de error");

        } catch (alertError) {
            // Si es el error que lanzamos intencionalmente, propagarlo
            if (alertError.message.includes("Alerta del sistema:")) {
                throw alertError;
            }
            // Si es otro error, solo registrarlo pero no romper el flujo
            console.log(`⚠️ Error al buscar alerta (se ignora): ${alertError.message}`);
        }


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
                nodo: "4.Buscar Poliza",
                status: "Busqueda Completada",
                Alerta_1: 'Sin Errores',
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
                await browser.close();
            } catch (closeError) {
                console.error("Error cerrando browser:", closeError.message);
            }
        }
        return [{
            json: {
                ...item,
                success: false,
                nodo: "4.BUSCAR POLIZA ERROR",
                status: "ERROR_BUSCAR",
                Alerta_1: Alerta_1,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            },
            binary: screenshots
        }];
    }
}

return run();