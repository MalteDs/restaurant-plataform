# Kickoff de implementación — Caja v1

**Estado:** planificación cerrada. Implementación **no iniciada**.
**Fecha:** 2026-11-05
**Para:** la sesión que ejecutará la Tarea 1 en adelante.

---

## 1. Antes de la primera línea

Verifica que exista:

- [ ] Repositorio git inicializado y con los documentos commiteados.
- [ ] Java 21 y `./mvnw` funcionando.
- [ ] Node 20+ y `npm`.
- [ ] Docker con `docker compose`.
- [ ] Edge o Chrome actualizado (para Playwright y la PWA).
- [ ] La PC Windows de Almendros disponible solo para la Tarea 15; no se necesita antes.

Comando sugerido para el primer commit:

```bash
git init
git add .
git commit -m "docs: contexto, requisitos y plan de implementacion"
```

---

## 2. Orden de lectura obligatorio

1. `Panteamiento del proyecto.md` — contexto, decisiones y evidencia.
2. `docs/requisitos-v1.md` — contrato de v1: RF, RNF, UI y criterios de aceptación.
3. `docs/superpowers/plans/2026-11-05-caja-v1-pwa.md` — tareas y pruebas.
4. `docs/estado.md` — punto de reanudación.

**Reglas de precedencia**

- Si el plan y los requisitos difieren, manda `docs/requisitos-v1.md`.
- Si algo no está en ninguno de los dos, no se inventa: se pregunta.
- Si una decisión cambia, se actualizan requisitos, registro de decisiones y plan **antes** de tocar código.

---

## 3. Método de ejecución

Ejecución **híbrida**: un modelo fuerte hace el trabajo pesado; modelos livianos hacen el trabajo mecánico.

### 3.1 Roles

| Rol | Modelo sugerido | Responsabilidad |
|---|---|---|
| Orquestador / arquitecto | `github-copilot/claude-opus-5.5` o `github-copilot/gpt-6.1-sol` | Decide, resuelve ambigüedades, implementa las tareas críticas y revisa todo. |
| Implementador medio | `github-copilot/claude-sonnet-5.5`, `gpt-6.1-terra` o `opencode-go/kimi-k3.1-pro` | Tareas de UI y CRUD con pruebas ya definidas. |
| Implementador liviano | `github-copilot/claude-haiku-5.5`, `gpt-6-luna` o `opencode-go/deepseek-v4.1-flash` | Pantallas repetitivas, formularios, textos y documentación. |
| Revisor | **Siempre** `claude-opus-5.5` | Revisa cada tarea, incluso las livianas. |
| Explorador | agente `explore` | Búsquedas y lecturas baratas. |

Si un modelo no está disponible, usa el equivalente más cercano de la misma familia. No cambies de familia solo por precio.

### 3.2 Reparto por tarea

| Nivel | Tareas | Quién implementa |
|---|---|---|
| **Crítico** | 1, 2, 3, 5, 6, 7, 9, 10, 11, 14, 15 | Orquestador fuerte, inline. |
| **Medio** | 4, 12 | Subagente medio. |
| **Liviano** | 8, 13 | Subagente liviano. |

Motivo: dinero, aislamiento multi-tenant, idempotencia, orden de sync y persistencia local no se delegan a modelos livianos. Una pantalla de administración sí.

### 3.3 Ciclo por tarea

1. Leer la tarea y los RF/CA que cubre.
2. Escribir la prueba que falla.
3. Ejecutarla y confirmar que falla por la razón correcta.
4. Implementar lo mínimo para que pase.
5. Correr la suite completa (`./mvnw verify`, `npm run test`, Playwright cuando aplique).
6. Pasar la tarea al revisor fuerte, que responde con hallazgos concretos.
7. Corregir y repetir hasta que el revisor apruebe.
8. Commit con el mensaje indicado en el plan.
9. Marcar los checkboxes del plan y actualizar `docs/estado.md`.

Nunca dos tareas en paralelo si comparten archivos o contratos.

### 3.4 Modo de la sesión

- Si el orquestador implementa inline: invoca `superpowers:executing-plans`.
- Si delegas todas las tareas a subagentes: invoca `superpowers:subagent-driven-development`.
- El reparto híbrido descrito arriba usa `executing-plans` como base y subagentes solo para las tareas medio/livianas.

---

## 4. Prompt para pegar en la sesión nueva

```text
Vas a implementar Caja v1 en este repositorio. No empieces a codificar todavía.

Lee, en este orden:
1. Panteamiento del proyecto.md
2. docs/requisitos-v1.md
3. docs/superpowers/plans/2026-11-05-caja-v1-pwa.md
4. docs/kickoff-implementacion.md
5. docs/estado.md

Después:
- Confirma en una línea que entendiste el alcance y las reglas de precedencia.
- Ejecuta la Tarea 1 del plan exactamente como está escrita, con TDD.
- Al terminar, pasa la tarea a un revisor fuerte antes de commitear.
- Actualiza docs/estado.md y los checkboxes del plan.
- No avances a la Tarea 2 sin mi aprobación.

Reglas que no se negocian:
- Dinero en enteros, nunca float.
- Toda consulta filtra por tenant y sede.
- Toda operación de sync tiene prueba de idempotencia.
- No se cambia una prueba para que pase: si la prueba está mal, se discute.
- No se agrega alcance sin actualizar primero los requisitos.
```

---

## 5. Puertas de calidad

Una tarea no está terminada si falla cualquiera de estas:

- [ ] La prueba existía y fallaba antes de implementar.
- [ ] La suite completa pasa, no solo la prueba nueva.
- [ ] No hay `float`, `double` ni `Decimal` para dinero.
- [ ] No hay endpoint ni repositorio sin filtro de tenant.
- [ ] No hay camino de sync sin prueba de reintento.
- [ ] El revisor fuerte aprobó.
- [ ] El commit tiene el mensaje del plan.
- [ ] `docs/estado.md` está actualizado.

---

## 6. Reanudar en otra sesión

1. Leer `docs/estado.md`.
2. Revisar los checkboxes del plan y `git log --oneline -10`.
3. Correr la suite antes de tocar nada; si falla, se arregla primero.
4. Continuar por la primera tarea sin marcar.
5. No repetir tareas ya cerradas aunque el contexto se haya perdido.

Si una sesión termina a mitad de una tarea, deja en `docs/estado.md`:

- tarea en curso,
- qué prueba está fallando,
- último comando ejecutado,
- siguiente paso concreto.

---

## 7. Cuándo detenerse y preguntar

- Un requisito es ambiguo y hay dos implementaciones razonables.
- Una prueba contradice el plan o los requisitos.
- Aparece una decisión de dinero, seguridad o pérdida de datos.
- IndexedDB no cumple lo que promete en la PC real.
- El alcance empieza a crecer sin aprobación.

Detenerse es más barato que adivinar.
