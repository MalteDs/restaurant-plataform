# Planteamiento del Proyecto — Orquestación Operativa para Restaurantes Multicanal

**Estado:** borrador de descubrimiento. No es un documento de requisitos cerrados.
**Última actualización:** 2026-11-04

---

## 0. Introducción

### Qué es este documento

Documento de descubrimiento y definición del proyecto. Recoge la investigación de campo, los problemas identificados, las decisiones tomadas y lo que falta por validar. Su objetivo es comprender el problema lo suficiente para definir y construir la primera versión; no es todavía un documento de requisitos cerrados ni una especificación técnica.

### El negocio

El negocio es un restaurante con tres sedes —Almedros, Calipso y Caney— que opera bajo más de una marca (Karbón, Salchipaperia2x1) y recibe pedidos principalmente desde Rappi y DiDi. No dispone hoy de un sistema de caja/POS: la venta se registra a mano en papel factura. Existió un sistema anterior, considerado útil pero inestable y sin mantenimiento, y esa experiencia pesa en los requisitos de confiabilidad.

`[Hecho]` El hardware disponible es de 2 tablets Android con Internet y 1 PC Windows con Internet. No se desea agregar pantallas, computadores ni impresoras.

### Origen de la investigación

La observación comenzó en Almedros, la sede con operación híbrida y atención al público, y continuó durante tres días en Calipso, una sede cerrada que trabaja solo con plataformas. Caney todavía no se ha observado. El conocimiento es desigual entre sedes, y por eso el documento distingue lo observado de lo que se asume.

`[Problema central]` Los restaurantes que reciben pedidos desde múltiples canales carecen de una capa operacional unificada que transforme esos pedidos en trabajo coordinado para cocina y personal, lo que produce dependencia de comunicación verbal, memoria, múltiples interfaces y procesos manuales.

### Qué contiene

El documento va de la visión de largo plazo a la estrategia de entrada, el alcance de Caja v1, el modelo conceptual, la arquitectura, la confiabilidad, los riesgos y los pendientes. Los hallazgos de campo y la matriz de problemas se conservan como anexos de evidencia.

### Documentos relacionados

| Documento | Rol |
|---|---|
| `Panteamiento del proyecto.md` | Este documento: contexto, visión, decisiones y evidencia. |
| `docs/requisitos-v1.md` | Requisitos funcionales, no funcionales, UI y criterios de aceptación de Caja v1. |
| `docs/superpowers/plans/2026-11-05-caja-v1-pwa.md` | Plan de implementación por tareas. |

### Cómo leerlo

Cada afirmación lleva una marca. Si no la lleva, es contexto general.

| Marca | Significado |
|---|---|
| `[Hecho]` | Observado en las sedes o confirmado por el negocio. |
| `[Problema]` | Dificultad identificada a partir de hechos observados. |
| `[Hipótesis]` | Creencia a validar. No es un requisito. |
| `[Decisión]` | Tomada explícitamente. Guía el trabajo actual. |
| `[Pendiente]` | Requiere definición o evidencia antes de congelarse. |

**Regla de extrapolación:** lo observado en una sede no se convierte automáticamente en regla para las demás. Almendros y Calipso ya muestran operaciones distintas, y Caney todavía no se ha observado.

---

## 1. Visión del producto

> No estamos construyendo simplemente un POS ni un agregador de pedidos. Estamos construyendo una capa operacional que conecta los canales de venta del restaurante con su operación.

El objetivo de largo plazo es una plataforma SaaS multi-restaurante y multi-sede que reciba pedidos de cualquier canal, los interprete en un modelo común y los transforme en trabajo coordinado para el personal:

**recibir → interpretar → coordinar → preparar → empaquetar → entregar**

`[Decisión]` La visión de largo plazo no cambia. Lo que cambia es la estrategia de entrada.

---

## 2. Estrategia de entrada: Caja primero

`[Decisión]` El primer producto entregable es un sistema de **Caja/POS pequeño y funcional**, no la plataforma multicanal completa.

La estrategia es:

