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

## Git y Pull Requests
- Al completar una tarea o feature, haz commit y push automáticamente a la 
  rama de la tarea sin pedirme confirmación para el push en sí.
- NO hagas push directo a `main`; siempre a la rama de la tarea/sesión.
- Yo reviso y apruebo manualmente el Pull Request en GitHub — no necesitas 
  preguntarme antes de subir los commits, solo evita tocar `main`.

## Forma de trabajar
- Antes de codear una feature, resume el plan en 3-4 líneas y espera mi aprobación
- Una feature por sesión/commit
- Mensajes de commit en español, formato: tipo(alcance): descripción
- Si algo financiero no está claro, pregunta antes de asumir
