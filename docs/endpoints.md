# Endpoints listos para Postman
Base: http://localhost:8080. En Postman puedes hacer Import → Raw text y pegar cada curl.
1. Salud (público)
curl http://localhost:8080/actuator/health
Sirve para confirmar que el backend y la base están arriba.
2. Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"caja123","locationCode":"ALM"}'
Devuelve accessToken (15 min), refreshToken (30 días) y user. Guarda el accessToken para el header Authorization: Bearer <TOKEN>.
3. Renovar token
curl -X POST http://localhost:8080/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<REFRESH_TOKEN>"}'
Rota el refresh: el anterior deja de servir.
4. Ver catálogo
curl http://localhost:8080/api/catalog \
  -H "Authorization: Bearer <TOKEN>"
Devuelve version, 9 categorías, 75 productos con precios, adicionales, precios por día, recetas, modificadores históricos y componentes de combos.
5. Crear producto (ADMIN)
curl -X POST http://localhost:8080/api/catalog/products \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"name":"Producto de prueba","categoryId":"00000000-0000-4000-8000-0000000007d3","pricePesos":12300,"costPesos":5000,"kind":"PRODUCT","saleDays":[1,2,3,4],"addonIds":[],"dayPrices":[{"weekday":1,"pricePesos":11000}],"recipe":[],"components":[]}'
Precio negativo o nombre vacío → 400. Nombre repetido → 409. Sube catalog_version. `saleDays` usa 1=lunes … 7=domingo; omítelo o usa [] para todos los días. `dayPrices` sobrescribe el precio base para los días indicados. `recipe` aplica solo a productos; `components` solo a combos y exige al menos uno.
6. Actualizar producto (ADMIN)
curl -X PUT http://localhost:8080/api/catalog/products/<PRODUCT_ID> \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"name":"Producto actualizado","pricePesos":13000,"active":false,"saleDays":[],"addonIds":[],"dayPrices":[],"recipe":[],"components":[]}'
Es actualización parcial: lo que omites no se borra (incluido costPesos). `saleDays: []` limpia los días y deja el producto disponible todos los días. Enviar `dayPrices`, `recipe`, `addonIds` o `components` como lista vacía limpia esa configuración.
7. Crear categoría (ADMIN)
curl -X POST http://localhost:8080/api/catalog/categories \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"name":"POSTRES","sortOrder":10}'
8. Actualizar categoría (ADMIN)
curl -X PUT http://localhost:8080/api/catalog/categories/<CATEGORY_ID> \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"name":"POSTRES","sortOrder":10,"active":false}'
9. Crear ingrediente (ADMIN)
curl -X POST http://localhost:8080/api/catalog/ingredients \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"name":"Tocineta","unit":"GRAM","wastePercent":5}'
`unit` acepta `UNIT` o `GRAM`. `wastePercent` va de 0 a 100.
10. Crear adicional (ADMIN)
curl -X POST http://localhost:8080/api/catalog/addons \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"name":"Tocineta extra","pricePesos":5000,"recipe":[{"ingredientId":"<INGREDIENT_ID>","quantity":30}]}'
10b. Actualizar adicional (ADMIN)
curl -X PUT http://localhost:8080/api/catalog/addons/<ADDON_ID> \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"pricePesos":6000,"active":true,"recipe":[{"ingredientId":"<INGREDIENT_ID>","quantity":30}]}'
Los grupos de modificadores quedan solo por compatibilidad histórica; la administración nueva usa adicionales. Sus endpoints heredados siguen vivos: `POST /api/catalog/modifier-groups` y `PUT /api/catalog/modifier-groups/<GROUP_ID>`.
11. Registrar dispositivo (ADMIN)
curl -X POST http://localhost:8080/api/devices/register \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"code":"A","name":"Caja A"}'
Devuelve deviceId y deviceToken. El deviceToken se usa solo en sync con el header X-Device-Token.
12. Revocar dispositivo (ADMIN)
curl -X POST http://localhost:8080/api/devices/<DEVICE_ID>/revoke \
  -H "Authorization: Bearer <TOKEN>"