**Caja → uso real → confianza → conocimiento del negocio → identificación de problemas → evolución hacia plataforma operacional multicanal**

### Por qué

- `[Hecho]` Las sedes no tienen hoy un sistema de caja/POS.
- `[Hecho]` Existió uno anteriormente: era considerado útil, pero presentaba fallas frecuentes y no recibía mantenimiento.
- `[Problema]` Una necesidad concreta, fácil de explicar y de valor inmediato para los dueños es la mejor puerta de entrada.
- `[Hipótesis]` Un producto estable usado a diario genera la confianza necesaria para introducir después la capa operacional.

`[Decisión]` Caja se construye con estándar de producto final: sin atajos desechables, migraciones versionadas, pruebas automatizadas, auditoría, respaldos verificados y arranque automático. No es un prototipo.

### Principio arquitectónico

`[Decisión]` Caja **no** se construye como un sistema aislado que luego haya que reemplazar.

Caja es, desde el inicio, **una fuente de pedidos más**, igual que en el futuro lo serán Rappi y DiDi:

```
Fase 1:   Caja ─────────────────► Order Core ──► registro / cierre
Fase 2:   Caja, Rappi, DiDi ────► Order Core ──► Task Engine ──► operación
Fase 3:   Order Core ──► preparación ──► empaque ──► despacho ──► métricas
```

`[Decisión]` No se implementa una lógica distinta para Caja y otra para Rappi/DiDi si ambas representan pedidos del restaurante.

---

## 3. Contexto observado

### Sedes

| Sede | Estado de observación | Notas |
|---|---|---|
| Almendros | Observada | Operación híbrida/multimarca. Pedidos principalmente Rappi y DiDi. Colaboración transversal entre trabajadores. |
| Calipso | Observada (3 días) | Sin atención al público. Canales DiDi y Rappi. Roles estrictos, sin ayuda transversal. Tablets y PC más antiguos. |
| Caney | **No observada** | `[Pendiente]` Observar antes de generalizar. |

### Canales

`[Hecho]` Rappi requiere aceptación manual en la PC, aviso a cocina e impresión: varios puntos donde una persona puede olvidar o retrasar una acción.

`[Hecho]` DiDi acepta automáticamente, pero la información relevante (modificadores, notas, combos, cantidades) no siempre es visible en la lista y obliga a abrir el detalle del pedido.

`[Hecho]` Existen varias "verdades" simultáneas del mismo pedido: la plataforma, el papel, la memoria de quien aceptó, la interpretación de cocina, la revisión de empaque y lo que sabe caja.

### Operación

- `[Hecho]` Un pedido puede requerir trabajo de varias estaciones (hamburguesas, papas, bebidas, empaque, entrega).
- `[Hecho]` La coordinación depende en parte de comunicación verbal ("Ayúdame con la 45", "Llegó una Rappi", "¿Quién está haciendo la 32?").
- `[Hecho]` En Calipso los trabajadores permanecen estrictamente en su rol: en una observación el preparador acumulaba pedidos mientras el salchipapero tenía capacidad libre, sin redistribución.
- `[Hecho]` Los tiempos de referencia son ~10 min normal, +15 min preocupante, con picos de hasta ~8 pedidos pendientes.
- `[Hecho]` Ocurrió al menos un pedido entregado equivocado; no existe una identificación operacional única de extremo a extremo.
- `[Hecho]` **Karbón** es el nombre del punto físico. **Salchipaperia2x1** y **Burguer Parrilla** son nombres de tienda en DiDi/Rappi. El catálogo puede diferir por canal.
- `[Hecho]` Almendros y Caney tienen mesas; el punto físico incluye consumo en mesa.
- `[Hecho]` El domicilio propio cobra envío. Almendros no tiene domiciliario propio; Caney sí.
- `[Hecho]` El local cierra a medianoche y deja de recibir pedidos a las 23:40.
- `[Hecho]` Medios de pago: efectivo, tarjeta por datáfono y Bre-B mediante QR de Bold.
- `[Hecho]` Los combos comerciales (p. ej. "Combo Tú y Yo") representan varios componentes operativos.
- `[Hecho]` Hardware disponible: 2 tablets Android con Internet y 1 PC Windows con Internet. No se desea agregar hardware.

