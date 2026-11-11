# Mejoras de accesibilidad y UX — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer la caja más legible, operable con teclado y recuperable ante errores, sin cambiar el flujo de venta.

**Architecture:** Se ajustan tokens y estilos compartidos una sola vez, se extrae un `Modal` accesible para los tres diálogos de Venta y un `FormError` anunciado para los errores. La fila de Pedidos conserva su acción principal en un botón real dentro de la celda.

**Tech Stack:** React 18 + TypeScript + Tailwind + Vitest.

**Spec:** Revisión UX del 2026-11-11 en `docs/superpowers/specs/2026-11-11-accesibilidad-ui-design.md`

## Global Constraints

- Sin dependencias nuevas.
- No cambiar flujos de negocio ni backend.
- Mantener el tema claro y los componentes existentes.
- Cada tarea termina con pruebas verdes y commit propio.
- La rama es `feat/mejoras-accesibilidad-ui`, basada en `feat/mejoras-venta`.

## Review Focus

- Contraste insuficiente en textos y botones naranjas.
- Foco de teclado invisible en botones, enlaces y filas.
- Modales que dejan el foco ir al fondo, no cierran con Escape o no restauran el foco.
- Errores que no se anuncian a lectores de pantalla.
- Sesión expirada sin salida desde la pantalla de bloqueo.

---

### Task 1: Tokens de color y foco visible

**Files:**
- Modify: `frontend/tailwind.config.ts`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/shared/ui/index.tsx`

**Interfaces:**
- Consumes: clases `brand-500`, `brand-600`, `brand-700` existentes.
- Produces: `brand-600` con contraste ≥4.5 sobre blanco; foco visible global en elementos interactivos.

- [ ] **Step 1: Ajustar la paleta**

En `tailwind.config.ts`, dejar `brand-600` en `#c2410c` y `brand-700` en `#9a3412`. Mantener `brand-500` para decoración.

- [ ] **Step 2: Añadir foco visible global**

En `index.css`, dentro de `@layer base`:

```css
:where(button, a, input, select, textarea, [tabindex]:not([tabindex='-1'])):focus-visible {
  outline: 2px solid #111827;
  outline-offset: 2px;
}
```

- [ ] **Step 3: Quitar el outline anulado del Input**

En `shared/ui/index.tsx`, quitar `outline-none` y cambiar el foco a `focus:border-brand-700 focus:ring-2 focus:ring-brand-700/30`.

- [ ] **Step 4: Verificar contraste y pruebas**

Run: `cd frontend && npm test && npm run build`
Expected: PASS. Verificar con cálculo que `#c2410c` sobre blanco da 5.18:1.

- [ ] **Step 5: Commit**

```bash
git add frontend/tailwind.config.ts frontend/src/index.css frontend/src/shared/ui/index.tsx
git commit -m "fix: sube el contraste de la marca y hace visible el foco"
```

---

### Task 2: Modal compartido accesible

**Files:**
- Create: `frontend/src/shared/ui/Modal.tsx`
- Create: `frontend/src/shared/ui/Modal.test.tsx`
- Modify: `frontend/src/shared/ui/index.tsx`
- Modify: `frontend/src/modules/sales/SaleScreen.tsx`

**Interfaces:**
- Produces: `Modal({ title, onClose, children })` con `role="dialog"`, `aria-modal`, foco inicial, Escape, trampa de Tab, bloqueo de scroll y restauración de foco.
- SaleScreen consume `Modal` en los diálogos de precio, presentación y modificadores.

- [ ] **Step 1: Escribir la prueba que falla**

En `Modal.test.tsx`:

```tsx
it('enfoca el primer control y cierra con Escape', async () => {
  const onClose = vi.fn()
  render(<Modal title="Probar" onClose={onClose}><button>Uno</button><button>Dos</button></Modal>)
  expect(screen.getByRole('dialog', { name: 'Probar' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Uno' })).toHaveFocus()
  await userEvent.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalled()
})
it('mantiene el foco dentro del diálogo al tabular', async () => { /* Tab desde el último vuelve al primero */ })
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd frontend && npx vitest run src/shared/ui/Modal.test.tsx`
Expected: FAIL porque `Modal` no existe.

- [ ] **Step 3: Implementar `Modal` y exportarlo**

Implementar con `useId`, `useRef` y `useEffect`; selector de controles `button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])`. En `Escape` llamar `onClose`; en `Tab` envolver del último al primero y viceversa. Guardar y restaurar `document.activeElement`; bloquear `body.overflow` mientras está abierto.

- [ ] **Step 4: Reemplazar los tres modales de SaleScreen**

Sustituir cada `<div className="fixed inset-0..."><Card>...` por `<Modal title={...} onClose={...}>`. Mantener el contenido, los botones y las validaciones existentes. El título del precio incluye el producto; el de presentación es el nombre de la familia; el de modificadores es `Modificadores de {producto}`.

- [ ] **Step 5: Ejecutar pruebas**

Run: `cd frontend && npx vitest run src/shared/ui/Modal.test.tsx src/modules/sales/SaleScreen.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/ui/Modal.tsx frontend/src/shared/ui/Modal.test.tsx frontend/src/shared/ui/index.tsx frontend/src/modules/sales/SaleScreen.tsx
git commit -m "feat: diálogos accesibles con foco atrapado y Escape"
```

---

### Task 3: Errores anunciados

