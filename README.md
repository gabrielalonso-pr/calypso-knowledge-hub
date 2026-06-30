# Calypso Knowledge Hub

Herramienta de capacitación sobre conceptos financieros usados en Calypso, construida con HTML/CSS/JS vanilla (sin frameworks) para ser desplegable como sitio estático en GitHub Pages.

## Cómo correr el proyecto en local

El proyecto usa `fetch()` para cargar JSON (`data/dictionary.json`, `config/products/*.json`), por lo que **no funciona abriendo los archivos `.html` directamente con doble clic** (los navegadores bloquean `fetch()` sobre `file://` por política CORS).

Hay que servirlo con un servidor HTTP simple. Con Python ya instalado:

```bash
cd calypso-knowledge-hub
python3 -m http.server 8080
```

Luego abre `http://localhost:8080` en el navegador. Para detener el servidor: `Ctrl + C`.

Alternativas si no tienes Python: `npx serve .`, `npx http-server .`, `php -S localhost:8080`, o la extensión "Live Server" de VS Code.

## Mapa de páginas

| Página | Descripción |
|---|---|
| `index.html` | Simulador interactivo de productos FX (Spot, Forward, NDF) |
| `dictionary.html` | Diccionario Calypso — términos oficiales con definición, fórmula y origen (solo lectura) |
| `glossary.html` | Mi Glosario — términos personales, editable desde la propia página |
| `manage.html` | Gestión de Contenido — propuestas de diccionario, fichas de producto y plantillas para generación con IA externa |
| `xml-editor.html` | Editor de XMLs de trades de Calypso (formato CDUF) |

## Arquitectura del código

| Archivo | Responsabilidad |
|---|---|
| `js/engine.js` | Motor de cálculo puro (fórmulas financieras, sin DOM) |
| `js/ui.js` | Controlador del simulador (`index.html`): estado, eventos, render |
| `js/loader.js` | Carga la configuración del producto activo desde `config/products/*.json` |
| `js/data-service.js` | Capa de datos: diccionario, Mi Glosario, propuestas de diccionario y borradores de fichas de producto (hoy en JSON estático + `localStorage`; reemplazable por una API sin cambiar la interfaz) |
| `js/dictionary.js` | Tooltips del diccionario interactivo |
| `js/manage.js` | Lógica de `manage.html` (formularios, plantillas IA, importador/validador de JSON) |
| `js/xml-editor.js` | Parseo, render y exportación de XMLs de trades |
| `config/products/*.json` | Fichas de configuración de cada producto simulado |
| `data/dictionary.json` | Diccionario Calypso oficial (fuente de verdad, editable a mano o vía propuestas exportadas desde `manage.html`) |

## Estado del MVP

| # | Funcionalidad | Estado |
|---|---|---|
| 1 | Simulador interactivo escalable por configuración | ✅ Completo (FX Spot, Forward, NDF) |
| 2 | Diccionario interactivo con hover (definición + fórmula + origen) | ✅ Completo |
| 2b | Entradas nuevas vía formulario web | ✅ Completo (`manage.html`) |
| 2c | Entradas nuevas vía texto estructurado generado con IA externa | ✅ Completo (`manage.html`, tab "Plantilla IA") |
| 3 | Etiquetado "específico de Calypso" / "transferible" | ✅ Completo |
| 4 | Ficha de configuración de producto generada con IA externa | ✅ Completo (`manage.html`, tab "Fichas de producto") |

Pendiente conocido: ninguna funcionalidad del MVP queda fuera; las propuestas de diccionario y las fichas de producto generadas en `manage.html` se guardan en `localStorage` y deben fusionarse manualmente al repositorio (no hay backend).

## Editor XML de Trades (`xml-editor.html`)

Herramienta para cargar, editar y exportar XMLs de trades de Calypso (formato CDUF). Detalle de modelo de datos y flujo en `CLAUDE.md`.