`[Pendiente]` Validar si existe un encargado o líder operativo formal; en Calipso se percibió un rol informal no confirmado.

---

## 4. Problemas identificados

Ver **Anexo B** para la matriz completa con impacto, frecuencia y dependencia externa.

Los problemas se agrupan en cinco familias:

1. **Recepción fragmentada:** cada canal tiene su mecanismo y su representación del pedido.
2. **Ausencia de estado operacional central:** el pedido vive repartido entre pantallas, papel, memoria y conversación.
3. **Descomposición manual:** combos y pedidos multproducto exigen coordinar varias estaciones sin un desglose común.
4. **Ceguera de tiempos y prioridades:** los retrasos se detectan por percepción, no por señal del sistema.
5. **Confiabilidad:** el sistema de caja anterior fallaba con frecuencia; la estabilidad es un requisito, no un extra.

`[Problema central]` Los restaurantes que reciben pedidos desde múltiples canales carecen de una capa operacional unificada que transforme esos pedidos en trabajo coordinado para cocina y personal, lo que produce dependencia de comunicación verbal, memoria, múltiples interfaces y procesos manuales.

---

## 5. Hipótesis de producto

`[Hipótesis]` Si centralizamos la representación operacional de los pedidos y los dividimos dinámicamente en tareas, reducimos errores de comunicación, mejoramos la visibilidad del trabajo pendiente y detectamos retrasos sin modificar el hardware existente.

`[Hipótesis]` Una Caja pequeña y estable, usada a diario, es la vía más rápida para entrar al restaurante, generar confianza y obtener evidencia real sobre la operación.

`[Hipótesis]` El mismo modelo de pedido sirve para ventas propias y para pedidos de plataformas, sin duplicar lógica.

`[Pendiente]` Ninguna de estas hipótesis está validada todavía.

---

## 6. Modelo conceptual

### Order → Tasks, no Order → Worker

`[Decisión]` Un pedido no equivale a una persona. Se modela como un pedido que se descompone en tareas ejecutables por personal autorizado, sin asignación rígida.

```
Pedido #45
├── 2 hamburguesas ...... Preparación
├── Papas con bacon ..... Salchipapas
├── Gaseosa ............. Empaque
└── Empaque ............. Empaque
```

`[Decisión]` El sistema muestra qué trabajo falta y permite que cualquier trabajador autorizado lo tome. No asigna automáticamente personas.

### Order Core

`[Decisión]` Existe un núcleo de dominio único que representa un pedido, independiente del canal de origen:

```
Caja    ─┐
Rappi   ─┼──► Adapters ──► Order Core ──► (Task Engine, fase 2)
DiDi    ─┤
Otros   ─┘
```

---

## 7. Alcance de Caja v1

`[Decisión]` Caja se limita deliberadamente. El objetivo es un producto funcional y estable que permita operar de verdad, no un POS empresarial.

### Entra en v1

1. Registrar ventas del **punto físico** y de **domicilio propio**.
2. Catálogo operacional por marca, con combos, modificadores y notas.
3. Registrar el **medio de pago** (efectivo, tarjeta por datáfono externo, Bre-B). Solo se registra: no hay integración.
4. Identidad única de pedido (número + marca) reutilizable después en preparación y empaque.
5. **Cierre del día:** totales por medio de pago y por marca.
6. **Operación sin conexión** y recuperación ante reinicio o cierre inesperado.
7. `[Decisión propuesta]` Registro manual rápido de pedidos de Rappi/DiDi para que el cierre refleje la venta real. Se incluye si no compromete la estabilidad; si no, pasa a la versión siguiente.
8. `[Decisión propuesta]` Apertura de caja con base inicial y arqueo por jornada.

### No entra en v1