**Files:**
- Modify: `frontend/src/shared/ui/index.tsx`
- Create: `frontend/src/shared/ui/FormError.test.tsx`
- Modify: `frontend/src/modules/sales/SaleScreen.tsx`
- Modify: `frontend/src/app/routes/LoginScreen.tsx`
- Modify: `frontend/src/app/routes/LockScreen.tsx`
- Modify: `frontend/src/modules/expenses/ExpensesScreen.tsx`
- Modify: `frontend/src/modules/refunds/OrderDetailPanel.tsx`

**Interfaces:**
- Produces: `FormError({ children, id })` con `role="alert"`.
- Los errores de formulario de las pantallas dejan de ser `<p>` visuales.

- [ ] **Step 1: Escribir la prueba que falla**

En `FormError.test.tsx`:

```tsx
it('anuncia el error como alerta', () => {
  render(<FormError>No se pudo guardar</FormError>)
  expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar')
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd frontend && npx vitest run src/shared/ui/FormError.test.tsx`
Expected: FAIL porque `FormError` no existe.

- [ ] **Step 3: Implementar y reemplazar los errores**

Implementar `FormError` y sustituir los `<p className="text-sm text-red-600">` de error en SaleScreen (incluido `priceError`), Login, Lock, Gastos y OrderDetailPanel. En Login y Lock añadir `aria-describedby` al PIN solo si el error pertenece al PIN.

- [ ] **Step 4: Ejecutar pruebas**

Run: `cd frontend && npx vitest run src/shared/ui/FormError.test.tsx src/modules/refunds/RefundScreen.test.tsx src/modules/sales/SaleScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/ui/index.tsx frontend/src/shared/ui/FormError.test.tsx frontend/src/modules/sales/SaleScreen.tsx frontend/src/app/routes/LoginScreen.tsx frontend/src/app/routes/LockScreen.tsx frontend/src/modules/expenses/ExpensesScreen.tsx frontend/src/modules/refunds/OrderDetailPanel.tsx
git commit -m "feat: anuncia los errores de formulario a lectores de pantalla"
```

---

### Task 4: Salida desde la pantalla de bloqueo

**Files:**
- Modify: `frontend/src/app/routes/LockScreen.tsx`
- Test: `frontend/src/app/routes/LockScreen.test.tsx`

**Interfaces:**
- Consumes: `logout` de `useAuth`.
- Produces: botón **Iniciar sesión de nuevo** que cierra la sesión y navega a `/login`.

- [ ] **Step 1: Escribir la prueba que falla**

Renderizar `LockScreen` con `useAuth` mockeado (`user`, `unlock`, `logout`) y un `MemoryRouter` con una ruta `/login` visible. Hacer clic en **Iniciar sesión de nuevo** y comprobar `logout` y la navegación.

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd frontend && npx vitest run src/app/routes/LockScreen.test.tsx`
Expected: FAIL porque el botón no existe.

- [ ] **Step 3: Implementar**

Añadir debajo del formulario un `Button variant="ghost"` de ancho completo: **Iniciar sesión de nuevo**, con `onClick={() => { logout(); navigate('/login', { replace: true }) }}`.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd frontend && npx vitest run src/app/routes/LockScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/routes/LockScreen.tsx frontend/src/app/routes/LockScreen.test.tsx
git commit -m "fix: permite volver al login desde la pantalla de bloqueo"
```

---

### Task 5: Fila de Pedidos con acción accesible

**Files:**
- Modify: `frontend/src/modules/refunds/RefundScreen.tsx`
- Test: `frontend/src/modules/refunds/RefundScreen.test.tsx`

**Interfaces:**
- Consumes: `selectedId`, `setSelectedId`.
- Produces: la fila sigue abriendo el detalle con clic, pero la acción de teclado/lector es un botón real con el código del pedido; la tabla conserva su semántica.

- [ ] **Step 1: Escribir la prueba que falla**

En `RefundScreen.test.tsx`, comprobar que el código es un botón accesible y que la fila conserva el rol de tabla:

```tsx
expect(await screen.findByRole('row', { name: /ALM-A-000001/ })).toBeInTheDocument()
expect(screen.getByRole('button', { name: /ver alm-a-000001/i })).toBeInTheDocument()
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd frontend && npx vitest run src/modules/refunds/RefundScreen.test.tsx`
Expected: FAIL; hoy el botón está en el `tr` con `role="button"`.

- [ ] **Step 3: Implementar**

Quitar `role="button"`, `tabIndex`, `aria-label` y `onKeyDown` del `<tr>`; conservar `onClick`. En la primera celda, renderizar un `<button type="button" aria-label={`Ver ${sale.displayCode}`} onClick={(event) => { event.stopPropagation(); setSelectedId(sale.id) }}>` con el código como texto.

- [ ] **Step 4: Ejecutar pruebas**

Run: `cd frontend && npx vitest run src/modules/refunds/RefundScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/refunds/RefundScreen.tsx frontend/src/modules/refunds/RefundScreen.test.tsx
git commit -m "fix: conserva la semántica de tabla en Pedidos"
```

---

### Task 6: Verificación y documentación

**Files:**
- Create: `docs/superpowers/specs/2026-11-11-accesibilidad-ui-design.md`
- Modify: `docs/estado.md`

- [ ] **Step 1: Documentar la decisión**

Crear el spec corto con el alcance del lote, el contraste elegido y la exclusión de los lotes 2 y 3. Añadir la sección de estado con la verificación.

- [ ] **Step 2: Verificación completa**

```bash
cd frontend && npm test
cd frontend && npm run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-11-11-accesibilidad-ui-design.md docs/estado.md
git commit -m "docs: accesibilidad y foco del lote 1"
```
