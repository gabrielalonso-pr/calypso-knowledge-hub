---
name: calypso-financial-rules
description: Usar siempre que se implemente o explique cálculos financieros 
  (Forward FX y futuros productos) o se agreguen entradas al diccionario interactivo.
---

## Regla de oro
El usuario no tiene formación financiera profunda. Toda fórmula debe:
1. Ser un estándar reconocido de la industria (ej. paridad de tasas de interés 
   para Forward FX), nunca una simplificación inventada sin avisar
2. Explicarse primero en lenguaje simple, con un ejemplo numérico, ANTES de 
   escribir el código
3. Citar la lógica/fuente conceptual (ej. "esto se basa en covered interest 
   rate parity, usado en cualquier mesa de tesorería")

## Formato del diccionario interactivo
{
  "termino": "string",
  "definicion": "string breve, máximo 2 líneas, sin jerga sin explicar",
  "formula": "string con la fórmula en notación simple",
  "origen": "explicación de qué inputs generan este número",
  "categoria": "especifico_calypso" | "transferible"
}

## Categorización
- especifico_calypso: terminología propia de la plataforma (Task Station, 
  Structured Flows, nombres de pantallas/módulos)
- transferible: conceptos financieros estándar de mercado (forward rate, 
  descuento de flujos, curvas) aplicables en cualquier sistema similar