- Facturación electrónica, impuestos y contabilidad.
- Inventario, compras, proveedores, nómina.
- Integración con datáfono o Bre-B.
- Impresión de tirillas: la factura se sigue escribiendo a mano en papel.
- Propinas, descuentos y división de cuenta.
- Mapa de mesas (ver pendientes).
- Asignación de tareas a estaciones y tablero operacional (fase 2).
- App móvil para la encargada.
- Operación simultánea en varias sedes.
- Reemplazar Rappi o DiDi, gestionar pagos o domicilios, modificar tablets de plataformas.

---

## 8. Flujo operativo de Caja

```
[1] Abrir jornada / base inicial        [Pendiente: confirmar si aplica]
        │
[2] Elegir marca (Karbón / Salchipaperia2x1)
        │
[3] Cargar productos y combos + modificadores + notas
        │
[4] Tipo de venta: punto físico | domicilio propio
        │
[5] Medio de pago: efectivo | tarjeta (datáfono externo) | Bre-B
        │
[6] Confirmar venta ──► pedido normalizado con ID único
        │                 (guardado local, sincroniza cuando haya red)
[7] (Plus) Registrar pedido de Rappi/DiDi recibido
        │
[8] Cierre del día ──► totales por medio de pago y por marca
```

`[Decisión]` La confirmación de la venta nunca depende de la red.

---

## 9. Modelo de dominio (conceptual)

| Entidad | Rol |
|---|---|
| `Tenant` / `Branch` | Restaurante y sede (Almendros, Calipso, Caney). |
| `Brand` | Marca con su catálogo, empaque y presentación. |
| `Order` | Pedido canónico: `id`, `source` (CAJA, RAPPI, DIDI), `external_ref`, sede, marca, tipo, estado, ítems, pagos, marcas de tiempo. |
| `OrderItem` | Línea del pedido: producto, cantidad, modificadores, notas, precio. |
| `Payment` | Medio y monto. `CASH`, `CARD`, `BREB`. |
| `Product` / `Combo` | Producto comercial y su composición operacional (qué componentes genera). |
| `CashSession` / `Shift` | Turno de caja: apertura, movimientos, cierre y arqueo. |
| `SyncOperation` | Operación local pendiente de sincronizar: `operationId`, `seq`, tipo, estado e intentos. |
| `User` | Persona que opera. `[Pendiente]` alcance del login. |
| `OrderEvent` | Registro append-only de lo que ocurrió con el pedido. Base para confiabilidad e historial. |
| `Task` / `Station` | Fase 2: tarea por estación y estado. |

`[Decisión]` Los estados de un pedido de Caja son de venta (`ABIERTO`, `COBRADO`, `ANULADO`), no de preparación. "Listo para entregar" es un concepto de la fase 2.

---

## 10. Arquitectura

```
┌───────────────────────────────────────────────┐
│  PC Windows (Almendros) — 2 GB RAM            │
│  PWA React + TypeScript en Edge               │
│  Service Worker · app shell offline           │
│  IndexedDB · ventas, turnos, cola de sync     │
└───────────────────┬───────────────────────────┘
                    │ HTTPS solo para sincronizar
┌───────────────────▼───────────────────────────┐
│  Nube: Spring Boot (monolito modular)         │
│  PostgreSQL · fuente de verdad consolidada    │
│  Sync API idempotente · reportes · auditoría  │
└───────────────────▲───────────────────────────┘
                    │ Order Core (mismo modelo)
┌───────────────────┴───────────────────────────┐
│  Fase 2: adapters Rappi/DiDi + Task Engine    │
└───────────────────────────────────────────────┘
```

`[Decisión]` Caja corre **solo en la PC**. Las tablets quedan reservadas para las vistas de estación de la fase 2. El celular de la encargada no se contempla.

`[Decisión]` No hay servidor local. La caja opera contra IndexedDB y sincroniza con el backend en la nube cuando hay Internet.

`[Decisión]` Mientras no hay red, IndexedDB es el sistema de registro; al sincronizar, PostgreSQL es la fuente de verdad consolidada. Esa dualidad es explícita y gobierna el diseño del sync.

