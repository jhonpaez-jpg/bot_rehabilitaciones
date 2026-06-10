const puppeteer = require('puppeteer');

// ==========================================
// 1. ✏️ VARIABLES DE ENTORNO Y CONFIGURACIÓN
// ==========================================
const USUARIO_PROD = "$('Secrets Access').first().json.secrets['db-exclusiones']";
const CLAVE_PROD = "$('Secrets Access').first().json.secrets['api-key-exclusiones']";

const item = $input.first().json;

// ✅ FIX: Los datos están en item.row
const rowData = item.row || item;

console.log(`🔑 Keys disponibles en item:`, Object.keys(item).join(', '));
console.log(`📊 Keys en rowData:`, Object.keys(rowData).join(', '));

const environment = ($env.ENVIRONMENT || "prod").toLowerCase();

const envVars = $('Environment Variables').first().json;
const LOGIN_URL = envVars.SimonURL || 'http://10.1.20.15:2005/SimonWeb/login.html';

const PRODUCTO_VALOR = (String(rowData.SECCION || rowData.PRODUCTO || "")).trim();
const NUMERO_POLIZA = (String(rowData.POLIZA || "")).trim();

console.log("🎯 Producto:", PRODUCTO_VALOR, "| Póliza:", NUMERO_POLIZA);

if (NUMERO_POLIZA.length < 3) {
    throw new Error(
        `⛔ Póliza vacía. Keys en item: ${Object.keys(item).join(', ')}, Keys en rowData: ${Object.keys(rowData).join(', ')}`
    );
}

const forceClickJS = async (frame, element) => {
    await frame.evaluate(el => { el.scrollIntoView({ block: "center" }); el.click(); }, element);
};