Después de revocar, ese deviceToken recibe 401 en sync.
13. Sync — abrir turno (seq 1)
curl -X POST http://localhost:8080/api/sync/operations \
  -H "X-Device-Token: <DEVICE_TOKEN>" -H "Content-Type: application/json" \
  -d '{"operations":[{"operationId":"11111111-1111-4111-8111-111111111111","seq":1,"type":"OPEN_SHIFT","userId":"<USER_ID>","clientCreatedAt":"2026-11-07T14:00:00Z","payload":{"openingCashPesos":50000}}]}'
Guarda el shiftId de result. seq debe ser consecutivo por dispositivo y empezar en 1.
14. Sync — crear venta (seq 2)
curl -X POST http://localhost:8080/api/sync/operations \
  -H "X-Device-Token: <DEVICE_TOKEN>" -H "Content-Type: application/json" \
  -d '{"operations":[{"operationId":"22222222-2222-4222-8222-222222222222","seq":2,"type":"CREATE_SALE","userId":"<USER_ID>","clientCreatedAt":"2026-11-07T14:05:00Z","payload":{"type":"COUNTER","shiftId":"<SHIFT_ID>","payments":[{"method":"CASH","amountPesos":12000},{"method":"CARD","amountPesos":21000}],"deliveryFeePesos":0,"displayCode":"ALM-A-000001","deviceSeq":1,"items":[{"productId":"00000000-0000-4000-8000-000000000bc4","productName":"SENCILLA","categoryName":"HAMBURGUESAS","quantity":2,"unitPricePesos":16500,"catalogUnitPricePesos":16500,"overrideReason":null,"costPesos":null,"note":null,"addons":[{"addonId":"<ADDON_ID>","addonName":"Tocineta","additionalPricePesos":5000,"quantity":2}],"components":[]}]}}]}'
La suma de `payments` debe ser igual al total. `addons` lleva cantidad y se cobra por unidad. `modifiers` sigue aceptándose para operaciones pendientes de versiones anteriores. `method` solo se acepta en operaciones antiguas y equivale a un pago único por el total. Para un cambio de precio, `unitPricePesos` difiere de `catalogUnitPricePesos` y `overrideReason` es obligatorio (5–200 caracteres); el usuario debe ser MANAGER o ADMIN.
15. Sync — devolución completa (seq 3)
curl -X POST http://localhost:8080/api/sync/operations \
  -H "X-Device-Token: <DEVICE_TOKEN>" -H "Content-Type: application/json" \
  -d '{"operations":[{"operationId":"33333333-3333-4333-8333-333333333333","seq":3,"type":"REFUND_SALE","userId":"<USER_ID>","clientCreatedAt":"2026-11-07T14:10:00Z","payload":{"shiftId":"<SHIFT_ID>","saleId":"<SALE_ID>","method":"CASH","reason":"cobro equivocado"}}]}'
La devolución es por el total de la venta y queda en el turno abierto actual.
16. Sync — movimiento de caja (seq 4)
curl -X POST http://localhost:8080/api/sync/operations \
  -H "X-Device-Token: <DEVICE_TOKEN>" -H "Content-Type: application/json" \
  -d '{"operations":[{"operationId":"44444444-4444-4444-8444-444444444444","seq":4,"type":"CASH_MOVEMENT","userId":"<USER_ID>","clientCreatedAt":"2026-11-07T14:15:00Z","payload":{"shiftId":"<SHIFT_ID>","movementType":"WITHDRAWAL","amountPesos":5000,"reason":"compra lechuga","expenseCategoryName":"Fruver"}}]}'