`[Decisión]` Stack: Java 21 + Spring Boot, PostgreSQL, React + TypeScript, PWA instalable, monolito modular. El peso del backend queda fuera de la PC de 2 GB.

`[Decisión]` Toda venta nace local y viaja por una cola de operaciones idempotente. No existe creación directa de ventas en la API.

`[Decisión]` El cierre de turno y el arqueo se calculan localmente; el servidor recalcula y marca diferencias.

`[Pendiente]` Proveedor de nube y su costo mensual.

`[Pendiente]` Persistencia de IndexedDB sin prueba técnica previa: se aceptó el riesgo y se mitiga con exportación periódica de pendientes y pruebas de recuperación obligatorias.

---

## 11. Confiabilidad (requisito duro)

`[Decisión]` Caja debe operar sin conexión y no debe caerse. Es el requisito que el sistema anterior no cumplía.

Criterios que v1 debe cumplir:

- La venta se confirma en la PC aunque no haya red.
- Un reinicio o cierre inesperado no pierde ventas ya confirmadas.
- Si el backend no responde, la caja sigue vendiendo y la cola crece sin pérdida.
- Una sincronización reintentada no duplica ventas.
- El estado de sincronización y del respaldo es visible para el operador (una señal simple, no un panel).
- Las ventas pendientes se pueden exportar y restaurar en un perfil limpio.

`[Decisión]` Los respaldos son automáticos y verificados: `pg_dump` diario en el servidor y exportación de pendientes cada 5 minutos en la caja. No dependen de que alguien copie archivos a mano.

`[Pendiente]` Qué ocurre si se daña la PC antes de sincronizar. La exportación reduce el riesgo; la recuperación exige un equipo de reemplazo.

---

## 12. Validación: qué debe aprender Caja

`[Decisión]` Caja es también un instrumento de diagnóstico. Sus hallazgos se documentan como **observaciones**, no se convierten automáticamente en requisitos.

| Qué observar | Por qué importa |
|---|---|
| Estabilidad de la red y cortes | Dimensiona el modo sin conexión real. |
| Conectividad y rendimiento de la PC | Confirma si el hardware soporta la interfaz. |
| Uso real por parte del personal | Valida si el flujo es adoptable. |
| Catálogo, combos y modificaciones | Valida si el modelo de pedido representa la venta. |
| Flujo de venta y cierre | Valida si el cierre le sirve al dueño. |
| Errores operativos y anulaciones | Alimenta las reglas de la versión siguiente. |
| Necesidades de información del encargado | Define qué reportes valen la pena. |

`[Hecho]` El comportamiento ante pérdida de conexión dejó de ser solo un aprendizaje: es un requisito del producto.

---

## 13. Integraciones

`[Decisión]` El núcleo del sistema no depende de conceptos específicos de una plataforma. Toda fuente externa entra por un adaptador que produce el modelo canónico.

| Fase | Integración |
|---|---|
| 1 (v1) | Caja como fuente de pedidos. Sin integraciones externas. |
| 2 | Simulador de Rappi/DiDi para desarrollar la capa operacional sin API real. |
| 3 | Adaptadores reales de Rappi y DiDi, reemplazando el simulador sin tocar el Order Core. |

`[Pendiente]` Obtención de acceso a las APIs reales. No bloquea el desarrollo.

---

## 14. Roadmap por fases

| Fase | Entrega | Propósito |
|---|---|---|
| 0 | Observación de Caney y consolidación de diferencias entre sedes | Completar el conocimiento antes de generalizar. |
| 1 | Caja en Almedros | Valor inmediato, confianza, diagnóstico técnico. |
| 2 | Order Core + adapters + Task Engine + vistas de estación en tablets | Convertir pedidos de todos los canales en trabajo coordinado. |
| 3 | Empaque, despacho, identidad única de extremo a extremo, métricas operacionales | Cerrar el ciclo operacional y medir. |

`[Decisión]` Caney no se observa antes de la fase 0; ninguna conclusión sobre diferencias entre sedes se considera completa hasta entonces.

---

## 15. Riesgos

