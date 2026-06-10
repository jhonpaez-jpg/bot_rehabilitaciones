const puppeteer = require('puppeteer');

// ==========================================
// 1. ✏️ VARIABLES DE ENTORNO Y CONFIGURACIÓN
// ==========================================

const forceClickJS = async (frame, element) => {
    await frame.evaluate(el => {
        el.scrollIntoView({block: "center"});
        el.click();
    }, element);
};

async function run() {
    const item = $input.first().json;

    const wsUrl = item.wsUrl;
    const finalUrl = item.finalUrl;
    const textoObservaciones = `REHABILITACION POLIZA SEGUN SOLICITUD FN - ${
        $('Normalizar Datos').first().json.CONSECUTIVO
    }`;

    if (! wsUrl) 
        throw new Error("⛔ No se encontró wsUrl en el input. ¿Viene del Nodo 1?");
    

    let browser;
    let popupPage;
    let screenshots = {};
    let Alerta_2 = null;

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
        // 2. SELECCIONAR REHABILITACION
        // ==========================================
        console.log("Buscando subProcesoModificacion...");

        const SELECTOR = '#forma\\:subProcesoModificacion\\:1';

        try {
            await popupPage.waitForSelector(SELECTOR, {
                visible: true,
                timeout: 10000
            });
            console.log("✅ Elemento subProcesoModificacion encontrado");
        } catch (e) {
            await takeSnap("ERROR_subProcesoModificacion_no_encontrado");

            const {
                url,
                title,
                radios,
                formaEls,
                errors
            } = await popupPage.evaluate(() => {
                const getText = el => el.textContent ?. trim().substring(0, 200) || '';

                return {
                    url: location.href,
                    title: document.title,
                    radios: [...document.querySelectorAll('input[type="radio"]')].map(el => ({id: el.id, name: el.name, value: el.value})),
                    formaEls: [...document.querySelectorAll('[id*="forma"]')].map(el => ({
                        id: el.id,
                        tag: el.tagName,
                        type: el.type || null
                    })),
                    errors: [...document.querySelectorAll('[class*="error"], [class*="mensaje"]')].map(getText).filter(Boolean)
                };
            });

            const lines = [`No se encontró ${SELECTOR}.\nURL: ${url}\nTítulo: ${title}\n`];
            if (errors.length) 
                lines.push(`⚠️ Errores:\n${
                    errors.map(e => `  - ${e}`).join('\n')
                }`);
            
            if (radios.length) 
                lines.push(`📻 Radios (${
                    radios.length
                }):\n${
                    radios.slice(0, 5).map(r => `  - ID: ${
                        r.id
                    }, Name: ${
                        r.name
                    }, Value: ${
                        r.value
                    }`).join('\n')
                }`);
            
            if (formaEls.length) 
                lines.push(`📋 Forma (${
                    formaEls.length
                }):\n${
                    formaEls.slice(0, 5).map(f => `  - ID: ${
                        f.id
                    }, Tag: ${
                        f.tag
                    }, Type: ${
                        f.type
                    }`).join('\n')
                }`);
            

            throw new Error(lines.join('\n\n'));
        }

        await popupPage.click(SELECTOR);
        await new Promise(r => setTimeout(r, 800));
        await takeSnap('Rehabilitacion');

        // ==========================================
        // 3. BUSCAR SELECT REHABILITAR POLIZA
        // ==========================================

        let formFrame = null;
        for (const frame of popupPage.frames()) {
            const found = await frame.$("#forma\\:codEndosSubProInput").catch(() => null);
            if (found) {
                formFrame = frame;
                break;
            }
        }
        if (! formFrame) 
            throw new Error("No se encontró el frame con ID codEndosSubProInput");
        

        console.log(`Seleccionando opción: REHABILITACION DE POLIZA`);
        const selInput = "#forma\\:codEndosSubProInput";
        const selItems = "#forma\\:codEndosSubProItems";

        await formFrame.waitForSelector(selInput);

        // Limpiar y escribir para activar el autocomplete
        await formFrame.click(selInput, {clickCount: 3});
        await formFrame.type(selInput, "REHABILITACION", {delay: 80});

        // Esperar a que aparezcan las opciones
        await formFrame.waitForSelector(`${selItems} .rf-au-itm`, {
            visible: true,
            timeout: 5000
        });

        // Buscar y clickear la opción que diga exactamente "REHABILITACION DE POLIZA" (sin S al final)
        const clickeado = await formFrame.evaluate((sel) => {
            const items = [...document.querySelectorAll(`${sel} .rf-au-itm`)];
            const opcion = items.find(el => {
                const texto = el.textContent.trim().toUpperCase();
                // Busca el que termina en "REHABILITACION DE POLIZA" sin la S
                return texto.endsWith("REHABILITACION DE POLIZA");
            });
            if (! opcion) 
                return null;
            
            opcion.click();
            return opcion.textContent.trim();
        }, selItems);

        if (! clickeado) 
            throw new Error("No se encontró la opción 'REHABILITACION DE POLIZA' en el autocomplete");
        

        console.log(`✅ Opción seleccionada: ${clickeado}`);
        await new Promise(r => setTimeout(r, 1000));
        await takeSnap("producto_seleccionado");

        // ==========================================
        // 4. LLENAR OBSERVACION
        // ==========================================

        console.log(`📝 Escribiendo observaciones: ${textoObservaciones}`);
        await popupPage.click('#forma\\:observaciones');
        await new Promise(r => setTimeout(r, 500));
        await popupPage.keyboard.type(textoObservaciones, {delay: 30});
        await new Promise(r => setTimeout(r, 800));
        await takeSnap("Observaciones");

        // ==========================================
        // 5. CLICK CONTINUAR
        // ==========================================

        console.log("✅ Presionando botón continuar");
        await popupPage.click('#forma\\:siguiente');
        await new Promise(r => setTimeout(r, 1500));
        await takeSnap("Continuar");

        // ==========================================
        // 6. CLICK CONTINUAR
        // ==========================================

        console.log("✅ Presionando botón continuar");
        await popupPage.click('#forma\\:siguiente');
        await new Promise(r => setTimeout(r, 2000));
        await takeSnap("Continuar");

        // ==========================================
        // 6.5 CAPTURAR ALERTA SI EXISTE
        // ==========================================

        console.log("🔍 Verificando si existe alerta de error...");

        try {
            const alertaSelector = "#j_idt360\\:";
            const alertaElement = await popupPage.$(alertaSelector).catch(() => null);

            if (alertaElement) {
                Alerta_2 = await popupPage.evaluate(el => el.textContent ?. trim(), alertaElement);
                console.log(`⚠️ Alerta capturada: ${Alerta_2}`);
                await takeSnap("alerta_2_detectada");

                // Si se detecta alerta, lanzar error para ir al catch
                throw new Error(`Alerta del sistema: ${Alerta_2}`);
            } else { // Intentar buscar por XPath con el patrón del mensaje
                const [alertaXPath] = await popupPage.$x("//*[contains(text(), 'Debe Rehabilitar la Poliza Anterior') or " + "contains(@id, 'j_idt360')]").catch(() => []);

                if (alertaXPath) {
                    Alerta_2 = await popupPage.evaluate(el => el.textContent ?. trim(), alertaXPath);
                    console.log(`⚠️ Alerta capturada por XPath: ${Alerta_2}`);
                    await takeSnap("alerta_2_detectada_xpath");

                    // Si se detecta alerta, lanzar error para ir al catch
                    throw new Error(`Alerta del sistema: ${Alerta_2}`);
                } else {
                    console.log("✅ No se detectó ninguna alerta de error");
                }
            }
        } catch (alertError) { // Si es el error que lanzamos intencionalmente, propagarlo
            if (alertError.message.includes("Alerta del sistema:")) {
                throw alertError;
            }
            // Si es otro error, solo registrarlo pero no romper el flujo
            console.log(`⚠️ Error al buscar alerta (se ignora): ${
                alertError.message
            }`);
        }


        // ==========================================
        // 7. FINALIZACIÓN
        // ==========================================
        await new Promise(r => setTimeout(r, 500));

        // ✅ Así debe quedar - capturar ANTES y verificar
        const newFinalUrl = popupPage.url();
        const newWsUrl = browser.wsEndpoint();
        console.log(`🔗 wsUrl que se pasa al nodo 6: ${newWsUrl}`);
        console.log(`🌐 finalUrl que se pasa al nodo 6: ${newFinalUrl}`);
        await takeSnap("antes_disconnect"); // ← captura para confirmar que la página existe
        browser.disconnect();
        clearTimeout(timeoutId);

        return [{
                json: {
                    ... item,
                    success: true,
                    nodo: "5.Completar Datos",
                    status: "Datos Completados",
                    Alerta_2: 'Sin Errores',
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
                    nodo: "5.ERROR COMPLETAR DATOS",
                    status: "ERROR_COMPLETAR DATOS",
                    Alerta_2: Alerta_2,
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                },
                binary: screenshots
            }];
    }
}

return run();