Un retiro sin `expenseCategoryName` es un movimiento normal. Con categoría, además se crea el gasto de caja en la misma operación.
17. Sync — corregir o anular un movimiento (seq 5)
Corrección: envía los datos nuevos y `replacesMovementId`:
curl -X POST http://localhost:8080/api/sync/operations \
  -H "X-Device-Token: <DEVICE_TOKEN>" -H "Content-Type: application/json" \
  -d '{"operations":[{"operationId":"55555555-5555-4555-8555-555555555555","seq":5,"type":"CASH_MOVEMENT","userId":"<USER_ID>","clientCreatedAt":"2026-11-07T14:16:00Z","payload":{"shiftId":"<SHIFT_ID>","movementType":"WITHDRAWAL","amountPesos":3000,"reason":"compra lechuga","expenseCategoryName":"Aseo","replacesMovementId":"<MOVEMENT_ID>"}}]}'
Anulación: envía solo `replacesMovementId` y `voided: true`.
El movimiento viejo queda anulado con usuario y fecha; la corrección crea el nuevo. Un turno cerrado no admite correcciones.
18. Sync — cerrar turno (seq 6)
curl -X POST http://localhost:8080/api/sync/operations \
  -H "X-Device-Token: <DEVICE_TOKEN>" -H "Content-Type: application/json" \
  -d '{"operations":[{"operationId":"66666666-6666-4666-8666-666666666666","seq":6,"type":"CLOSE_SHIFT","userId":"<USER_ID>","clientCreatedAt":"2026-11-07T14:20:00Z","payload":{"shiftId":"<SHIFT_ID>","countedCashPesos":47000,"expectedPesos":47000,"countedBreakdown":{"20000":2,"1000":7},"closeNote":null}}]}'
El desglose debe sumar el contado. Si el servidor calcula una diferencia distinta de cero, `closeNote` es obligatoria (5–200 caracteres). Devuelve expectedPesos y differencePesos y guarda el esperado local y el del servidor.
19. Resumen del día
curl "http://localhost:8080/api/reports/summary?from=2026-11-07&to=2026-11-07" \
  -H "Authorization: Bearer <TOKEN>"
Ventas brutas, devoluciones, neto, efectivo/tarjeta/Bre-B, costo, gastos, utilidad operativa, ticket promedio y desgloses por día/hora/producto. Incluye `byExpenseCategory` con el total de gastos por categoría. Los gastos anulados no se incluyen.
20. Registrar gasto (MANAGER o ADMIN)
curl -X POST http://localhost:8080/api/expenses \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"expenseCategoryId":"<CATEGORY_ID>","description":"Taxi","amountPesos":10000,"expenseDate":"2026-11-07"}'
Un CASHIER recibe 403. La categoría debe existir y estar activa. Los gastos pagados con caja no usan este endpoint: nacen del `CASH_MOVEMENT`.
21. Listar gastos (MANAGER o ADMIN)
curl "http://localhost:8080/api/expenses?from=2026-11-07&to=2026-11-07" \
  -H "Authorization: Bearer <TOKEN>"
No incluye gastos anulados.
22. Auditoría (MANAGER o ADMIN)
curl "http://localhost:8080/api/audit?from=2026-11-07&to=2026-11-07" \
  -H "Authorization: Bearer <TOKEN>"
Registra devoluciones, cierres, movimientos, gastos y cambios de catálogo.
23. Listar categorías de gasto (cualquier usuario autenticado)
curl http://localhost:8080/api/expenses/categories \
  -H "Authorization: Bearer <TOKEN>"
Devuelve id, nombre, orden y estado activo. Caja las usa sin conexión desde su caché local.
24. Crear categoría de gasto (ADMIN)
curl -X POST http://localhost:8080/api/expenses/categories \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"name":"Domicilios"}'
Nombre repetido → 409.
25. Activar o renombrar categoría de gasto (ADMIN)
curl -X PUT http://localhost:8080/api/expenses/categories/<CATEGORY_ID> \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"name":"Domicilios","active":false}'
Una categoría inactiva no se puede usar en gastos nuevos. El gasto conserva el nombre con el que se registró.
26. Snapshot administrativo del catálogo (ADMIN)
curl http://localhost:8080/api/catalog/admin \
  -H "Authorization: Bearer <TOKEN>"
Incluye categorías, productos y grupos de modificadores inactivos para poder reactivarlos. La caja sigue usando `GET /api/catalog`, que solo devuelve activos. Un CASHIER recibe 403.