| # | Riesgo | Mitigación propuesta |
|---|---|---|
| R1 | Caja resuelve poco en Calipso, que no tiene atención al público. La estrategia de entrada depende de Almendros. | Piloto en Almendros; no prometer Caja como solución universal. |
| R2 | Deriva hacia POS completo (inventario, contabilidad, facturación electrónica). | Alcance de v1 explícito y fuera de alcance documentado. |
| R3 | Modo sin conexión mal implementado: dos verdades y conflictos de sincronización. | Una sola PC, base local como fuente de verdad, eventos idempotentes. |
| R4 | Una sola PC es punto único de falla: si se daña, se pierde la jornada. | Respaldo y recuperación (`[Pendiente]`). |
| R5 | El registro manual de pedidos de plataforma se abandona en la práctica y el cierre queda incompleto. | Medir uso real antes de prometerlo como parte del valor. |
| R6 | El dueño espera un POS completo y la entrega se percibe incompleta. | Acordar expectativa: Caja reemplaza el cuaderno, no la facturación ni la impresión. |
| R7 | La configurabilidad multi-sede se sobre-diseña antes de conocer Caney. | Modelar sede y marca desde el inicio, pero no construir funciones multi-sede en v1. |

---

## 16. Registro de decisiones

| # | Decisión | Fecha | Estado |
|---|---|---|---|
| D1 | La visión de largo plazo es una capa operacional multicanal; no cambia. | 2026-11-04 | Tomada |
| D2 | La estrategia de entrada es Caja: producto pequeño, funcional y estable. | 2026-11-04 | Tomada |
| D3 | Caja se construye sobre el mismo Order Core que usará la plataforma multicanal. Caja es una fuente de pedidos. | 2026-11-04 | Tomada |
| D4 | Caja registra punto físico (mostrador y mesas con etiqueta) y domicilio propio con cargo de envío. | 2026-11-04 | Tomada |
| D5 | Caja debe funcionar sin conexión y no debe caerse; ninguna venta se pierde. | 2026-11-04 | Tomada |
| D6 | Caja corre únicamente en la PC de Almendros. Tablets y celular quedan fuera. | 2026-11-04 | Tomada |
| D7 | Sede piloto: Almendros. | 2026-11-04 | Tomada |
| D8 | Sin descuentos, sin propinas, sin división de cuenta. Medios de pago: efectivo, tarjeta por datáfono y Bre-B por QR de Bold. Solo se registran; no hay integración. | 2026-11-04 | Tomada |
| D9 | La factura se sigue escribiendo a mano en papel: Caja no imprime. | 2026-11-04 | Tomada |
| D10 | Se documenta sin congelar requisitos hasta observar Caney. | 2026-11-04 | Tomada |
| D11 | Registro manual de pedidos de plataforma en Caja, como plus de bajo costo. | 2026-11-04 | **Propuesta, por confirmar prioridad** |
| D12 | Apertura de caja con base inicial y arqueo por jornada. | 2026-11-04 | Tomada |
| D13 | Stack de v1: PWA React + TypeScript con IndexedDB; backend Spring Boot + PostgreSQL en la nube; monolito modular. Reemplaza la propuesta anterior de Go + SQLite. | 2026-11-05 | Tomada |
| D14 | Login con roles: cajero, encargado y administrador. Toda devolución queda con usuario, fecha y motivo. | 2026-11-04 | Tomada |
| D15 | Contabilidad de v1: gastos y utilidad operativa (ventas netas − costo de productos − gastos). Contabilidad formal queda fuera. | 2026-11-04 | Tomada |
| D16 | Caja se construye con estándar de producto final, no de prototipo. | 2026-11-04 | Tomada |
| D17 | Caja es offline-first: toda venta nace en IndexedDB y se sincroniza después. Sin servidor local. | 2026-11-05 | Tomada |
| D18 | Sincronización por cola de operaciones ordenada e idempotente, con `operationId` y `seq` por dispositivo. | 2026-11-05 | Tomada |
| D19 | Backend en la nube. Proveedor y costo mensual quedan pendientes. | 2026-11-05 | Tomada |
| D20 | Se descarta el spike de persistencia previo. El riesgo se mitiga con exportación de pendientes y pruebas de recuperación obligatorias. | 2026-11-05 | Tomada |
| D21 | Retención mínima de 5 años sin borrado automático; exportación CSV de reportes. | 2026-11-05 | Tomada |
| D22 | Utilidad operativa = ventas netas − costo de productos − gastos. El costo por producto es opcional; si falta, se advierte. | 2026-11-05 | Tomada |
| D23 | Las mesas se registran con etiqueta al cobrar. No hay cuenta abierta por mesa en v1. | 2026-11-05 | Tomada |

