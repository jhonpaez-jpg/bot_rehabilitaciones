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

    let descripcion = null;
    let panelEndoso = null;
    let fechaExp = null;
    let fechaIni = null;
    let fechaFin = null;

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
        // 2. Copiar Panel Endoso
        // ==========================================

        console.log('📍 Leyendo Panel Endoso (endososPanel_header_content)');

        try {
            await popupPage.waitForFunction(
                () => {
                    const el = document.getElementById('endososPanel_header_content');
                    return el && el.innerText && el.innerText.trim().length > 0;
                },
                { timeout: 20000 }
            );

            panelEndoso = await popupPage.evaluate(() => {
                const el = document.getElementById('endososPanel_header_content');
                return (el.value || el.innerText || el.textContent || '').trim();
            });

            console.log(`🎉 Panel Endoso obtenido: "${panelEndoso}"`);
            await takeSnap('panel_endoso_ok');

        } catch (e) {
            console.error(`❌ No se pudo leer endososPanel_header_content: ${e.message}`);
            await takeSnap('panel_endoso_ERROR');
        }

        // ==========================================
        // 3. Leer tabla lstEndososPoliza
        //    Buscar TODAS las filas con REHABILITACION DE POLIZA
        //    y tomar la que tenga Fecha Expe. más cercana a hoy
        // ==========================================
        console.log('📍 Leyendo tabla lstEndososPoliza');
        try {
            await popupPage.waitForFunction(
                () => {
                    const tabla = document.getElementById('lstEndososPoliza');
                    return tabla && tabla.rows && tabla.rows.length > 0;
                },
                { timeout: 20000 }
            );

            const resultados = await popupPage.evaluate(() => {
                const tabla = document.getElementById('lstEndososPoliza');
                const coincidencias = [];

                for (let i = 0; i < tabla.rows.length; i++) {
                    const celdaDesc = tabla.rows[i].cells[3];
                    if (!celdaDesc) continue;

                    if (celdaDesc.innerText.trim() === "REHABILITACION DE POLIZA") {
                        coincidencias.push({
                            descripcion: tabla.rows[i].cells[3].innerText.trim(),
                            fechaExp: tabla.rows[i].cells[4].innerText.trim(),
                            fechaIni: tabla.rows[i].cells[5].innerText.trim(),
                            fechaFin: tabla.rows[i].cells[6].innerText.trim()
                        });
                    }
                }

                if (coincidencias.length === 0) return null;

                // Parsear fecha en formato DD/MM/YYYY → Date
                const parseDate = (str) => {
                    const [day, month, year] = str.split('/');
                    return new Date(`${year}-${month}-${day}`);
                };

                const hoy = new Date();

                // Ordenar por diferencia absoluta con hoy (menor diferencia = más cercana)
                coincidencias.sort((a, b) => {
                    const diffA = Math.abs(hoy - parseDate(a.fechaExp));
                    const diffB = Math.abs(hoy - parseDate(b.fechaExp));
                    return diffA - diffB;
                });

                // Retornar la más cercana a la fecha actual
                return coincidencias[0];
            });

            if (resultados) {
                descripcion = resultados.descripcion;
                fechaExp = resultados.fechaExp;
                fechaIni = resultados.fechaIni;
                fechaFin = resultados.fechaFin;
                console.log(`🎉 Descripción obtenida: "${descripcion}"`);
                console.log(`🎉 Fecha Exp obtenida:   "${fechaExp}"`);
                console.log(`🎉 Fecha Inicio obtenida:"${fechaIni}"`);
                console.log(`🎉 Fecha Fin obtenida:   "${fechaFin}"`);
                await takeSnap('tabla_ok');
            } else {
                console.warn('⚠️ No se encontró ninguna fila con REHABILITACION DE POLIZA');
                await takeSnap('tabla_sin_rehabilitacion');
            }
        } catch (e) {
            console.error(`❌ Error leyendo tabla lstEndososPoliza: ${e.message}`);
            await takeSnap('tabla_ERROR');
        }

        // ==========================================
        // 4. FINALIZACIÓN
        // ==========================================


        const newWsUrl = browser.wsEndpoint();
        const newFinalUrl = popupPage.url();

        // ⚠️ CRÍTICO: Desconectar sin cerrar el browser
        browser.disconnect();
        clearTimeout(timeoutId);

        return [{
            json: {
                ...item,
                success: true,
                nodo: "9.Copiar Datos Nuevos",
                status: "Copiado Completado",
                wsUrl: newWsUrl,
                finalUrl: newFinalUrl,
                descripcion_nueva: descripcion,
                Panel_endoso_Nuevo: panelEndoso,
                Fecha_Exp_Nueva: fechaExp,
                Fecha_Inicio_Nueva: fechaIni,
                Fecha_Fin_Nueva: fechaFin,
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
                nodo: "9.Copiar Datos Nuevos",
                status: "ERROR_COPIADO",
                descripcion_nueva: descripcion,
                Panel_endoso_Nuevo: panelEndoso,
                Fecha_Exp_Nueva: fechaExp,
                Fecha_Inicio_Nueva: fechaIni,
                Fecha_Fin_Nueva: fechaFin,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            },
            binary: screenshots
        }];
    }
}

return run();