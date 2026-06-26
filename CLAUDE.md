# Calypso Knowledge Hub

## Contexto
Proyecto para una hackatón interna de mi empresa. Demuestra uso de IA agéntica 
(Claude Code) para construir una herramienta de capacitación sobre conceptos 
financieros usados en Calypso.

## Importante: mi nivel de conocimiento
NO tengo formación profunda en productos financieros (FX, derivados, bonos). 
Por eso:
- Antes de implementar cualquier fórmula financiera, explícamela en términos 
  simples (como si yo no supiera nada del tema) y dime de dónde la sacaste 
  (debe ser una fórmula estándar reconocida en la industria, no inventada).
- Si hay supuestos o simplificaciones, dilos explícitamente.
- No avances con el cálculo hasta que yo confirme que la explicación tiene sentido.

## Stack y restricciones
- HTML/CSS/JS vanilla (sin frameworks salvo que yo lo pida)
- Desplegable en GitHub Pages (sitio estático)
- Sin API keys expuestas en el cliente
- Sin backend pagado

## Funcionalidades del MVP (en este orden de prioridad)
  1. Simulador interactivo de un Forward FX (inputs básicos, cálculo de cashflow, prices, rates, etc..), debe ser escalable a otros productos mediante archivos de configuración.
  2. Diccionario interactivo: hover sobre cualquier valor calculado muestra definición + fórmula + origen del número. El diccionario debe permitir entradas nuevas, mediante formularios dentro de la página web, mediante texto estructurado que pueda ser generado con IA de forma externa
  3. Etiquetado de cada concepto como "específico de Calypso" o "transferible a otras plataformas financieras"
  4. Generación asistida por IA de una ficha de configuración del producto simulado, por temas de tiempo, la ficha de configuración se generará de forma externa con IA y se subirá al repositorio.

## Editor XML de Trades (`xml-editor.html`)

Herramienta para cargar, editar y exportar XMLs de trades de Calypso (formato CDUF).

### Archivos
- `xml-editor.html` — página completa full-screen con estilos inline
- `js/xml-editor.js` — toda la lógica (parse, render, collect, export)

### Modelo de datos interno
Cada nodo del XML se representa como:
- **Simple:** `{ tag, isGroup: false, values: string[] }` — soporta múltiples valores del mismo tag
- **Grupo:** `{ tag, isGroup: true, instances: Node[][] }` — soporta múltiples instancias del bloque

### Flujo principal
1. Usuario sube XML → `parseXML()` → árbol de nodos → `renderForm()` → DOM
2. Usuario edita → DOM con inputs `.xe-value-input` y grupos `.xe-group-instance`
3. `getFormSchema()` → `collectSchema()` lee el DOM y reconstruye el árbol
4. "Agregar registro" → push del árbol al array `savedRecords`
5. "Exportar CDUF" → `buildXML(records)` → archivo descargable

### Capacidades del formulario
- **Campos simples repetibles:** botón `+` al lado de cada input agrega otro valor con el mismo tag
- **Bloques repetibles:** botón `⊕ Duplicar` en el header de cada sección anidada clona el bloque con sus valores
- **Eliminar instancias extras:** botón `✕` en bloques/valores agregados (el primero no se puede eliminar)
- **Jerarquía visual:** 3 niveles de profundidad con colores distintos (azul oscuro → gris oscuro → gris claro)
- **Limpiar valores:** vacía todos los inputs sin alterar la estructura
- **Cargar registro:** recarga un registro guardado en el formulario para editarlo

### Detección automática de estructura
El parser detecta el tag raíz y el tag de segundo nivel automáticamente — funciona con cualquier XML, no solo `CalypsoUploadDocument/CalypsoTrade`.

## Git y Pull Requests
- Al completar una tarea o feature, haz commit y push automáticamente a la 
  rama de la tarea sin pedirme confirmación para el push en sí.
- NO hagas push directo a `main`; siempre a la rama de la tarea/sesión.
- Nombra las ramas con el formato: `feat/<descripcion-corta>` o `fix/<descripcion-corta>`.
  Ejemplos: `feat/sidebar-diccionario`, `fix/calculo-npv`.
- Al terminar el push, crea el Pull Request automáticamente con `mcp__github__create_pull_request`
  apuntando a `main`. Incluye en el body: resumen, tabla de archivos modificados y checklist de pruebas.
- Yo reviso y hago el merge manualmente — nunca hagas merge ni cierres el PR.
- No me pidas confirmación para crear el PR; es parte del flujo normal de entrega.

## Forma de trabajar
- Antes de codear una feature, resume el plan en 3-4 líneas y espera mi aprobación
- Una feature por sesión/commit
- Mensajes de commit en español, formato: tipo(alcance): descripción
- Si algo financiero no está claro, pregunta antes de asumir