---

## 17. Pendientes de validación

| # | Pendiente | Por qué cambia el producto |
|---|---|---|
| P1 | ~~¿El punto físico incluye consumo en mesa?~~ Resuelto: sí, hay mesas en Almendros y Caney (D-01). | — |
| P2 | ~~¿Quién opera Caja?~~ Resuelto: login con roles (D14). | — |
| P3 | ~~¿Se permite anular una venta cerrada?~~ Resuelto: sí, siempre, con motivo y registro. El modelo de devolución está en el plan. | — |
| P4 | ~~Nombre y flujo del medio Bre-B~~ Resuelto: Bre-B por QR de Bold, más datáfono (D8). | — |
| P5 | ~~Prioridad del registro manual de pedidos de plataforma~~ Resuelto: fuera de v1 (D-08). | — |
| P6 | ~~¿Con qué frecuencia cambian precios y productos?~~ Resuelto: edición manual por el administrador; carga inicial desde el menú. | — |
| P7 | ~~¿El domicilio cobra envío? ¿Se registra el domiciliario?~~ Resuelto: cobra envío; sin domiciliario en Almendros, con domiciliario en Caney (D-02). | — |
| P8 | Observación de Caney y diferencias reales entre las tres sedes. | Evita generalizar; no bloquea v1. |
| P9 | ~~¿Una instalación por sede?~~ Resuelto: un despliegue, dispositivos por sede (D-09). | — |
| P10 | ~~Facturación electrónica futura~~ Fuera de v1 (D-10). | — |
| P11 | Respaldo y recuperación ante daño de la PC. | Mitigado con exportación; sin PC de reemplazo definida (D-12). |
| P12 | ~~Stack tecnológico~~ Resuelto: PWA React + IndexedDB, Spring Boot + PostgreSQL en la nube (D13). | — |
| P13 | Proveedor de nube y costo mensual. | Define despliegue, TLS y respaldos. Sujeto a cambios. |
| P14 | Costo por producto para utilidad exacta. | El menú tiene precios de venta, no costos. |
| P15 | ¿Cuenta abierta por mesa o venta con etiqueta al cobrar? | Alcance de v1. |

---

## 18. Fuera de alcance (visión completa, no solo v1)

- Optimizar físicamente la cocina o decidir la dotación de personal.
- Inventario completo, compras, proveedores, nómina.
- Reemplazar Rappi o DiDi.
- Gestionar pagos, domicilios o impresoras.
- Modificar las tablets de las plataformas.
- Automatizar físicamente la preparación.
- Asignar obligatoriamente personas a estaciones.
- Construir un ERP, un sistema contable o resolver toda la administración del restaurante.

---

## Anexo A — Hallazgos operativos

Resumen de la investigación de campo. Se conserva como evidencia; no todo es requisito.

