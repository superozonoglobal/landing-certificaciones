/**
 * ══════════════════════════════════════════════════════════════
 *  Super Ozono Global — Lead Capture Logic
 *  Archivo: app.js
 *  Dominio: certificacion.superozonoglobal.com
 * ══════════════════════════════════════════════════════════════
 *
 *  Funcionalidades:
 *    1. Validación completa del formulario (nombre, email, WhatsApp, país)
 *    2. Envío de lead al backend (POST /api/leads) con fallback localStorage
 *    3. Disparo de eventos: Meta Pixel, GA4, GTM dataLayer
 *    4. Toast de confirmación + redirección a /gracias.html
 *    5. FAQ accordion
 *    6. Smooth scroll para links internos
 *    7. Protección honeypot anti-spam
 */

(function () {
    'use strict';

    /* ─────────────────────────────────────────────
       CONFIGURACIÓN CENTRAL
       Ajusta estos valores para tu entorno
    ───────────────────────────────────────────── */
    const CONFIG = {
        // URL del endpoint de tu backend Express.
        // En producción: 'https://api.superozonoglobal.com/api/leads'
        // En desarrollo local: 'http://localhost:3001/api/leads'
        apiUrl: 'http://localhost:3001/api/leads',

        // Página de gracias post-registro
        thanksPage: '/gracias.html',

        // Redirección automática (true = redirige, false = solo muestra toast)
        redirectAfterSubmit: true,

        // Milisegundos antes de redirigir
        redirectDelay: 2000,

        // Guardar copia local en localStorage (útil como fallback offline)
        saveToLocalStorage: true,
    };

    /* ─────────────────────────────────────────────
       SELECTORES DEL DOM
    ───────────────────────────────────────────── */
    const form = document.getElementById('lead-form');
    const submitBtn = document.getElementById('submit-btn');
    const toast = document.getElementById('toast');

    const fields = {
        nombre: document.getElementById('f-nombre'),
        email: document.getElementById('f-email'),
        whatsapp: document.getElementById('f-whatsapp'),
        pais: document.getElementById('f-pais'),
        honeypot: document.getElementById('f-website'),
    };

    const errors = {
        nombre: document.getElementById('err-nombre'),
        email: document.getElementById('err-email'),
        whatsapp: document.getElementById('err-whatsapp'),
        pais: document.getElementById('err-pais'),
    };

    /* ─────────────────────────────────────────────
       VALIDACIONES
    ───────────────────────────────────────────── */

    const validators = {
        nombre: (v) => v.trim().length >= 2,
        email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
        whatsapp: (v) => /^\+?[\d\s\-().]{7,20}$/.test(v.trim()),
        pais: (v) => v.trim() !== '',
    };

    function validateField(name) {
        const field = fields[name];
        const errorEl = errors[name];
        const valid = validators[name](field.value);

        if (!valid) {
            field.classList.add('field-error');
            errorEl.classList.add('visible');
        } else {
            field.classList.remove('field-error');
            errorEl.classList.remove('visible');
        }

        return valid;
    }

    function validateAll() {
        return ['nombre', 'email', 'whatsapp', 'pais'].every(validateField);
    }

    // Validación en tiempo real (blur)
    ['nombre', 'email', 'whatsapp', 'pais'].forEach((name) => {
        fields[name].addEventListener('blur', () => validateField(name));
        fields[name].addEventListener('input', () => {
            if (fields[name].classList.contains('field-error')) validateField(name);
        });
    });

    /* ─────────────────────────────────────────────
       UTILIDADES UI
    ───────────────────────────────────────────── */

    function showToast(message, type = 'success') {
        toast.textContent = message;
        toast.className = `show ${type}`;
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.classList.remove('show');
        }, 5000);
    }

    function setLoading(isLoading) {
        submitBtn.disabled = isLoading;
        submitBtn.classList.toggle('loading', isLoading);
        submitBtn.classList.toggle('opacity-70', isLoading);
        submitBtn.classList.toggle('cursor-not-allowed', isLoading);
    }

    /* ─────────────────────────────────────────────
       ANALYTICS & PIXEL HELPERS
    ───────────────────────────────────────────── */

    function fireLeadEvents(leadData) {
        // ── Meta Pixel: Lead Event
        if (typeof fbq === 'function') {
            fbq('track', 'Lead', {
                content_name: 'Webinar Certificación Ozono',
                content_category: 'Agricultura',
                country: leadData.pais,
            });
        }

        // ── GA4: generate_lead event
        if (typeof gtag === 'function') {
            gtag('event', 'generate_lead', {
                event_category: 'form',
                event_label: 'webinar_ozono_registro',
                country: leadData.pais,
                currency: 'MXN',
                value: 1,
            });
        }

        // ── GTM dataLayer push
        if (typeof dataLayer !== 'undefined') {
            dataLayer.push({
                event: 'lead_submitted',
                lead_country: leadData.pais,
                lead_source: 'landing_ozono',
                form_id: 'lead-form',
            });
        }
    }

    /* ─────────────────────────────────────────────
       GUARDADO LOCAL (FALLBACK)
    ───────────────────────────────────────────── */

    function saveLocalLead(leadData) {
        try {
            const stored = JSON.parse(localStorage.getItem('og_leads') || '[]');
            stored.push({ ...leadData, ts: new Date().toISOString() });
            localStorage.setItem('og_leads', JSON.stringify(stored));
        } catch (e) {
            // localStorage no disponible en algunos contextos — ignorar silenciosamente
        }
    }

    /* ─────────────────────────────────────────────
       ENVÍO AL BACKEND
    ───────────────────────────────────────────── */

    async function submitLead(leadData) {
        const response = await fetch(CONFIG.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(leadData),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            
            // Manejo especial para correo duplicado
            if (response.status === 409 && err.duplicate) {
                const errorMsg = `
                    ⚠️ ¡Este correo ya está registrado!
                    
                    ✅ Ya recibiste todos los detalles del webinar en tu correo: ${err.email}
                    
                    💡 Si no encuentras el correo:
                    • Revisa tu carpeta de spam/promociones
                    • Busca "Super Ozono Global" en tu bandeja de entrada
                    • Contáctanos por WhatsApp si necesitas ayuda
                    
                    📧 Vuelve a revisar tu correo para acceder al enlace del webinar
                `;
                throw new Error(errorMsg);
            }
            
            throw new Error(err.message || `Error ${response.status}`);
        }

        return response.json();
    }

    /* ─────────────────────────────────────────────
       SUBMIT DEL FORMULARIO
    ───────────────────────────────────────────── */

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Anti-spam honeypot
        if (fields.honeypot.value.trim() !== '') {
            return; // bot detectado — silencio
        }

        if (!validateAll()) {
            // Hacer scroll al primer campo inválido
            const firstError = form.querySelector('.field-error');
            if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const leadData = {
            nombre: fields.nombre.value.trim(),
            email: fields.email.value.trim().toLowerCase(),
            whatsapp: fields.whatsapp.value.trim(),
            pais: fields.pais.value.trim(),
            fuente: document.referrer || 'directo',
            utm_source: getParam('utm_source'),
            utm_medium: getParam('utm_medium'),
            utm_campaign: getParam('utm_campaign'),
            utm_content: getParam('utm_content'),
            utm_term: getParam('utm_term'),
            page_url: window.location.href,
            user_agent: navigator.userAgent,
        };

        setLoading(true);

        try {
            await submitLead(leadData);

            // Guardar también en localStorage
            if (CONFIG.saveToLocalStorage) saveLocalLead(leadData);

            // Disparar eventos de conversión
            fireLeadEvents(leadData);

            showToast('✅ ¡Registro exitoso! Revisa tu correo para los detalles del webinar.', 'success');

            form.reset();

            if (CONFIG.redirectAfterSubmit) {
                setTimeout(() => {
                    window.location.href =
                        CONFIG.thanksPage +
                        '?nombre=' + encodeURIComponent(leadData.nombre) +
                        '&email=' + encodeURIComponent(leadData.email);
                }, CONFIG.redirectDelay);
            }

        } catch (err) {
            console.error('[SuperOzono] Error al enviar lead:', err);

            // Guardar localmente aunque el backend falle
            if (CONFIG.saveToLocalStorage) saveLocalLead({ ...leadData, backendError: err.message });

            // Mostrar toast de error amigable pero NO bloquear la experiencia
            showToast('Hubo un problema al guardar su registro. Inténtelo de nuevo o contáctenos por WhatsApp.', 'error');

        } finally {
            setLoading(false);
        }
    });

    /* ─────────────────────────────────────────────
       FAQ ACCORDION
    ───────────────────────────────────────────── */

    document.querySelectorAll('.faq-trigger').forEach((trigger) => {
        trigger.addEventListener('click', () => {
            const item = trigger.closest('.faq-item');
            const answer = item.querySelector('.faq-answer');
            const icon = trigger.querySelector('.faq-icon');
            const isOpen = answer.classList.contains('open');

            // Cerrar todos los demás
            document.querySelectorAll('.faq-answer.open').forEach((a) => {
                a.classList.remove('open');
                a.style.paddingBottom = '0';
                const otherIcon = a.closest('.faq-item').querySelector('.faq-icon');
                if (otherIcon) otherIcon.classList.remove('open');
                a.closest('.faq-trigger') && a.closest('.faq-item').querySelector('.faq-trigger').setAttribute('aria-expanded', 'false');
            });

            if (!isOpen) {
                answer.classList.add('open');
                answer.style.paddingBottom = '1.5rem';
                icon.classList.add('open');
                trigger.setAttribute('aria-expanded', 'true');
            }
        });
    });

    /* ─────────────────────────────────────────────
       SMOOTH SCROLL
    ───────────────────────────────────────────── */

    document.querySelectorAll('a[href^="#"]').forEach((link) => {
        link.addEventListener('click', (e) => {
            const target = document.querySelector(link.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    /* ─────────────────────────────────────────────
       VIDEO PLAYER (Cloudflare R2)
    ───────────────────────────────────────────── */

    const heroVideo = document.getElementById('hero-video');
    const videoOverlay = document.getElementById('video-overlay');
    const customPlayBtn = document.getElementById('custom-play-btn');

    if (heroVideo && videoOverlay && customPlayBtn) {
        // Forzar la carga del primer video disponible
        function forceLoadVideo() {
            const sources = heroVideo.querySelectorAll('source');
            console.log('[SuperOzono] Verificando fuentes de video:');
            
            sources.forEach((source, index) => {
                console.log(`${index + 1}. ${source.src} (${source.type})`);
            });
            
            // Intentar cargar el primer video HLS (funciona)
            const hlsSource = sources[0]; // stream_1.m3u8
            if (hlsSource && hlsSource.src.includes('manifest') && hlsSource.type === 'application/vnd.apple.mpegurl') {
                console.log('[SuperOzono] Forzando carga de video HLS:', hlsSource.src);
                heroVideo.src = hlsSource.src;
                heroVideo.load();
            }
        }
        
        // Función para reproducir el video
        function playVideo() {
            heroVideo.play().then(() => {
                videoOverlay.classList.add('opacity-0', 'pointer-events-none');
                
                // Disparar evento GA4
                if (typeof gtag === 'function') {
                    gtag('event', 'video_play', { 
                        event_label: 'hero_intro_video',
                        video_source: 'cloudflare_r2_backend',
                        video_url: heroVideo.currentSrc
                    });
                }
            }).catch(error => {
                console.error('[SuperOzono] Error al reproducir video:', error);
                showVideoError('No se pudo reproducir el video. Intenta recargar la página.');
            });
        }

        // Función para mostrar errores
        function showVideoError(message) {
            if (videoOverlay) {
                videoOverlay.innerHTML = `
                    <div class="text-center text-white p-8">
                        <span class="material-symbols-outlined text-4xl text-red-400 mb-4">error</span>
                        <p class="text-lg font-medium mb-2">Error en el video</p>
                        <p class="text-sm opacity-80">${message}</p>
                        <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
                            Recargar página
                        </button>
                    </div>
                `;
                videoOverlay.classList.remove('opacity-0', 'pointer-events-none');
            }
        }

        // Event listeners
        customPlayBtn.addEventListener('click', playVideo);
        videoOverlay.addEventListener('click', playVideo);

        // Mostrar overlay cuando el video termina
        heroVideo.addEventListener('ended', () => {
            videoOverlay.classList.remove('opacity-0', 'pointer-events-none');
            // Restaurar contenido original del overlay
            restoreOverlayContent();
        });

        // Manejar errores de carga del video
        heroVideo.addEventListener('error', (e) => {
            console.error('[SuperOzono] Error al cargar video de Cloudflare R2:', e);
            showVideoError('El video no está disponible o la URL es incorrecta.');
        });

        // Manejar cuando el video puede reproducirse
        heroVideo.addEventListener('canplay', () => {
            console.log('[SuperOzono] Video listo para reproducir:', heroVideo.currentSrc);
        });

        // Manejar cuando se carga la metadata
        heroVideo.addEventListener('loadedmetadata', () => {
            console.log('[SuperOzono] Metadata del video cargada');
            console.log('[SuperOzono] Duración:', heroVideo.duration, 'segundos');
            console.log('[SuperOzono] Dimensiones:', heroVideo.videoWidth, 'x', heroVideo.videoHeight);
        });

        // Manejar cuando el video empieza a cargar
        heroVideo.addEventListener('loadstart', () => {
            console.log('[SuperOzono] Comenzando a cargar el video...');
        });

        // Manejar cuando el video se está cargando
        heroVideo.addEventListener('progress', () => {
            if (heroVideo.buffered.length > 0) {
                const bufferedEnd = heroVideo.buffered.end(heroVideo.buffered.length - 1);
                const duration = heroVideo.duration;
                if (duration > 0) {
                    const percentComplete = (bufferedEnd / duration) * 100;
                    console.log('[SuperOzono] Buffer:', Math.round(percentComplete) + '%');
                }
            }
        });

        // Ocultar controles nativos y mostrar overlay personalizado
        heroVideo.addEventListener('pause', () => {
            if (heroVideo.currentTime > 0 && !heroVideo.ended) {
                videoOverlay.classList.remove('opacity-0', 'pointer-events-none');
            }
        });

        // Ocultar overlay cuando el video se está reproduciendo
        heroVideo.addEventListener('play', () => {
            videoOverlay.classList.add('opacity-0', 'pointer-events-none');
        });

        // Función para restaurar el contenido original del overlay
        function restoreOverlayContent() {
            if (videoOverlay) {
                videoOverlay.innerHTML = `
                    <div class="text-center text-white">
                        <div class="w-20 h-20 rounded-full bg-primary/80 flex items-center justify-center mx-auto mb-4 hover:scale-110 transition-transform cursor-pointer" id="custom-play-btn">
                            <span class="material-symbols-outlined text-4xl">play_arrow</span>
                        </div>
                        <p class="text-lg font-medium mb-2">Introducción a la Certificación</p>
                        <p class="text-sm opacity-80">Descubre cómo transformar tu agricultura con ozono</p>
                    </div>
                `;
                // Re-asignar event listener
                const newPlayBtn = document.getElementById('custom-play-btn');
                if (newPlayBtn) {
                    newPlayBtn.addEventListener('click', playVideo);
                }
            }
        }

        // Verificar si el video se puede cargar
        heroVideo.addEventListener('loadeddata', () => {
            console.log('[SuperOzono] Video cargado exitosamente');
        });

        // Log inicial para debugging
        console.log('[SuperOzono] Inicializando video player');
        console.log('[SuperOzono] Fuentes de video configuradas:', heroVideo.querySelectorAll('source').length);
        
        // Forzar carga del video correcto
        forceLoadVideo();
    }

    /* ─────────────────────────────────────────────
       UTILIDAD: LEER PARÁMETROS URL
    ───────────────────────────────────────────── */

    function getParam(name) {
        return new URLSearchParams(window.location.search).get(name) || '';
    }

    /* ─────────────────────────────────────────────
       POPUP DE CAPTURA DE LEADS
    ───────────────────────────────────────────── */

    // Configuración del popup
    const POPUP_CONFIG = {
        showAfter: 15000, // 15 segundos
        showAgainAfter: 60000, // 1 minuto si se cierra sin registrar
        maxShows: 3, // máximo 3 veces por sesión
        storageKey: 'og_popup_seen'
    };

    let popupShows = parseInt(localStorage.getItem(POPUP_CONFIG.storageKey) || '0');
    let popupTimer;

    function showLeadPopup() {
        if (popupShows >= POPUP_CONFIG.maxShows) return;
        
        const popup = document.getElementById('lead-popup');
        popup.classList.remove('hidden');
        popup.classList.add('flex');
        
        popupShows++;
        localStorage.setItem(POPUP_CONFIG.storageKey, popupShows.toString());
        
        // Disparar evento de vista del popup
        if (typeof gtag === 'function') {
            gtag('event', 'popup_view', {
                event_category: 'lead_capture',
                event_label: 'popup_shown',
                value: popupShows
            });
        }
    }

    function closeLeadPopup() {
        const popup = document.getElementById('lead-popup');
        popup.classList.add('hidden');
        popup.classList.remove('flex');
        
        // Programar siguiente muestra
        if (popupShows < POPUP_CONFIG.maxShows) {
            popupTimer = setTimeout(showLeadPopup, POPUP_CONFIG.showAgainAfter);
        }
    }

    // Validación del popup
    const popupFields = {
        nombre: document.getElementById('popup-nombre'),
        email: document.getElementById('popup-email'),
        whatsapp: document.getElementById('popup-whatsapp'),
        pais: document.getElementById('popup-pais')
    };

    const popupErrors = {
        nombre: document.getElementById('popup-err-nombre'),
        email: document.getElementById('popup-err-email'),
        whatsapp: document.getElementById('popup-err-whatsapp'),
        pais: document.getElementById('popup-err-pais')
    };

    function validatePopupField(name) {
        const field = popupFields[name];
        const errorEl = popupErrors[name];
        const valid = validators[name](field.value);

        if (!valid) {
            field.classList.add('border-red-500');
            errorEl.classList.remove('hidden');
        } else {
            field.classList.remove('border-red-500');
            errorEl.classList.add('hidden');
        }

        return valid;
    }

    function validatePopupAll() {
        return ['nombre', 'email', 'whatsapp', 'pais'].every(validatePopupField);
    }

    // Validación en tiempo real para el popup
    Object.keys(popupFields).forEach((name) => {
        popupFields[name].addEventListener('blur', () => validatePopupField(name));
        popupFields[name].addEventListener('input', () => {
            if (popupFields[name].classList.contains('border-red-500')) {
                validatePopupField(name);
            }
        });
    });

    // Submit del popup
    const popupForm = document.getElementById('popup-form');
    if (popupForm) {
        popupForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!validatePopupAll()) {
                return;
            }

            const leadData = {
                nombre: popupFields.nombre.value.trim(),
                email: popupFields.email.value.trim().toLowerCase(),
                whatsapp: popupFields.whatsapp.value.trim(),
                pais: popupFields.pais.value.trim(),
                fuente: 'popup_modal',
                utm_source: getParam('utm_source'),
                utm_medium: getParam('utm_medium'),
                utm_campaign: getParam('utm_campaign'),
                utm_content: getParam('utm_content'),
                utm_term: getParam('utm_term'),
                page_url: window.location.href,
                user_agent: navigator.userAgent,
                popup_show_count: popupShows
            };

            const submitBtn = popupForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Enviando...';

            try {
                await submitLead(leadData);
                
                if (CONFIG.saveToLocalStorage) saveLocalLead(leadData);
                fireLeadEvents(leadData);

                showToast('✅ ¡Registro exitoso! Revisa tu correo para el 5% de descuento.', 'success');
                closeLeadPopup();
                popupForm.reset();

                // Disparar evento de conversión del popup
                if (typeof gtag === 'function') {
                    gtag('event', 'popup_conversion', {
                        event_category: 'lead_capture',
                        event_label: 'popup_form_submit',
                        value: popupShows
                    });
                }

            } catch (err) {
                console.error('[SuperOzono] Error popup:', err);
                if (CONFIG.saveToLocalStorage) saveLocalLead({ ...leadData, backendError: err.message });
                showToast('Hubo un problema. Inténtelo de nuevo.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    // Iniciar temporizador del popup
    popupTimer = setTimeout(showLeadPopup, POPUP_CONFIG.showAfter);

    // Event listeners para cerrar popup
    const popupCloseBtn = document.getElementById('popup-close-btn');
    const popupBackdrop = document.getElementById('popup-backdrop');
    
    if (popupCloseBtn) {
        popupCloseBtn.addEventListener('click', closeLeadPopup);
    }
    
    if (popupBackdrop) {
        popupBackdrop.addEventListener('click', closeLeadPopup);
    }

    // Limpiar timer al salir de la página
    window.addEventListener('beforeunload', () => {
        if (popupTimer) clearTimeout(popupTimer);
    });

    /* ─────────────────────────────────────────────
       COMPORTAMIENTO STICKY NAV (active link)
    ───────────────────────────────────────────── */

    const navLinks = document.querySelectorAll('nav a[href^="#"]');
    const sections = document.querySelectorAll('section[id], header[id]');

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        navLinks.forEach((link) => {
                            link.classList.toggle(
                                'text-primary',
                                link.getAttribute('href') === '#' + entry.target.id
                            );
                        });
                    }
                });
            },
            { threshold: 0.4 }
        );

        sections.forEach((s) => observer.observe(s));
    }

    // Exponer funciones globalmente para acceso desde HTML
    window.closeLeadPopup = closeLeadPopup;

    /* ─────────────────────────────────────────────
       ANIMACIONES DE SCROLL ELEGANTES
    ───────────────────────────────────────────── */

    // Configuración del Intersection Observer
    const ANIMATION_CONFIG = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    // Observer para animaciones básicas
    const animationObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, ANIMATION_CONFIG);

    // Observer para animaciones stagger (secuenciales)
    const staggerObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting && !entry.target.classList.contains('visible')) {
                setTimeout(() => {
                    entry.target.classList.add('visible');
                }, index * 100); // 100ms de delay entre cada elemento
            }
        });
    }, ANIMATION_CONFIG);

    // Inicializar animaciones
    function initScrollAnimations() {
        // Animaciones básicas
        const animatedElements = document.querySelectorAll(
            '.fade-in-up, .slide-in-left, .slide-in-right, .slide-in-up, .zoom-in'
        );
        
        animatedElements.forEach((element) => {
            animationObserver.observe(element);
        });

        // Animaciones stagger (secuenciales)
        const staggerElements = document.querySelectorAll('.stagger-item');
        staggerElements.forEach((element) => {
            staggerObserver.observe(element);
        });

        // Animaciones especiales para headers
        const headers = document.querySelectorAll('h2, h3');
        headers.forEach((header, index) => {
            if (!header.closest('nav') && !header.closest('header')) {
                header.classList.add('fade-in-up');
                animationObserver.observe(header);
            }
        });

        // Animaciones para párrafos importantes
        const paragraphs = document.querySelectorAll('.text-center p, .max-w-2xl p');
        paragraphs.forEach((paragraph, index) => {
            paragraph.classList.add('fade-in-up');
            animationObserver.observe(paragraph);
        });

        // Animaciones para imágenes
        const images = document.querySelectorAll('img');
        images.forEach((image) => {
            if (!image.closest('nav')) {
                image.classList.add('fade-in-up');
                animationObserver.observe(image);
            }
        });

        // Animaciones para botones CTA
        const ctaButtons = document.querySelectorAll('a[href="#registro"], .bg-primary');
        ctaButtons.forEach((button) => {
            button.classList.add('zoom-in');
            animationObserver.observe(button);
        });
    }

    // Inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScrollAnimations);
    } else {
        initScrollAnimations();
    }

    // Efecto parallax sutil para el hero
    function initParallaxEffect() {
        const heroSection = document.querySelector('header');
        if (!heroSection) return;

        let ticking = false;
        
        function updateParallax() {
            const scrolled = window.pageYOffset;
            const parallaxElements = heroSection.querySelectorAll('.absolute');
            
            parallaxElements.forEach((element, index) => {
                const speed = 0.5 + (index * 0.1);
                const yPos = -(scrolled * speed);
                element.style.transform = `translateY(${yPos}px)`;
            });
            
            ticking = false;
        }

        function requestTick() {
            if (!ticking) {
                window.requestAnimationFrame(updateParallax);
                ticking = true;
            }
        }

        window.addEventListener('scroll', requestTick);
    }

    // Inicializar parallax
    initParallaxEffect();

})();