async function run() {
    let browser;
    let popupPage;
    let screenshots = {};

    // ⏱️ Timeout global de 3 minutos para evitar ejecuciones infinitas
    const timeoutId = setTimeout(() => {
        if (browser) {
            console.error("⏱️ TIMEOUT: Cerrando browser después de 3 minutos");
            browser.close().catch(() => { });
        }
    }, 180000);

    const takeSnap = async (name) => {
        if (!popupPage) return;
        try {
            // Usar captura de viewport en lugar de fullPage para reducir memoria
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
        browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/chromium-browser',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-popup-blocking',
                '--window-size=1366,768',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--max-old-space-size=512'
            ],
        });

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(45000);
        await page.setDefaultTimeout(45000);
        await page.setViewport({ width: 1366, height: 768 });

        // Deshabilitar imágenes y fuentes para reducir uso de memoria
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'font', 'stylesheet'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // ==========================================
        // 2. LÓGICA DE LOGIN 
        // ==========================================
        if (environment === "dev" || environment === "stg") {
            await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
            const newTargetPromise = browser.waitForTarget(target => target.opener() === page.target(), { timeout: 60000 });
            const submitLogin = await page.$('#submit');
            if (submitLogin) await page.evaluate(el => el.click(), submitLogin);

            const newTarget = await newTargetPromise;
            popupPage = await newTarget.page();
        }
        else {
            // ==========================================
            // FLUJO PROD - LOGIN COMPLETO
            // ==========================================
            console.log("✔️ Ambiente PROD - login completo");
            console.log(`🌐 Navegando a: ${LOGIN_URL}`);
            await page.goto(LOGIN_URL, { waitUntil: 'load', timeout: 0 });

            popupPage = page; // Temporal para screenshots
            await takeSnap("login_cargado");

            // ✅ FIX CRÍTICO: Registrar listener ANTES de llenar formulario
            console.log(`� Registrando listener de popup (con timeout infinito)...`);
            const popupTargetPromise = browser.waitForTarget(
                target => target.opener() === page.target(),
                { timeout: 0 }  // ⬅️ Timeout infinito - clave para evitar el error
            );

            // Paso 1: Ingresar usuario
            console.log(`👤 Esperando campo de usuario...`);
            await page.waitForSelector('#Num_Documento', { timeout: 0 });
            await page.click('#Num_Documento', { clickCount: 3 });
            await page.keyboard.press('Backspace');
            await page.type('#Num_Documento', String(USUARIO_PROD), { delay: 80 });
            console.log(`✅ Usuario ingresado: ${USUARIO_PROD}`);

            // Paso 2: Ingresar contraseña
            console.log(`🔑 Esperando campo de contraseña...`);
            await page.waitForSelector('[name="Ecom_Password"], [type="password"]', { timeout: 0 });

            const pwSelector = await page.$('[name="Ecom_Password"]')
                ? '[name="Ecom_Password"]'
                : '[type="password"]';

            await page.click(pwSelector, { clickCount: 3 });
            await page.keyboard.press('Backspace');
            await page.type(pwSelector, CLAVE_PROD, { delay: 80 });
            console.log(`✅ Contraseña ingresada`);
            await takeSnap("prod_credenciales_completas");

            // Paso 3: Click en botón de login
            console.log(`� Haciendo clic en botón de login...`);
            await page.click('input[value="INGRESA"], input[type="submit"]');
            console.log(`✅ Click en botón INGRESA ejecutado`);

            // Esperar a que se abra el popup
            await new Promise(r => setTimeout(r, 3000));
            await takeSnap("click_ingresa");

            console.log(`⏳ Esperando popup...`);
            const newTarget = await popupTargetPromise;
            popupPage = await newTarget.page();

            await popupPage.bringToFront();
            await popupPage.setDefaultTimeout(0);  // ⬅️ Timeout infinito también en popup
            await new Promise(r => setTimeout(r, 2000));
            await takeSnap("popup_abierto");
            console.log(`✅ Popup capturado y activo`);
        }

        await popupPage.bringToFront();
        await popupPage.setViewport({ width: 1366, height: 768 });

        await popupPage.setDefaultNavigationTimeout(60000);
        await popupPage.setDefaultTimeout(60000);
        await takeSnap("inicio_popup");

        // ==========================================
        // 3. NAVEGACIÓN MENÚS
        // ==========================================
        const forceClick = async (pg, xpaths) => {
            for (let i = 0; i < 5; i++) {
                for (const frame of pg.frames()) {
                    for (const xpath of xpaths) {
                        const [el] = await frame.$x(xpath);
                        if (el) { await frame.evaluate(el => el.click(), el); return true; }
                    }
                }
                await new Promise(r => setTimeout(r, 800));
            }
            return false;
        };

        await forceClick(popupPage, ["//input[@value='Ok']"]);
        await new Promise(r => setTimeout(r, 2000));

        await forceClick(popupPage, ["//input[@value='Aceptar']"]);
        await new Promise(r => setTimeout(r, 2000));

        await forceClick(popupPage, ["//input[@value='Continuar']"]);
        await new Promise(r => setTimeout(r, 2000));

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

        await findAndHover(popupPage, "Consultas Test");
        await new Promise(r => setTimeout(r, 1000));
        const sub = await findAndHover(popupPage, "Polizas Test");
        await new Promise(r => setTimeout(r, 1000));
        const sob = await findAndHover(popupPage, "Numero poliza - seccion - Riesgo Test");
      
        if (sub) await sub.frame.evaluate(e => e.click(), sub.element);
        if (sob) await sob.frame.evaluate(e => e.click(), sob.element);

        await new Promise(r => setTimeout(r, 5000));
        await takeSnap("menu_consultas");

        // ==========================================
        // 4. LLENADO DE FORMULARIO
        // ==========================================
        let formFrame = null;
        for (const frame of popupPage.frames()) {
            const found = await frame.$("#frmConsultaGeneral\\:seccion").catch(() => null);
            if (found) { formFrame = frame; break; }
        }

        if (!formFrame) throw new Error("No se encontró el frame con ID frmConsultaGeneral");

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
        
        await formFrame.click(inputPoliza, { clickCount: 3 });
        await popupPage.keyboard.press('Backspace');
        await formFrame.type(inputPoliza, NUMERO_POLIZA, { delay: 100 });
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
        // 4.1 CLIC ROBUSTO EN BOTÓN DE RESULTADO
        // ==========================================
        const btnResultadoId = "#frmConsultaGeneral\\:lstPolizasCotizPresu\\:0\\:j_idt681";

        /**
         * Intenta hacer clic en el botón con múltiples estrategias y validaciones
         * @returns {boolean} true si el clic fue exitoso
         */
        const clickConValidaciones = async () => {
            // Estrategia 1: Click por ID específico con validaciones
            let btnFinal = await formFrame.$(btnResultadoId).catch(() => null);

            if (btnFinal) {
                console.log("✅ Botón encontrado por ID");
                await takeSnap("boton_resultado_encontrado");

                // Validar que el botón esté visible
                const isVisible = await formFrame.evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                }, btnFinal);

                if (!isVisible) {
                    console.log("⚠️ Botón no visible, haciendo scroll");
                    await takeSnap("boton_no_visible");
                    await formFrame.evaluate(el => el.scrollIntoView({ block: "center", behavior: "smooth" }), btnFinal);
                    await new Promise(r => setTimeout(r, 500));
                    await takeSnap("despues_scroll_boton");
                }

                // Validar que el botón no esté deshabilitado
                const isEnabled = await formFrame.evaluate(el => !el.disabled && !el.hasAttribute('disabled'), btnFinal);

                if (!isEnabled) {
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

                        if (intento === 1) {
                            // Intento 1: Click normal de Puppeteer
                            await btnFinal.click({ delay: 100 });
                        } else if (intento === 2) {
                            // Intento 2: Click con JavaScript directo
                            await formFrame.evaluate(el => el.click(), btnFinal);
                        } else {
                            // Intento 3: Dispatch de evento de click
                            await formFrame.evaluate(el => {
                                el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                                el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                                el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                            }, btnFinal);
                        }

                        console.log(`✅ Click ${intento} ejecutado exitosamente`);
                        await takeSnap(`click_exitoso_intento_${intento}`);
                        await new Promise(r => setTimeout(r, 1000));
                        return true;

                    } catch (clickError) {
                        console.log(`⚠️ Error en intento ${intento}: ${clickError.message}`);
                        await takeSnap(`click_fallido_intento_${intento}`);
                        if (intento < 3) await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }

            // Estrategia 2: Buscar por XPath en la tabla con la póliza
            console.log("🔍 Estrategia 2: Buscando botón por XPath en tabla...");
            await takeSnap("iniciando_estrategia_xpath");
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

            // Estrategia 3: Buscar cualquier enlace o botón en la primera fila de resultados
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

        console.log("🎯 Iniciando clic robusto en botón de resultado...");
        const clickExitoso = await clickConValidaciones();

        if (!clickExitoso) {
            console.log("⚠️ ADVERTENCIA: No se pudo hacer clic en ningún botón después de todas las estrategias");
            await takeSnap("error_sin_boton");
        } else {
            console.log("✅ Clic en botón de resultado completado exitosamente");
        }

        // ==========================================
        // 5. MANEJO DE POSTERGADOS / FINALIZACIÓN
        // ==========================================
        await new Promise(r => setTimeout(r, 5000));

        let ventanaAtrapada = false;
        for (const frame of popupPage.frames()) {
            const [btnReiniciar] = await frame.$x("//input[contains(@value, 'Reiniciar Modificación')] | //button[contains(., 'Reiniciar Modificación')]");
            if (btnReiniciar) {
                await forceClickJS(frame, btnReiniciar);
                await takeSnap("despues_click_reiniciar");
                ventanaAtrapada = true;
                break;
            }
        }

        if (ventanaAtrapada) {
            await new Promise(r => setTimeout(r, 5000));
            await takeSnap("despues_esperar_reinicio");
        }
        await takeSnap("final_proceso");

        const wsUrl = browser.wsEndpoint();
        const finalUrl = popupPage.url();

        // ⚠️ CRÍTICO: Desconectar sin cerrar el browser (Nodo 2 lo necesita)
        browser.disconnect();
        clearTimeout(timeoutId);

        return [{
            json: {
                ...item,
                row: item.row || {  // ✅ Preservar datos originales
                    POLIZA: NUMERO_POLIZA,
                    SECCION: PRODUCTO_VALOR,
                    PRODUCTO: PRODUCTO_VALOR,
                    CONSECUTIVO: item.CONSECUTIVO || item.consecutivo
                },
                success: true,
                nodo: "1_Login",
                status: "LOGIN_COMPLETADO",
                wsUrl: wsUrl,
                finalUrl: finalUrl,
                producto: PRODUCTO_VALOR,
                poliza_buscada: NUMERO_POLIZA,
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
                // En caso de error, cerrar completamente
                await browser.close();
            } catch (closeError) {
                console.error("Error cerrando browser:", closeError.message);
            }
        }
        return [{
            json: {
                ...item,
                success: false,
                nodo: "1_Login",
                status: "ERROR_LOGIN",
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            },
            binary: screenshots
        }];
    }
}

return run();