1. **Recepción.** Rappi exige aceptar en la PC, avisar a cocina e imprimir. DiDi acepta automáticamente pero esconde modificadores, notas y combos detrás del detalle.
2. **Fuentes de verdad.** Plataforma, papel, memoria, cocina, empaque y caja tienen cada una su versión del pedido.
3. **Comunicación verbal.** "Ayúdame con la 45", "Llegó una Rappi", "¿Quién está haciendo la 32?" sostienen la coordinación y no escalan.
4. **Estaciones.** Un pedido cruza preparación, salchipapas y empaque; una persona puede hacer todo o pedir ayuda.
5. **Tiempos.** ~10 min normal, +15 min preocupante, hasta ~8 pedidos pendientes en pico. No hay señal sistemática de retraso.
6. **Prioridad.** Rappi suele tener prioridad porque el domiciliario llega antes, pero vive en el conocimiento del personal.
7. **Visibilidad.** La interfaz propia puede resumir la información operacional en lugar de replicar la pantalla de la plataforma.
8. **Identificación.** Se usan número, nombre, plataforma, marca, bolsa, productos y papel; no hay identidad única de extremo a extremo. Ya ocurrió un pedido equivocado.
9. **Marcas.** Karbón y Salchipaperia2x1 difieren en empaque, presentación y configuración: el catálogo debe ser por marca.
10. **Combos.** "Combo Tú y Yo" equivale operativamente a 2 hamburguesas pequeñas + papas + bacon: se necesita un catálogo operacional propio.
11. **Historia.** No hay datos unificados de tiempos, estaciones críticas, horas pico, cancelaciones ni problemas. Se prioriza después del flujo.
12. **Límites.** El producto se concentra en recibir → interpretar → coordinar → preparar → empacar → entregar.

---

## Anexo B — Matriz de problemas

La columna **Caja** refleja el reencuadre tras la decisión D2: qué problemas atiende v1 y cuáles quedan para la fase operacional.

| # | Problema | Impacto | Frecuencia | Oportunidad | Caja |
|---|---|---|---|---|---|
| 1 | Los pedidos llegan por canales distintos | Alto | Alta | Unificar en un modelo común | Fase 2 |
| 2 | Rappi depende de que alguien acepte y avise a cocina | Alto | Alta | Registrar y hacer visible el pedido | Fase 2 |
| 3 | Un pedido puede perderse entre caja y cocina | Alto | Ocasional | Estado central del pedido | Parcial |
| 4 | La información de DiDi exige abrir el pedido | Medio/alto | Alta | Vista operacional propia | Fase 2 |
| 5 | Modificadores y notas pasan desapercibidos | Alto | Ocasional | Normalizar y destacar modificaciones | Parcial |
| 6 | Un pedido requiere trabajo de varias estaciones | Alto | Alta | Descomponer en tareas | Fase 2 |
| 7 | La colaboración depende de comunicación verbal | Medio/alto | Alta | Mostrar trabajo pendiente y permitir tomarlo | Fase 2 |
| 8 | No hay definición central de "pedido listo" | Alto | Alta | Estados operacionales propios | Fase 2 |
| 9 | El tiempo de preparación no se controla | Medio | Alta | Temporizadores y métricas | Fase 2 |
| 10 | Los retrasos no tienen señal sistemática | Alto | Ocasional | Prioridad y alertas | Fase 2 |
| 11 | Empaque depende de papel, memoria y plataforma | Alto | Alta | Vista de empaque | Fase 2 |
| 12 | Riesgo de entregar un pedido equivocado | Alto | Ocasional | Identidad única de extremo a extremo | Parcial |
| 13 | Las marcas tienen productos y empaques distintos | Medio/alto | Alta | Catálogo y configuración por marca | **Sí** |
| 14 | Los combos deben interpretarse operativamente | Alto | Alta | Composición operacional | **Sí** |
| 15 | No hay fuente histórica operacional unificada | Medio | Alta | Historial de pedidos y eventos | Parcial |
| 16 | No hay sistema de caja actualmente | Potencialmente alto | Alta | Módulo de ventas/caja | **Sí** |
| 17 | El sistema anterior de caja era útil pero poco confiable | Alto | Alta cuando ocurría | Arquitectura confiable y observable | **Sí** |
| 18 | No hay información consolidada para el encargado | Medio/alto | Alta | Cierre del día y reportes | Parcial |
| 19 | El sistema depende del conocimiento de los trabajadores | Medio | Alta | Estandarización digital configurable | Parcial |
| 20 | El hardware disponible es limitado | Alto | Permanente | Interfaz adaptable a los equipos existentes | **Sí** |
